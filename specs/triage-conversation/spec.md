<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: triage-conversation -->
<!-- date: 2026-05-16 -->

# Spec: triage-conversation (PR N)

**Sources:**

- `PLAN.md § Planned #1` — primary scope (this row)
- `PRODUCT-ROADMAP.md` — long-horizon context (v0 Phase 1)
- `.gstack/design-review-home-os-2026-05-02.md § TRIAGE — Two-Phase Diagnostic Conversation` — UI surface (Phase 2: Clarifying Conversation, Confirmed Assessment, Diagnostic thread)
- `.gstack/eng-review-home-os-2026-05-01.md § Triage Route Handler Logic + § Build Order (Phase 1) step 6 + § Business Logic` — server-side conversation + location handling
- `.gstack/ceo-review-home-os-2026-05-01-r2.md § Scope (AI triage)` — premises, scope boundaries
- Prior spec `specs/triage-route-handler/spec.md` — style + structure reference; this PR builds on its surfaces
- `apps/web/app/(app)/cards/[id]/page.tsx` lines 1–16 — the diagnosed-body extension hook ("answer-input dialog slots in below the diagnosed preview without page replacement") set up for this PR
- `supabase/migrations/20260513184101_002_tables.sql` — pre-existing `triage_conversations` + `cards.monitoring_cadence_days` + `users.location` columns this PR uses without re-creating

PR N delivers the multi-round Q&A loop on top of the initial read. Up to 3 diagnostic rounds, with one free location ask outside the budget. AI proposes a monitoring cadence at confirmation; user sees a confirmed severity and a persistent collapsible "How we diagnosed this" thread on the card. Closes PLAN row #1 (`triage-conversation`); unblocks row #2 (`decide-state`).

---

## Decisions (resolved at spec time)

10 `/ak-spec`-time decisions resolved in Phase 0 with the user. Recorded below so Phase 1 preserves them verbatim and a crashed Phase 1 resumes without re-asking.

### D1: Endpoint shape — new route vs. extend `/api/triage`

