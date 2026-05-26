# Tasks: usage-counters-and-byok

## Decisions

- D1: `confirm_triage` RPC extended with atomic triage_session_count increment + week-rollover (same `claim_card_slot` pattern).
- D2: Usage check in `/api/triage/answer` only, free-tier only, before Claude call. Initial read always free.
- D3: BYOK key via `byok_key` request body field — React state only, never persisted.
- D4: `POST /api/key-validate` — minimal `claude-haiku-4-5` probe, returns `{ valid: true }` or `{ error }`.
- D5: `/settings` route in `(app)` group. Gear icon in header.
- D6: Usage bar: 4px progress bar, indigo under limit, terracotta at 5/5.
- D7: BYOK two-state UI: State A (first-time, explainer + input), State B (returning, input only).
- D8: Two new PostHog events: `byok_key_validated`, `triage_limit_reached`.

## Tasks

### T1: Migration 014 + types regen

- [x] Write migration SQL
- [x] Apply via pnpm db:reset
- [x] Regen types via pnpm db:gen-types
- [x] Verify mark_byok_used in types
- [x] Commit

### T2: POST /api/key-validate route + tests

- [x] Create route handler
- [x] Create route tests (~8 cases)
- [x] Commit

### T3: POST /api/triage + POST /api/triage/answer modifications + tests

- [x] Add byok_key to /api/triage
- [x] Add byok_key + usage check to /api/triage/answer
- [x] Add route tests (~8 new cases)
- [x] Commit

### T4: ByokKeyProvider React context

- [x] Create provider component
- [x] Create tests (~4 cases)
- [x] Commit

### T5: /settings page + UsageBar + ByokKeyInput + tests

- [x] Create settings page (server component)
- [x] Create UsageBar component
- [x] Create ByokKeyInput component
- [x] Create component tests
- [x] Commit

### T6: Header gear icon in layout

- [x] Add gear icon to layout
- [x] Mount ByokKeyProvider
- [x] Commit

### T7: Limit-reached UI in AnswerThread + StartTriage BYOK

- [x] Handle TRIAGE_LIMIT_REACHED in AnswerThread
- [x] Pass byokKey in StartTriage + AnswerThread fetch
- [x] Add tests
- [x] Commit

### T8: E2E spec

- [ ] Create Playwright spec (5 cases)
- [ ] Commit

### T9: Docs

- [x] Update CLAUDE.md
- [x] Update METRICS.md
- [x] Commit
