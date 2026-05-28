## Gate 2f: changed-tests-local

- Result: pass-with-note (unit + integration green locally; E2E deferred to CI)

Unit + integration tests for changed files pass locally (945 web unit tests
green via fast-job-local). The changed E2E spec `apps/web/e2e/photo-comparison.spec.ts`
cannot execute in this sandbox — three independent environment gaps, none of
which are code defects:

1. `mobile` project (iPhone 15 → WebKit) — WebKit browser not installed locally
   (only system Chromium present). CI installs it via
   `playwright install --with-deps chromium webkit` (`.github/workflows/ci.yml:199`).
2. Playwright-bundled Chromium (v1223) is not downloadable here — the
   Chrome-for-Testing CDN is firewall-blocked (`Download failure, code=1`).
   Worked around by symlinking the system Chromium (148.0.7778.167) into the
   Playwright cache; the browser then launches.
3. With the browser launching, the test's `beforeEach` user-creation /
   sign-in hits `AuthRetryableFetchError` against the local GoTrue endpoint —
   a sandbox network reachability limitation. The PRE-EXISTING
   `e2e/magic-link.spec.ts` also fails locally (element-not-found), confirming
   the local E2E suite is environmentally broken for ALL specs, not this feature.

The spec is well-formed and reuses the established `e2e/helpers/admin-client.ts`
pattern (same as decide-state / planned-state / triage specs that pass in CI).
playwright.config.ts documents CI as the authoritative E2E runner
("CI brings up next start via the slow-job workflow"). E2E is verified in
Phase 5 CI watch.

## Dismissals

None
