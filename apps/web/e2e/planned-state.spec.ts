// What: End-to-end Playwright spec for the planned-state feature
//       (PR N+1). Seeds confirmed cards in state='planned' (via admin
//       client, skipping the AI hop + the DECIDE commitment) and
//       exercises the five UI flows per spec § Tests § E2E:
//         1. Happy path — set a future reminder (DIY card)
//         2. Reminder-due chip appears (seed past date)
//         3. Edit existing reminder + signed days_out
//         4. BeforeCloseSummary — Contractor variant (+N more questions)
//         5. State guard — PATCH rejected on non-planned cards
// Why:  Unit tests cover the route + parser + components with mocks;
//       this spec proves the wire end-to-end: PATCH /api/card/[id]/
//       reminder against RLS, the page.tsx body transition under
//       router.refresh(), the indigo chip mount, the state-guard 409s.
// Does NOT: Run the AI hop or the DECIDE commitment — we seed cards
//           already in state='planned'. The decide-state E2E covers
//           that transition; this spec assumes it's correct and tests
//           the PLANNED surface in isolation.

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
  materials: [
    { name: 'P-trap kit', cost_min: 12, cost_max: 18 },
    { name: 'Plumber tape', cost_min: 2, cost_max: 4 },
  ],
  tools: [
    { name: 'Channel-locks', cost_min: 0, cost_max: 25, optional: true },
    { name: 'Adjustable wrench', cost_min: 0, cost_max: 20 },
  ],
  total_min: 14,
  total_max: 67,
  gotchas: 'PVC cracks if you over-tighten.',
  abort_condition: 'Stop if tailpiece threads strip.',
  steps: [
    'Place a bucket under the trap.',
    'Loosen both slip nuts.',
    'Replace the P-trap and tighten.',
    'Run water and check for drips.',
  ],
};

const VALID_CONTRACTOR_MANY_QS = {
  contractor_type: 'plumber',
  cost_range_min: 150,
  cost_range_max: 400,
  questions_for_contractor: [
    'Will you need to open the wall behind the fixture?',
    'Is the repair warrantied for a year?',
    'Do you bring your own parts or do I supply them?',
    'How long will the work take?',
    'Do you charge a trip fee?',
    'Will you patch any damaged drywall?',
    'Are you licensed and insured?',
  ],
  red_flags: ['No written quote.'],
  good_completion: 'No drip under load after 24h pressure test.',
};

