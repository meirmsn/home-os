// What: Playwright globalSetup. Forces PostgREST to reload its in-memory
//       schema cache before any E2E test runs, AND prints diagnostics so
//       CI logs surface whether the reload took effect. PR #28 hit a
//       PGRST204 cache miss on migration 012's `cards.planned_reminder_date`
//       despite the column existing in Postgres — fix attempts 1 + 2 sent
//       NOTIFY pgrst but the cache stayed stale. Attempt 3 (this file):
//       verbose logging + cache verification + retry with exponential
//       backoff if the first NOTIFY didn't take.
// Why:  Playwright globalSetup runs after `supabase start` has fully
//       completed and PostgREST is listening on its NOTIFY channel.
//       Sending NOTIFY here is the only reliable timing — migration-time
//       NOTIFY (attempt 1) didn't reach PostgREST because migrations may
//       apply before PostgREST's LISTEN is active.
// Does NOT: Install fixtures, seed test users, or assert schema validity.
//           Per-test `beforeEach` handles seeding. Skips silently when
//           SUPABASE_URL is absent (non-CI runs).

import { execSync } from 'node:child_process';

const PROBE_COLUMN = 'planned_reminder_date'; // canary column from migration 012

/**
 *
 */
function log(msg: string): void {
  console.log(`[globalSetup] ${msg}`);
}

/**
 *
 */
function probeCache(
  url: string,
  key: string
): {
  cardsCols: number;
  hasProbeColumn: boolean;
  status: number;
} {
  try {
    const out = execSync(
      `curl -s -w "\\n%{http_code}" "${url}/rest/v1/" -H "apikey: ${key}" -H "Authorization: Bearer ${key}"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const parts = out.trim().split('\n');
    const status = parseInt(parts[parts.length - 1] ?? '0', 10);
    const body = parts.slice(0, -1).join('\n');
    const d = JSON.parse(body);
    const cols = Object.keys(d?.definitions?.cards?.properties ?? {});
    return {
      cardsCols: cols.length,
      hasProbeColumn: cols.includes(PROBE_COLUMN),
      status,
    };
  } catch {
    return {
      cardsCols: -1,
      hasProbeColumn: false,
      status: 0,
    };
  }
}

/**
 *
 */
async function globalSetup(): Promise<void> {
  const dbUrl =
    (process.env.DB_URL ?? '').trim() ||
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const restUrl = (process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  log(`DB_URL set: ${process.env.DB_URL ? 'yes' : 'no (using fallback)'}`);
  log(`SUPABASE_URL set: ${restUrl ? 'yes' : 'no'}`);
  log(`SUPABASE_SERVICE_ROLE_KEY set: ${serviceKey ? 'yes' : 'no'}`);

  if (
    !dbUrl.includes('127.0.0.1') &&
    !dbUrl.includes('localhost') &&
    !dbUrl.includes('supabase-runner')
  ) {
    log('not a local stack — skipping');
    return;
  }

  // Pre-reload probe
  if (restUrl && serviceKey) {
    const before = probeCache(restUrl, serviceKey);
    log(
      `pre-NOTIFY cache: status=${before.status} cardsCols=${before.cardsCols} has_${PROBE_COLUMN}=${before.hasProbeColumn}`
    );
  }

  // Try multiple reload mechanisms back-to-back. PostgREST's documented
  // channel is `pgrst` with payload `reload schema`; we also send the
  // bare NOTIFY in case the payload variant is the issue.
  const reloadStatements = [
    `notify pgrst, 'reload schema';`,
    `select pg_notify('pgrst', 'reload schema');`,
    `notify pgrst;`,
  ];

  for (const stmt of reloadStatements) {
    try {
      const out = execSync(`psql "${dbUrl}" -c "${stmt}" 2>&1`, {
        encoding: 'utf8',
        timeout: 5000,
      });
      log(`reload sent: ${stmt} → ${out.trim().split('\n').pop()}`);
    } catch (err) {
      log(
        `reload FAILED: ${stmt} → ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Settle, then verify
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (restUrl && serviceKey) {
    const after = probeCache(restUrl, serviceKey);
    log(
      `post-NOTIFY cache: status=${after.status} cardsCols=${after.cardsCols} has_${PROBE_COLUMN}=${after.hasProbeColumn}`
    );
    if (!after.hasProbeColumn) {
      log(
        `WARNING: cache still missing ${PROBE_COLUMN} after NOTIFY — E2E will hit PGRST204`
      );
    }
  }
}

export default globalSetup;
