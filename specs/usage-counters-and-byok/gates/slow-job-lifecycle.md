## Gate 2c: slow-job-lifecycle

**Result:** pass

**Workflow:** `.github/workflows/ci.yml` — `slow` job (lines 157-338).

**Triggers:** Correct. `pull_request` on `main` (pre-merge) and `push` on `main` (post-merge). The `slow` job gates on `github.event_name == 'pull_request'` with a docs-only skip filter via the `changes` job, which is the expected pattern.

**Lifecycle posture:** Active from day one per `kit/docs/guide/conventions.md` Slow-Job Lifecycle convention. Heavy steps (Playwright install, E2E run, type-drift check, rollback round-trip) use `hashFiles(...)` guards to short-circuit when no migrations or E2E specs exist. `supabase start` runs unconditionally as an ambient health signal.

**Steps verified:**

- Playwright browser install (chromium + webkit) gated on `hashFiles('apps/web/e2e/**/*.spec.ts')`
- Supabase local stack start with edge-runtime health-check retry
- Schema type-drift check gated on `hashFiles('supabase/migrations/*.sql')`
- Migration rollback round-trip gated on `hashFiles('supabase/migrations/*.sql')`
- Next.js build + Playwright E2E run gated on E2E spec existence
- Artifact upload on failure with 7-day retention

**Env bridging:** `supabase status -o env` values are quote-stripped and exported via `$GITHUB_ENV`; step-level `env:` mappings bridge unprefixed names to `SUPABASE_*`/`NEXT_PUBLIC_*` prefixed names. No job-level shadowing issue.

**Timeout:** 30 minutes — appropriate for the slow-job scope.

## Dismissals

None.
