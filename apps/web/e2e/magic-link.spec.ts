// What: Full round-trip Playwright E2E for the auth-magic-link feature
//       (D10). Submits the /login form with a fresh email, polls Inbucket
//       for the magic-link email, follows the link to /auth/callback, and
//       asserts the user lands on /home with the expected signed-in
//       shell. Then signs out and asserts the middleware redirect rule
//       (anon + /home -> /login?next=/home).
// Why:  Unit tests cover branches with mocks; this spec proves the wire
//       format end-to-end — cookies, PKCE code-verifier round-trip, the
//       email template's magic-link shape, the (app) layout's getUser
//       defense-in-depth, and the middleware redirect rules all in one
//       run.
// Does NOT: Run against CI fast-job without a local stack. `test.skip
//           (!isLocalSupabase, …)` mirrors rls-isolation.spec.ts — the
//           slow-job lane is the enforcement surface; fast-job reports
//           skipped.

import { test, expect } from '@playwright/test';
import {
  isLocalSupabase,
  localSupabaseSkipReason,
} from './helpers/admin-client';
import { latestMagicLink } from './helpers/inbucket';

test.describe('auth-magic-link round trip', () => {
  test.skip(!isLocalSupabase, localSupabaseSkipReason);

  test('sends a link, exchanges the code, lands on /home, signs out', async ({
    page,
  }) => {
    // Fresh email per run dodges Supabase's per-email rate limit (D12 / spec § Gotchas).
    const email = `playwright-${Date.now()}@test.local`;

    // 1. /login form: enter email + submit
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send magic link' }).click();

    // 2. Confirmation state visible
    await expect(page.getByText(/check your email/i)).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    // 3. Pull the magic-link URL out of Inbucket
    const magicLink = await latestMagicLink(email);

    // 4. Visit the magic link — browser follows the 303 chain to /home
    await page.goto(magicLink.toString());
    await page.waitForURL('**/home');

    // 5. (app)/home rendered with the signed-in shell (D11)
    await expect(
      page.getByRole('heading', { level: 1, name: 'home-os' })
    ).toBeVisible();
    await expect(page.getByText(/signed in as/i)).toBeVisible();
    // (Email visibility is asserted via the testid in step 6 below — a bare
    // `getByText(email)` here trips Playwright strict mode because the email
    // is now rendered both in the header and the body `<strong>` after sign-in.)

    // 6. Header email + sign-out button (D11)
    await expect(page.getByTestId('signed-in-email')).toHaveText(email);
    const signOut = page.getByRole('button', { name: 'Sign out' });
    await expect(signOut).toBeVisible();

    // 7. Submit sign-out -> lands on /login
    await signOut.click();
    await page.waitForURL('**/login');

    // 8. Subsequent /home hit while signed out -> /login?next=/home
    //    (middleware rule, D6)
    await page.goto('/home');
    await page.waitForURL('**/login?next=%2Fhome');
    expect(page.url()).toContain('next=%2Fhome');
  });
});
