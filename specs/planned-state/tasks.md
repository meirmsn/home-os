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
**Status**: done

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

- **T1 — migration timestamp `20260517214500`**: Picked a unique timestamp later than migration 011's `20260517031335` per spec § Data model changes recommendation. Date 2026-05-17, time 21:45:00 — keeps the date stable while ordering after 011 within the same day.
- **T2 — `Date.UTC` round-trip vs `new Date(value)`** for ISO date validation: Used `Date.UTC(y, m-1, d)` over `new Date(value)` to avoid local-timezone parsing variance. Otherwise `new Date('2026-02-30')` would coerce silently (a known JS footgun). The round-trip-equals-input check stays in lock-step with the strict regex check, both required.
- **T2 — `.eq('state', 'planned')` on the UPDATE chain** for state guard (chosen pattern): RLS alone enforces ownership but not state-machine. Adding `.eq('state', 'planned')` to the UPDATE WHERE clause makes the UPDATE race-safe AND atomically returns no row when state has drifted — letting the route's 404-vs-409 disambiguation re-read distinguish the two. Same pattern as `/estimate`'s `.in('state', EDITABLE_STATES)`.
- **T3 — `daysOut` returns rounded integers** (not truncated): `Math.round(deltaMs / 86400000)` over `Math.floor` because the UTC-midnight stripping eliminates fractional days; round is more defensive against any floating-point drift on the delta math.
- **T3 — `had_future_date` computed from the pre-clear props** (not the post-PATCH row): The 200 response doesn't return the prior state; capturing `!props.isReminderDue && prev !== null` from the rendered-frame props is the only way to get the regret-vs-acknowledgment signal correct. After `router.refresh()`, the props are gone.
- **T4 — `_reminder-chip.ts` takes `humanDate` as input** (not the raw ISO): Returns the full `"Revisit by …"` label so callers don't re-concat strings (one place to drift). The chip component formats `humanDate` separately and passes it in — keeps the helper pure and the formatting reusable for future surfaces (PR #4 dashboard tier-1 cards may want a different date abbreviation strategy).
- **T4 — `<BeforeCloseSummary />` combines materials + tools in a single list** (not two parallel sections): Spec § Screens § BeforeCloseSummary describes "first 5 of `materials[]` + non-optional `tools[]` (combined)". The DIY summary annotates tool entries with `(tool)` so the user can still tell them apart at a glance; a single combined list keeps the "to acquire" scan calm vs a noisy two-section layout.
- **T5 — `<ReminderEditor />` mounts for all three chosen paths** (including monitor): Spec § Screens § PlannedView state table shows `<ReminderEditor />` "shown" across all three chosen-path columns. A user who chose Monitor may still want to set an ad-hoc revisit reminder ("check this in 2 months even though I'm monitoring monthly").
- **T6 — `todayIso` uses `new Date().toISOString().slice(0, 10)`** (not `new Date(Date.UTC(y, m, d))`): The slice form is one line + obviously correct (`toISOString()` always returns the UTC ISO string). Both forms produce the same `'YYYY-MM-DD'` shape; the slice form is the recipe codified in spec § Gotchas #3, so the code matches the prose.
- **T7 — E2E uses dynamic relative dates** (`Date.UTC + N days`): Avoids hard-coded calendar dates that drift over the project's lifetime. Each test computes "today + 30 days" or "today - 7 days" at run time; the assertions check the value round-trips through the DB column.
- **T8 — CLAUDE.md adds Gotchas rows 1, 2, 3, 5, 7, 9** (subset, not all 12): Spec § In scope explicitly lists items #1, #2, #3, #5, #7, #9 as "new entries that aren't already documented". The other items (#4 state guard, #6 events-after-200, #8 optional filter, #10 path-map hook, #11 additive props, #12 input min/max) are either already covered by existing CLAUDE.md gotchas (e.g. `tool_choice`-forces-but-model-can-refuse for #6's optimistic posture) or are spec-internal implementation notes that don't generalize to other surfaces.
