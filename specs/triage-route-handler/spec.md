<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: triage-route-handler -->
<!-- date: 2026-05-15 -->

# Spec: triage-route-handler (v0 Phase 1 PR #4)

**Sources:**

- `PRODUCT-ROADMAP.md` + `PLAN.md § Planned § row #1` — primary scope
- `.gstack/eng-review-home-os-2026-05-01.md § Triage Route Handler Logic` — 11-step route logic (lines 172–207)
- `.gstack/eng-review-home-os-2026-05-01.md § Business Logic — Location Handling` (lines 245–250)
- `.gstack/eng-review-home-os-2026-05-01.md § Pre-Ship Requirements` (lines 422–434) — eval dataset deferred to row #11
- `.gstack/ceo-review-home-os-2026-05-01-r2.md § Scope — AI Triage` (lines 68–69) — progressive disclosure model
- `.gstack/design-review-home-os-2026-05-02.md § TRIAGE — Two-Phase Diagnostic Conversation` (lines 209–276) — phase 1 = initial read scope
- Prior spec `specs/capture-flow/spec.md` — style + structure reference
- Prior route `apps/web/app/api/card/route.ts` — handler pattern (auth, error envelope, dynamic export)
- `supabase/migrations/20260513184101_002_tables.sql` — `cards`, `triage_conversations`, `users`, `usage_counters` schema
- `supabase/migrations/20260514030943_006b_capture_flow.sql` — `claim_card_slot` SECURITY DEFINER pattern reference for `start_triage`

`POST /api/triage` does the initial AI read for a freshly-captured card: pulls
the photo + description, calls Claude Sonnet 4.6 with the `web_search` server
tool and a forced `record_initial_read` tool-use output, persists the result
into `cards` + `triage_conversations`, and transitions state `capturing` →
`triaging` → `diagnosed`. Initial read only — multi-round Q&A is row #2.

---

## Decisions (resolved at spec time)

11 decisions resolved in Phase 0 with the user. Recorded below so Phase 1
preserves them verbatim and a crashed Phase 1 resumes without re-asking.

### D1: SDK + model

**Decision:** Use `@anthropic-ai/sdk` (latest). Default model
`claude-sonnet-4-6`, overridable via `ANTHROPIC_MODEL` env var.

**Rationale:** Sonnet 4.6 balances reasoning + vision quality against the
per-call cost on a free tier. Opus 4.7 is overkill (3x cost), Haiku 4.5 may
miss nuance on photo analysis. Env-overridable so row #11's eval pipeline
can A/B different models without code change.

### D2: Web search

**Decision:** Anthropic's native `web_search` server tool with `max_uses: 5`,
no domain allowlist.

**Rationale:** Spec calls for "grounded in home improvement knowledge with
cited sources" (ceo-review § Scope). Native server tool avoids MCP plumbing.
5-search budget covers product specs / code lookups / contractor practice
without runaway per-call cost. No allowlist — we trust Claude's selection.

### D3: Output shape — forced tool-use

**Decision:** AI must call a `record_initial_read` tool with fields:

```
{
  summary: string,                // human-readable working hypothesis
  severity_provisional: 'cosmetic' | 'monitor' | 'soon' | 'urgent',
  what_im_confident_about: string,
  what_i_need_to_know: string[],  // 1–3 clarifying questions
  sources: { url: string, title: string }[], // cited from web_search
  system_tag_proposed: system_tag enum,
  contractor_tag_proposed: contractor_tag enum,
}
```

Force via `tool_choice: { type: 'tool', name: 'record_initial_read' }`.

**Rationale:** Tool-use guarantees parseable output every call. Avoids the
JSON-in-text-block parsing failures common with "respond in JSON" prompts.
Each field maps directly to a `cards` column or to the persisted assistant
message blob.

### D4: Photo handling

**Decision:** Server-side download photo bytes from `card-photos` Storage
in the authenticated user's RLS context, base64-encode, send as
`image/jpeg` content blocks to Claude. Concat multiple photos if a card has
them; cap at the first 3 to bound payload size.

**Rationale:** No signed URLs leaked to Anthropic; no signed-URL TTL
fragility; works under the existing RLS predicate (the `auth.uid()` path
match). 3-photo cap is defensive — v0 Phase 1 only writes one `primary/wide`
photo per card; the cap protects against future photo expansion.

### D5: User-facing trigger surface

**Decision:** Ship a new `/(app)/cards/[id]` server-rendered card detail page
that owns the lifecycle UI:

- state=`capturing` → "Read this for me" button (POSTs to `/api/triage`)
- state=`triaging` → loading skeleton (re-fetched on poll or full reload)
- state=`diagnosed` → initial-read result (summary, severity_provisional,
  the three "what I need to know" questions as preview)
