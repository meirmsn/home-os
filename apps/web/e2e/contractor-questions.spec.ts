// What: End-to-end Playwright spec for the contractor-question-retrieval
//       feature. Seeds cards carrying contractor questions (via admin
//       client, skipping the AI hop) and exercises the Core user story:
//         1. Open the dashboard and tap the "Contractor questions" link.
//         2. See questions grouped by trade with their question lists.
//         3. See the appointment nudge on a trade whose oldest card is
//            ≥30 days old.
//       Runs at both 375px (mobile) and 1440px (desktop).
// Why:  Unit + render tests cover the grouping lib + view with mocks; this
//       spec proves the wire end-to-end: RLS-scoped SELECT in the server
//       component, the grouping/nudge derivation against real timestamps,
//       and the dashboard-link navigation.
// Does NOT: Run the AI hop — cards are seeded already carrying a populated
//           cost_estimate_hire jsonb + contractor_tag. Editing the
//           expansion lives on cards/[id]; this spec is read-only.

// WebSocket polyfill — see rls-isolation.spec.ts header.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'undefined') {
  (globalThis as { WebSocket?: unknown }).WebSocket = class WebSocketStub {
    constructor() {
      throw new Error(
        'WebSocket stub: realtime not supported in this test runner'
      );
    }
  };
}

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  adminClient,
  isLocalSupabase,
  localSupabaseSkipReason,
} from './helpers/admin-client';

test.skip(!isLocalSupabase, localSupabaseSkipReason);

const SHOT_DIR = path.resolve(
  __dirname,
  '../../../specs/contractor-question-retrieval/screenshots'
);

const CONTRACTOR_PLUMBER = {
  contractor_type: 'plumber',
  cost_range_min: 150,
  cost_range_max: 400,
  questions_for_contractor: [
    'Will you need to open the wall behind the fixture?',
    'Is the repair warrantied for a year?',
  ],
  red_flags: ['No written quote.'],
  good_completion: 'No drip under load after a 24h pressure test.',
};

const CONTRACTOR_ELECTRICIAN = {
  contractor_type: 'electrician',
  cost_range_min: 200,
  cost_range_max: 600,
  questions_for_contractor: ['Is the panel up to current code?'],
  red_flags: ['No permit pulled.'],
  good_completion: 'Breaker holds under load; no warm outlets.',
};

/** ms helper: N whole days before now. */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

