## Gate 2: metrics-check

**Result: findings (1) fixed**

Scanned 14 changed `.ts`/`.tsx` source files (excluding tests) for `posthog.capture(...)`, `Sentry.captureException(...)`, and `Sentry.captureMessage(...)` call sites. Cross-referenced each against `METRICS.md`.

### PostHog events (9 call sites, 0 findings)

All PostHog events in changed files already had rows in METRICS.md:

- `byok_key_validated` -- ByokKeyInput.tsx (row 42)
- `triage_limit_reached` -- AnswerThread.tsx (row 43)
- `triage_qa_round_started`, `triage_qa_round_completed`, `triage_qa_confirmed`, `triage_qa_failed` -- AnswerThread.tsx (rows 19-22)
- `triage_initial_read_started`, `triage_initial_read_completed`, `triage_initial_read_failed` -- StartTriage.tsx (rows 14-16)

### Sentry events (2 new call sites, 1 finding)

- `POST /api/key-validate` -- stages `anthropic_probe` and `mark_byok_used`: already documented in row 44 of METRICS.md. No action needed.
- `POST /api/triage/answer` -- new stage `usage_check` (line 341, fires on `usage_counters` SELECT failure): **missing** from the existing multi-stage row 23. Fixed in commit `4e184e6` by adding `usage_check` to the stage list in the "When it fires" column.

### Files scanned

```
apps/web/app/(app)/_components/ByokKeyProvider.tsx            (none)
apps/web/app/(app)/cards/[id]/_components/AnswerThread.tsx     7 call sites
apps/web/app/(app)/cards/[id]/_components/StartTriage.tsx      4 call sites
apps/web/app/(app)/layout.tsx                                  (none)
apps/web/app/(app)/settings/_components/ByokKeyInput.tsx       1 call site
apps/web/app/(app)/settings/_components/UsageBar.tsx           (none)
apps/web/app/(app)/settings/page.tsx                           (none)
apps/web/app/api/key-validate/route.ts                         2 call sites
apps/web/app/api/triage/answer/route.ts                       12 call sites
apps/web/app/api/triage/route.ts                              10 call sites (all pre-existing)
packages/core/src/supabase.types.ts                            (none)
```

## Dismissals

None.
