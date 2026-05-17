<!-- generated-by: /ak-implement Phase 2 -->
<!-- feature: planned-state -->
<!-- date: 2026-05-17 -->

# Tasks: planned-state

Dependency-ordered. ⟶ marks the critical chain. Spec at `specs/planned-state/spec.md`.

## Task: T1 — Migration 012 + types regen

**Hat**: Data
**Depends on**: none
**Blocks**: T2, T6
**Done when**: Migration file exists, `pnpm db:reset` applies cleanly, `packages/core/src/supabase.types.ts` regenerated with `planned_reminder_date: string | null` on the `cards` Row/Insert/Update, `cards_planned_reminder_due_idx` exists in pg_catalog.
**Risk**: low
**Status**: todo

## Task: T2 — PATCH /api/card/[id]/reminder route + parser + tests

**Hat**: BE
**Depends on**: T1
**Blocks**: T3, T7
**Done when**: `parse-reminder-body.ts` validates with strict ISO regex + Date round-trip + null path; route handler enforces auth, state guard (`planned` only — 6 states → 409), narrow 404-vs-409 re-read, RLS-enforced UPDATE; ~14 route tests + ~12 parser tests pass.
**Risk**: medium

## Task: T3 — `<ReminderEditor />` client component + tests

**Hat**: FE
**Depends on**: T2
**Blocks**: T5, T7
**Done when**: Three render states (A/B/C); native `<input type="date">`; PATCH wiring; `planned_reminder_set` / `planned_reminder_cleared` / `planned_reminder_edited` fire AFTER 200 via `posthog-js`; ~11 tests pass.
**Risk**: medium

## Task: T4 — `<ReminderDueChip />` + `<BeforeCloseSummary />` + `_reminder-chip.ts` + tests

**Hat**: FE
**Depends on**: T1
**Blocks**: T5, T6, T7
**Done when**: `_reminder-chip.ts` mirrors `_severity-chip.ts` posture; `<ReminderDueChip />` uses `--color-planned`; `<BeforeCloseSummary />` branches on `chosenPath`, filters `tools[].optional !== true`, override-wins-over-app via `(override ?? estimate)`, `<details>` collapsible for `+N more`; ~19 tests pass.
**Risk**: low

## Task: T5 — `<PlannedView />` extension + tests

**Hat**: FE
**Depends on**: T3, T4
**Blocks**: T6, T7
**Done when**: Two new props (`plannedReminderDate`, `isReminderDue`) added without removing existing; `<BeforeCloseSummary />` mounted between PathCard and ChoosePath (skipped for monitor); `<ReminderEditor />` mounted after ChoosePath; ~6 new test cases extend the existing suite.
**Risk**: low

## Task: T6 — `cards/[id]/page.tsx` wiring

**Hat**: FE
**Depends on**: T1, T4, T5
**Blocks**: T7
**Done when**: `CardRow` widened, SELECT list extended; `isReminderDue` derived inline via UTC-safe string comparison (Gotcha #3); `<ReminderDueChip />` mounted conditionally in header; `<PlannedView />` invocation threads new props; ~5 new test cases extend the existing suite.
**Risk**: low

## Task: T7 — `apps/web/e2e/planned-state.spec.ts`

**Hat**: BE/FE
**Depends on**: T2, T3, T4, T5, T6
**Blocks**: T8
**Done when**: 5 Playwright cases per § E2E — happy path DIY, due-chip from seeded past date, edit + signed `days_out`, Contractor BeforeCloseSummary, state guard 409 across non-planned states. Skip gracefully on non-local Supabase.
**Risk**: medium

## Task: T8 — Docs (CLAUDE.md / METRICS.md / PLAN.md)

**Hat**: PM
**Depends on**: T1–T7
**Blocks**: none
**Done when**: CLAUDE.md § Where Things Happen gains 7+ new rows (route + parser + 3 components + helper + migration + page extension); § Gotchas codifies Gotchas #1, #2, #3, #5, #7, #9 from this spec; METRICS.md grows 3 rows; PLAN.md row #1 stays in `## Active` (Phase 0 already moved it). Pre-commit `check-docs-freshness-project.sh` passes.
**Risk**: low

## Decisions

(Resolved at implementation time. Supplements spec D1–D9; never overrides.)
