<!-- generated-by: /ak-implement Phase 2 -->
<!-- feature: close-flow -->
<!-- date: 2026-05-26 -->

# Tasks: close-flow

Dependency-ordered. Spec at `specs/close-flow/spec.md`.

## Decisions

- D1: Migration 013 adds `cards.actual_spend_cents int NULL` + `cards.spend_notes text NULL`. No CHECK on negative.
- D2: Same migration adds `'close'` to `touchpoint_type` enum via rename-recreate (006a recipe). No function-dependency dance needed.
- D3: New SECURITY DEFINER RPC `close_card(p_user, p_card, p_spend_cents, p_spend_notes)` — guards `state='planned'` ONLY.
- D4: `POST /api/card/[id]/close` with `multipart/form-data`. Photo upload BEFORE RPC call. Envelope: 200/400/401/404/409/500.
- D5: `<CloseCardForm />` client component — inline expansion below `<ReminderEditor />`. "Mark as closed" button.
- D6: `<ClosedView />` server component — severity chip + calm-green "Closed" chip + before/after + spend + thread.
- D7: `<BeforeAfterPhotos />` — earliest `touchpoint_type='primary'` + latest `touchpoint_type='close'`.
- D8: PostHog events: `card_close_started` (expand) + `card_closed` (POST 200).

## Task: T1 — Migration 013 + types regen

**Hat**: Data
**Depends on**: none
**Blocks**: T2, T4, T6
**Done when**: Migration file exists with touchpoint_type rename-recreate + additive columns + close_card RPC; `pnpm db:reset` applies cleanly; `packages/core/src/supabase.types.ts` regenerated with `'close'` in `touchpoint_type`, `actual_spend_cents` + `spend_notes` on cards, `close_card` in Functions.
**Status**: pending

## Task: T2 — `POST /api/card/[id]/close` route + tests

**Hat**: BE
**Depends on**: T1
**Blocks**: T3, T7
**Done when**: Multipart form handler with auth + validation + Storage upload + RPC call. ~14 route tests covering 200/400/401/404/409/500 matrix.
**Status**: pending

## Task: T3 — `<CloseCardForm />` client component + tests

**Hat**: FE
**Depends on**: T2
**Blocks**: T5, T7
**Done when**: "Mark as closed" → expand → inline form → POST. PostHog events. ~12 tests.
**Status**: pending

## Task: T4 — `<ClosedView />` + `<BeforeAfterPhotos />` server components + tests

**Hat**: FE
**Depends on**: T1
**Blocks**: T6, T7
**Done when**: ClosedView composes severity chip + closed chip + date + spend + photo pair + thread. BeforeAfterPhotos handles 4 photo states. ~16 tests total.
**Status**: pending

## Task: T5 — `<PlannedView />` extension

**Hat**: FE
**Depends on**: T3
**Blocks**: T7
**Done when**: `<CloseCardForm />` mounted below `<ReminderEditor />` for all 3 chosen paths, NOT mounted when chosenPath=null. 2+ new tests.
**Status**: pending

## Task: T6 — `cards/[id]/page.tsx` closed-state wiring

**Hat**: FE
**Depends on**: T1, T4
**Blocks**: T7
**Done when**: CardRow extended with actual_spend_cents + spend_notes; SELECT list updated; closed-state stub replaced with `<ClosedView />`; close-photo signed URL queries added. 4+ new tests.
**Status**: pending

## Task: T7 — `apps/web/e2e/close-flow.spec.ts`

**Hat**: E2E
**Depends on**: T2, T3, T4, T5, T6
**Blocks**: T8
**Done when**: 5-case Playwright spec per spec section.
**Status**: pending

## Task: T8 — Docs

**Hat**: Docs
**Depends on**: T7
**Blocks**: none
**Done when**: CLAUDE.md path-map + gotchas, METRICS.md events, PLAN.md bookkeeping updated.
**Status**: pending