test.describe('contractor-question-retrieval', () => {
  let email = '';
  let password = '';
  let userId = '';

  test.beforeEach(async ({ page }) => {
    const runId = Math.random().toString(36).slice(2, 10);
    email = `contractor-q-${runId}@test.local`;
    password = 'contractor-q-test-password-2026';

    const admin = adminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    if (!data.user) throw new Error('createUser returned no user');
    userId = data.user.id;

    const { createClient } = await import('@supabase/supabase-js');
    const url = (process.env.SUPABASE_URL ?? '').trim();
    const anonKey = (process.env.SUPABASE_ANON_KEY ?? '').trim();
    const signinClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: session, error: signinError } =
      await signinClient.auth.signInWithPassword({ email, password });
    if (signinError) throw signinError;
    if (!session.session)
      throw new Error('signInWithPassword returned no session');

    const projectRef = new URL(url).hostname.split('.')[0] ?? 'local';
    const cookieValue = JSON.stringify({
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
      expires_at: session.session.expires_at,
      expires_in: session.session.expires_in,
      token_type: 'bearer',
      user: session.session.user,
    });
    await page.context().addCookies([
      {
        name: `sb-${projectRef}-auth-token`,
        value: encodeURIComponent(cookieValue),
        url: 'http://127.0.0.1:3000',
        httpOnly: false,
        sameSite: 'Lax',
        expires: -1,
      },
    ]);
  });

  test.afterEach(async () => {
    const admin = adminClient();
    if (userId) await admin.auth.admin.deleteUser(userId);
    userId = '';
  });

  /** Seed a card carrying a contractor expansion + tag. */
  async function seedCard(opts: {
    contractorTag: string;
    expansion: Record<string, unknown>;
    createdAt: string;
    state?: string;
    description?: string;
  }) {
    const admin = adminClient();
    const { data: inserted, error } = await admin
      .from('cards')
      .insert({
        user_id: userId,
        state: opts.state ?? 'decide',
        initial_description: opts.description ?? 'A slow leak under the sink.',
        system_tag: 'plumbing',
        room_tag: 'Kitchen',
        severity: 'soon',
        severity_confirmed: true,
        diagnosis: 'Needs a pro look.',
        contractor_tag: opts.contractorTag,
        monitoring_cadence_days: 14,
        cost_estimate_hire: opts.expansion,
        created_at: opts.createdAt,
      })
      .select('id')
      .single();
    if (error) throw error;
    if (!inserted) throw new Error('seedCard: no row returned');
    return inserted.id as string;
  }

  // Runs under both the `mobile` (375px) and `desktop` (1440px) Playwright
  // projects — see playwright.config.ts — so the Core user story is verified
  // at both breakpoints without a manual viewport loop.
  test('Core user story — open, see groups, see nudge', async ({
    page,
  }, testInfo) => {
    {
      // A recent plumber card (no nudge) + an aged electrician card (nudge).
      await seedCard({
        contractorTag: 'plumber',
        expansion: CONTRACTOR_PLUMBER,
        createdAt: daysAgoIso(3),
        description: 'Slow leak under the kitchen sink.',
      });
      await seedCard({
        contractorTag: 'electrician',
        expansion: CONTRACTOR_ELECTRICIAN,
        createdAt: daysAgoIso(45),
        description: 'Flickering kitchen lights.',
      });

      // 1. Open the dashboard and tap the entry-point link.
      await page.goto('/home');
      const link = page.getByTestId('contractor-questions-link');
      await expect(link).toBeVisible();
      await link.click();

      await expect(page).toHaveURL(/\/contractor-questions$/);
      await expect(page.getByTestId('contractor-questions-view')).toBeVisible();

      // 2. See the two trade groups + their questions.
      await expect(page.getByTestId('contractor-group-plumber')).toBeVisible();
      await expect(
        page.getByTestId('contractor-group-electrician')
      ).toBeVisible();
      await expect(
        page.getByText('Will you need to open the wall behind the fixture?')
      ).toBeVisible();

      // 3. The aged electrician group shows the appointment nudge; the
      //    recent plumber group does not.
      const electricianGroup = page.getByTestId('contractor-group-electrician');
      await expect(
        electricianGroup.getByTestId('contractor-appointment-nudge')
      ).toBeVisible();
      await expect(
        electricianGroup.getByTestId('contractor-appointment-nudge')
      ).toContainText(
        'You have 1 open questions for your Electrician contractor.'
      );
      await expect(
        page
          .getByTestId('contractor-group-plumber')
          .getByTestId('contractor-appointment-nudge')
      ).toHaveCount(0);

      // qa-walk artifact: one screenshot per Core-user-story verb-set,
      // named by the active breakpoint project (mobile / desktop).
      mkdirSync(SHOT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(
          SHOT_DIR,
          `retrieval-view-${testInfo.project.name}.png`
        ),
        fullPage: true,
      });
    }
  });

  test('empty state when no qualifying cards', async ({ page }) => {
    // A closed card + a diy card → both excluded → empty.
    await seedCard({
      contractorTag: 'plumber',
      expansion: CONTRACTOR_PLUMBER,
      createdAt: daysAgoIso(2),
      state: 'closed',
    });
    await seedCard({
      contractorTag: 'diy',
      expansion: CONTRACTOR_PLUMBER,
      createdAt: daysAgoIso(2),
    });

    await page.goto('/contractor-questions');
    await expect(page.getByTestId('contractor-questions-empty')).toBeVisible();
  });

  test('unauthenticated visit redirects to /login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/contractor-questions');
    await expect(page).toHaveURL(/\/login/);
  });
});
