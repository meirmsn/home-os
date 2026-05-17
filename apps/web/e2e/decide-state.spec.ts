// What: End-to-end Playwright spec for the decide-state feature
//       (PR N). Seeds confirmed cards in state='decide' (via admin
//       client, skipping the AI hop) and exercises the five UI flows
//       per spec § Tests § E2E:
//         1. Happy path: DIY choice → planned + chosen_path='diy'
//         2. Edit + reset estimate
//         3. Set to Monitor + cadence picker
//         4. Dismiss
//         5. Concurrent commit → 409 invalid_state
// Why:  Unit tests cover the route + parsers + components with mocks;
//       this spec proves the wire end-to-end: commit_decide RPC,
//       PATCH /api/card/[id]/estimate against RLS, the page.tsx body
//       transition under router.refresh().
// Does NOT: Run the AI hop — we seed cards already in state='decide'
//           with populated cost_estimate_* jsonb. The triage-
//           conversation E2E covers the AI → decide transition; this
//           spec assumes that's correct and tests the DECIDE surface
//           in isolation.

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
import {
  adminClient,
  isLocalSupabase,
  localSupabaseSkipReason,
} from './helpers/admin-client';

test.skip(!isLocalSupabase, localSupabaseSkipReason);

const VALID_DIY = {
  skill_level: 'intermediate',
  time_hours_min: 1,
  time_hours_max: 2,
  materials: [{ name: 'P-trap kit', cost_min: 12, cost_max: 18 }],
  tools: [{ name: 'Channel-locks', cost_min: 0, cost_max: 25, optional: true }],
  total_min: 12,
  total_max: 43,
  gotchas: 'PVC cracks if you over-tighten.',
  abort_condition: 'Stop if tailpiece threads strip.',
  steps: [
    'Place a bucket under the trap.',
    'Loosen both slip nuts.',
    'Replace the P-trap and tighten.',
    'Run water and check for drips.',
  ],
};

const VALID_CONTRACTOR = {
  contractor_type: 'plumber',
  cost_range_min: 150,
  cost_range_max: 400,
  questions_for_contractor: [
    'Will you need to open the wall behind the fixture?',
    'Is the repair warrantied for a year?',
  ],
  red_flags: ['No written quote.'],
  good_completion: 'No drip under load after 24h pressure test.',
};

