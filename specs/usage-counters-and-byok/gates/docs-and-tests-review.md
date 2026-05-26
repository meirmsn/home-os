## Gate 5: docs-and-tests-review

**Audit 1** | HEAD: `14d2abc` | Range: `origin/main..HEAD` (14 commits)

### Docs audit

| Doc file     | Surface                          | Status   | Notes                                                                                                                                                                                                           |
| ------------ | -------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`  | `/settings` route                | **pass** | Mentioned in migration 014 gotcha bullet (line 41): "Key surfaces: `POST /api/key-validate` (BYOK validation), `/settings` page (usage bar + BYOK input), `ByokKeyProvider` (React context in `(app)` layout)." |
| `CLAUDE.md`  | BYOK key handling gotcha         | **pass** | Dedicated bullet (line 31): "BYOK key must NEVER be logged, persisted, or included in error payloads."                                                                                                          |
| `CLAUDE.md`  | Usage check NULL row gotcha      | **pass** | Dedicated bullet (line 33).                                                                                                                                                                                     |
| `CLAUDE.md`  | Session count increment gotcha   | **pass** | Dedicated bullet (line 35).                                                                                                                                                                                     |
| `CLAUDE.md`  | Initial-read asymmetry gotcha    | **pass** | Dedicated bullet (line 37).                                                                                                                                                                                     |
| `CLAUDE.md`  | key-validate 200 envelope gotcha | **pass** | Dedicated bullet (line 39).                                                                                                                                                                                     |
| `CLAUDE.md`  | Migration 014 path-map           | **pass** | Dedicated bullet (line 41).                                                                                                                                                                                     |
| `METRICS.md` | `byok_key_validated` event       | **pass** | Row present with correct fire-site, properties, and rationale.                                                                                                                                                  |
| `METRICS.md` | `triage_limit_reached` event     | **pass** | Row present with correct fire-site, properties, and rationale.                                                                                                                                                  |
| `METRICS.md` | Sentry `POST /api/key-validate`  | **pass** | Row present with both stages (`anthropic_probe`, `mark_byok_used`).                                                                                                                                             |
| `METRICS.md` | Sentry `usage_check` stage       | **pass** | Mentioned in the existing `POST /api/triage/answer` row.                                                                                                                                                        |

### Tests audit

#### Route tests

| File                          | Spec requirement      | Actual test count                       | Key behaviors covered                                                                                                                                                                                                                  | Status   |
| ----------------------------- | --------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `key-validate/route.test.ts`  | 8+ cases              | 10 cases                                | auth 401, bad JSON 400, missing key 400, empty key 400, valid key 200, mark_byok_used called, invalid_key (Anthropic 401), out_of_credits (Anthropic 402), network error 500 + Sentry, mark_byok_used failure still returns valid:true | **pass** |
| `triage/route.test.ts`        | 3+ new BYOK cases     | 4 BYOK cases (dedicated describe block) | BYOK key pass-through, byok_invalid on 401, byok_out_of_credits on 402, server key fallback                                                                                                                                            | **pass** |
| `triage/answer/route.test.ts` | 5+ usage + BYOK cases | 9 new cases (2 describe blocks)         | TRIAGE_LIMIT_REACHED at count>=5, under-limit proceeds, NULL row as count=0, stale week_start as count=0, usage query error 500, BYOK skips usage check, BYOK key pass-through, byok_invalid on 401, byok_out_of_credits on 402        | **pass** |

#### Component tests

| File                       | Spec requirement   | Actual test count               | Key behaviors covered                                                                                                                                                                                          | Status      |
| -------------------------- | ------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `ByokKeyProvider.test.tsx` | 4+ cases           | 4 cases                         | initial null, setByokKey updates, clearByokKey resets, throws outside provider                                                                                                                                 | **pass**    |
| `UsageBar.test.tsx`        | 4+ cases           | 7 cases                         | count text, 60% fill, indigo under limit, terracotta at 5/5, "Resets Monday", hasByokKey text variant, cap fill at 100%                                                                                        | **pass**    |
| `ByokKeyInput.test.tsx`    | 8+ cases           | 8 cases                         | State A explainer, State B hides explainer, input + button render, empty disables, valid shows "Key accepted" + PostHog, invalid_key error, out_of_credits + billing link, network error, loading state        | **pass**    |
| `AnswerThread.test.tsx`    | 3+ new limit cases | 6 new cases (2 describe blocks) | limit-reached banner renders, settings link present, triage_limit_reached PostHog fires with resets prop, does NOT fire triage_qa_failed on limit, BYOK key included in fetch body, BYOK key omitted when null | **pass**    |
| `layout.test.tsx`          | 2+ gear icon cases | **0 gear icon cases**           | No test for gear icon link presence or href                                                                                                                                                                    | **finding** |

#### E2E tests

| File                                           | Spec requirement | Status                            |
| ---------------------------------------------- | ---------------- | --------------------------------- |
| `apps/web/e2e/usage-counters-and-byok.spec.ts` | 5 cases          | **finding** — file does not exist |

#### StartTriage BYOK pass-through

| File                   | Spec requirement                    | Status                                                                                |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| `StartTriage.test.tsx` | BYOK key pass-through in fetch body | **finding** — mock hardcodes `byokKey: null`, never tests the BYOK key inclusion path |

### Findings

| #   | Severity   | Category | Finding                                                                                                                                                                                                                                                                                                                           |
| --- | ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **medium** | tests    | `layout.test.tsx` does not test the gear icon link. The spec (T6) requires 2+ new cases: gear icon link present, gear icon links to `/settings`. The layout source renders `data-testid="settings-link"` with `href="/settings"`, but no test asserts either.                                                                     |
| F2  | **medium** | tests    | `apps/web/e2e/usage-counters-and-byok.spec.ts` does not exist. The spec (T8) requires a 5-case Playwright E2E spec covering: settings page renders usage bar, usage bar at limit shows terracotta, BYOK validation happy path, triage limit blocks Q&A, BYOK bypasses limit.                                                      |
| F3  | **low**    | tests    | `StartTriage.test.tsx` mocks `useByokKey` to return `byokKey: null` and never tests the path where `byokKey` is present and gets included in the fetch body as `byok_key`. The source code at lines 89-92 has this conditional logic. AnswerThread has equivalent coverage (2 BYOK pass-through tests), but StartTriage does not. |

### Dismissals

No findings dismissed.

### Verdict

**findings (3) pending** -- 2 medium, 1 low. The gear icon layout tests (F1) and E2E spec (F2) are spec-required test surfaces that are missing. The StartTriage BYOK test gap (F3) is lower severity since AnswerThread covers the equivalent pattern and the route-level tests cover the server-side contract.
