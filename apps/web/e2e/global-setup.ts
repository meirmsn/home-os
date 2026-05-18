// What: Playwright globalSetup. Forces PostgREST to reload its in-memory
//       schema cache before any E2E test runs. PR #28 hit a PGRST204 cache
//       miss on migration 012's `cards.planned_reminder_date` despite the
//       column existing in Postgres — Supabase's `supabase start` apparently
//       doesn't refresh PostgREST's cache reliably after plain
//       `ALTER TABLE ADD COLUMN` (decide-state PR #27 got lucky because its
//       rename-recreate enum + ALTER COLUMN TYPE triggered a deeper refresh).
// Why:  Playwright globalSetup runs after `supabase start` has fully
//       completed and PostgREST is listening on its NOTIFY channel.
//       Sending NOTIFY here is the only reliable timing. Migration-time
//       NOTIFY (the canonical PostgREST mechanism) doesn't reach PostgREST
//       because migrations may apply before PostgREST's LISTEN is active.
// Does NOT: Install fixtures, seed test users, or assert schema validity.
//           Per-test `beforeEach` handles seeding. Skips silently when
//           SUPABASE_URL is absent (non-CI runs that don't use the local
//           stack).

import { execSync } from 'node:child_process';

/**
 *
 */
async function globalSetup(): Promise<void> {
  // Build the local Postgres connection URL from supabase env vars. CI
  // workflow exports DB_URL via `supabase status -o env`. Falls back to
  // the stock Supabase local-stack port if not set.
  const dbUrl =
    (process.env.DB_URL ?? '').trim() ||
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

  // Skip when not running against the local stack (e.g. tests pointed at
  // a hosted Supabase project — those manage their own PostgREST cache).
  if (
    !dbUrl.includes('127.0.0.1') &&
    !dbUrl.includes('localhost') &&
    !dbUrl.includes('supabase-runner')
  ) {
    return;
  }

  // Send NOTIFY via psql. `psql` is pre-installed on GitHub Actions
  // `ubuntu-latest` runners and on the supabase-runner Docker image used
  // locally. The `|| true` swallows transient failures (psql not in PATH
  // outside CI) — tests skip via `isLocalSupabase` in that case.
  try {
    execSync(`psql "${dbUrl}" -c "notify pgrst, 'reload schema';" 2>&1`, {
      stdio: 'pipe',
      timeout: 5000,
    });
    // Brief settle so PostgREST processes the NOTIFY before tests run.
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (err) {
    // Best-effort — if psql isn't reachable, tests that need the local
    // stack will skip anyway. Log so CI surfaces the cause if E2E later
    // fails with PGRST204.
    console.warn(
      '[globalSetup] PostgREST schema-cache reload failed (non-fatal):',
      err instanceof Error ? err.message : String(err)
    );
  }
}

export default globalSetup;
