// What: Playwright E2E for auth edge cases that the happy-path
//       magic-link.spec.ts doesn't exercise — (a) the PKCE callback's
//       error-surfacing on a bad code, (b) the D6 middleware rule that
//       authenticated visits to /login redirect to /home, (c) the
//       landing-redirect rules 3 + 4: anonymous `/` -> /login and
//       authenticated `/` -> /home.
// Why:  All security-flavored. The bad-code path proves that an
//       expired/used link surfaces a user-facing banner (not a 500); the
//       authenticated-/login redirect closes the inverse of the
//       anon-/home rule; the landing-redirect cases prove the bare /
//       surface is auth-aware and never flashes the noscript-fallback
//       anchor to normal browser flows. Route + middleware unit tests
//       cover the handler-level contract; this spec proves the browser
//       actually sees the rendered surface.
// Does NOT: Re-exercise the happy-path round trip (that's magic-link.spec.ts)
//           or open-redirect defenses (route test is the right surface —
//           same code path, faster harness).

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

test.describe('auth edge cases', () => {
  test('bad callback code: garbage ?code lands on /login with the expired-link banner', async ({
    page,
  }) => {
    await page.goto('/auth/callback?code=this-is-not-a-real-pkce-code');
    // The 303 chain ends on /login?error=callback_failed.
    await page.waitForURL('**/login?**error=callback_failed');
    expect(page.url()).toContain('error=callback_failed');
    // /login's server shell forwards the error code to the form, which
    // renders the canonical copy from ERROR_COPY.callback_failed.
    await expect(
      page.getByText(/sign-in link expired or was already used/i)
    ).toBeVisible();
  });

  test('authenticated /login → /home: middleware rule 2 (D6) redirects signed-in users away from /login', async ({
    page,
  }) => {
    const runId = Math.random().toString(36).slice(2, 10);
    const email = `auth-edge-${runId}@test.local`;
    const password = 'auth-edge-test-password-2026';

    const admin = adminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    if (!data.user) throw new Error('createUser returned no user');
    const userId = data.user.id;

    try {
      // Sign in via password to mint a real session.
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

      // Inject the @supabase/ssr canonical auth cookie into the browser
      // context (same pattern as capture-flow.spec.ts beforeEach).
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

      // Authenticated visit to /login → middleware 307 → /home.
      await page.goto('/login');
      await page.waitForURL('**/home');
      expect(page.url()).toMatch(/\/home$/);
      // /home renders the signed-in shell — confirms the redirect didn't
      // just bounce off middleware into another anon redirect loop.
      await expect(page.getByTestId('signed-in-email')).toBeVisible();
    } finally {
      if (userId) await admin.auth.admin.deleteUser(userId);
    }
  });

  test('anonymous / → /login: middleware rule 3 (landing-redirect)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForURL('**/login');
    expect(page.url()).toMatch(/\/login$/);
    // Magic-link form rendered — proves we landed on /login's real shell,
    // not a redirect loop bouncing back through middleware.
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test('authenticated / → /home: middleware rule 4 (landing-redirect)', async ({
    page,
  }) => {
    const runId = Math.random().toString(36).slice(2, 10);
    const email = `landing-redirect-${runId}@test.local`;
    const password = 'landing-redirect-test-password-2026';

    const admin = adminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    if (!data.user) throw new Error('createUser returned no user');
    const userId = data.user.id;

    try {
      // Same password + cookie-injection pattern as the authenticated
      // /login → /home test above.
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

      // Authenticated visit to / → middleware 307 → /home.
      await page.goto('/');
      await page.waitForURL('**/home');
      expect(page.url()).toMatch(/\/home$/);
      // /home renders the signed-in shell — confirms the redirect didn't
      // bounce into the noscript-fallback anchor at /.
      await expect(page.getByTestId('signed-in-email')).toBeVisible();
    } finally {
      if (userId) await admin.auth.admin.deleteUser(userId);
    }
  });
});