test.describe('planned-state round trip', () => {
  let email = '';
  let password = '';
  let userId = '';

  test.beforeEach(async ({ page }) => {
    const runId = Math.random().toString(36).slice(2, 10);
    email = `planned-${runId}@test.local`;
    password = 'planned-test-password-2026';

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

  /** Seed a card already in state='planned' with the supplied chosen_path. */
  async function seedPlannedCard(
    chosenPath: 'diy' | 'contractor' | 'monitor',
    extra: Record<string, unknown> = {}
  ) {
    const admin = adminClient();
    const seed: Record<string, unknown> = {
      user_id: userId,
      state: 'planned',
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
      cost_estimate_hire: VALID_CONTRACTOR_MANY_QS,
      chosen_path: chosenPath,
      ...extra,
    };
    const { data: inserted, error } = await admin
      .from('cards')
      .insert(seed)
      .select('id')
      .single();
    if (error) throw error;
    if (!inserted) throw new Error('seedPlannedCard: no row returned');
    return inserted.id as string;
  }

  test('happy path — set a future reminder on a DIY card', async ({ page }) => {
    const cardId = await seedPlannedCard('diy');
    await page.goto(`/cards/${cardId}`);

    await expect(page.getByTestId('planned-view')).toBeVisible();
    // BeforeCloseSummary shows for DIY.
    await expect(page.getByTestId('before-close-diy')).toBeVisible();
    // No reminder yet — State A.
    await expect(page.getByTestId('reminder-editor-a')).toBeVisible();
    // No chip in header.
    await expect(page.getByTestId('reminder-due-chip')).toBeHidden();

    await page.getByTestId('reminder-set-link').click();
    await expect(page.getByTestId('reminder-editor-form')).toBeVisible();

    // Pick a future date — 30 days out from "today" (test-machine clock).
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 30);
    const futureIso = future.toISOString().slice(0, 10);
    await page.getByTestId('reminder-date-input').fill(futureIso);
    await page.getByTestId('reminder-save').click();

    // After router.refresh, State B is rendered with the subline.
    await expect(page.getByTestId('reminder-editor-b')).toBeVisible();
    await expect(page.getByTestId('reminder-subline')).toContainText(
      'Revisit by'
    );
    // Still no chip in header (future date).
    await expect(page.getByTestId('reminder-due-chip')).toBeHidden();

    const admin = adminClient();
    const { data: row } = await admin
      .from('cards')
      .select('planned_reminder_date')
      .eq('id', cardId)
      .single();
    expect(row?.planned_reminder_date).toBe(futureIso);
  });

  test('reminder-due chip appears when seeded with a past date', async ({
    page,
  }) => {
    // Seed with a date 7 days in the past.
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 7);
    const pastIso = past.toISOString().slice(0, 10);
    const cardId = await seedPlannedCard('diy', {
      planned_reminder_date: pastIso,
    });
    await page.goto(`/cards/${cardId}`);

    // Chip is visible in the header.
    await expect(page.getByTestId('reminder-due-chip')).toBeVisible();
    await expect(page.getByTestId('reminder-due-chip')).toContainText(
      'Revisit by'
    );
    // State C in the editor (same shape as B; the chip is the urgency cue).
    await expect(page.getByTestId('reminder-editor-c')).toBeVisible();

    // Clear → back to State A, chip disappears.
    await page.getByTestId('reminder-clear-link').click();
    await expect(page.getByTestId('reminder-editor-a')).toBeVisible();
    await expect(page.getByTestId('reminder-due-chip')).toBeHidden();

    const admin = adminClient();
    const { data: row } = await admin
      .from('cards')
      .select('planned_reminder_date')
      .eq('id', cardId)
      .single();
    expect(row?.planned_reminder_date).toBeNull();
  });

  test('edit an existing future reminder to a past date — chip appears', async ({
    page,
  }) => {
    // Seed with a future date.
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 14);
    const futureIso = future.toISOString().slice(0, 10);
    const cardId = await seedPlannedCard('diy', {
      planned_reminder_date: futureIso,
    });
    await page.goto(`/cards/${cardId}`);
    await expect(page.getByTestId('reminder-editor-b')).toBeVisible();
    await expect(page.getByTestId('reminder-due-chip')).toBeHidden();

    // Edit to a past date.
    await page.getByTestId('reminder-edit-link').click();
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 3);
    const pastIso = past.toISOString().slice(0, 10);
    await page.getByTestId('reminder-date-input').fill(pastIso);
    await page.getByTestId('reminder-save').click();

    // After refresh: State C + chip visible.
    await expect(page.getByTestId('reminder-editor-c')).toBeVisible();
    await expect(page.getByTestId('reminder-due-chip')).toBeVisible();

    const admin = adminClient();
    const { data: row } = await admin
      .from('cards')
      .select('planned_reminder_date')
      .eq('id', cardId)
      .single();
    expect(row?.planned_reminder_date).toBe(pastIso);
  });

  test('BeforeCloseSummary — Contractor variant + monitor renders no summary', async ({
    page,
  }) => {
    // Contractor card with many questions — exercises overflow.
    const contractorId = await seedPlannedCard('contractor');
    await page.goto(`/cards/${contractorId}`);
    await expect(page.getByTestId('before-close-contractor')).toBeVisible();
    await expect(
      page.getByTestId('before-close-contractor-headline')
    ).toContainText('Contractor to schedule: plumber');
    // 7 questions, 3 inline + 4 overflow.
    await expect(
      page.getByTestId('before-close-contractor-overflow')
    ).toContainText('+4 more questions');

    // Monitor card → no summary rendered.
    const monitorId = await seedPlannedCard('monitor', {
      monitoring_cadence_days: 30,
    });
    await page.goto(`/cards/${monitorId}`);
    await expect(page.getByTestId('planned-view')).toBeVisible();
    await expect(page.getByTestId('before-close-diy')).toBeHidden();
    await expect(page.getByTestId('before-close-contractor')).toBeHidden();
  });

  test('state guard — PATCH /api/card/[id]/reminder rejects non-planned states with 409', async ({
    page,
  }) => {
    // Use `page.request` (NOT the top-level `request` fixture). The
    // top-level fixture has its own APIRequestContext that doesn't
    // share cookies with the page's BrowserContext — auth cookie set
    // via `page.context().addCookies` in beforeEach is invisible to
    // it, so requests return 401 instead of the state-guard 409 we're
    // asserting.
    // Seed in state='decide' (no chosen_path yet). The UI doesn't
    // surface the reminder editor for decide, so we use the direct
    // request API.
    const admin = adminClient();
    const seedDecide = await admin
      .from('cards')
      .insert({
        user_id: userId,
        state: 'decide',
        initial_description: 'leak',
        system_tag: 'plumbing',
        room_tag: 'Kitchen',
        severity: 'soon',
        severity_confirmed: true,
        diagnosis: 'leak',
        contractor_tag: 'plumber',
        monitoring_cadence_days: 14,
      })
      .select('id')
      .single();
    if (seedDecide.error) throw seedDecide.error;
    const cardId = seedDecide.data!.id as string;

    // Navigate to the page so Playwright picks up the auth cookie set
    // in beforeEach; the request API then carries it for the PATCH.
    await page.goto(`/cards/${cardId}`);

    // Bypass UI — PATCH directly. Decide state → 409.
    const r1 = await page.request.patch(`/api/card/${cardId}/reminder`, {
      data: { reminder_date: '2026-06-15' },
    });
    expect(r1.status()).toBe(409);
    expect(await r1.json()).toEqual({ error: 'invalid_state' });

    // Move card to dismissed → still 409.
    await admin.from('cards').update({ state: 'dismissed' }).eq('id', cardId);
    const r2 = await page.request.patch(`/api/card/${cardId}/reminder`, {
      data: { reminder_date: '2026-06-15' },
    });
    expect(r2.status()).toBe(409);

    // Move card to monitoring → 409 (reminders only apply to planned).
    await admin.from('cards').update({ state: 'monitoring' }).eq('id', cardId);
    const r3 = await page.request.patch(`/api/card/${cardId}/reminder`, {
      data: { reminder_date: '2026-06-15' },
    });
    expect(r3.status()).toBe(409);

    // None of those calls should have persisted a reminder date.
    const { data: row } = await admin
      .from('cards')
      .select('planned_reminder_date')
      .eq('id', cardId)
      .single();
    expect(row?.planned_reminder_date).toBeNull();
  });
});
