# Tasks: contractor-question-retrieval

Derived from `spec.md § Task order` (6 tasks). Read-only presentation
feature — NO migration. Data (`questions_for_contractor`, `contractor_tag`)
already exists.

## Task: Grouping + filter lib + unit tests

**Hat**: FE (pure logic)
**Depends on**: none
**Blocks**: Retrieval route, Metrics
**Done when**: `group-contractor-questions.ts` exports `groupContractorQuestions(rows, now)`, `NUDGE_AGE_DAYS`, and types; the 7 spec test cases pass under `test:unit`.
**Risk**: medium (UTC-slice boundary math)
**Status**: todo

## Task: contractor-tag-label util + tests

**Hat**: FE
**Depends on**: none
**Blocks**: Retrieval route
**Done when**: `contractor-tag-label.ts` maps every non-diy tag → label, safe fallback for diy/unknown; tests pass.
**Risk**: low
**Status**: todo

## Task: Retrieval route + view + nudge + empty state

**Hat**: FE
**Depends on**: Grouping lib, label util
**Blocks**: Dashboard entry point, Metrics
**Done when**: `page.tsx` (auth + RLS SELECT + Sentry-on-error + empty fall-through), `ContractorQuestionsView.tsx` (groups + copy-friendly lists + empty state), `ContractorAppointmentNudge.tsx` (D3 copy) render; `ContractorQuestionsView.test.tsx` passes.
**Risk**: medium
**Status**: todo

## Task: Dashboard entry point

**Hat**: FE
**Depends on**: Retrieval route
**Blocks**: none
**Done when**: `DashboardShell.tsx` renders a `/contractor-questions` link in the header region; test asserts it.
**Risk**: low
**Status**: todo

## Task: Metrics events

**Hat**: FE
**Depends on**: Retrieval route
**Blocks**: none
**Done when**: `ContractorQuestionsViewOpenedCapture.tsx` fires `contractor_questions_view_opened` once/session; nudge fires `contractor_appointment_nudge_shown` on mount; both match METRICS.md shapes; capture tests pass.
**Risk**: low
**Status**: todo

## Task: Playwright E2E

**Hat**: FE
**Depends on**: all above
**Blocks**: none
**Done when**: `contractor-questions.spec.ts` written for 375px + 1440px, dashboard-link nav + nudge case; correct against seed helpers. (CI-slow verifiable.)
**Risk**: low
**Status**: todo

## Decisions

(judgment calls recorded here as they arise)
