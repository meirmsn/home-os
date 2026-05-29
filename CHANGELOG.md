# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1.0] - 2026-05-28

### Added

- Triage eval harness under `apps/web/eval/triage/`: a 75-issue labeled dataset spanning 9 home-maintenance categories, a deterministic scoring module, and a runner (`pnpm eval:triage`) that grades the triage AI against the dataset and prints per-category accuracy. Lets a maintainer catch triage-quality regressions before a prompt change ships.
- Dataset integrity tests (count, unique IDs, enum validity, category balance) and scoring-module unit tests wired into the Vitest suite so the eval harness itself stays correct.
- `apps/web/eval/triage/README.md` documenting the dataset schema, how to run the eval, and how to read its output; `apps/web/README.md` gains a note pointing prompt changes at the eval.

## [0.1.0.0] - 2026-05-26

### Added

- Cards can now be closed after completing a repair or scheduling a contractor, with an optional spend log (dollar amount + notes) and a finished photo that automatically pairs with the original capture for a visual before-and-after.
- Migration 013: `touchpoint_type` enum extended with `'close'`; `cards.actual_spend_cents` and `cards.spend_notes` columns added; `close_card` SECURITY DEFINER RPC enforces the PLANNED-to-CLOSED state guard atomically.
- `POST /api/card/[id]/close` route handles multipart form data (optional spend + optional photo) with photo-first-state-second ordering to prevent photo loss on terminal state transitions.
- `<CloseCardForm />` client component on PlannedView provides a low-friction inline expansion for closing cards, with PostHog `card_close_started` and `card_closed` events.
- `<ClosedView />` server component replaces the one-line closed stub with severity chip, calm-green "Closed" chip, spend log, diagnosis thread collapsible, and before/after photo pair.
- `<BeforeAfterPhotos />` component renders four photo-present/absent states in a responsive grid with signed URLs.
- 5 E2E Playwright test cases covering the close flow end-to-end.
- 54 new unit/integration tests across route, components, and page integration.