- state=`monitoring`/`closed`/`dismissed` → minimal stub (row #4+ owns)

CaptureForm's 201 success redirect changes from `/home` → `/cards/[id]`.

**Rationale:** Endpoint needs a consumer to QA + ship. `/cards/[id]` becomes
the home base for row #2's Q&A UI — answer-input dialog slots in below the
preview without page replacement. Avoids server-chained call from `/api/card`
that would block capture POST on 10s+ Claude latency.

### D6: State lifecycle + atomic transition

**Decision:** Define `public.start_triage(p_user uuid, p_card uuid)`
SECURITY DEFINER RPC that runs `update cards set state='triaging' where
id=p_card and user_id=p_user and state='capturing' returning id, state`.
Returns the updated row on success; raises `triage_invalid_state` (P0001) if
no rows updated. Route handler checks: success → continue Claude call;
P0001 → 409 `invalid_state`.

On Claude success: route updates the card row with diagnosis + severity +
proposed tags AND inserts the `triage_conversations` row (role='assistant',
round=1) AND moves state to `diagnosed`. Three updates wrap in a single RPC
`complete_triage(p_user, p_card, p_diagnosis, p_severity, p_system_tag,
p_contractor_tag, p_assistant_content)` for atomicity.

On Claude error: revert state via `update cards set state='capturing' where
id=? and user_id=? and state='triaging'` (best-effort; if the user retries
faster than the revert, the 409 path catches them).

**Rationale:** Atomic `capturing → triaging` is the only way to handle
concurrent submits (refresh-while-running). The SECURITY DEFINER pattern
matches `claim_card_slot` from capture-flow — same auth-internal-guard
defense (`p_user = auth.uid()`). Revert-on-error keeps capture recoverable.

### D7: Idempotence

**Decision:** Route behavior by current card state at entry:

- `capturing` → proceed
- `triaging` → 202 `triage_in_progress` (rare: concurrent fire; client
  should re-poll the card detail page)
- `diagnosed` → 409 `already_triaged`
- `monitoring`/`closed`/`dismissed` → 409 `invalid_state`
- card not owned by user → 404 `card_not_found`

**Rationale:** 202 path handles browser-refresh race without surfacing an
error. 409 on `diagnosed` prevents silent re-triage cost. 404 leaks no
information about whether the card exists.

### D8: TRIAGE_SYSTEM_PROMPT source

**Decision:** Required env var `TRIAGE_SYSTEM_PROMPT` with code fallback:
export `DEFAULT_TRIAGE_SYSTEM_PROMPT` as a const from
`apps/web/app/api/triage/_lib/prompt.ts`. Route prefers env var when set,
falls back to the const otherwise. Tests use the const directly.

**Rationale:** Operator can iterate prompt without redeploy (eng-review
explicit) AND missing env doesn't 500 production. The fallback const is the
"code-reviewed baseline"; env var is the "production-tunable override".
Prompt content (first draft):

- Persona: calm authority; never alarmist; spiral prevention is explicit.
- Task: initial read of a home maintenance issue from photo + description.
- Output: use the `record_initial_read` tool exclusively.
- Severity calibration: four-tier enum mapped to homeowner action.
- Citation: use web_search for product specs / code requirements / typical
  contractor practice; cite URLs.
- Tone: one-screen scannable; no scary words unless severity=urgent.

Target length: ~400 words, comfortably under Vercel's 4KB env-var limit.

### D9: Error envelope

**Decision:** Match `/api/card`'s `{ error: string, ... }` shape:

- 400 `validation_failed` + `{ fields: { card_id: '...' } }`
- 401 `auth_required`
- 404 `card_not_found`
- 409 `invalid_state` | `already_triaged`
- 202 `triage_in_progress`
- 429 `triage_rate_limited` + `{ retry_after_s: number }` (Anthropic 429)
- 503 `triage_unavailable` + `{ retry_after_s: number }` (Anthropic 5xx)
- 500 `server_error` (anything else; Sentry captured)

Success: 200 `{ card_id, severity_provisional, what_i_need_to_know: string[] }`.

**Rationale:** One pattern across all `/api/*` routes simplifies client
error handling. Distinct codes for distinct error classes lets the UI
display calibrated copy (429 retry vs 503 wait).

### D10: Metrics events

**Decision:** Three PostHog events, parallel to capture-flow's shape:

- `triage_initial_read_started` — props: card_id, system_tag (input)
- `triage_initial_read_completed` — props: card_id, system_tag,
  severity_provisional, latency_ms, search_count (from tool-use stops)
- `triage_initial_read_failed` — props: card_id, error_class, latency_ms

**Rationale:** Three-event pattern mirrors `capture_started/completed/cap_hit`
so the Phase-1 funnel reads consistently. `search_count` surfaces the
web_search cost driver.

### D11: E2E test strategy

**Decision:** Mock Anthropic via fetch interceptor for E2E (fixed
`record_initial_read` JSON payload). Real-API regression handled by row #11
`triage-eval-dataset`. The E2E spec asserts: state transitions fire in
order, conversation row is written, `cards` columns are updated, photo-bytes
fetch resolves under RLS, error path reverts state.

**Rationale:** Real Claude calls in CI are slow (10s+ per call) and burn
`ANTHROPIC_API_KEY_QA` budget. Row #11's eval dataset is the structured place
for real-API regression. E2E's job is wiring, not quality.

---

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens, Data
     model changes, API contracts, Offline behavior, Metrics, Files to
     create/modify, Tests, Dependencies, Task order, Gotchas, Acceptance /
     rollout / rollback. The Decisions section above stays verbatim. -->
