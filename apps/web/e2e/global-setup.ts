// What: Playwright globalSetup. Forces PostgREST to reload its in-memory
//       schema cache before any E2E test runs. PR #28 (planned-state) hit
//       a PGRST204 cache miss on migration 012's new column despite the
//       column existing in Postgres. Attempts 1-3 sent NOTIFY pgrst from
//       multiple shapes; attempt 3's diagnostics proved psql succeeds AND
//       PostgREST is reachable, yet the cache stays stale. CI's PostgREST
//       silently ignores NOTIFY for reasons that don't reproduce locally
//       (local: same Supabase CLI 2.98.2, same channel `pgrst`, NOTIFY
//       reloads cache fine).
//       Attempt 4 (this file): pg_stat_activity probe to capture WHAT CI's
//       PostgREST is actually listening on + docker-restart fallback as the
//       nuclear option that forces a fresh introspection.
// Why:  Each attempt's diagnostics narrow the failure surface. Attempt 4's
//       PostgREST process probe answers "is the LISTEN even active?" and
//       "on what channel?". The restart fallback unblocks the PR regardless
//       of root cause — `docker restart` of the supabase_rest container
//       forces a clean schema introspection on container reattach.
// Does NOT: Install fixtures or seed test users — that's per-spec
//           `beforeEach`. Skip silently when not running against the
//           local stack.

import { execSync } from 'node:child_process';

const PROBE_COLUMN = 'planned_reminder_date';

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
): { cardsCols: number; hasProbeColumn: boolean; status: number } {
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
    return { cardsCols: -1, hasProbeColumn: false, status: 0 };
  }
}

/**
 *
 */
function psqlQuery(dbUrl: string, sql: string): string {
  try {
    return execSync(`psql "${dbUrl}" -tAc "${sql.replace(/"/g, '\\"')}" 2>&1`, {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
  } catch (err) {
    return `<psql-error: ${err instanceof Error ? err.message : String(err)}>`;
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

  // Pre-reload cache state
  if (restUrl && serviceKey) {
    const before = probeCache(restUrl, serviceKey);
    log(
      `pre-fix cache: status=${before.status} cardsCols=${before.cardsCols} has_${PROBE_COLUMN}=${before.hasProbeColumn}`
    );
    if (before.hasProbeColumn) {
      log('cache already has the column — nothing to do');
      return;
    }
  }

  // DIAGNOSTIC: what is PostgREST actually doing?
  log(
    `pg_stat_activity (PostgREST connections): ${psqlQuery(
      dbUrl,
      "select application_name || '|' || coalesce(query, '<null>') from pg_stat_activity where application_name ilike 'postgrest%'"
    )}`
  );

  // FIX 1: try NOTIFY pgrst (canonical mechanism). If CI's PostgREST listens
  // on this channel and honors it, cache reloads.
  log(`notify pgrst: ${psqlQuery(dbUrl, "notify pgrst, 'reload schema'")}`);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (restUrl && serviceKey) {
    const afterNotify = probeCache(restUrl, serviceKey);
    log(
      `post-NOTIFY cache: cardsCols=${afterNotify.cardsCols} has_${PROBE_COLUMN}=${afterNotify.hasProbeColumn}`
    );
    if (afterNotify.hasProbeColumn) {
      log('NOTIFY fixed it — done');
      return;
    }
  }

  // FIX 2: docker restart the supabase_rest container. Forces a fresh
  // schema introspection on reconnect. Heavy hammer but works regardless
  // of why NOTIFY is being ignored.
  log('NOTIFY ineffective — trying docker restart of supabase_rest');
  try {
    const containerName = execSync(
      `docker ps --format '{{.Names}}' --filter 'name=supabase_rest' 2>&1`,
      { encoding: 'utf8', timeout: 5000 }
    )
      .trim()
      .split('\n')[0];
    if (!containerName) {
      log('no supabase_rest container found — cannot restart');
      return;
    }
    log(`restarting ${containerName}`);
    execSync(`docker restart ${containerName} 2>&1`, {
      encoding: 'utf8',
      timeout: 30000,
    });
    // Poll until PostgREST responds 200 again (may take a few seconds)
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (restUrl && serviceKey) {
        const probe = probeCache(restUrl, serviceKey);
        if (probe.status === 200) {
          log(
            `post-restart cache (after ${(i + 1) * 0.5}s): cardsCols=${probe.cardsCols} has_${PROBE_COLUMN}=${probe.hasProbeColumn}`
          );
          if (probe.hasProbeColumn) {
            log('restart fixed it — done');
            return;
          }
          if (i > 10 && probe.cardsCols > 0) {
            log(
              `WARNING: PostgREST back up after restart but cache still missing ${PROBE_COLUMN} (cardsCols=${probe.cardsCols}) — fundamental problem`
            );
            return;
          }
        }
      }
    }
    log('WARNING: PostgREST did not return 200 within 15s of restart');
  } catch (err) {
    log(
      `docker restart FAILED: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export default globalSetup;
