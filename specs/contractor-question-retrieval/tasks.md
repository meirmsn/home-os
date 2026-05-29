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
**Status**: done

## Task: contractor-tag-label util + tests

**Hat**: FE
**Depends on**: none
**Blocks**: Retrieval route
**Done when**: `contractor-tag-label.ts` maps every non-diy tag → label, safe fallback for diy/unknown; tests pass.
**Risk**: low
**Status**: done

## Task: Retrieval route + view + nudge + empty state

**Hat**: FE
**Depends on**: Grouping lib, label util
**Blocks**: Dashboard entry point, Metrics
**Done when**: `page.tsx` (auth + RLS SELECT + Sentry-on-error + empty fall-through), `ContractorQuestionsView.tsx` (groups + copy-friendly lists + empty state), `ContractorAppointmentNudge.tsx` (D3 copy) render; `ContractorQuestionsView.test.tsx` passes.
**Risk**: medium
**Status**: done

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
**Status**: done (folded into Task 3 vertical slice — capture components committed with the view they mount)

## Task: Playwright E2E

**Hat**: FE
**Depends on**: all above
**Blocks**: none
**Done when**: `contractor-questions.spec.ts` written for 375px + 1440px, dashboard-link nav + nudge case; correct against seed helpers. (CI-slow verifiable.)
**Risk**: low
**Status**: todo

## Decisions

- **Grouping lib (Task 1)**: Group ordering "alphabetical-by-display-label" (spec § Output shape) requires the label, so the lib imports `contractorTagLabel` and sorts groups by it (tie-break on raw tag for total stability). This couples Task 1 → Task 2's util, so Task 2 was committed first.
- **Grouping lib (Task 1)**: Card `title` falls back `title || initial_description || 'Untitled'` — spec says "title (or initial_description fallback)"; added a final 'Untitled' guard so a card with both null still renders a non-empty heading.
- **Docs-coverage (Task 1 commit)**: README route row for `/contractor-questions` (covering the grouping lib) was added in the Task 2 commit; the Task 1 commit recorded a `Docs-Coverage-Bypass:` trailer rather than re-touching the README.
- **Tokens (Task 3)**: spec named `--color-surface-raised` / `--color-border-subtle`, but globals.css `@theme` only defines `--color-background-raised` / `--color-border-default` (the spec names are dead tokens used by DashboardCard). Used the actually-defined tokens (matching CadenceEditor/ChoosePath) so surfaces/borders render.
- **Task 5 folded into Task 3**: the two capture components are imported+mounted by the view, so they ship in the same atomic vertical-slice commit. Each got a dedicated `.test.tsx` (rather than a `.devshop-test-coverage-exempt` entry — the `(app)` route-group parens break the exempt-check's cited-path regex, so dedicated tests are the clean path).
- **Nudge copy (Task 3)**: used the exact spec D3 copy ("You have {N} open questions for your {Label} contractor.") verbatim, including always-plural "questions", to keep e2e/acceptance exact-match stable.
