# tasks: decide-state

Dependency-ordered task breakdown for the `decide-state` PR. Mirrors `spec.md § Task order`.

## Task: T1 — Migration 011 + types regen

**Hat**: Data
**Depends on**: none
**Blocks**: T2–T15
**Done when**: `pnpm db:reset` applies cleanly; `pnpm db:gen-types` regenerates `packages/core/src/supabase.types.ts` with the new enum values + columns + RPCs; tests still green.
**Risk**: medium
**Status**: done

## Task: T2 — Extend `_lib/parse-qa-output.ts` + shared estimate-shapes helper

**Hat**: BE
**Depends on**: none
**Blocks**: T5, T7
**Done when**: `parseDiyExpansion` + `parseContractorExpansion` exist (factored into shared `_lib/estimate-shapes.ts` per spec micro-opt); `parseConfirmAssessment` calls them; ~25 new test cases cover the locked-shape envelope.
**Risk**: medium
**Status**: done

## Task: T3 — Extend `_lib/anthropic-qa.ts` confirm_assessment tool schema

**Hat**: BE
**Depends on**: T2
**Blocks**: T5
**Done when**: confirm_assessment tool definition includes `diy_expansion` + `contractor_expansion` properties + `required` lists; existing test extended.
**Risk**: low
**Status**: done

## Task: T4 — Extend `_lib/prompt-qa.ts` for expansion fields

**Hat**: BE
**Depends on**: T3
**Blocks**: T5
**Done when**: `DEFAULT_QA_SYSTEM_PROMPT` instructs the model on the expansion fields; total length still ≤ PROMPT_MAX_CHARS (3500); paired tests still green.
**Risk**: low
**Status**: done

## Task: T5 — Wire `/api/triage/answer` to confirm_triage's new params

**Hat**: BE
**Depends on**: T1, T2, T3, T4
**Blocks**: T15
**Done when**: Route forwards `parsed.value.diy_expansion` + `parsed.value.contractor_expansion` to `confirm_triage` RPC as `p_diy_expansion` + `p_contractor_expansion`; route test extended for the new path.
**Risk**: low
**Status**: done

## Task: T6 — `POST /api/cards/[id]/decide` route + helpers + tests

**Hat**: BE
**Depends on**: T1
**Blocks**: T10, T11, T13, T15
**Done when**: Route + `_lib/parse-decide-body.ts` validator exist; tests cover all 6 envelopes (200/400/401/404/409/500).
**Risk**: medium
**Status**: done

## Task: T7 — `PATCH /api/cards/[id]/estimate` route + helpers + tests

**Hat**: BE
**Depends on**: T1, T2
**Blocks**: T9, T15
**Done when**: Route + `_lib/parse-estimate-override.ts` (re-exporting helpers from `_lib/estimate-shapes.ts`) exist; tests cover 200 each path, 200 reset, 400 invalid shape, 401, 404, 409, 200 override at monitoring.
**Risk**: medium
**Status**: done

## Task: T8 — `<PathCard />` server component + test

**Hat**: FE
**Depends on**: T1
**Blocks**: T9, T12, T13
**Done when**: Component renders DIY/contractor collapsed + expanded views with override-or-app data + "edited" badge; 8+ test cases.
**Risk**: low
**Status**: done

## Task: T9 — `<EstimateEditor />` client component + test

**Hat**: FE
**Depends on**: T7, T8
**Blocks**: T12
**Done when**: Inline edit form with per-field controls; save + reset POST/PATCH; 10+ test cases.
**Risk**: medium
**Status**: done

## Task: T10 — `<ChoosePath />` client component + test

**Hat**: FE
**Depends on**: T6
**Blocks**: T12, T13
**Done when**: 4-button row + greyed-state for planned; PostHog events fire; 9+ test cases.
**Risk**: medium
**Status**: done

## Task: T11 — `<MonitorCadencePicker />` client component + test

**Hat**: FE
**Depends on**: T6
**Blocks**: T10, T12
**Done when**: Inline cadence stepper with min/max bounds; confirms POST with cadence; 6+ test cases.
**Risk**: low
**Status**: done

## Task: T12 — `<DecideView />` server component + test

**Hat**: FE
**Depends on**: T8, T9, T10, T11
**Blocks**: T14
**Done when**: Composes severity chip + 2 PathCards + ChoosePath + collapsible "How we diagnosed this"; 6+ test cases.
**Risk**: low
**Status**: todo

## Task: T13 — `<PlannedView />` server component + test

**Hat**: FE
**Depends on**: T8, T6
**Blocks**: T14
**Done when**: Chosen-path summary + chosen-path detail + "Change decision" link + greyed ChoosePath; 5+ test cases.
**Risk**: low
**Status**: todo

## Task: T14 — `cards/[id]/page.tsx` body extension

**Hat**: FE
**Depends on**: T12, T13
**Blocks**: T15
**Done when**: Page renders `<DecideView />` on state=decide, `<PlannedView />` on state=planned; CardState + CardRow types widened; 4+ new test cases.
**Risk**: low
**Status**: todo

## Task: T15 — `apps/web/e2e/decide-state.spec.ts`

**Hat**: BE
**Depends on**: T5, T6, T7, T10, T12, T13, T14
**Blocks**: T16
**Done when**: 5-case Playwright spec exists; skips gracefully on non-local.
**Risk**: medium
**Status**: todo

## Task: T16 — Docs (CLAUDE.md, METRICS.md, tasks.md)

**Hat**: PM
**Depends on**: T1–T15
**Blocks**: none
**Done when**: CLAUDE.md § Where Things Happen has new rows + Gotchas entries; METRICS.md has the 6 new event rows; tasks.md updated.
**Risk**: low
**Status**: todo

## Decisions

(judgment calls made during implementation, appended as they happen)
