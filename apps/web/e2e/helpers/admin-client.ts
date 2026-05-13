// What: Canonical helpers for Playwright E2E tests that need to talk to
//       Supabase directly — admin-side seed data (`adminClient`),
//       anonymous-side reads as an end user would do (`anonClient`),
//       deterministic sign-in lookup (`userIdFromSignIn`), and the local-
//       stack skip predicate (`isLocalSupabase`, `localSupabaseSkipReason`).
// Why:  Pattern 3 from kit/docs/guide/supabase-ssr-boilerplate.md — locked
//       canonical shape so every project's E2E tests have the same five
//       exports under the same import path. Don't reinvent.
// Does NOT: Spawn the supabase stack — that's the test harness's job. These
//           helpers fail loudly if SUPABASE_URL points at prod (admin client
//           writes are inherently dangerous; the helpers refuse to run unless
//           targeting a local stack).

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const url = (process.env.SUPABASE_URL ?? '').trim();
const anonKey = (process.env.SUPABASE_ANON_KEY ?? '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

/** True when the test process points at a local supabase stack. The
 *  E2E suite skips integration steps when this is false (e.g., CI fast-job
 *  that didn't bring up a stack). */
export const isLocalSupabase =
  url.startsWith('http://127.0.0.1') ||
  url.startsWith('http://localhost') ||
  url.includes('host.docker.internal');

/** Human-readable reason to surface in a Playwright `test.skip(...)` when
 *  isLocalSupabase is false — keeps the skipped-test reporter informative. */
export const localSupabaseSkipReason =
  'No local Supabase stack detected (SUPABASE_URL not pointing at ' +
  '127.0.0.1 / localhost / host.docker.internal). Bring up the local ' +
  'stack with `pnpm db:start` before running integration E2E.';

/** Anonymous client — uses the published local-stack anon JWT. Same auth
 *  surface as an unauthenticated end user. */
export function anonClient() {
  return createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Admin client — service-role JWT, bypasses RLS. **Refuses to run unless
 *  isLocalSupabase is true** — an E2E suite that targets prod would be a
 *  data-loss event. */
export function adminClient() {
  if (!isLocalSupabase) {
    throw new Error(
      `adminClient() refused: SUPABASE_URL is not a local stack ` +
        `(got ${JSON.stringify(url)}). ${localSupabaseSkipReason}`
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Sign in a (pre-seeded) test user and return their auth.users.id. The
 *  caller is responsible for ensuring the email exists in the local stack;
 *  use adminClient().auth.admin.createUser() to seed in a beforeAll. */
export async function userIdFromSignIn(
  email: string,
  password: string
): Promise<string> {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  if (!data.user) throw new Error('signInWithPassword returned no user');
  return data.user.id;
}
