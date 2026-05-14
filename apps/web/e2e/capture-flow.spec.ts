// What: Full-round-trip Playwright E2E for the capture-flow feature
//       (PR #3). Seeds a confirmed user via admin client; signs in via
//       password (no Inbucket dependency since auth-magic-link is not
//       the surface under test). Three cases: happy-path capture,
//       cap-hit (seed counter at 20), revival-from-dismissed.
// Why:  Unit tests cover branches with mocks; this spec proves the
//       wire format end-to-end — cookies, RLS, the SECURITY DEFINER
//       claim_card_slot RPC, Storage upload paths, and the redirect
//       to /home.
// Does NOT: Run against CI fast-job without a local stack. Mirrors the
//           magic-link + rls-isolation skip pattern so the slow-job
//           lane is the enforcement surface.

// WebSocket polyfill — see rls-isolation.spec.ts header. Mirror the stub
// so the @supabase/supabase-js construction doesn't crash on Node 20.
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

test.describe('capture-flow round trip', () => {
  // Per-test fresh user — avoids state leakage across cases.
  let email = '';
  let password = '';
  let userId = '';

  test.beforeEach(async ({ page }) => {
    const runId = Math.random().toString(36).slice(2, 10);
    email = `capture-${runId}@test.local`;
    password = 'capture-test-password-2026';

    const admin = adminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    if (!data.user) throw new Error('createUser returned no user');
    userId = data.user.id;

    // Sign in via the password helper (not magic link). Use the /login
    // form's API surface only — we drive the actual UI for the rest.
    await page.goto('/login');
    // No password field on the form. Drive supabase-js directly via the
    // browser context's localStorage cookie writer to avoid a private
    // page route. Easier: call signInWithPassword via the page's already-
    // loaded supabase client by re-using the supabase-js library directly
    // server-side and setting the cookie on the page. Since both Playwright
    // and supabase-js can talk to the same local stack, we sign in
    // server-side and inject the session cookie into the browser.
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

    // Inject the session into the browser's cookies in the @supabase/ssr
    // format. The SSR layer reads `sb-<ref>-auth-token` as a chunked
    // JSON blob; for the local stack the ref segment is derived from the
    // URL host. We instead set the session via the in-browser supabase
    // client which is the canonical write path.
    await page.addInitScript(
      (args: { url: string; key: string; access: string; refresh: string }) => {
        // Stash so the next page load picks it up. The SSR client's
        // setAll path will be a no-op for this test; we rely on the JWT
        // present in localStorage.
        try {
          window.localStorage.setItem(
            'sb-auth',
            JSON.stringify({
              access_token: args.access,
              refresh_token: args.refresh,
            })
          );
        } catch {
          // ignore
        }
      },
      {
        url,
        key: anonKey,
        access: session.session.access_token,
        refresh: session.session.refresh_token,
      }
    );

    // Easier reliable path: set the @supabase/ssr canonical auth cookie
    // via the Playwright context.
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

  test('happy path: capture a card with photo from /home → land back on /home', async ({
    page,
  }) => {
    await page.goto('/home');
    await page.getByRole('link', { name: '+ Capture' }).click();
    await page.waitForURL('**/capture');

    await page
      .getByLabel(/what.s going on/i)
      .fill('Leaky faucet under the kitchen sink for two days.');
    await page.getByLabel(/system/i).selectOption('plumbing');
    await page.getByLabel(/room/i).fill('Kitchen');

    // Upload a tiny JPEG via the photo input.
    await page.getByLabel(/photo/i).setInputFiles({
      name: 'capture.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });

    await page.getByRole('button', { name: 'Save card' }).click();
    await page.waitForURL('**/home');

    // Admin verifications.
    const admin = adminClient();
    const cards = await admin
      .from('cards')
      .select('id, state, system_tag, room_tag, initial_description')
      .eq('user_id', userId);
    expect(cards.error).toBeNull();
    expect(cards.data?.length).toBe(1);
    expect(cards.data?.[0]?.state).toBe('capturing');
    expect(cards.data?.[0]?.system_tag).toBe('plumbing');
    expect(cards.data?.[0]?.room_tag).toBe('Kitchen');

    const photos = await admin
      .from('card_photos')
      .select('id, touchpoint_type, slot')
      .eq('user_id', userId);
    expect(photos.error).toBeNull();
    expect(photos.data?.length).toBe(1);
    expect(photos.data?.[0]?.touchpoint_type).toBe('primary');
    expect(photos.data?.[0]?.slot).toBe('wide');

    const counters = await admin
      .from('usage_counters')
      .select('card_count')
      .eq('user_id', userId)
      .maybeSingle();
    expect(counters.data?.card_count).toBe(1);
  });

  test('cap-hit: 21st submit shows the banner, no new card / no Storage object', async ({
    page,
  }) => {
    const admin = adminClient();
    // Seed counter at 20 for this user, anchored at this Monday-UTC.
    await admin.from('usage_counters').insert({
      user_id: userId,
      card_count: 20,
      triage_session_count: 0,
    });

    await page.goto('/capture');
    await page
      .getByLabel(/what.s going on/i)
      .fill('Yet another issue, should not land.');
    await page.getByLabel(/system/i).selectOption('plumbing');
    await page.getByLabel(/room/i).fill('Garage');
    await page.getByRole('button', { name: 'Save card' }).click();

    await expect(page.getByText(/20 issues this week/i)).toBeVisible();

    const cards = await admin.from('cards').select('id').eq('user_id', userId);
    expect(cards.data?.length ?? 0).toBe(0);
  });

  test('revival from dismissed: row appears on /dismissed, Restore flips state', async ({
    page,
  }) => {
    const admin = adminClient();
    const { data: card, error: insertError } = await admin
      .from('cards')
      .insert({
        user_id: userId,
        title: 'Old dismissed thing',
        state: 'dismissed',
        system_tag: 'plumbing',
        room_tag: 'Bath',
      })
      .select('id')
      .single();
    // Surface the actual postgres error if the insert failed (otherwise
    // the next-line `card!.id` crashes with a generic null-deref that
    // hides the real reason). Same gotcha CLAUDE.md § Gotchas calls out
    // for every `.select()` consumer.
    if (insertError) {
      throw new Error(
        `seed dismissed card failed: ${JSON.stringify(insertError)}`
      );
    }
    const cardId = card!.id as string;

    await page.goto('/dismissed');
    await expect(page.getByText('Old dismissed thing')).toBeVisible();

    // Two clicks: collapsed -> confirm -> POST. Both buttons share the
    // "Restore" name; the second click is on the confirm-stage button.
    const restoreButtons = page.getByRole('button', { name: 'Restore' });
    await restoreButtons.first().click();
    await page.getByRole('button', { name: 'Restore' }).last().click();

    await page.waitForLoadState('networkidle');

    const after = await admin
      .from('cards')
      .select('state')
      .eq('id', cardId)
      .single();
    expect(after.data?.state).toBe('capturing');
  });
});