test.describe('decide-state round trip', () => {
  let email = '';
  let password = '';
  let userId = '';

  test.beforeEach(async ({ page }) => {
    const runId = Math.random().toString(36).slice(2, 10);
    email = `decide-${runId}@test.local`;
    password = 'decide-test-password-2026';

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

  /** Seed a card in state='decide' with both estimates populated. */
  async function seedDecideCard(extra: Record<string, unknown> = {}) {
    const admin = adminClient();
    const { data: inserted, error } = await admin
      .from('cards')
      .insert({
        user_id: userId,
        state: 'decide',
        initial_description: 'A slow leak under the kitchen sink.',
        system_tag: 'plumbing',
        room_tag: 'Kitchen',
        severity: 'soon',
        severity_confirmed: true,
        diagnosis:
          'Slow leak at the P-trap. Manageable with a wrench and an hour.',
        contractor_tag: 'plumber',
        monitoring_cadence_days: 14,
        cost_estimate_diy: VALID_DIY,
        cost_estimate_hire: VALID_CONTRACTOR,
        ...extra,
      })
      .select('id')
      .single();
    if (error) throw error;
    if (!inserted) throw new Error('seedDecideCard: no row returned');
    return inserted.id as string;
  }

  test('happy path — Choose DIY → planned + chosen_path=diy', async ({
    page,
  }) => {
    const cardId = await seedDecideCard();
    await page.goto(`/cards/${cardId}`);

    await expect(page.getByTestId('decide-view')).toBeVisible();
    await expect(page.getByTestId('path-card-diy')).toBeVisible();
    await expect(page.getByTestId('path-card-contractor')).toBeVisible();

    await page.getByTestId('choose-diy').click();
    await expect(page.getByTestId('planned-view')).toBeVisible();
    await expect(page.getByTestId('planned-banner')).toHaveText(
      'You chose: DIY'
    );

    const admin = adminClient();
    const { data: row } = await admin
      .from('cards')
      .select('state, chosen_path')
      .eq('id', cardId)
      .single();
    expect(row?.state).toBe('planned');
    expect(row?.chosen_path).toBe('diy');
  });

  test('edit + reset DIY estimate', async ({ page }) => {
    const cardId = await seedDecideCard();
    await page.goto(`/cards/${cardId}`);

    // Open editor via the editor slot inside the DIY PathCard.
    await page
      .getByTestId('estimate-editor-diy')
      .getByText('Edit estimate')
      .click();
    await expect(page.getByTestId('estimate-editor-diy-form')).toBeVisible();

    // Bump total_max — 4th type=number input under the DIY form.
    const numInputs = page.locator(
      '[data-testid="estimate-editor-diy-form"] input[type=number]'
    );
    await numInputs.nth(3).fill('99');
    await page.getByTestId('save-diy').click();

    // After refresh, the PathCard summary should reflect the override
    // and the badge should read "edited".
    await expect(page.getByTestId('path-card-diy-badge')).toHaveText('edited');

    const admin = adminClient();
    const { data: row } = await admin
      .from('cards')
      .select('cost_estimate_diy_override')
      .eq('id', cardId)
      .single();
    expect(row?.cost_estimate_diy_override).toBeTruthy();

    // Reset.
    await page.getByTestId('reset-diy').click();
    await expect(page.getByTestId('path-card-diy-badge')).toHaveText(
      'AI estimate'
    );
    const { data: row2 } = await admin
      .from('cards')
      .select('cost_estimate_diy_override')
      .eq('id', cardId)
      .single();
    expect(row2?.cost_estimate_diy_override).toBeNull();
  });

  test('Set to Monitor + cadence picker → state=monitoring', async ({
    page,
  }) => {
    const cardId = await seedDecideCard({ monitoring_cadence_days: 30 });
    await page.goto(`/cards/${cardId}`);

    await page.getByTestId('choose-monitor').click();
    await expect(page.getByTestId('monitor-cadence-picker')).toBeVisible();

    // Adjust cadence from 30 → 60.
    await page.getByTestId('cadence-input').fill('60');
    await page.getByTestId('cadence-confirm').click();

    const admin = adminClient();
    // Brief wait for the router.refresh + DB write.
    await page.waitForFunction(
      async () => true /* refresh handled by Playwright */
    );
    const { data: row } = await admin
      .from('cards')
      .select('state, monitoring_cadence_days, chosen_path')
      .eq('id', cardId)
      .single();
    expect(row?.state).toBe('monitoring');
    expect(row?.monitoring_cadence_days).toBe(60);
    expect(row?.chosen_path).toBe('monitor');
  });

  test('Dismiss → state=dismissed', async ({ page }) => {
    const cardId = await seedDecideCard();
    await page.goto(`/cards/${cardId}`);

    await page.getByTestId('choose-dismiss').click();
    // After commit, the page refreshes and falls into the existing
    // dismissed stub.
    await expect(page.getByText(/This card was dismissed/i)).toBeVisible();

    const admin = adminClient();
    const { data: row } = await admin
      .from('cards')
      .select('state, chosen_path')
      .eq('id', cardId)
      .single();
    expect(row?.state).toBe('dismissed');
    expect(row?.chosen_path).toBeNull();
  });

  test('concurrent commit → 409 invalid_state surfaces error banner', async ({
    page,
  }) => {
    const cardId = await seedDecideCard();
    await page.goto(`/cards/${cardId}`);
    await expect(page.getByTestId('decide-view')).toBeVisible();

    // Race: admin moves the card to 'closed' BEFORE the user clicks.
    // (Truly concurrent timing is brittle to reproduce; instead we
    // pre-bump to a non-(decide|planned) state so the next commit
    // 409s.)
    const admin = adminClient();
    await admin
      .from('cards')
      .update({ state: 'closed', closed_at: new Date().toISOString() })
      .eq('id', cardId);

    await page.getByTestId('choose-diy').click();

    // ChoosePath surfaces the error banner with the route error text.
    await expect(page.getByTestId('choose-path-error')).toBeVisible();
    await expect(page.getByTestId('choose-path-error')).toContainText(
      /invalid_state/i
    );

    const { data: row } = await admin
      .from('cards')
      .select('state, chosen_path')
      .eq('id', cardId)
      .single();
    expect(row?.state).toBe('closed');
    expect(row?.chosen_path).toBeNull();
  });
});
