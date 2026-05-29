## Gate 2c: slow-job-lifecycle

- Result: pass

The new `apps/web/e2e/contractor-questions.spec.ts` lands under the configured
`testDir: './e2e'` and is auto-discovered by Playwright's spec glob. The CI
slow-job runs Playwright e2e when runtime files change; this PR's diff touches
`apps/web/app/**` (runtime), so the slow-job activates and will execute the new
spec at both breakpoint projects. No lifecycle stub gap.

## Dismissals

None
