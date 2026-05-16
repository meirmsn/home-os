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