**Decision:** New route `POST /api/triage/answer` taking `{ card_id: uuid, answer?: string, skip?: true }`. `/api/triage` (PR #19) stays "initial read only".

**Rationale:** Initial-read auth/state machine (transitions `capturing → triaging → diagnosed`) differs from Q&A turn auth/state (operates on cards already in `diagnosed`, ends by flipping `severity_confirmed=true`). Cleaner test boundaries. Mirrors the `claim_card_slot` vs `start_triage` separation already established in this codebase.

### D2: State machine — how to express provisional vs. confirmed assessment

**Decision:** Add `cards.severity_confirmed boolean not null default false`. Card state stays `diagnosed` through all Q&A rounds; the boolean flips to `true` on confirmation. `card_state` enum is untouched in this PR — row #2 (`decide-state`) introduces its own state moves.

**Rationale:** Avoids `ALTER TYPE ADD VALUE` split-migration overhead. Boolean reads cleanly from the cards/[id] page's state-switched body. Rolling back is a single column-drop, not an enum-value retirement. PR #2 (decide-state) will introduce richer states (`decide`, `planned`, …) on top.

### D3: Anthropic tool shape — two tools, `tool_choice: auto`

**Decision:** Two custom tools, model picks via `tool_choice: { type: 'auto' }`.

- `ask_next_question` — fields: `question: string`, `is_location_ask: boolean`, `updated_provisional_severity: severity_enum`, `reasoning_so_far: string`
- `confirm_assessment` — fields: `final_diagnosis: string`, `severity_confirmed: severity_enum`, `system_tag: system_tag_enum`, `contractor_tag: contractor_tag_enum`, `monitoring_cadence_days_proposal: int`, `confidence_note: string`, `sources: { url, title }[]` (≤ 5)

`web_search_20260209` stays available (max 5 uses per turn, same as initial read).

**Rationale:** Lets the model express "I'm done" structurally rather than via a confidence-threshold hack on a single-tool output. Each tool has its own validator with its own discriminant — the type system pins which fields are required. The `tool_choice: auto` path means the AI decides per turn whether to keep asking or finalize.

### D4: 3-round limit — server-enforced via force-tool

**Decision:** Server counts rows in `triage_conversations` where `card_id = ? AND role = 'user' AND is_location_ask = false`. If count ≥ 3 when the next round begins, the route handler forces `tool_choice: { type: 'tool', name: 'confirm_assessment' }` on the Claude call instead of `{ type: 'auto' }`. The location ask never counts toward the budget.

**Rationale:** Server-side cap (not prompt cap) — robust to model misbehavior. `is_location_ask=true` rows are the discriminator. Matches the same posture as initial-read's force-tool for `record_initial_read`.

### D5: Schema additions — migration 008

**Decision:** One migration file (no enum-add splits needed):

- `alter table public.cards add column severity_confirmed boolean not null default false;`
- `alter table public.triage_conversations add column is_location_ask boolean not null default false;`
- `alter table public.triage_conversations add column tool_name text;` — records which Claude tool produced the assistant row (`record_initial_read` | `ask_next_question` | `confirm_assessment`). Nullable for the pre-PR rows that have no tool attribution.
- Two new SECURITY DEFINER RPCs (each pins `search_path = public, pg_catalog` and guards `p_user = auth.uid()` internally — matches `start_triage` / `complete_triage` posture from migration 007):
  - `public.answer_triage_round(p_user uuid, p_card uuid, p_user_answer text, p_assistant_content jsonb, p_tool_name text, p_is_location_ask boolean, p_user_round int)` — atomic INSERT of two rows into `triage_conversations` (round=`p_user_round`, role=`'user'`, content=`p_user_answer`, is_location_ask=`p_is_location_ask`, tool_name=null) AND (round=`p_user_round`, role=`'assistant'`, content=`p_assistant_content::text`, is_location_ask=false, tool_name=`p_tool_name`). Returns the inserted assistant row id.
  - `public.confirm_triage(p_user uuid, p_card uuid, p_diagnosis text, p_severity public.severity, p_system_tag public.system_tag, p_contractor_tag public.contractor_tag, p_monitoring_cadence_days int, p_assistant_content jsonb, p_user_round int, p_skip boolean, p_user_answer text)` — atomic: optionally INSERT user row when `p_skip=false` and `p_user_answer is not null`; INSERT assistant row (round=`p_user_round`, role=`'assistant'`, tool_name=`'confirm_assessment'`); UPDATE cards set diagnosis, severity, system_tag, contractor_tag, monitoring_cadence_days, severity_confirmed=true, updated_at=now(). Predicate-guards on `state='diagnosed' AND severity_confirmed=false` so concurrent confirms don't both succeed.

**Rationale:** Atomic writes guard the Q&A invariants (two-row pair always lands together; confirmation can't half-land). SECURITY DEFINER + internal auth check is the established pattern in this codebase. The `tool_name` column is what makes "How we diagnosed this" rendering trivially routable to the right UI variant per row.

**Migration ordering note:** the existing `triage_conversations` rows from PR #19 (initial-read assistant rows) get `tool_name=null` after the column is added, and the migration follows with `update public.triage_conversations set tool_name = 'record_initial_read' where role = 'assistant' and tool_name is null and round = 1;` so the prior data is back-filled without a manual step.

### D6: Location ask — answer dual-writes to `users.location`

**Decision:** When the previous round's `ask_next_question.is_location_ask=true`, the route handler dual-writes the user's answer: (a) into `triage_conversations` via `answer_triage_round` (with `p_is_location_ask=true`), and (b) into `public.users.location` via a separate UPDATE (still under the user's RLS context). The location-ask round does not count against the 3-round budget (D4).

**Rationale:** Per design § Location ask + eng-review § Location handling — silent storage on the user row + reuse on subsequent triages. Spec text is conversational; storage shape is structural. No new column on `users`; `users.location text` (migration 002) is reused.

### D7: New PostHog events — 4 events

**Decision:** Four new events added to METRICS.md:

- `triage_qa_round_started` — fired from `<AnswerThread />` when the user clicks "Send" (or "Skip"). Props: `{ card_id: string, round_number: number, is_skip: boolean }`.
- `triage_qa_round_completed` — fired when `POST /api/triage/answer` returns 200 with `ask_next_question`. Props: `{ card_id: string, round_number: number, latency_ms: number, is_location_ask: boolean, search_count: number }`.
- `triage_qa_confirmed` — fired when `POST /api/triage/answer` returns 200 with `confirm_assessment`. Props: `{ card_id: string, total_rounds: number, severity: string, contractor_tag: string, monitoring_cadence_days: number, latency_ms: number, was_forced: boolean }`.
- `triage_qa_failed` — fired when `POST /api/triage/answer` returns non-2xx or fetch throws. Props: `{ card_id: string, round_number: number, error_class: string, latency_ms: number }`.

**Rationale:** Mirrors the initial-read event triad. `was_forced` (true when round-3 forced `confirm_assessment`) is the calibration signal — "did the AI ever finalize on its own, or did our cap always fire?". `tool_used` is implicit in event name (round_completed vs confirmed).

### D8: UI — where does the Q&A surface live

**Decision:** No new route. On `/(app)/cards/[id]` page, the diagnosed-state body (already wired in PR #19) is extended with:

- `<AnswerThread />` client component, mounted below the existing initial-read preview. Renders prior user+assistant rounds (server-fetched and passed as a prop), the active question, a textarea, a "Send" button, and a "Skip — give me your best assessment" button (visible from round ≥ 1).
- After confirmation (server-side `severity_confirmed=true`), the page replaces `<AnswerThread />` with `<DiagnosedThread />` — a server-rendered collapsible "How we diagnosed this" section (closed by default), rendering the full triage_conversations thread inline, plus the confirmed diagnosis / severity / system_tag / contractor_tag / monitoring_cadence_days_proposal above it.

**Rationale:** Reuses the cards/[id] state-switched body (`severity_confirmed` is the new discriminant within the `diagnosed` state). Server-renders prior thread avoids a spinner on revisit; client component only owns the active turn. No new auth gating, no new middleware prefix.

### D9: "Skip — confirm now" affordance

**Decision:** Second button alongside "Send" in `<AnswerThread />`, visible from round ≥ 1 (i.e. after the first AI question has been served). POSTs to `/api/triage/answer` with `{ card_id, skip: true }`. Server forces `tool_choice: { type: 'tool', name: 'confirm_assessment' }` for that Claude call and skips the user-answer row insert (the user did not provide one). `triage_qa_round_started.is_skip=true` for telemetry.

**Rationale:** Per design § Phase 2 — "Ends when AI reaches a confident assessment, OR user indicates they want to proceed with current information". Required for low-stakes flows and impatient users; the AI must surface its best read with explicit uncertainty per eng-review rescue #11.

### D10: Failure semantics — save assistant row AFTER successful parse

**Decision:** On Anthropic 5xx / 429 / parse failure mid-Q&A, the route handler returns the same envelope as initial-read (503 `triage_unavailable`, 429 `triage_rate_limited`, 502 `triage_invalid_output`). No state change: card stays `diagnosed`, `severity_confirmed` stays `false`, no triage_conversations rows inserted for the failed turn. The user retries with the same answer text — fresh Claude call, fresh round numbering.

**Rationale:** Differs slightly from eng-review § Triage Route Handler step 8 ("save AI response BEFORE returning to client") — but that line was written for the initial-read shape, not for a retry-friendly turn loop. Saving only on parse success means retries don't pollute the thread with mid-failed turns. Matches initial-read's posture.

### D11: E2E test seam — reuse `ANTHROPIC_BASE_URL` mock

**Decision:** New spec `apps/web/e2e/triage-conversation.spec.ts`. Reuses the local-HTTP-server mock pattern from `apps/web/e2e/triage-route-handler.spec.ts` via the `ANTHROPIC_BASE_URL` env override. Covers: (a) single-round happy path (round 1 ask → confirm), (b) 3-round force-confirm path, (c) location-ask path with `users.location` write verified, (d) skip path, (e) 503 retry. `test.skip(!isLocalSupabase, …)` for graceful CI behavior — same posture as the initial-read E2E.

**Rationale:** Same seam, same skip guard, same shape. No new mock infra needed.

---

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens, Data
     model changes, API contracts, Offline behavior, Metrics, Files to
     create/modify, Tests, Dependencies, Task order, Gotchas, Acceptance /
     rollout / rollback. The Decisions section above stays verbatim. -->

## Core user story

1. User lands on `/cards/[id]` with a `state='diagnosed'` card from PR #19's initial-read flow.
2. User reads the AI's three "what I need to know" questions and the active question rendered by `<AnswerThread />`.
3. User types an answer (or taps "Skip — give me your best assessment"), hits Send. PostHog `triage_qa_round_started` fires.
4. The Anthropic call returns either `ask_next_question` (another round) or `confirm_assessment` (terminal).
5. On `ask_next_question`: the page server-refreshes; the new active question appears above the textarea. `triage_qa_round_completed` fires. Prior turn renders inline (collapsed) in the thread.
6. On `confirm_assessment` (model-decided OR server-forced at round 3 OR user-skipped): `severity_confirmed=true` lands on the card; `<DiagnosedThread />` replaces `<AnswerThread />`. The user sees the confirmed severity chip, the final diagnosis, the AI-proposed monitoring cadence, and a collapsible "How we diagnosed this" section listing every prior turn. `triage_qa_confirmed` fires.

Six verbs (read-card, type-answer, send, see-next-question, see-confirmation, expand-thread). Gate 9 captures one screenshot per verb under `specs/triage-conversation/qa-walk/`.

## In scope

- **`POST /api/triage/answer` route handler** (D1) that:
  - Authenticates via `supabase.auth.getUser()`.
  - Validates the body: `{ card_id: uuid, answer?: string (≤ 2000 chars), skip?: true }` — exactly one of `answer` or `skip:true` must be present.
  - Loads + state-classifies the card under the user's RLS context. Requires `state='diagnosed' AND severity_confirmed=false`.
  - Counts existing user reply rows in `triage_conversations` (excluding `is_location_ask=true`) to derive the current Q&A round number.
  - Reads the previous-turn assistant content (most-recent `triage_conversations` row for the card with `role='assistant'`) and parses out its `tool_name` so the handler knows whether the prior question was a location-ask.
  - Fetches photo bytes via `_lib/photos.fetchCardPhotosAsBase64` (reused from PR #19 — same RLS posture).
  - Builds the Q&A user message: full prior conversation thread (alternating user/assistant rows) plus the current user answer/skip prefix.
  - Forces `tool_choice: { type: 'tool', name: 'confirm_assessment' }` when (a) round-3 cap fires (D4) OR (b) `skip=true` (D9); otherwise `tool_choice: { type: 'auto' }` with both tools available.
  - Calls Claude via `_lib/anthropic-qa.callQaTurn()` with both tools (`ask_next_question` + `confirm_assessment`) + `web_search`.
  - Defensively parses the tool-use payload at runtime — branches on the tool name (`ask_next_question` vs `confirm_assessment`) and validates the matching shape.
  - On `ask_next_question`: calls `answer_triage_round` RPC (D5) to atomically insert the paired user + assistant rows. If the prior round was a location-ask, ALSO dual-writes the answer to `users.location` (D6).
  - On `confirm_assessment`: calls `confirm_triage` RPC (D5) to atomically insert the optional user row, the assistant row, update `cards.diagnosis / severity / system_tag / contractor_tag / monitoring_cadence_days / severity_confirmed=true`.
  - Returns the D10 envelope.
  - Surfaces structured response shape that `<AnswerThread />` uses to fire the right PostHog event.
- **Migration 008** (D5):
  - `cards.severity_confirmed boolean not null default false` add-column.
  - `triage_conversations.is_location_ask boolean not null default false` add-column.
  - `triage_conversations.tool_name text` add-column (nullable).
  - Backfill `tool_name='record_initial_read'` for pre-existing assistant rows (D5 migration ordering note).
  - Widen the `triage_round_in_range` CHECK to `round between 1 and 5` (initial read = round 1; up to 3 Q&A rounds + 1 location-ask round = round 5 ceiling).
  - Two new SECURITY DEFINER RPCs: `answer_triage_round`, `confirm_triage`. Both pin `search_path = public, pg_catalog` and guard `p_user = auth.uid()` internally (matches `start_triage` / `complete_triage` posture from migration 007). Both apply the PR #24 column-qualification lesson preemptively (Gotchas #1).
- **`<AnswerThread />` `'use client'` component** (D8) — server-passed prior thread + active question (the most-recent `ask_next_question` assistant content) + a textarea, Send button, Skip button (visible from round ≥ 1), and per-state UI (mid-fetch, retryable-error banner, success bridge). Fires the four D7 PostHog events.
- **`<DiagnosedThread />` server component** (D8) — replaces `<AnswerThread />` once `severity_confirmed=true`. Renders the confirmed severity chip + final diagnosis + AI-proposed monitoring cadence + collapsible "How we diagnosed this" section listing every prior turn (initial read + Q&A pairs) rendered in render-by-tool-name discriminator (D5).
- **`/(app)/cards/[id]/page.tsx` extension** — the existing `diagnosed`-state body splits on `severity_confirmed`:
  - `false` → existing diagnosis preview + `<AnswerThread />` mounted below.
  - `true` → `<DiagnosedThread />` (the full confirmed-state body; replaces the existing "what I need to know" preview list since the AI has resolved its open questions through the Q&A).
- **PR #19 helper reuse** — `_lib/photos.ts` + `_lib/prompt.ts` get an export-extension only; new helpers (`_lib/round-state.ts`, `_lib/prompt-qa.ts`, `_lib/parse-qa-output.ts`, `_lib/anthropic-qa.ts`) sit alongside.
- **Regenerated `packages/core/src/supabase.types.ts`** after migration 008 applies. Adds `severity_confirmed` to `Database['public']['Tables']['cards']`, `is_location_ask` + `tool_name` to `Database['public']['Tables']['triage_conversations']`, and `answer_triage_round` + `confirm_triage` to `Database['public']['Functions']`.
- **Four new PostHog events** in `METRICS.md` per D7.
- **New E2E spec** `apps/web/e2e/triage-conversation.spec.ts` per D11.
- **CLAUDE.md § Where Things Happen** entries for: `POST /api/triage/answer`, the four new `_lib/*-qa.ts` helpers, `<AnswerThread />`, `<DiagnosedThread />`, migration 008. **CLAUDE.md § Gotchas** entries for the six Gotchas surfaced below that aren't already in CLAUDE.md.

## Out of scope

- **DECIDE state transitions**. Row #2 (`decide-state`) owns the DIY-vs-contractor branch + the cost-estimate UI. After `severity_confirmed=true`, the card stays in `state='diagnosed'`; row #2 will add the next state-transition CTA.
- **User-modifiable monitoring cadence**. This PR stores the AI's `monitoring_cadence_days_proposal` on `cards.monitoring_cadence_days` verbatim. The "pick a different cadence" UI ships in `monitor-beta` (row #5).
- **Contractor-tag user override**. PR writes the AI's `contractor_tag` proposal silently (same posture as PR #19 for the initial read). Row #2 owns the user-facing override UI.
- **Photo comparison**. Row #6 owns. `<DiagnosedThread />` renders the prior single photo only; no before/after comparison.
- **BYOK + usage caps**. Row #9 (`usage-counters-and-byok`) wires the per-session counter increment. This PR's `confirm_assessment` does NOT increment `usage_counters.triage_session_count`.
- **Triage eval dataset**. Row #10 owns. This PR's E2E mocks Anthropic via `ANTHROPIC_BASE_URL`.
- **PostHog feature flag for the Q&A budget**. Server-side cap stays hard-coded at 3 rounds (D4).
- **Streaming responses**. Each Q&A turn waits for the full Anthropic response before the route returns (mirrors the initial-read posture).

## Screens

### `/cards/[id]` — extended `diagnosed`-state body

Header (room_tag · system_tag chip · created_at) + Photo block + Description block from PR #19 stay identical across all `diagnosed` sub-states.

| Sub-state                                                  | Trigger                                                                                                                                                                                                                                                                                                                                                                                           | Body below the static blocks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diagnosed-provisional` — `severity_confirmed=false`       | After PR #19's initial read completes (round 1 assistant row only) OR after a successful `ask_next_question` turn (round ≥ 2 assistant rows present).                                                                                                                                                                                                                                             | (a) Existing initial-read preview from PR #19: provisional severity chip, summary, sources list. (b) Prior Q&A turns collapsed into a compact "Conversation so far" thread (one row per `(user, assistant)` pair, oldest first, render-by-`tool_name`). (c) `<AnswerThread />` with the active assistant question lifted to a heading + a textarea + "Send" button + "Skip — give me your best assessment" button (only visible when at least one Q&A round has been answered, i.e. user has seen the AI's question once already). The active question is the most-recent `ask_next_question` row. |
| `diagnosed-confirmed` — `severity_confirmed=true`          | After `confirm_assessment` lands.                                                                                                                                                                                                                                                                                                                                                                 | `<DiagnosedThread />`: (a) Confirmed severity chip (same four-tier palette from `packages/ui/src/tokens.ts`; same `<SeverityChip>` component reused from PR #19). (b) Final diagnosis (full text). (c) Monitoring cadence proposal — single-line "Check back in N days" with a "(AI-proposed)" tag. (d) Collapsible "How we diagnosed this" — closed by default, button label `Show conversation` / `Hide conversation`; when open, renders every prior turn (oldest first) in chronological order, with tool-name discriminator driving the per-row UI.                                           |
| `diagnosed-provisional + mid-fetch` — `<AnswerThread />` Q | Submit clicked, Anthropic call in flight.                                                                                                                                                                                                                                                                                                                                                         | Send button disabled + spinner; Skip button hidden mid-fetch; textarea disabled. No skeleton swap — the thread above stays rendered so users can re-read their answer mid-wait.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `diagnosed-provisional + retryable error`                  | Anthropic 503 / 429 / 5xx / network throw / 502 `triage_invalid_output`. (Note: 502 reverts no DB state — no row was inserted — so it's a clean retry, matching D10.)                                                                                                                                                                                                                             | Retryable banner inline below the thread with copy calibrated to error_class (429 surfaces `retry_after_s`, others use generic "We hit a snag — try again."). Send button re-enables; user's typed answer text is preserved in the textarea (controlled-input state survives the failed POST). Skip button re-shown.                                                                                                                                                                                                                                                                               |
| Render-by-tool-name in the thread                          | Each prior assistant row carries `tool_name`. Renderer dispatches: `record_initial_read` → "Initial read" header + parsed `summary`. `ask_next_question` → "Question N" header + parsed `question`. `confirm_assessment` → "Confirmed" header + parsed `final_diagnosis`. User rows render as "Your reply (round N)" + the raw text; rows where `is_location_ask=true` get a tiny "Location" tag. |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### Render conditions — `diagnosed`-state body split

| Element                                                                  | provisional (initial) | provisional (mid-Q&A) | confirmed |
| ------------------------------------------------------------------------ | --------------------- | --------------------- | --------- |
| Header (room / system / created_at)                                      | shown                 | shown                 | shown     |
| Photo block                                                              | shown                 | shown                 | shown     |
| Description block                                                        | shown                 | shown                 | shown     |
| Initial-read preview (PR #19's severity chip + summary + sources)        | shown (provisional)   | shown (provisional)   | hidden    |
| Initial-read "what I need to know" preview list                          | shown                 | hidden                | hidden    |
| Compact prior-Q&A thread ("Conversation so far")                         | hidden                | shown                 | hidden    |
| `<AnswerThread />` (textarea + Send + Skip)                              | shown                 | shown                 | hidden    |
| `<DiagnosedThread />` confirmed severity chip                            | hidden                | hidden                | shown     |
| `<DiagnosedThread />` final diagnosis text                               | hidden                | hidden                | shown     |
| `<DiagnosedThread />` monitoring cadence ("Check back in N days")        | hidden                | hidden                | shown     |
| `<DiagnosedThread />` "How we diagnosed this" collapsible (closed start) | hidden                | hidden                | shown     |

### Render conditions — `<AnswerThread />` local UI

| Element                                  | idle   | submitting | 200 → next ask     | 200 → confirmed    | 429 / 503 / 5xx | network | 502    | 409 invalid_state  |
| ---------------------------------------- | ------ | ---------- | ------------------ | ------------------ | --------------- | ------- | ------ | ------------------ |
| Textarea (enabled)                       | shown  | hidden     | shown (cleared)    | hidden             | shown           | shown   | shown  | hidden             |
| Textarea (disabled mid-fetch)            | hidden | shown      | hidden             | hidden             | hidden          | hidden  | hidden | hidden             |
| Send button (enabled)                    | shown  | hidden     | shown              | hidden             | shown           | shown   | shown  | hidden             |
| Send button (disabled + spinner)         | hidden | shown      | hidden             | hidden             | hidden          | hidden  | hidden | hidden             |
| Skip button (visible from round ≥ 1)     | shown  | hidden     | shown              | hidden             | shown           | shown   | shown  | hidden             |
| Retryable error banner                   | hidden | hidden     | hidden             | hidden             | shown           | shown   | shown  | hidden             |
| "Already confirmed — refreshing…" notice | hidden | hidden     | hidden             | hidden             | hidden          | hidden  | hidden | shown              |
| Action on success                        | —      | —          | `router.refresh()` | `router.refresh()` | —               | —       | —      | `router.refresh()` |

`router.refresh()` is the bridge — server picks up the new rows + the (possibly flipped) `severity_confirmed` and rerenders the page; the `<AnswerThread />` is either re-mounted with the new active question or replaced by `<DiagnosedThread />`.

## Data model changes

### Migration 008 — `triage-conversation` schema + RPCs

Filename: `supabase/migrations/20260516HHMMSS_010_triage_conversation.sql`. Per the existing migration numbering, this is the **tenth** migration (009 was the column-ambiguity fix from PR #24). The spec uses `008_triage_conversation` in commit messages and tracker labels for human readability, but the file's numeric prefix is `010` to follow the on-disk order. The migration-runner sorts lexicographically by timestamp; the underscore-number is descriptive only.

Single file. No enum-add transaction restriction (no enum touched). Both schema mutations + both `create or replace function` statements run inside one transaction.

```sql
-- Migration 010 — triage-conversation Q&A loop schema + RPCs.
-- Source: specs/triage-conversation/spec.md § Data model changes (D5).
--
-- 1. Adds cards.severity_confirmed (boolean, default false) — D2 trade-off.
-- 2. Adds triage_conversations.is_location_ask (boolean, default false) — D6.
-- 3. Adds triage_conversations.tool_name (text, nullable) — discriminates the
--    three tool-use producers (record_initial_read | ask_next_question |
--    confirm_assessment); enables render-by-tool dispatch in <DiagnosedThread />.
-- 4. Back-fills tool_name='record_initial_read' on pre-existing assistant rows
--    from PR #19 (D5 migration-ordering note).
-- 5. Widens triage_round_in_range CHECK constraint from 1..3 to 1..5
--    (initial=1; up to 3 Q&A rounds = round 4; +1 location-ask = round 5).
-- 6. answer_triage_round(p_user, p_card, p_user_answer, p_assistant_content,
--      p_tool_name, p_is_location_ask, p_user_round) — atomic INSERT of the
--    paired (user, assistant) rows. SECURITY DEFINER + auth.uid() guard.
-- 7. confirm_triage(p_user, p_card, p_diagnosis, p_severity, p_system_tag,
--      p_contractor_tag, p_monitoring_cadence_days, p_assistant_content,
--      p_user_round, p_skip, p_user_answer) — atomic: optional user row INSERT
--    when !p_skip + assistant row INSERT + cards UPDATE (state stays diagnosed
--    but severity_confirmed flips to true + diagnosis/severity/tags/cadence
--    captured). SECURITY DEFINER + auth.uid() guard.

alter table public.cards
  add column if not exists severity_confirmed boolean not null default false;

alter table public.triage_conversations
  add column if not exists is_location_ask boolean not null default false;

alter table public.triage_conversations
  add column if not exists tool_name text;

update public.triage_conversations
  set tool_name = 'record_initial_read'
  where role = 'assistant' and tool_name is null and round = 1;

alter table public.triage_conversations
  drop constraint if exists triage_round_in_range;

alter table public.triage_conversations
  add constraint triage_round_in_range check (round between 1 and 5);

create or replace function public.answer_triage_round(
  p_user uuid,
  p_card uuid,
  p_user_answer text,
  p_assistant_content text,
  p_tool_name text,
  p_is_location_ask boolean,
  p_user_round int
)
returns table (assistant_row_id uuid)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_assistant_id uuid;
begin
  -- Auth-internal guard. SECURITY DEFINER bypasses RLS on the INSERT,
  -- so this is the only thing keeping a malicious authenticated user
  -- from poking another user's thread via direct PostgREST RPC.
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Predicate-guard: only proceed when the card is in diagnosed +
  -- not-yet-confirmed. Concurrent confirms can't trample.
  -- Column-qualified per PR #24 / Gotchas #1 to avoid plpgsql
  -- OUT-parameter ambiguity (no RETURNS TABLE column collision here
  -- since we only return assistant_row_id, but keep qualification
  -- consistent across all migration-008 RPCs).
  if not exists (
    select 1
    from public.cards
    where public.cards.id = p_card
      and public.cards.user_id = p_user
      and public.cards.state = 'diagnosed'
      and public.cards.severity_confirmed = false
  ) then
    raise exception 'qa_invalid_state' using errcode = 'P0001';
  end if;

  -- Insert the user reply row.
  insert into public.triage_conversations (
    card_id, user_id, round, role, content, is_location_ask, tool_name
  )
  values (
    p_card, p_user, p_user_round, 'user',
    p_user_answer, p_is_location_ask, null
  );

  -- Insert the assistant question row.
  insert into public.triage_conversations (
    card_id, user_id, round, role, content, is_location_ask, tool_name
  )
  values (
    p_card, p_user, p_user_round, 'assistant',
    p_assistant_content, p_is_location_ask, p_tool_name
  )
  returning public.triage_conversations.id into v_assistant_id;

  return query select v_assistant_id;
end;
$$;

create or replace function public.confirm_triage(
  p_user uuid,
  p_card uuid,
  p_diagnosis text,
  p_severity public.severity,
  p_system_tag public.system_tag,
  p_contractor_tag public.contractor_tag,
  p_monitoring_cadence_days int,
  p_assistant_content text,
  p_user_round int,
  p_skip boolean,
  p_user_answer text
)
returns table (card_id uuid)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_card_id uuid;
begin
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Atomic predicate-guard: only confirm when still unconfirmed.
  -- Column-qualified per PR #24 / Gotchas #1.
  update public.cards
    set diagnosis = p_diagnosis,
        severity = p_severity,
        system_tag = p_system_tag,
        contractor_tag = p_contractor_tag,
        monitoring_cadence_days = p_monitoring_cadence_days,
        severity_confirmed = true,
        updated_at = now()
  where public.cards.id = p_card
    and public.cards.user_id = p_user
    and public.cards.state = 'diagnosed'
    and public.cards.severity_confirmed = false
  returning public.cards.id into v_card_id;

  if v_card_id is null then
    raise exception 'qa_invalid_state' using errcode = 'P0001';
  end if;

  -- Optional user reply row when the user provided one (Send path; skip path omits).
  if p_skip = false and p_user_answer is not null then
    insert into public.triage_conversations (
      card_id, user_id, round, role, content, is_location_ask, tool_name
    )
    values (
      p_card, p_user, p_user_round, 'user', p_user_answer, false, null
    );
  end if;

  -- Always insert the assistant confirm_assessment row.
  insert into public.triage_conversations (
    card_id, user_id, round, role, content, is_location_ask, tool_name
  )
  values (
    p_card, p_user, p_user_round, 'assistant',
    p_assistant_content, false, 'confirm_assessment'
  );

  return query select v_card_id;
end;
$$;

-- ROLLBACK:
-- drop function if exists public.confirm_triage(uuid, uuid, text, severity, system_tag, contractor_tag, int, text, int, boolean, text);
-- drop function if exists public.answer_triage_round(uuid, uuid, text, text, text, boolean, int);
-- alter table public.triage_conversations drop constraint if exists triage_round_in_range;
-- alter table public.triage_conversations add constraint triage_round_in_range check (round between 1 and 3);
-- update public.triage_conversations set tool_name = null where tool_name = 'record_initial_read' and round = 1;
-- alter table public.triage_conversations drop column if exists tool_name;
-- alter table public.triage_conversations drop column if exists is_location_ask;
-- alter table public.cards drop column if exists severity_confirmed;
```

**Why one migration file**: no enum-add; both `create or replace function` are transaction-safe; the column adds + the backfill + the CHECK swap all sit cleanly in a single transaction.

**RLS posture**: both new RPCs are SECURITY DEFINER and bypass RLS on writes. The auth-internal guard (`p_user = auth.uid()`) is the only defense against a malicious authenticated user poking another user's thread via direct PostgREST RPC. The route handler is the second layer (always passes `p_user = getUser().id`, never trusts the body — same posture as `claim_card_slot` / `start_triage` / `complete_triage`).

**Column qualification preempts plpgsql 42702** — every column reference in WHERE / SET / RETURNING is `public.<table>.<col>` (Gotchas #1).

### Generated types regeneration

After migration 010 applies locally:

```bash
pnpm db:reset      # apply 010 to local
pnpm db:gen-types  # regen types
```

`packages/core/src/supabase.types.ts` gains:

- `Database['public']['Tables']['cards']['Row'].severity_confirmed: boolean`
- `Database['public']['Tables']['triage_conversations']['Row'].is_location_ask: boolean`
- `Database['public']['Tables']['triage_conversations']['Row'].tool_name: string | null`
- `Database['public']['Functions']['answer_triage_round']` with the 7-arg signature.
- `Database['public']['Functions']['confirm_triage']` with the 11-arg signature.

## API contracts

### `POST /api/triage/answer`

**Input** — `application/json`:

```ts
type AnswerRequest =
  | { card_id: string /* uuid */; answer: string /* 1..2000 */ }
  | { card_id: string /* uuid */; skip: true };
```

Exactly one of `answer` (non-empty string ≤ 2000 chars) or `skip: true` must be present. Both present → 400. Neither present → 400.

**Auth**: session cookie via `apps/web/lib/supabase/server.ts`. `supabase.auth.getUser()` is the gate.

**Behavior** (mirrors PR #19's `POST /api/triage` flow):

1. **Auth check** — `getUser()` null → 401 `{ error: 'auth_required' }`.
2. **Body parse + validate** — JSON parse error or wrong shape → 400 `{ error: 'validation_failed', fields: { ... } }`.
3. **Load card + state-classify** — `select id, user_id, state, severity_confirmed, initial_description, system_tag, room_tag from cards where id = card_id` under user-context client (RLS scopes).
   - No row → 404 `{ error: 'card_not_found' }`.
   - `state != 'diagnosed'` → 409 `{ error: 'invalid_state' }`.
   - `state = 'diagnosed' and severity_confirmed = true` → 409 `{ error: 'already_confirmed' }`.
   - `state = 'diagnosed' and severity_confirmed = false` → continue.
4. **Load thread + derive round number + detect location-ask context** — via `_lib/round-state.computeQaRoundState()`:
   - Fetch all `triage_conversations` rows for the card under user-context client, ordered by `created_at ASC`.
   - Count user rows where `is_location_ask=false` → `qaUserCount`.
   - `nextRound = (max round so far) + 1` if the previous-most-recent row was an assistant row (the normal case after `start_triage` or after an `ask_next_question` turn); else the existing round (degenerate; shouldn't happen).
   - Read the most-recent `assistant` row's `tool_name` + `content`. If `tool_name='ask_next_question'` and the parsed `is_location_ask=true`, set `priorWasLocationAsk=true`.
   - `forceConfirm = qaUserCount >= 3 || body.skip === true` (D4 + D9).
5. **Load photo bytes** — reuse PR #19's `fetchCardPhotosAsBase64(supabase, user.id, cardId)`. Same RLS posture.
6. **Build Anthropic call** — `_lib/anthropic-qa.callQaTurn()`:
   - Model: `ANTHROPIC_MODEL` env or `claude-sonnet-4-6` (D1 from PR #19).
   - System: `_lib/prompt-qa.resolveQaSystemPrompt()` — separate from initial-read prompt; calibrates the model for the Q&A budget + tool-choice behavior.
   - Messages: full prior conversation thread reconstructed as alternating user/assistant messages (image blocks on the first user message; subsequent user messages are text-only; assistant messages carry the parsed tool-use content rendered back as text the model can reason over).
   - Tools: `[ask_next_question_tool, confirm_assessment_tool, web_search_tool]`. `web_search_20260209` reused from PR #19's pinned constant.
   - `tool_choice`: `{ type: 'tool', name: 'confirm_assessment' }` if `forceConfirm`, else `{ type: 'auto' }`.
   - `max_tokens: 4096`. Timeout: 30 s.
7. **Parse the tool-use payload** — `_lib/parse-qa-output.parseQaTurn(response)`:
   - Find first block with `type === 'tool_use'`.
   - Branch on `block.name`:
     - `'ask_next_question'` → validate against `AskNextQuestion` shape. On `forceConfirm=true` this is unexpected (model defied the force) → treat as parse failure → 502 `triage_invalid_output`. (Gotchas #3.)
     - `'confirm_assessment'` → validate against `ConfirmAssessment` shape.
     - Any other name → parse failure → 502.
   - No `tool_use` block found → parse failure → 502.
   - On any validation error: Sentry capture + 502 `{ error: 'triage_invalid_output' }`. No DB state change (Gotchas #4 — fail-before-write keeps retries clean).
8. **Persist the turn** — branch on parsed tool name:
   - `ask_next_question`:
     - Call `answer_triage_round` RPC with `p_user_round = nextRound`, `p_user_answer = body.answer`, `p_assistant_content = JSON.stringify(parsed.value)`, `p_tool_name = 'ask_next_question'`, `p_is_location_ask = parsed.value.is_location_ask`.
     - If `priorWasLocationAsk === true`: dual-write `update users set location = body.answer where id = user.id` (user-context client; RLS-enforced). On UPDATE failure: Sentry warning + continue (Gotchas #5 — round IS saved; silent location-cache miss tolerable since the next location-ask round will re-ask).
     - On RPC P0001 (`qa_invalid_state` — concurrent confirm landed between our SELECT and our INSERT): 409 `{ error: 'invalid_state' }`.
     - On other RPC error: Sentry + 500 `{ error: 'server_error' }`.
   - `confirm_assessment`:
     - Call `confirm_triage` RPC with `p_user_round = nextRound`, `p_diagnosis = parsed.value.final_diagnosis`, `p_severity = parsed.value.severity_confirmed`, `p_system_tag = parsed.value.system_tag`, `p_contractor_tag = parsed.value.contractor_tag`, `p_monitoring_cadence_days = parsed.value.monitoring_cadence_days_proposal`, `p_assistant_content = JSON.stringify(parsed.value)`, `p_skip = body.skip === true`, `p_user_answer = body.answer ?? null`.
     - On RPC P0001 → 409 `{ error: 'already_confirmed' }`.
     - On other RPC error: Sentry + 500.
9. **Anthropic 429** — read `retry-after` header → 429 `{ error: 'triage_rate_limited', retry_after_s }`. No DB state change. No Sentry (expected backpressure).
10. **Anthropic 5xx / network / timeout** — 503 `{ error: 'triage_unavailable', retry_after_s: 30 }`. No DB state change. Sentry captured.
11. **Return success** — branch on parsed tool name:
    - `ask_next_question` → 200 `{ tool: 'ask_next_question', card_id, round_number, question, is_location_ask, updated_provisional_severity }`.
    - `confirm_assessment` → 200 `{ tool: 'confirm_assessment', card_id, severity_confirmed, monitoring_cadence_days, was_forced }`.

`was_forced` is the server-derived boolean for D7's `triage_qa_confirmed` event — the route knows whether `forceConfirm` was true at request time and passes it through to the client so PostHog props are accurate.

**Output schemas**:

```ts
// 200 OK — ask_next_question branch
type AnswerOkAsk = {
  tool: 'ask_next_question';
  card_id: string;
  round_number: number; // the round of the user reply just persisted
  question: string; // next question to render
  is_location_ask: boolean;
  updated_provisional_severity: 'cosmetic' | 'monitor' | 'soon' | 'urgent';
};

// 200 OK — confirm_assessment branch
type AnswerOkConfirm = {
  tool: 'confirm_assessment';
  card_id: string;
  severity_confirmed: 'cosmetic' | 'monitor' | 'soon' | 'urgent';
  monitoring_cadence_days: number;
  was_forced: boolean; // true if server forced confirm (round-3 cap OR skip)
};

// 400
type ValidationFailed = {
  error: 'validation_failed';
  fields: Partial<Record<'card_id' | 'answer' | 'skip', string>>;
};

// 401
type AuthRequired = { error: 'auth_required' };

// 404
type CardNotFound = { error: 'card_not_found' };

// 409
type InvalidState = { error: 'invalid_state' | 'already_confirmed' };

// 429 — Anthropic backpressure
type TriageRateLimited = {
  error: 'triage_rate_limited';
  retry_after_s: number;
};

// 502 — model returned unparseable tool-use
type TriageInvalidOutput = { error: 'triage_invalid_output' };

// 503 — Anthropic unavailable / timeout
type TriageUnavailable = { error: 'triage_unavailable'; retry_after_s: number };

// 500
type ServerError = { error: 'server_error' };
```

**Notes**:

- `export const dynamic = 'force-dynamic'`.
- Mirrors PR #19's envelope exactly except for the new 200 union and the new 409 variant `already_confirmed`.
- No DB state change on any error path (D10) — retries are clean.
- The 200 union is dispatched on `tool` field; client must branch on it before firing PostHog events.

## Offline behavior

**(a) online-only with error state**, identical to PR #19's `/api/triage`.

Q&A requires Claude + Supabase; neither is cacheable. When offline:

- `<AnswerThread />`'s fetch throws → renders the retryable error banner. Answer text stays in the textarea (controlled-input survives the failed POST).
- Card detail page renders from the server-rendered initial paint; refresh-while-offline shows stale state without notice. Refresh-on-reconnect is the recovery path.

No service worker cache for `/api/triage/answer`. No offline queue.

## Metrics

Four new PostHog events (D7). All fire from the client (`<AnswerThread />`) — server-side route handlers don't have PostHog initialized in this codebase (CLAUDE.md § Where Things Happen — `apps/web/lib/posthog.ts`). Append to `METRICS.md § Events`.

| Event                       | When it fires                                                                                                                                                 | Key properties                                                                                                                                                                                                                                                              | Why we care                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `triage_qa_round_started`   | Fired from `apps/web/app/(app)/cards/[id]/_components/AnswerThread.tsx` when the user clicks "Send" or "Skip" and the `POST /api/triage/answer` fetch begins. | `{ card_id: string, round_number: number, is_skip: boolean }`                                                                                                                                                                                                               | Top of each Q&A turn — measures user engagement past the initial read.                                                                                                            |
| `triage_qa_round_completed` | Fired from `AnswerThread.tsx` when `POST /api/triage/answer` returns 200 with `tool='ask_next_question'`.                                                     | `{ card_id: string, round_number: number, latency_ms: number, is_location_ask: boolean, search_count: number }`                                                                                                                                                             | Bottom of the per-round funnel; `is_location_ask` surfaces the "free question outside budget" trigger rate; `search_count` is the cost driver.                                    |
| `triage_qa_confirmed`       | Fired from `AnswerThread.tsx` when `POST /api/triage/answer` returns 200 with `tool='confirm_assessment'`.                                                    | `{ card_id: string, total_rounds: number, severity: 'cosmetic'\|'monitor'\|'soon'\|'urgent', contractor_tag: string, monitoring_cadence_days: number, latency_ms: number, was_forced: boolean }`                                                                            | Bottom of the overall Q&A funnel. `was_forced` flags "did the AI ever finalize on its own, or did our 3-round cap always fire?" — the calibration signal for the prompt + budget. |
| `triage_qa_failed`          | Fired from `AnswerThread.tsx` when `POST /api/triage/answer` returns non-2xx or the fetch throws. `error_class` maps to D10 envelope (or `'network'`).        | `{ card_id: string, round_number: number, error_class: 'validation_failed'\|'auth_required'\|'card_not_found'\|'invalid_state'\|'already_confirmed'\|'triage_rate_limited'\|'triage_invalid_output'\|'triage_unavailable'\|'server_error'\|'network', latency_ms: number }` | Tracks reliability surface area. Mirrors `triage_initial_read_failed`'s shape so PostHog dashboards can union the two for an "all-triage failures" view.                          |

No new Sentry call sites beyond what's documented above (dual-write location warning, RPC errors, Anthropic 5xx capture — these all reuse the existing tag patterns from PR #19's route).

## Files to create

| File                                                                 | Purpose                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260516HHMMSS_010_triage_conversation.sql`     | Column adds + tool_name backfill + CHECK widen + `answer_triage_round` + `confirm_triage` SECURITY DEFINER RPCs (D5).                                                                                                                                                                                                                                                |
| `apps/web/app/api/triage/answer/route.ts`                            | `POST /api/triage/answer` route handler (D1). `export const dynamic = 'force-dynamic'`.                                                                                                                                                                                                                                                                              |
| `apps/web/app/api/triage/answer/route.test.ts`                       | Vitest — mocks Supabase client + RPCs + `@anthropic-ai/sdk` + the four `_lib/*-qa.ts` helpers. Cases enumerated in § Tests.                                                                                                                                                                                                                                          |
| `apps/web/app/api/triage/_lib/round-state.ts`                        | Exports `computeQaRoundState(rows)` — pure-fn over the thread rows. Returns `{ qaUserCount: number, nextRound: number, priorWasLocationAsk: boolean, priorAssistantToolName: string \| null }`. Single seam for the route's round-counting logic.                                                                                                                    |
| `apps/web/app/api/triage/_lib/round-state.test.ts`                   | Vitest — table-driven cases: empty thread (impossible-but-defensive), 1-row initial-read-only thread → `qaUserCount=0`, after-one-Q&A thread (3 rows: initial assistant + user + ask_next_question assistant) → `qaUserCount=1`, location-ask user row excluded from count, force-confirm threshold (count=3) handled by route not helper.                           |
| `apps/web/app/api/triage/_lib/prompt-qa.ts`                          | Exports `DEFAULT_QA_SYSTEM_PROMPT: string` + `resolveQaSystemPrompt()`. Env override `TRIAGE_QA_SYSTEM_PROMPT` (optional). Prompt content: same calm-authority persona as initial-read + Q&A-specific calibration (be concise; you have a 3-round budget; ask one focused question per turn; force-confirm semantics; location-ask rule per D6).                     |
| `apps/web/app/api/triage/_lib/prompt-qa.test.ts`                     | Vitest — env override resolves; whitespace fallback; default contains the persona keywords ("calm", "spiral", "3-round budget", "location"); default length ≤ `PROMPT_MAX_CHARS` (3500).                                                                                                                                                                             |
| `apps/web/app/api/triage/_lib/parse-qa-output.ts`                    | Exports `parseQaTurn(response: AnthropicMessagesResponse): { ok: true; tool: 'ask_next_question'; value: AskNextQuestion } \| { ok: true; tool: 'confirm_assessment'; value: ConfirmAssessment } \| ParseError`. Defensive: handles missing tool_use block, wrong tool name, malformed input. Branches by `block.name`.                                              |
| `apps/web/app/api/triage/_lib/parse-qa-output.test.ts`               | Vitest — happy paths for both tools; missing tool_use block → ParseError; wrong tool name → ParseError; each required field missing → ParseError; each enum violation → ParseError; sources length > 5 → ParseError; `monitoring_cadence_days_proposal` non-int / ≤ 0 → ParseError; `updated_provisional_severity` not in enum → ParseError; extra fields tolerated. |
| `apps/web/app/api/triage/_lib/anthropic-qa.ts`                       | Exports `callQaTurn({ apiKey, model, baseURL, system, messages, images, forceConfirm, timeoutMs })`. Constructs both tools (`ask_next_question` + `confirm_assessment`) + reuses `WEB_SEARCH_TOOL_TYPE` from `_lib/anthropic.ts`. Builds `tool_choice` from `forceConfirm`.                                                                                          |
| `apps/web/app/api/triage/_lib/anthropic-qa.test.ts`                  | Vitest — mocks SDK; assert tools array includes both Q&A tools + web_search; tool_choice branches on forceConfirm; messages array passes through; timeout option; api key passes; baseURL override honored.                                                                                                                                                          |
| `apps/web/app/(app)/cards/[id]/_components/AnswerThread.tsx`         | `'use client'` Q&A surface (D8). Renders prior thread (compact), active question, textarea, Send + Skip buttons, mid-fetch + error states. Fires the four D7 PostHog events.                                                                                                                                                                                         |
| `apps/web/app/(app)/cards/[id]/_components/AnswerThread.test.tsx`    | Vitest — initial render; Send fires `triage_qa_round_started`; 200 ask → `triage_qa_round_completed` + `router.refresh()`; 200 confirm → `triage_qa_confirmed` + `router.refresh()`; 429 → banner + `triage_qa_failed`; 503 → banner; 502 → banner; network → banner; Skip path → request body includes `skip:true`; Skip button hidden until round ≥ 1.             |
| `apps/web/app/(app)/cards/[id]/_components/DiagnosedThread.tsx`      | Server component (D8) — renders the confirmed-state body: severity chip + final diagnosis + monitoring cadence ("Check back in N days") + collapsible "How we diagnosed this" (`<details>` element, closed by default). Render-by-tool-name dispatch over prior rows.                                                                                                |
| `apps/web/app/(app)/cards/[id]/_components/DiagnosedThread.test.tsx` | Vitest — renders confirmed severity chip with the right data-testid + color class; renders monitoring cadence line; collapsible is closed by default; clicking expands it (via the native `<details>` toggle — assert `<details>` element + summary text); render-by-tool-name dispatch for each of the three tool names + user rows.                                |
| `apps/web/app/(app)/cards/[id]/_components/QaThread.tsx`             | Server component — renders the compact "Conversation so far" thread for the provisional-mid-Q&A state. Shares the render-by-tool-name dispatcher with `<DiagnosedThread />` via a small `_components/ConversationRow.tsx` helper (next row).                                                                                                                         |
| `apps/web/app/(app)/cards/[id]/_components/QaThread.test.tsx`        | Vitest — empty thread (no rows after initial read) renders nothing; 1-Q&A-pair thread renders the user row + the assistant question; location-ask user row gets the "Location" tag.                                                                                                                                                                                  |
| `apps/web/app/(app)/cards/[id]/_components/ConversationRow.tsx`      | Server component — single-row renderer. Dispatches on `(role, tool_name, is_location_ask)`. Imported by `QaThread.tsx` + `DiagnosedThread.tsx` (DRY shared dispatcher).                                                                                                                                                                                              |
| `apps/web/app/(app)/cards/[id]/_components/ConversationRow.test.tsx` | Vitest — each (role, tool_name) tuple renders the right header + body; user + is_location_ask=true renders the "Location" tag; malformed assistant content (JSON.parse failure) renders a fallback "Unparseable conversation row" copy + a Sentry breadcrumb (no exception thrown).                                                                                  |
| `apps/web/e2e/triage-conversation.spec.ts`                           | Playwright spec (D11). Reuses `ANTHROPIC_BASE_URL` mock pattern. Five flows: single-round confirm, 3-round force-confirm, location-ask + `users.location` write, skip path, 503 retry.                                                                                                                                                                               |

## Files to modify

| File                                          | Action     | Why                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/(app)/cards/[id]/page.tsx`      | modify     | Extend the existing `state==='diagnosed'` branch to split on `card.severity_confirmed`. Pull all `triage_conversations` rows for the card (not just the most-recent assistant) so `<AnswerThread />` + `<QaThread />` + `<DiagnosedThread />` can render from server-fetched data. Existing PR #19 preview block now ONLY renders when `severity_confirmed=false AND no Q&A rounds completed yet`. |
| `apps/web/app/(app)/cards/[id]/page.test.tsx` | modify     | Extend existing tests: add cases for the two new `diagnosed` sub-states — provisional-with-Q&A (mounts `<AnswerThread />`) and confirmed (mounts `<DiagnosedThread />`). Existing "shown/hidden" matrix gets the new sub-state columns.                                                                                                                                                            |
| `packages/core/src/supabase.types.ts`         | regenerate | After migration 010 applies — gains 3 column types + 2 function signatures.                                                                                                                                                                                                                                                                                                                        |
| `apps/web/.env.example`                       | modify     | Add `# TRIAGE_QA_SYSTEM_PROMPT=` (commented — optional override for the Q&A prompt).                                                                                                                                                                                                                                                                                                               |
| `METRICS.md`                                  | append     | Four new event rows per D7 / § Metrics.                                                                                                                                                                                                                                                                                                                                                            |
| `CLAUDE.md` § Where Things Happen             | append     | New rows for: `POST /api/triage/answer`, the four `_lib/*-qa.ts` helpers (round-state, prompt-qa, parse-qa-output, anthropic-qa), `<AnswerThread />`, `<DiagnosedThread />`, `<QaThread />`, `<ConversationRow />`, migration 010, `TRIAGE_QA_SYSTEM_PROMPT` env var. Extend the existing `Card detail page` row to mention the `severity_confirmed`-split body.                                   |
| `CLAUDE.md` § Gotchas                         | append     | New gotcha entries from § Gotchas below: location-cache silent-miss tolerance (D6 / Gotchas #5), tool_name backfill ordering (Gotchas #6), `is_location_ask` flag on both user + assistant rows (Gotchas #7), users.location verbatim no normalization (Gotchas #8), CHECK widen 1..5 (new sub-entry of Gotchas #6).                                                                               |
| `PLAN.md`                                     | modify     | Move row #1 from `## Planned` to `## Active`; drop the `#` column, add `Branch` + `Spec` columns per convention.                                                                                                                                                                                                                                                                                   |

## Tests

### Unit tests (Vitest)

1. **`round-state.test.ts`** — pure-fn over thread rows; table-driven.
   - Empty thread → `{ qaUserCount: 0, nextRound: 1, priorWasLocationAsk: false, priorAssistantToolName: null }` (defensive — shouldn't happen because the route gates on `state='diagnosed'` which requires at least the initial read row).
   - Just the initial read assistant row (round=1, tool_name='record_initial_read') → `{ qaUserCount: 0, nextRound: 2, priorWasLocationAsk: false, priorAssistantToolName: 'record_initial_read' }`.
   - Initial + 1 Q&A pair (user round=2, assistant round=2 tool_name='ask_next_question', is_location_ask=false) → `{ qaUserCount: 1, nextRound: 3, priorWasLocationAsk: false, priorAssistantToolName: 'ask_next_question' }`.
   - Initial + 1 location-ask Q&A pair (user round=2 is_location_ask=true, assistant round=2 ask_next_question is_location_ask=true) → `{ qaUserCount: 0, nextRound: 3, priorWasLocationAsk: true, priorAssistantToolName: 'ask_next_question' }` — location ask doesn't count toward budget (D4) but still advances the round number.
   - Initial + 3 Q&A pairs (all non-location) → `{ qaUserCount: 3, nextRound: 5, ... }` — round-3 cap fires from the route, not the helper.
   - Out-of-order timestamps tolerated (assert helper sorts internally).
2. **`prompt-qa.test.ts`** —
   - `resolveQaSystemPrompt({ env: { TRIAGE_QA_SYSTEM_PROMPT: '  override  ' } })` returns `'override'` (trim defense).
   - Whitespace-only or empty env → default.
   - Default contains keywords: "calm", "spiral", "ask one focused question", "3 question budget", "location".
   - Default length ≤ `PROMPT_MAX_CHARS`.
3. **`parse-qa-output.test.ts`** —
   - `ask_next_question` happy path → `{ ok: true, tool: 'ask_next_question', value }`.
   - `confirm_assessment` happy path → `{ ok: true, tool: 'confirm_assessment', value }`.
   - No `tool_use` block in response → `ParseError`.
   - Tool name neither `ask_next_question` nor `confirm_assessment` → `ParseError`.
   - `ask_next_question`: missing each required field → ParseError; `is_location_ask` non-boolean → ParseError; `updated_provisional_severity` out of enum → ParseError; empty `question` string → ParseError.
   - `confirm_assessment`: missing each required field → ParseError; `severity_confirmed` out of enum → ParseError; `system_tag` / `contractor_tag` out of enum → ParseError; `monitoring_cadence_days_proposal` not a positive int → ParseError; `sources` length > 5 → ParseError; `sources` malformed (missing url/title) → ParseError; empty `final_diagnosis` → ParseError.
   - Extra fields tolerated for both shapes (allowlist-not-denylist).
4. **`anthropic-qa.test.ts`** — mocks `Anthropic.Messages.create`.
   - `tools` array includes the `ask_next_question` schema, the `confirm_assessment` schema, and the web_search server tool.
   - `tool_choice` is `{ type: 'auto' }` when `forceConfirm=false`.
   - `tool_choice` is `{ type: 'tool', name: 'confirm_assessment' }` when `forceConfirm=true`.
   - `messages` array passes through unchanged.
   - Image blocks land only on the first user message.
   - Model defaults to `claude-sonnet-4-6`; override honored.
   - `baseURL` override + `timeout: 30000` honored.
5. **`api/triage/answer/route.test.ts`** — mocks `createClient` + `@anthropic-ai/sdk` + the four `_lib/*-qa.ts` helpers.
   - 401 when `getUser()` returns null.
   - 400 when body isn't JSON.
   - 400 when both `answer` and `skip` present.
   - 400 when neither present.
   - 400 when `card_id` isn't a uuid.
   - 400 when `answer` > 2000 chars.
   - 404 when card row select returns no row.
   - 409 `invalid_state` when card state is `'capturing' | 'triaging' | 'monitoring' | 'closed' | 'dismissed'`.
   - 409 `already_confirmed` when `severity_confirmed=true`.
   - Happy path — `ask_next_question` branch: `callQaTurn` returns ask payload → `parseQaTurn` returns ok-ask → `answer_triage_round` called with `p_user_round=nextRound`, `p_is_location_ask=false`, `p_tool_name='ask_next_question'` → 200 `{ tool: 'ask_next_question', ... }`.
   - Happy path — `confirm_assessment` branch: `callQaTurn` returns confirm payload → `parseQaTurn` returns ok-confirm → `confirm_triage` called → 200 `{ tool: 'confirm_assessment', was_forced: false, ... }`.
   - Force-confirm on round 3 cap: 3 prior user rows → route sets `forceConfirm=true` → `callQaTurn` called with `forceConfirm=true` → 200 `was_forced: true`.
   - Force-confirm on `skip:true`: `body.skip=true` → `forceConfirm=true` → no user reply persisted (`p_skip=true, p_user_answer=null` to `confirm_triage`) → 200 `was_forced: true`.
   - Location-ask dual-write: prior assistant row's `tool_name='ask_next_question'` + `is_location_ask=true` (from row-state helper) → `answer_triage_round` called with `p_is_location_ask=true` AND `users.location` UPDATE called with `body.answer`.
   - Location-ask dual-write — UPDATE fails: Sentry warning fires; route still returns 200 (Gotchas #5).
   - 409 `invalid_state` when `answer_triage_round` RPC raises P0001 (concurrent confirm landed).
   - 409 `already_confirmed` when `confirm_triage` RPC raises P0001 (race).
   - 500 + Sentry on other RPC errors.
   - 502 `triage_invalid_output` when `parseQaTurn` returns ParseError → assert NO DB write was attempted.
   - 502 when `forceConfirm=true` but the model returned `ask_next_question` (defied the force, per Gotchas #3) → assert NO DB write.
   - 429 when Anthropic SDK throws `APIError` status 429 → assert no DB write; no Sentry.
   - 503 when Anthropic throws 5xx → assert no DB write; Sentry capture.
   - 503 on network throw / timeout.
   - Authoritative: `p_user` always === `getUser().id` (never from body). Body's `card_id` is the only body-derived param trusted.
6. **`(app)/cards/[id]/page.test.tsx`** (modify existing) —
   - For `state='diagnosed', severity_confirmed=false, qaUserCount=0` (just-after-initial-read): renders the existing initial-read preview (provisional severity chip, summary, sources, "what I need to know" list) + `<AnswerThread />` mounted below; Skip button hidden (round ≥ 1 gate).
   - For `state='diagnosed', severity_confirmed=false, qaUserCount=1`: renders the compact "Conversation so far" + `<AnswerThread />` with Skip visible; initial-read preview hidden.
   - For `state='diagnosed', severity_confirmed=true`: renders `<DiagnosedThread />`; `<AnswerThread />` not rendered.
   - Existing PR #19 cases for capturing / triaging / monitoring / closed / dismissed unchanged.
7. **`AnswerThread.test.tsx`** —
   - Initial render: textarea + Send button + (round ≥ 1) Skip button.
   - Send with answer: `triage_qa_round_started` fires with `{ card_id, round_number, is_skip: false }`; POST body is `{ card_id, answer }`; mid-fetch state.
   - 200 `tool='ask_next_question'` response: `triage_qa_round_completed` fires with the right `latency_ms` + `is_location_ask` + `search_count`; `router.refresh()` called.
   - 200 `tool='confirm_assessment'` response: `triage_qa_confirmed` fires with `total_rounds` (`= round_number` from response context — for the confirm, derived from `qaUserCount + 1`), `severity`, `contractor_tag`, `monitoring_cadence_days`, `was_forced`, `latency_ms`; `router.refresh()`.
   - 429 → `triage_qa_failed` with `error_class='triage_rate_limited'`; retry banner.
   - 503 → `error_class='triage_unavailable'`; banner.
   - 502 → `error_class='triage_invalid_output'`; banner; textarea content preserved.
   - 409 `already_confirmed` → `error_class='already_confirmed'`; "Already confirmed — refreshing…" notice + `router.refresh()`.
   - Network throw → `error_class='network'`; banner.
   - Skip button: POST body is `{ card_id, skip: true }`; `triage_qa_round_started` fires with `is_skip: true`.
   - Skip button hidden on round 0 (provisional, no Q&A rounds completed); shown on round ≥ 1.
8. **`DiagnosedThread.test.tsx`** —
   - Renders confirmed severity chip with the right `data-testid` + `data-severity` (reusing PR #19's `<SeverityChip>`).
   - Renders the final diagnosis text.
   - Renders monitoring cadence line: "Check back in N days" with the "(AI-proposed)" tag.
   - "How we diagnosed this" is a `<details>` element, closed by default (`open` attribute absent).
   - When opened (test toggles `open`), renders one `<ConversationRow>` per thread row in chronological order.
9. **`QaThread.test.tsx`** —
   - Zero rows passed in (just-after-initial-read) → renders nothing (component returns null).
   - One Q&A pair (user round=2 + assistant round=2 ask_next_question) → renders both rows.
   - Location-ask user row carries the `data-testid="location-tag"` indicator.
10. **`ConversationRow.test.tsx`** —
    - User row → "Your reply (round N)" + raw content.
    - User row + `is_location_ask=true` → "Location" tag rendered.
    - Assistant row + `tool_name='record_initial_read'` → renders "Initial read" header + parsed `summary`.
    - Assistant row + `tool_name='ask_next_question'` → renders "Question N" header + parsed `question`.
    - Assistant row + `tool_name='confirm_assessment'` → renders "Confirmed" header + parsed `final_diagnosis`.
    - Assistant row with malformed JSON `content` → renders fallback copy "Conversation row could not be parsed." + Sentry breadcrumb fired (no throw).
    - Unknown `tool_name` → fallback copy + Sentry breadcrumb (forward-compat against tool-shape drift).

### Integration tests

None new. External dependencies (Supabase RPCs, Anthropic) are mocked at the unit-test layer; E2E owns end-to-end wiring.

### E2E test (Playwright)

**`apps/web/e2e/triage-conversation.spec.ts`** (D11). Skips gracefully on non-local via `test.skip(!isLocalSupabase, …)`. Reuses the `ANTHROPIC_BASE_URL` local-mock server pattern from `apps/web/e2e/triage-route-handler.spec.ts`.

Flows:

1. **Single-round confirm (model decides):**
   - Admin-seed a card in `state='diagnosed', severity_confirmed=false` with the initial-read assistant row (round=1, `record_initial_read`).
   - Sign in via password helper.
   - Navigate to `/cards/[id]`.
   - Assert `<AnswerThread />` mounted with the active "What I need to know" question rendered.
   - Mock Anthropic to return `confirm_assessment` immediately (no questions).
   - Type an answer, click Send.
   - Assert page transitions to `<DiagnosedThread />`: confirmed severity chip + final diagnosis + monitoring cadence visible.
   - Admin-client read asserts: `cards.severity_confirmed=true`, `cards.monitoring_cadence_days = <mocked value>`, two new `triage_conversations` rows (user round=2 + assistant round=2 tool_name='confirm_assessment').
2. **3-round force-confirm:**
   - Admin-seed a card with the initial-read row + 3 prior Q&A pairs (rounds 2, 3, 4 — `qaUserCount=3` heading in).
   - Mock Anthropic to return `confirm_assessment` (server will force; mock cooperates).
   - Type answer + Send.
   - Assert `<DiagnosedThread />` renders; admin-client reads confirm `severity_confirmed=true` and `<AnswerThread />` not present.
3. **Location-ask path:**
   - Admin-seed initial-read + 1 prior Q&A pair where the assistant row is a location-ask (`is_location_ask=true`).
   - Mock Anthropic to return another `ask_next_question` (non-location).
   - Type "94110" (a ZIP), click Send.
   - Assert: `users.location='94110'` (admin-client read); new user row has `is_location_ask=true`; next assistant row's `is_location_ask=false`.
4. **Skip path:**
   - Admin-seed initial-read + 1 Q&A pair (Skip is visible since round ≥ 1).
   - Mock Anthropic to return `confirm_assessment`.
   - Click Skip (no textarea content).
   - Assert: no user reply row inserted for the skip turn; `cards.severity_confirmed=true`.
5. **503 retry:**
   - Admin-seed initial-read row.
   - Mock Anthropic to return 503 on first request, valid `ask_next_question` on second.
   - Click Send; assert retryable banner with retry button.
   - Click retry; assert success.
   - Admin-client read: only one user row inserted for the eventual success turn (the failed turn left no DB trace, D10).

### Test Presence enforcement

Every new `.ts` / `.tsx` source file under `apps/web/app/api/triage/answer/` and `apps/web/app/api/triage/_lib/*-qa.ts` and `apps/web/app/(app)/cards/[id]/_components/` has a paired `*.test.ts`. No `.devshop-test-coverage-exempt` additions needed.

## Dependencies

### Package dependencies

None new. `@anthropic-ai/sdk@0.96.0` is already in `apps/web/package.json` from PR #19.

### Service dependencies

- **Anthropic API** — same as PR #19. Outage manifests as 503 with retry; the user keeps their typed answer in the textarea and can retry.
- **Supabase Postgres + Storage** — existing.

### Env vars

| Name                      | Where set                      | Required | Notes                                                                                                                                          |
| ------------------------- | ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`       | Vercel (prod + preview), local | yes      | Reused from PR #19. Server-only. `.trim()` defense.                                                                                            |
| `TRIAGE_QA_SYSTEM_PROMPT` | Vercel (prod + preview), local | no       | NEW — operator-tunable override for the Q&A prompt (separate from initial-read's `TRIAGE_SYSTEM_PROMPT`). ≤ 3500 chars per `PROMPT_MAX_CHARS`. |
| `ANTHROPIC_MODEL`         | Vercel (prod + preview), local | no       | Reused from PR #19; default `claude-sonnet-4-6`.                                                                                               |
| `ANTHROPIC_BASE_URL`      | local (E2E only)               | no       | Reused from PR #19's E2E test seam.                                                                                                            |

### Other repo deps

- Requires migration 010 to have applied locally (`pnpm db:reset`) before unit tests can run against the generated types.
- Requires PR #19 (`triage-route-handler`) shipped — depends on `start_triage` / `complete_triage` RPCs + the existing `_lib/anthropic.ts` + `_lib/photos.ts` + `_lib/prompt.ts` helpers + the `/cards/[id]` server page.

## Task order

Hard dependencies between subtasks. Implement and commit atomically per row. Mirrors Phase 0 preview's T1-T10 with refinement.

| #   | Task                                                          | Depends on             | Acceptance                                                                                                             | Tests                                                                                         |
| --- | ------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | Migration 010 (column adds + CHECK widen + backfill + 2 RPCs) | —                      | `pnpm db:reset` clean. `select severity_confirmed from cards limit 1` returns rows. `pg_proc` lists both new RPCs.     | Smoke-only: assert RPC names exist post-migration (handled by `pnpm db:reset` + types regen). |
| 2   | Regenerate `packages/core/src/supabase.types.ts`              | T1                     | Generated types include `severity_confirmed`, `is_location_ask`, `tool_name`, `answer_triage_round`, `confirm_triage`. | TS compile passes; helper imports use the regenerated types.                                  |
| 3   | `_lib/round-state.ts` + paired test                           | T2                     | Pure-fn returns `{ qaUserCount, nextRound, priorWasLocationAsk, priorAssistantToolName }`.                             | `round-state.test.ts` — 6 table-driven cases.                                                 |
| 4   | `_lib/prompt-qa.ts` + paired test                             | —                      | `DEFAULT_QA_SYSTEM_PROMPT` + `resolveQaSystemPrompt()` exported; default ≤ 3500 chars.                                 | `prompt-qa.test.ts` — 4 cases.                                                                |
| 5   | `_lib/parse-qa-output.ts` + paired test                       | —                      | Discriminated union returned per tool name; ParseError on every shape violation.                                       | `parse-qa-output.test.ts` — ~25 cases (both happy paths + each violation).                    |
| 6   | `_lib/anthropic-qa.ts` + paired test                          | T5                     | `callQaTurn()` wraps the SDK; `tool_choice` branches on `forceConfirm`.                                                | `anthropic-qa.test.ts` — ~8 cases.                                                            |
| 7   | `POST /api/triage/answer/route.ts` + paired test              | T2 + T3 + T4 + T5 + T6 | Wires the four helpers; D10 envelope; dual-write on location turn; force-confirm on round-3 + skip.                    | `route.test.ts` — ~25 cases per § Tests.                                                      |
| 8   | `<ConversationRow />` server component + paired test          | T2                     | Renders by `(role, tool_name)` discriminator; malformed JSON falls back gracefully.                                    | `ConversationRow.test.tsx` — 7 cases.                                                         |
| 9   | `<QaThread />` server component + paired test                 | T8                     | Renders compact prior thread; nothing-to-show case handled.                                                            | `QaThread.test.tsx` — 3 cases.                                                                |
| 10  | `<DiagnosedThread />` server component + paired test          | T8                     | Renders confirmed-state body; `<details>` collapsible closed by default.                                               | `DiagnosedThread.test.tsx` — 5 cases.                                                         |
| 11  | `<AnswerThread />` client component + paired test             | T7                     | Send + Skip wired; PostHog events fire on each response class; controlled-input survives 502/503/network.              | `AnswerThread.test.tsx` — ~12 cases.                                                          |
| 12  | `/(app)/cards/[id]/page.tsx` extension + test extension       | T9 + T10 + T11         | `severity_confirmed`-split body mounts the right sub-component; thread fetched once on the server.                     | `page.test.tsx` — 3 new sub-state cases.                                                      |
| 13  | METRICS.md append (4 events)                                  | T11                    | Four new rows under `## Events`.                                                                                       | Doc-only; check-docs-freshness hook validates.                                                |
| 14  | CLAUDE.md updates (Where Things Happen rows + Gotchas)        | T1-T12                 | New rows reflect every new file/path; new Gotchas reflect the 8 spec § Gotchas.                                        | Doc-only; check-docs-freshness hook validates.                                                |
| 15  | `.env.example` (`TRIAGE_QA_SYSTEM_PROMPT`)                    | —                      | Commented entry present.                                                                                               | Doc-only.                                                                                     |
| 16  | E2E `apps/web/e2e/triage-conversation.spec.ts`                | T7 + T11 + T12         | Five flows pass against local Supabase; skipped on non-local.                                                          | The spec itself.                                                                              |

Rows 1-2 must finish before 3-7 (types). Rows 3-6 can run in parallel; 7 depends on all four. Rows 8-11 can run in parallel after 7 (or 2 for 8-10). Row 12 depends on 9-11. Rows 13-15 are independent. Row 16 needs everything else green.

## Gotchas

Non-obvious rules surfaced during spec design. Add to CLAUDE.md § Gotchas as part of T14.

1. **plpgsql column-name ambiguity inside `RETURNS TABLE` (the PR #24 / commit ad544ce lesson — apply preemptively).** plpgsql exposes RETURNS TABLE column names as variables inside the function body; default `#variable_conflict` is `error`. Bare references like `state`, `id`, `card_id` collide with the underlying table columns and 42702 at runtime (PostgreSQL 15+). Migration 010's RPCs MUST qualify every column reference with `public.<table>.<col>` in WHERE / SET / RETURNING clauses. The fix shape is exactly what migration 007 needed in PR #24 (`fix: column reference "state" is ambiguous`); apply it preemptively in migration 010 so we don't get burned twice. Audit pattern: `grep -E "^\s*(where|and|set|returning)\s+[a-z_]+\s" supabase/migrations/<file>.sql` and flag any unqualified column ref inside a function body. Migration 010 also adds `if not exists` guards on column adds so re-applying is idempotent — the audit script that ships with the repo treats `add column if not exists` as a marker of intentional idempotence.

2. **The two-tool `tool_choice: { type: 'auto' }` failure mode.** Even with both tools defined, the model can output a `text` block with no `tool_use` block at all, or pick one tool but produce malformed input. `parse-qa-output.ts` MUST defensively handle: (a) no `tool_use` block at all (return ParseError); (b) `tool_use.name` that's neither `ask_next_question` nor `confirm_assessment` (return ParseError); (c) the right tool name but malformed input (return ParseError). On any ParseError: 502 `triage_invalid_output` + Sentry + NO DB write. This is the LLM-response trust boundary (mirrors PR #19's `parseInitialRead` posture from CLAUDE.md § Gotchas).

3. **Force-confirm semantics at round 3 / skip.** When the server forces `tool_choice: { type: 'tool', name: 'confirm_assessment' }`, the model is STILL capable of returning either: (a) an `ask_next_question` tool*use block (defying the force — Anthropic's tool_choice forces \_a* tool but the model can structurally refuse by attempting the wrong one), or (b) a malformed `confirm_assessment` input. Server must still validate: if validation fails OR the wrong tool is returned, 502 `triage_invalid_output` (same envelope as initial-read). The route's force path does NOT trust that forceConfirm guarantees a `confirm_assessment` payload — it still dispatches through `parseQaTurn` and branches on `parsed.tool`. The route test #5 (case "force-confirm but model returned ask_next_question") explicitly covers this.

4. **`cards.severity_confirmed` boolean vs. state-enum trade-off (D2 rationale, codified for future readers).** The state machine does NOT gain a new `card_state` enum value like `'confirmed'` because (a) `ALTER TYPE ADD VALUE` requires a split migration (cannot run inside a transaction with other DDL — see capture-flow `006a` / `006b` split), and (b) the boolean is a cleaner read site for the `/cards/[id]` body switch (a single `severity_confirmed` check vs. a new enum case to handle everywhere). Row #2 (`decide-state`) WILL introduce new states (e.g. `decide`, `planned`); those land on the enum proper. The boolean is the temporary "we've confirmed but haven't moved to the next decision step" marker that survives row #2's expansion (a confirmed-then-deciding card has `severity_confirmed=true AND state='decide'`).

5. **Dual-write to `users.location` — silent location-cache miss is tolerable.** When the previous round was a location-ask (per `_lib/round-state.priorWasLocationAsk`), a successful Send must (a) save the row via `answer_triage_round`, AND (b) UPDATE `public.users SET location = $1 WHERE id = auth.uid()`. Both writes happen in the same route-handler request. **If the location UPDATE fails after `answer_triage_round` succeeds**: log to Sentry (warning, not exception) and return 200 — the round IS saved; the silent location-cache miss is tolerable since the next location-ask round will re-ask. We do NOT roll back the round insert just because the secondary write failed — that would surface a "Q&A failed" error to the user when the Q&A actually succeeded. Single-direction failure is the right trade-off.

6. **Migration 010's `tool_name` backfill + CHECK widen ordering.** The migration must (a) add the `tool_name` column FIRST, (b) `UPDATE ... SET tool_name = 'record_initial_read'` for pre-existing assistant rows where `role='assistant' AND tool_name IS NULL AND round = 1` (this targets the PR #19 initial-read rows specifically), (c) DROP the existing `triage_round_in_range` CHECK, (d) ADD the new `triage_round_in_range CHECK (round between 1 and 5)`. The CHECK swap is necessary because Q&A rounds 2-4 + a possible location-ask round 5 break the original 1..3 constraint. **Forgetting the backfill** would leave the old initial-read rows with `tool_name=null`, and `<ConversationRow />`'s dispatcher would render them via its fallback "Unparseable conversation row" branch — visible UX regression. **Forgetting the CHECK widen** would cause `answer_triage_round` to 23514 (check_violation) on the 4th user reply row.

7. **`is_location_ask` flag set on BOTH the user reply row AND the assistant question row for a location turn.** Decision (made at /ak-spec time per Gotchas #7 in the operator's input): set `is_location_ask=true` on BOTH rows for the location turn. The user row's flag is what `_lib/round-state.qaUserCount` filters on (`role='user' AND is_location_ask=false` — D4). The assistant row's flag is what the next-turn handler reads via `_lib/round-state.priorWasLocationAsk` to decide whether the CURRENT user answer should dual-write to `users.location`. Setting both on the same turn means round-counting can filter on either side (`role='user'` filter is the canonical D4 path; `role='assistant'` filter is a defensive double-check available for future audits). The route handler passes `p_is_location_ask = parsed.value.is_location_ask` (the AI's declaration for the assistant row it's about to write) to `answer_triage_round`, AND the same value is what the NEXT request's `_lib/round-state` sees on the previous-most-recent assistant row. This makes the location-turn detection durable across page refreshes — no transient client state involved.

8. **`users.location` value normalization: verbatim, no geocode.** The user types free text (ZIP, city, neighborhood, "near downtown San Francisco"). Store the answer string verbatim in `users.location`. Do NOT normalize, geocode, or validate beyond `< 2000 char` truncation. The Claude Q&A prompt receives `users.location` as-is per eng-review § Location handling. Geocoding is a v1 concern (precise-radius weather + zone-code queries); v0's posture is "the AI can interpret natural-language location like a smart human would". This locks the value-shape early so row #5 (`monitor-beta`) reading `users.location` in its weather hooks doesn't trip over an unexpected JSON-vs-string split.

## Acceptance

User-verifiable success criteria — `/ak-pre-ship` Gate 9 captures one screenshot per Core user story verb under `specs/triage-conversation/qa-walk/`.

1. **Provisional → Q&A surface mounts** — visit `/cards/[id]` for a `state='diagnosed', severity_confirmed=false` card; `<AnswerThread />` is mounted below the existing initial-read preview; the active question is rendered + textarea is enabled.
2. **Send flow advances the round** — type an answer, click Send; mid-fetch state visible; on 200 with `ask_next_question`, page refreshes and the new active question appears; the previous turn is rendered in the compact "Conversation so far" thread.
3. **Confirm flow lands** — at any round, when Claude returns `confirm_assessment`: page refreshes; `<AnswerThread />` is gone; `<DiagnosedThread />` renders with the confirmed severity chip + final diagnosis + "Check back in N days" monitoring cadence line + closed-by-default "How we diagnosed this" collapsible.
4. **Force-confirm at round 3** — start at round 3 (3 prior non-location user replies); the server forces `tool_choice` to `confirm_assessment` (verifiable via DB read: `cards.severity_confirmed=true` lands within one Send click); `triage_qa_confirmed` event has `was_forced=true`.
5. **Skip path** — Skip button visible from round ≥ 1; clicking it lands directly on `<DiagnosedThread />`; admin-client read confirms no user reply row was inserted for the skip turn; `triage_qa_confirmed.was_forced=true`.
6. **Location ask dual-write** — when the prior assistant turn was a location-ask (`is_location_ask=true`), sending the answer writes both the `triage_conversations` row AND `users.location`. Admin-client read confirms `users.location` matches the typed answer verbatim.
7. **Error paths surfaced** — forced Anthropic 503 returns a retryable banner; the textarea content is preserved; clicking retry re-issues the POST. Forced 502 (`triage_invalid_output`) does the same. No DB row is inserted for any failed turn.
8. **Already-confirmed 409** — POSTing `/api/triage/answer` for a card already in `severity_confirmed=true` returns 409 `already_confirmed`; client renders the "Already confirmed — refreshing…" notice + `router.refresh()`.
9. **Wrong-state 409** — POSTing for a card in `capturing` / `triaging` / `monitoring` / `closed` / `dismissed` returns 409 `invalid_state`.
10. **Cross-user 404** — POSTing for a card owned by another user returns 404 `card_not_found` (no information leak).
11. **PostHog events visible** — all four new events appear in the PostHog event stream with the property shapes from § Metrics. `triage_qa_confirmed.was_forced` is `true` for the 3-round-cap + skip flows, `false` for the model-decided confirm.
12. **"How we diagnosed this" collapsible renders the full thread** — open the collapsible on a confirmed card; one row per (role × tool_name) is rendered in chronological order; the location-ask user row carries the "Location" tag.

## Rollout

Operator checklist before merging:

1. **No new env required for default behavior.** `TRIAGE_QA_SYSTEM_PROMPT` is optional; leaving it unset uses the code default `DEFAULT_QA_SYSTEM_PROMPT`.
2. **Migration 010 deploys via `.github/workflows/deploy-migrations.yml`** on push-to-main, before Vercel's app deploy starts. The column adds + the CHECK swap + the backfill + the RPC creates are all idempotent (`if not exists` guards + `drop constraint if exists` + `update ... where role='assistant' and tool_name is null` + `create or replace function`). Re-applying is safe.
3. **Post-merge smoke test** — sign into production with a test account that has at least one `diagnosed`-state card from PR #19. Confirm the `<AnswerThread />` mounts. Run a single Send-to-confirm flow; confirm `<DiagnosedThread />` renders + the collapsible expands the full thread.
4. **Decide on `TRIAGE_QA_SYSTEM_PROMPT`** — leave unset for v0 launch. When ready to iterate post-launch, set in Vercel + local; never check the override into git.

## Rollback

If the Q&A surface is shipping broken in production:

1. **First**: roll the Q&A prompt back via `TRIAGE_QA_SYSTEM_PROMPT` env var (no code deploy) — set to a known-good prior value or unset to fall back to the code default. Vercel env-var changes take effect on next request (~30 s).
2. **If env-rollback insufficient**: revert the merge commit on `main`. Vercel auto-deploys the prior state. Migration 010 stays in place — `severity_confirmed=false` is the default for new cards, so reverting the code leaves all post-merge cards on the PR #19 flow (which simply ignores the new column). The two new RPCs become orphaned-but-harmless (no caller after revert). Reverting the migration is NOT required and is potentially destructive (the backfilled `tool_name` values would be discarded; the new column would lose any in-flight `severity_confirmed=true` data).
3. **If migration 010 itself is broken**: the rollback block at the bottom of the migration file drops both functions + drops the new columns + restores the 1..3 CHECK. Run via `psql` against the production DB connection string. **Do not** do this without a paired code revert — any code path that reads `severity_confirmed` will throw "column does not exist" after the rollback.
4. **Stuck-state reaper** (not anticipated): no card-state machine path leaves a card stuck on this PR's surface — every Q&A failure path returns the user to the same `severity_confirmed=false` view they started from. The only stuck-state risk is a confirmed card whose `<DiagnosedThread />` is broken, in which case the rollback above is the recovery.

## Decision rows surfaced for Phase 0 sign-off (already resolved)

Confidence Calibration § stop-and-ask items present in this spec — all signed off in Phase 0 and recorded in the Decisions section above:

- **New DB columns** — D5 (`cards.severity_confirmed`, `triage_conversations.is_location_ask` + `tool_name`, CHECK constraint widen 1..3 → 1..5).
- **New DB RPCs** — D5 (`answer_triage_round`, `confirm_triage`).
- **Third-party API integration changes** — D3 (two new custom tools + reused `web_search_20260209` from PR #19).
- **Performance-sensitive code paths** — Q&A turn latency is 5-12s p50 (text-only round; faster than initial read because no image base64 transfer in the user message past round 1). Skeleton design intentionally preserves prior thread mid-fetch.
- **Security-related logic** — D5 (both new RPCs are SECURITY DEFINER + auth.uid() guarded), Gotchas #5 (dual-write trust posture), Gotchas #7 (is_location_ask flag on both rows is the durable detection seam).
- **New METRICS.md events** — D7 (four new events).

No first-integration-test-threshold crossing (capture-flow + PR #19 already established the patterns). No new dependency added.
