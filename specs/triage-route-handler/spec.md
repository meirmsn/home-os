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

## Core user story

1. Sign in.
2. Capture a card (photo + description + system_tag + room_tag) and submit.
3. Land on `/cards/[id]` showing the card in `capturing` state with a "Read this for me" button.
4. Tap "Read this for me" — see the loading skeleton while state moves to `triaging`.
5. See the initial-read result render (summary, severity_provisional chip, the three "what I need to know" questions) once state moves to `diagnosed`.

Five verbs (sign-in, capture-submit, see-button, tap-trigger, see-result).
Gate 9 captures one artifact per verb under `specs/triage-route-handler/qa-walk/`.

## In scope

- `POST /api/triage` route handler that:
  - Authenticates via `supabase.auth.getUser()`.
  - Validates `card_id` (required uuid; D9 envelope).
  - Confirms the card belongs to the user and is in `state='capturing'`.
  - Atomically transitions `capturing → triaging` via the `start_triage` SECURITY DEFINER RPC (D6).
  - Loads photo bytes from Storage in the user's RLS context (D4).
  - Calls Claude Sonnet 4.6 with `web_search` server tool + forced `record_initial_read` tool-use (D1, D2, D3).
  - Parses the tool-use payload at runtime (defensive — D3 says "force tool", but the SDK can still return refused).
  - On success: `complete_triage` SECURITY DEFINER RPC atomically writes `cards.diagnosis / severity / system_tag / contractor_tag`, inserts `triage_conversations` row (role=`assistant`, round=1), transitions `triaging → diagnosed` (D6).
  - On any error after `start_triage`: best-effort revert via `update cards set state='capturing'` predicate-guarded on `state='triaging'` (D6).
  - Returns the D9 error envelope across all paths.
  - Fires the three PostHog events from D10.
- New SECURITY DEFINER RPCs in migration 007 (D6): `start_triage`, `complete_triage`. Each internally guards `p_user = auth.uid()` (matches `claim_card_slot` posture).
- New `/(app)/cards/[id]` server-rendered card detail page that owns the state-machine UI (D5).
- New `<StartTriage />` `'use client'` component that POSTs to `/api/triage` and re-routes to the same `/cards/[id]` (or refreshes) on completion / error.
- Capture-flow modification: `CaptureForm` 201 redirect changes from `/home` → `/cards/[id]` (D5).
- Middleware `GATED_PREFIXES` extension: add `/cards` (anonymous bounces to `/login?next=/cards/<id>`).
- New env vars: `ANTHROPIC_API_KEY` (required, server-only), `TRIAGE_SYSTEM_PROMPT` (optional override — code fallback in `_lib/prompt.ts`, D8), `ANTHROPIC_MODEL` (optional, default `claude-sonnet-4-6`, D1).
- New `@anthropic-ai/sdk` dependency on `apps/web`.
- Regenerated `packages/core/src/supabase.types.ts` after migration 007 applies.
- Three new PostHog events in `METRICS.md` per D10.
- New e2e spec `apps/web/e2e/triage-route-handler.spec.ts` with Anthropic mocked via `page.route()` interceptor (D11).
- Three unit tests for the route handler's pure helpers (`prompt.ts`, `parse-tool-output.ts`, `photos.ts`) + the route handler itself, mocking the Anthropic client.
- CLAUDE.md § Where Things Happen + § Gotchas updates.

## Out of scope

- **Multi-round Q&A** (rounds 2 + 3). Row #2 (`triage-conversation`) owns it. The initial-read response stores three "what I need to know" strings as a preview only; no answer-input UI ships here.
- **Location ask flow** (eng-review § Business Logic § Location Handling). The free-question outside the 3-round limit is row #2's concern; this route never asks about location and never reads `users.location`.
- **BYOK** (bring-your-own Anthropic key). Row #10 owns. This route always uses the server `ANTHROPIC_API_KEY`.
- **Free-tier usage limits** (5 triage sessions/wk). Row #10 owns the `usage_counters.triage_session_count` increment + the cap-hit error. Initial read is uncapped per eng-review § Triage Route Handler Logic step 3c.
- **Monitoring-cadence UI** + the `cards.monitoring_cadence_days` write. Cadence proposal lives in row #2 (post-Q&A).
- **Contractor question tags UI** + the `cards.contractor_tag` user-modification flow. Row #3 (`decide-state`) owns. The initial-read writes a _proposed_ contractor_tag but doesn't surface it in this PR's UI beyond the diagnosis text.
- **Triage eval dataset** + the eval-runner script. Row #11 (`triage-eval-dataset`) owns. This PR's E2E uses a mocked Anthropic response — no real-API regression coverage in CI here.
- **Photo-comparison rendering** on `/cards/[id]`. Row #7 owns; this PR's card detail page renders only the most-recent `primary/wide` photo.
- **Restore-from-DISMISSED-to-TRIAGE** with prior context. Row #6 (`monitor-beta`) names the resume flow.

## Screens

### `/cards/[id]` — card detail (new)

Single server-rendered page; state-machine-conditioned body. Header constant across states: room_tag · system_tag chip · created_at.

| State        | Body                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capturing`  | Photo (most-recent `primary/wide`, or "no photo" placeholder per design-review). Description text. `<StartTriage cardId={id} />` button labeled "Read this for me" — primary CTA on the dark ground, calm-authority copy.                                                                                                                                                                                                                             |
| `triaging`   | Photo + description (unchanged). Skeleton block where the diagnosis will land. Polite copy: "Reading your capture…" (matches capture-flow's TRIAGE_PENDING design-review § Card States copy). No retry button — user can refresh; the route's 202 path handles refresh-while-running races (D7).                                                                                                                                                      |
| `diagnosed`  | Photo + description. Diagnosis summary (multi-line, scannable). Severity chip (`cosmetic` / `monitor` / `soon` / `urgent`) with the four-tier color treatment from `DESIGN.md` (severity colors are already in `packages/ui/src/tokens.ts`). Three "what I need to know" questions as a static preview list (no answer-input UI — row #2 wires that). Sources list rendered as `[1] title (domain)` plain text with `target="_blank" rel="noopener"`. |
| `monitoring` | Stub: "Monitoring view ships in `monitor-beta`." Row #6 replaces.                                                                                                                                                                                                                                                                                                                                                                                     |
| `closed`     | Stub: "Card closed on `<closed_at>`." Row #5 (`close-flow`) replaces.                                                                                                                                                                                                                                                                                                                                                                                 |
| `dismissed`  | Stub: "This card was dismissed. Restore it from `/dismissed` to reactivate." Link to `/dismissed`.                                                                                                                                                                                                                                                                                                                                                    |

If the card isn't owned by the signed-in user, the page renders a 404 (Next's `notFound()`) — never a 403, to avoid leaking card-existence per D7's 404-not-403 posture.

## Render conditions — `/cards/[id]` body

| Element                                     | `capturing` | `triaging` | `diagnosed` | `monitoring` | `closed` | `dismissed` |
| ------------------------------------------- | ----------- | ---------- | ----------- | ------------ | -------- | ----------- |
| Header (room / system / created_at)         | shown       | shown      | shown       | shown        | shown    | shown       |
| Photo block (`primary/wide` or placeholder) | shown       | shown      | shown       | shown        | shown    | shown       |
| Description block                           | shown       | shown      | shown       | shown        | shown    | shown       |
| `<StartTriage>` button "Read this for me"   | shown       | hidden     | hidden      | hidden       | hidden   | hidden      |
| Loading skeleton ("Reading your capture…")  | hidden      | shown      | hidden      | hidden       | hidden   | hidden      |
| Diagnosis summary block                     | hidden      | hidden     | shown       | hidden       | hidden   | hidden      |
| Severity chip                               | hidden      | hidden     | shown       | hidden       | hidden   | hidden      |
| "What I need to know" preview list          | hidden      | hidden     | shown       | hidden       | hidden   | hidden      |
| Sources list                                | hidden      | hidden     | shown       | hidden       | hidden   | hidden      |
| `monitoring` stub                           | hidden      | hidden     | hidden      | shown        | hidden   | hidden      |
| `closed` stub                               | hidden      | hidden     | hidden      | hidden       | shown    | hidden      |
| `dismissed` stub (with `/dismissed` link)   | hidden      | hidden     | hidden      | hidden       | hidden   | shown       |

## Render conditions — `<StartTriage>` button local UI

| Element                                  | initial | mid-fetch | 202 `triage_in_progress` | 409 `already_triaged` | 5xx / 503 / 429 | network error |
| ---------------------------------------- | ------- | --------- | ------------------------ | --------------------- | --------------- | ------------- |
| "Read this for me" button (enabled)      | shown   | hidden    | hidden                   | hidden                | shown           | shown         |
| "Read this for me" button (disabled)     | hidden  | shown     | hidden                   | hidden                | hidden          | hidden        |
| Inline spinner inside button             | hidden  | shown     | hidden                   | hidden                | hidden          | hidden        |
| "Already running — refreshing…" notice   | hidden  | hidden    | shown                    | hidden                | hidden          | hidden        |
| "Already diagnosed — refresh" notice     | hidden  | hidden    | hidden                   | shown                 | hidden          | hidden        |
| Retryable error banner with retry button | hidden  | hidden    | hidden                   | hidden                | shown           | shown         |

202 + 409 paths force a `router.refresh()` after a short delay so the page re-renders against the latest server state. 5xx / 429 keeps the user on the page with a retry-eligible button.

## Data model changes

### Migration 007 — `start_triage` + `complete_triage` RPCs

Filename: `supabase/migrations/20260515HHMMSS_007_triage_route_handler.sql` (a single file — neither RPC alters an enum, so the ALTER TYPE transaction restriction doesn't apply; both `create or replace function` statements run inside one transaction).

```sql
-- Migration 007 — triage-route-handler RPCs.
-- Source: specs/triage-route-handler/spec.md § Data model changes.
--
-- Adds two SECURITY DEFINER functions:
--   1. public.start_triage(p_user, p_card) — atomic capturing → triaging
--   2. public.complete_triage(p_user, p_card, p_diagnosis, p_severity,
--        p_system_tag, p_contractor_tag, p_assistant_content) — atomic
--        triaging → diagnosed + cards UPDATE + triage_conversations INSERT
--
-- Both pin search_path to `public, pg_catalog` and internally guard
-- `p_user = auth.uid()`. Matches the claim_card_slot convention from
-- migration 006b — same auth-internal-guard defense.

create or replace function public.start_triage(
  p_user uuid,
  p_card uuid
)
returns table (card_id uuid, state public.card_state)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_card_id uuid;
  v_state public.card_state;
begin
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.cards
    set state = 'triaging',
        updated_at = now()
  where id = p_card
    and user_id = p_user
    and state = 'capturing'
  returning id, state into v_card_id, v_state;

  if v_card_id is null then
    raise exception 'triage_invalid_state' using errcode = 'P0001';
  end if;

  return query select v_card_id, v_state;
end;
$$;

create or replace function public.complete_triage(
  p_user uuid,
  p_card uuid,
  p_diagnosis text,
  p_severity_provisional public.severity,
  p_system_tag public.system_tag,
  p_contractor_tag public.contractor_tag,
  p_assistant_content text
)
returns table (card_id uuid, state public.card_state)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_card_id uuid;
  v_state public.card_state;
begin
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Predicate-guard on state='triaging' so concurrent completes don't
  -- both succeed. Second caller falls through to v_card_id is null.
  update public.cards
    set state = 'diagnosed',
        diagnosis = p_diagnosis,
        severity = p_severity_provisional,
        system_tag = p_system_tag,
        contractor_tag = p_contractor_tag,
        updated_at = now()
  where id = p_card
    and user_id = p_user
    and state = 'triaging'
  returning id, state into v_card_id, v_state;

  if v_card_id is null then
    raise exception 'triage_invalid_state' using errcode = 'P0001';
  end if;

  insert into public.triage_conversations (
    card_id, user_id, round, role, content
  )
  values (
    p_card, p_user, 1, 'assistant', p_assistant_content
  );

  return query select v_card_id, v_state;
end;
$$;

-- ROLLBACK:
-- drop function if exists public.complete_triage(uuid, uuid, text, severity, system_tag, contractor_tag, text);
-- drop function if exists public.start_triage(uuid, uuid);
```

**Why a single migration**: neither function touches an enum value, and `create or replace function` is transaction-safe. Splitting into 007a/007b would only be needed if we were adding a new enum variant (e.g., `'triage_failed'`); we're not — error states revert to `capturing` per D6.

**RLS posture**: both functions are SECURITY DEFINER and bypass RLS for the cards UPDATE + triage_conversations INSERT. The auth-internal-guard (`p_user = auth.uid()`) is the only defense against a malicious authenticated user passing a foreign uid via direct PostgREST RPC. The route handler is the second layer (always passes `p_user = getUser().id`, never trusts the body).

**No schema diffs to existing tables** — `cards.diagnosis / severity / system_tag / contractor_tag` already exist (migration 002). `triage_conversations` already exists (migration 002). `card_state` enum already includes `'triaging'` and `'diagnosed'` (migration 001).

### Generated types regeneration

After migration 007 applies locally:

```bash
pnpm db:gen-types
```

`packages/core/src/supabase.types.ts` gains two new entries under `Database['public']['Functions']`: `start_triage` + `complete_triage` with the argument + return shape inferred from the function signatures.

## API contracts

### `POST /api/triage`

**Input** — `application/json`:

```ts
type TriageRequest = {
  card_id: string; // uuid
};
```

**Auth**: session cookie via `apps/web/lib/supabase/server.ts`. `supabase.auth.getUser()` is the gate.

**Behavior**:

1. **Auth check** — `getUser()` null → 401 `{ error: 'auth_required' }`.
2. **Validate body** — JSON parse error or invalid uuid → 400 `{ error: 'validation_failed', fields: { card_id: '<message>' } }`.
3. **Load card + state-classify** — `select id, user_id, state, initial_description, system_tag, room_tag from cards where id = card_id and user_id = user.id` via the user-context client (RLS enforces). Per D7:
   - No row → 404 `{ error: 'card_not_found' }`.
   - `state='triaging'` → 202 `{ error: 'triage_in_progress' }` (client refreshes the card detail page; the running call will finish or the revert path will reset state).
   - `state='diagnosed'` → 409 `{ error: 'already_triaged' }`.
   - `state='monitoring' | 'closed' | 'dismissed'` → 409 `{ error: 'invalid_state' }`.
   - `state='capturing'` → continue.
4. **Atomic transition** — `supabase.rpc('start_triage', { p_user: user.id, p_card: card_id })`. On P0001 `triage_invalid_state` → 409 `{ error: 'invalid_state' }` (race: someone else moved it). On other error → Sentry capture + 500 `{ error: 'server_error' }`.
5. **Fire `triage_initial_read_started`** PostHog event (server-side: ignore — events fire from the client surface that POSTs; see § Metrics). The route does NOT capture PostHog events directly because PostHog client init is browser-only in this project (`apps/web/lib/posthog.ts`); events are captured by `<StartTriage />` (D10).
6. **Load photo bytes (best-effort)** — query `card_photos where card_id = p_card and user_id = user.id order by created_at desc limit 3` via the user-context client. For each row, `supabase.storage.from('card-photos').download(storage_path)`. Convert each blob → base64. Concat into a Claude `content` array with `{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: ... } }` entries. Skip silently on per-photo download error (Sentry breadcrumb only). If zero photos resolve, proceed text-only — initial-read of description alone is valid per eng-review § Error Rescue Map #1 + Edge Case #1.
7. **Call Claude** — `apps/web/app/api/triage/_lib/anthropic.ts` wrapper:
   - Model: `ANTHROPIC_MODEL` env var or `claude-sonnet-4-6` (D1).
   - System: `TRIAGE_SYSTEM_PROMPT` env var or `DEFAULT_TRIAGE_SYSTEM_PROMPT` (D8).
   - Messages: one user message with image content blocks + a text block containing `initial_description` (description trimmed; system_tag + room_tag named in the text so the model has the location context).
   - Tools: `[record_initial_read_tool, web_search_tool]`. `record_initial_read` definition matches D3; `web_search` uses the SDK's server-tool helper (verify exact name + version against `package.json` at implementation time — see § Gotchas).
   - `tool_choice: { type: 'tool', name: 'record_initial_read' }` (D3).
   - `max_tokens: 4096`. Conservative — single tool-use response averages ~1k tokens.
   - Timeout (SDK option): 30 s. Above that, abort + revert.
8. **Parse tool-use output** — iterate `response.content`, find the first block with `type === 'tool_use'` and `name === 'record_initial_read'`. Pass `block.input` to `parseInitialRead()` (runtime validator). On parse failure (model refused, missing required field, severity out of enum, sources non-array): revert state + 502 `{ error: 'triage_invalid_output' }` + Sentry capture with the raw response stashed in `extra.raw_response_id` (Anthropic message id is enough; never log the body — may contain photo PII).
9. **Complete transition** — `supabase.rpc('complete_triage', { p_user: user.id, p_card: card_id, p_diagnosis: <summary>, p_severity_provisional: <severity_provisional>, p_system_tag: <system_tag_proposed>, p_contractor_tag: <contractor_tag_proposed>, p_assistant_content: <JSON.stringify(parsed)> })`. The `p_assistant_content` is the full parsed structured payload, serialized — so row #2's Q&A surface can render the sources + questions in the "How we diagnosed this" thread.
10. **On `complete_triage` error** — Sentry capture, revert state, return 500.
11. **Return success** — 200 `{ card_id, severity_provisional, what_i_need_to_know: string[] }`. Client uses the response to render the success state immediately + fires `triage_initial_read_completed` (latency_ms = `Date.now() - start`, search_count = `response.content.filter(b => b.type === 'server_tool_use' && b.name === 'web_search').length`).
12. **Anthropic 429** — read `retry-after` header; map to 429 `{ error: 'triage_rate_limited', retry_after_s: <number> }`. Revert state. No Sentry capture (expected backpressure).
13. **Anthropic 5xx / network error / timeout** — revert state, return 503 `{ error: 'triage_unavailable', retry_after_s: 30 }`. Sentry capture (operator should know if upstream is flapping).

**Output schemas**:

```ts
// 200 OK
type TriageOk = {
  card_id: string;
  severity_provisional: 'cosmetic' | 'monitor' | 'soon' | 'urgent';
  what_i_need_to_know: string[]; // 1..3 strings
};

// 202 Accepted (D7)
type TriageInProgress = { error: 'triage_in_progress' };

// 400 — validation
type ValidationFailed = {
  error: 'validation_failed';
  fields: Partial<Record<'card_id', string>>;
};

// 401
type AuthRequired = { error: 'auth_required' };

// 404
type CardNotFound = { error: 'card_not_found' };

// 409
type InvalidState = { error: 'invalid_state' | 'already_triaged' };

// 429 — Anthropic backpressure
type TriageRateLimited = {
  error: 'triage_rate_limited';
  retry_after_s: number;
};

// 502 — model returned unparseable tool-use
type TriageInvalidOutput = { error: 'triage_invalid_output' };

// 503 — Anthropic unavailable / timeout
type TriageUnavailable = {
  error: 'triage_unavailable';
  retry_after_s: number;
};

// 500
type ServerError = { error: 'server_error' };
```

**Notes**:

- `export const dynamic = 'force-dynamic'` (cookies are read implicitly via the SSR client).
- Latency budget: typical Anthropic call with web_search runs 8–15s. The `<StartTriage />` button stays in `mid-fetch` state until response or timeout. No streaming in v0.
- The `start_triage` → Claude → `complete_triage` flow is **not transactionally atomic across the network boundary**. The revert-on-error path (D6) is best-effort. If revert itself fails (network drop between two Supabase calls), the card is stuck in `triaging`; the next user action gets 202 `triage_in_progress` and a page refresh — they retry via a future operator-side reaper script (out of scope, but Sentry will tag for visibility).

## Offline behavior

**(a) online-only with error state.**

Triage requires Claude and the Supabase backend; neither is cacheable in any meaningful way (each call is a fresh model invocation). When offline:

- The `<StartTriage />` button fetch throws → renders the retryable error banner.
- The card detail page itself renders from the server-rendered initial paint; client-side polling / refresh-while-offline shows stale state without notice. (Acceptable — refresh-on-reconnect is the recovery path.)

No service-worker cache for `/api/triage` responses. No offline queue.

## Metrics

Three new PostHog events. All three fire from the **client** (`<StartTriage />`) — server-side route handlers don't have PostHog initialized in this codebase per `apps/web/lib/posthog.ts`'s SSR no-op.

| Event                           | When it fires                                                                                                                                           | Key properties                                                                                                                                                                                                                                                            | Why we care                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `triage_initial_read_started`   | Fired from `apps/web/app/(app)/cards/[id]/_components/StartTriage.tsx` on submit, immediately before the `POST /api/triage` fetch (D10).                | `{ card_id: string, system_tag: string }`                                                                                                                                                                                                                                 | Top of the triage funnel — measures the rate of "user captured + chose to invoke AI". Drop vs `capture_completed` flags hesitation.   |
| `triage_initial_read_completed` | Fired from `StartTriage.tsx` after the route returns 200 (D10).                                                                                         | `{ card_id: string, system_tag: string, severity_provisional: 'cosmetic'\|'monitor'\|'soon'\|'urgent', latency_ms: number, search_count: number }`                                                                                                                        | Bottom of the funnel + cost driver (search_count = web_search invocations); latency_ms surfaces UX degradation before users complain. |
| `triage_initial_read_failed`    | Fired from `StartTriage.tsx` on any non-2xx response or network error (D10). `error_class` maps to the `error` field of the D9 envelope (or 'network'). | `{ card_id: string, error_class: 'validation_failed'\|'auth_required'\|'card_not_found'\|'invalid_state'\|'already_triaged'\|'triage_in_progress'\|'triage_rate_limited'\|'triage_invalid_output'\|'triage_unavailable'\|'server_error'\|'network', latency_ms: number }` | Tracks reliability surface area. 429 / 503 spikes flag Anthropic incidents; `triage_invalid_output` spikes flag prompt-regression.    |

These three append to `METRICS.md § Events`. **Decision row**: adding three new metrics events triggers Confidence Calibration § "new METRICS.md events" — recorded as D10 above, signed off in Phase 0.

## Files to create

| File                                                              | Purpose                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260515HHMMSS_007_triage_route_handler.sql` | `start_triage` + `complete_triage` SECURITY DEFINER RPCs (D6).                                                                                                                                                                                                                                      |
| `apps/web/app/api/triage/route.ts`                                | `POST /api/triage` route handler — auth, validate, state-classify, photo bytes, Claude call, parse, complete or revert. `export const dynamic = 'force-dynamic'`.                                                                                                                                   |
| `apps/web/app/api/triage/route.test.ts`                           | Vitest — mocks Supabase client + RPCs + Storage + `@anthropic-ai/sdk`. Cases enumerated in § Tests.                                                                                                                                                                                                 |
| `apps/web/app/api/triage/_lib/prompt.ts`                          | Exports `DEFAULT_TRIAGE_SYSTEM_PROMPT: string` (D8) and `resolveSystemPrompt()` that returns the env override or the default.                                                                                                                                                                       |
| `apps/web/app/api/triage/_lib/prompt.test.ts`                     | Vitest — `resolveSystemPrompt()` returns env value when set, falls back to default when env is empty / whitespace / undefined. Asserts default contains the persona keywords ("calm authority", "spiral", four-tier severity).                                                                      |
| `apps/web/app/api/triage/_lib/photos.ts`                          | Exports `fetchCardPhotosAsBase64(supabase, userId, cardId)` returning `Array<{ media_type: 'image/jpeg'; data: string }>` (max 3 photos, oldest-first by `created_at`).                                                                                                                             |
| `apps/web/app/api/triage/_lib/photos.test.ts`                     | Vitest — mocks `supabase.storage.download` + the `card_photos` query. Cases: zero photos (returns []), one photo, four photos (returns 3), partial-failure (one download throws — that one is skipped, others returned).                                                                            |
| `apps/web/app/api/triage/_lib/anthropic.ts`                       | Exports `callInitialRead({ apiKey, model, system, userText, images })` returning the raw Anthropic Messages response. Constructs the `record_initial_read` tool + `web_search` server tool. Wraps the SDK client with `timeout: 30000`.                                                             |
| `apps/web/app/api/triage/_lib/anthropic.test.ts`                  | Vitest — mocks `Anthropic.Messages.create`. Cases: tools array includes `record_initial_read` + `web_search`; `tool_choice` forces `record_initial_read`; timeout option set; api key passed; system / user-text / image blocks composed correctly.                                                 |
| `apps/web/app/api/triage/_lib/parse-tool-output.ts`               | Exports `parseInitialRead(input: unknown): RecordInitialRead \| ParseError`. Runtime validator (zod or hand-rolled — implementer's call). Validates: all required fields present, enums match, sources is `{url, title}[]`, `what_i_need_to_know` is `string[]` length 1–3.                         |
| `apps/web/app/api/triage/_lib/parse-tool-output.test.ts`          | Vitest — happy path; each required field missing → ParseError; severity not in enum; system_tag not in enum; contractor_tag not in enum; sources malformed; what_i_need_to_know length 0 or >3; extra fields tolerated (allowlist not denylist).                                                    |
| `apps/web/app/(app)/cards/[id]/page.tsx`                          | Server-rendered card detail page (D5). State-switched body per § Screens.                                                                                                                                                                                                                           |
| `apps/web/app/(app)/cards/[id]/page.test.tsx`                     | Vitest — renders each of the 6 state bodies; renders the `<StartTriage>` button only when `state='capturing'`; renders `notFound()` for cards the user doesn't own; renders the photo block with the most-recent `primary/wide` photo or the placeholder.                                           |
| `apps/web/app/(app)/cards/[id]/_components/StartTriage.tsx`       | `'use client'` button + fetch + PostHog wiring (D10).                                                                                                                                                                                                                                               |
| `apps/web/app/(app)/cards/[id]/_components/StartTriage.test.tsx`  | Vitest — fires `triage_initial_read_started` on submit; on 200 fires `triage_initial_read_completed` with latency_ms + search_count; on each error class fires `triage_initial_read_failed` with the right `error_class`; 202 + 409 trigger `router.refresh()`; renders the right notice per state. |
| `apps/web/e2e/triage-route-handler.spec.ts`                       | Playwright full round-trip — signs in via password helper (Pattern 3), captures a card, navigates to `/cards/[id]`, intercepts the `/api/triage` POST and the Anthropic request via `page.route()` to return a fixed `record_initial_read` JSON, asserts state machine + DB writes.                 |

## Files to modify

| File                                                          | Action       | Why                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/package.json`                                       | modify       | Add `@anthropic-ai/sdk` to `dependencies` (latest stable). Add (if not already present) `@types/node` updates needed by the SDK.                                                                                                                                                                                                   |
| `apps/web/.env.example` (or root if applicable)               | modify       | Add `ANTHROPIC_API_KEY=`, `# TRIAGE_SYSTEM_PROMPT=` (commented — optional), `# ANTHROPIC_MODEL=claude-sonnet-4-6` (commented — optional).                                                                                                                                                                                          |
| `apps/web/middleware.ts`                                      | modify       | `GATED_PREFIXES` adds `/cards` so anonymous hits bounce.                                                                                                                                                                                                                                                                           |
| `apps/web/middleware.test.ts`                                 | modify       | Add cases: `/cards` anon → `/login?next=/cards`; `/cards/<uuid>` anon → `/login?next=/cards/<uuid>`; `/cards` authed → pass-through; `/cards/<uuid>` authed → pass-through.                                                                                                                                                        |
| `apps/web/app/(app)/capture/_components/CaptureForm.tsx`      | modify       | On 201, redirect destination changes from `/home` to `/cards/${card_id}` (D5). The 201 response shape already exposes `card_id` (capture-flow `CardCreated`).                                                                                                                                                                      |
| `apps/web/app/(app)/capture/_components/CaptureForm.test.tsx` | modify       | Update the existing "201 routes to /home" assertion to `router.push('/cards/<id>')`.                                                                                                                                                                                                                                               |
| `packages/core/src/supabase.types.ts`                         | regenerate   | `pnpm db:gen-types` after migration 007 applies. Adds `start_triage` + `complete_triage` to `Database['public']['Functions']`.                                                                                                                                                                                                     |
| `apps/web/next.config.ts`                                     | maybe-modify | Verify `connect-src` CSP allows `https://api.anthropic.com` — currently it's built from `NEXT_PUBLIC_SUPABASE_URL`. Server-side fetches in route handlers don't need browser CSP allowance (CSP is browser-only), so this is a **read-and-verify** step, likely no change required. Document the verification result in BUILD-LOG. |
| `METRICS.md`                                                  | append       | Three new event rows per D10 + § Metrics.                                                                                                                                                                                                                                                                                          |
| `CLAUDE.md` § Where Things Happen                             | append       | One entry per new path: `/cards/[id]` page, StartTriage component, `POST /api/triage`, the four `_lib/*` helpers, migration 007, the env vars (under § Env Var Naming).                                                                                                                                                            |
| `CLAUDE.md` § Gotchas                                         | append       | Three new gotchas from § Gotchas below: (1) Anthropic SDK web_search tool name version drift; (2) `tool_choice` forces tool but model can still refuse; (3) Vercel 4KB env var limit on `TRIAGE_SYSTEM_PROMPT`.                                                                                                                    |

## Tests

### Unit tests (Vitest)

1. **`prompt.test.ts`** —
   - `resolveSystemPrompt({ env: { TRIAGE_SYSTEM_PROMPT: '  override  ' } })` returns `'override'` (trim defense per CLAUDE.md § Gotchas).
   - `resolveSystemPrompt({ env: { TRIAGE_SYSTEM_PROMPT: '' } })` returns the default.
   - `resolveSystemPrompt({ env: {} })` returns the default.
   - `DEFAULT_TRIAGE_SYSTEM_PROMPT` contains the persona keywords (D8): "calm", "spiral", and each of the four severity tiers (`cosmetic`, `monitor`, `soon`, `urgent`).
   - Default prompt length < 4096 chars (Vercel env-var limit defense — see § Gotchas).

2. **`photos.test.ts`** —
   - Zero `card_photos` rows → returns `[]`.
   - One row, download succeeds → returns one entry with `media_type='image/jpeg'` and a non-empty base64 string.
   - Four rows → returns 3 (D4 cap).
   - Partial-failure: 2 rows, one download throws → returns 1.
   - Asserts the `card_photos` query uses `user_id = userId` predicate (RLS belt-and-suspenders).

3. **`anthropic.test.ts`** —
   - Mock `Anthropic.Messages.create`; assert call shape: `model` defaults to `claude-sonnet-4-6` and accepts override; `system` is the resolved prompt; `messages[0].content` includes image blocks AND a final text block; `tools` includes `record_initial_read` schema + `web_search` server-tool entry; `tool_choice = { type: 'tool', name: 'record_initial_read' }`; `max_tokens = 4096`; client constructed with `timeout: 30000`.

4. **`parse-tool-output.test.ts`** —
   - Happy path → returns parsed struct.
   - Missing each required field individually → ParseError naming the field.
   - `severity_provisional` not in enum → ParseError.
   - `system_tag_proposed` / `contractor_tag_proposed` not in enum → ParseError.
   - `sources` malformed (missing `url` or `title`, or not an array) → ParseError.
   - `what_i_need_to_know` length 0 → ParseError; length 4 → ParseError; length 1, 2, 3 → ok.
   - Extra fields tolerated (forward-compat).

5. **`api/triage/route.test.ts`** — mocks `createClient` (returns a Supabase mock) + `@anthropic-ai/sdk` + the four `_lib/*` helpers:
   - 401 when `getUser()` returns null.
   - 400 when body isn't JSON or `card_id` isn't a uuid.
   - 404 when card row select returns no row.
   - 202 when card row state is `'triaging'`.
   - 409 `already_triaged` when state is `'diagnosed'`.
   - 409 `invalid_state` when state is `'monitoring' | 'closed' | 'dismissed'`.
   - 409 `invalid_state` when `start_triage` RPC raises P0001 `triage_invalid_state` (race).
   - 500 + Sentry when `start_triage` raises any other error.
   - Happy path: `start_triage` succeeds → `fetchCardPhotosAsBase64` called with `(supabase, user.id, card_id)` → `callInitialRead` called → `parseInitialRead` returns ok → `complete_triage` called with the parsed fields → 200 with `{ card_id, severity_provisional, what_i_need_to_know }`.
   - Photo-fetch path: assert `callInitialRead` receives the images array from `fetchCardPhotosAsBase64`.
   - 502 `triage_invalid_output` when `parseInitialRead` returns ParseError → assert revert-state update was called.
   - 429 when Anthropic SDK throws `APIError` with status 429 → asserts `retry_after_s` propagated; revert-state called; no Sentry.
   - 503 when Anthropic throws 5xx → asserts revert-state called; Sentry called.
   - 503 when Anthropic times out (mock rejects with AbortError) → asserts revert-state called.
   - Revert-state failure: when revert itself errors, assert Sentry called twice (once for the upstream error, once for the revert).
   - Authoritative: `p_user` passed to RPCs always === `user.id` (never from body).

6. **`(app)/cards/[id]/page.test.tsx`** —
   - Renders 404 (`notFound()`) when the card doesn't exist or isn't owned.
   - For each state in `{capturing, triaging, diagnosed, monitoring, closed, dismissed}`: renders only the elements named `shown` in the § Render conditions matrix.
   - Renders the most-recent `primary/wide` photo when present; renders placeholder copy when absent.
   - Asserts the header (room_tag, system_tag chip, created_at) on every state.
   - The `diagnosed` body renders the three "what I need to know" strings + the sources list.

7. **`StartTriage.test.tsx`** —
   - Initial render: enabled "Read this for me" button.
   - On click: button → mid-fetch (disabled + spinner); `triage_initial_read_started` fires with `{ card_id, system_tag }`.
   - On 200: `triage_initial_read_completed` fires with `latency_ms` (number > 0) + `search_count: 0` (since the test mock doesn't include server_tool_use blocks); `router.refresh()` called.
   - On 202: `triage_initial_read_failed` fires with `error_class='triage_in_progress'`; "Already running — refreshing…" notice renders; `router.refresh()` called after a short delay.
   - On 409 `already_triaged`: notice + refresh.
   - On 429: error_class='triage_rate_limited'; retry-eligible banner.
   - On 503: error_class='triage_unavailable'; retry-eligible banner.
   - On network throw: error_class='network'; retry-eligible banner.
   - Retry from banner: re-issues POST.

8. **`middleware.test.ts`** (modify, extending existing cases): `/cards` + `/cards/<uuid>` anon → 307 redirect to `/login?next=<path>` with query preserved; `/cards` + `/cards/<uuid>` authed → pass-through.

9. **`CaptureForm.test.tsx`** (modify): swap the existing `expect(push).toHaveBeenCalledWith('/home')` for `expect(push).toHaveBeenCalledWith(`/cards/${cardId}`)`.

### Integration tests

No new `*.integration.test.ts` in this PR — the route handler's external dependencies (Supabase, Anthropic) are mocked at the unit-test layer above. The route's behavior is fully covered by the unit suite for "wiring" assertions and by E2E for end-to-end happy path.

### E2E test (Playwright)

**`apps/web/e2e/triage-route-handler.spec.ts`** — full round-trip, skipped on non-local via `test.skip(!isLocalSupabase, …)` so CI fast-job reports skipped (consistent with `capture-flow.spec.ts` + `magic-link.spec.ts`); slow-job is the enforcement surface.

Flow:

1. Seed user via `adminClient().auth.admin.createUser({ email, password, email_confirm: true })`.
2. Sign in via `userIdFromSignIn(email, password)` (Pattern 3 helper).
3. Navigate to `/capture`, fill description + system_tag + room_tag, submit.
4. Assert redirect lands at `/cards/<uuid>`.
5. Assert page renders the "Read this for me" button (capturing state).
6. Intercept `https://api.anthropic.com/**` via `page.route()` and respond with a fixed `record_initial_read` tool_use payload:
   - severity_provisional: 'soon'
   - summary: 'Test summary'
   - what_i_need_to_know: ['q1', 'q2', 'q3']
   - sources: [{url:'https://example.com',title:'Example'}]
   - system_tag_proposed: 'plumbing'
   - contractor_tag_proposed: 'plumber'
   - what_im_confident_about: 'confident'
7. Click "Read this for me".
8. Assert page transitions through skeleton (state=triaging) → diagnosed (assert severity chip + the three q's render).
9. Via `adminClient()`, assert `cards.state='diagnosed'`, `cards.diagnosis !== null`, `cards.severity = 'soon'`, `cards.system_tag = 'plumbing'`, `cards.contractor_tag = 'plumber'`, and a `triage_conversations` row exists with `card_id = <id>`, `role='assistant'`, `round=1`, content parseable as the JSON struct.
10. Error-path case: a second card; intercept Anthropic with a 503 response; click button; assert error banner; assert `cards.state` reverted to `'capturing'` via admin client.
11. Refresh-race case: a third card; intercept Anthropic with a 30-second delay; in a second browser context (or after `start_triage` fires), navigate to `/cards/<id>` and assert the page shows the `triaging` skeleton; assert a direct POST to `/api/triage` for the same card returns 202.

### Test Presence enforcement

Every new `.ts` / `.tsx` source file under `apps/web/app/api/triage/` and `apps/web/app/(app)/cards/[id]/` has a paired `*.test.ts` — see § Files to create. No `.devshop-test-coverage-exempt` additions needed.

## Dependencies

### Package dependencies (added by this PR)

- `@anthropic-ai/sdk` (latest stable, `apps/web/package.json` `dependencies`). Server-only; never imported from a `'use client'` component.

### Service dependencies

- **Anthropic API** (`https://api.anthropic.com`) — production-critical for this surface. Outage manifests as 503 with retry; users keep their captured card and can retry. No fallback model.
- **Supabase Postgres + Storage** — existing dependency.

### Env vars

| Name                   | Where set                       | Required | Notes                                                                                                                                         |
| ---------------------- | ------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`    | Vercel (prod + preview), local  | yes      | Server-only. **NOT** `NEXT_PUBLIC_*`. Never logged. Read with `.trim()` defense.                                                              |
| `TRIAGE_SYSTEM_PROMPT` | Vercel (prod + preview), local  | no       | Override of the code default. Vercel 4KB env-var cap applies (see § Gotchas) — target default + override stay < 3500 chars to leave headroom. |
| `ANTHROPIC_MODEL`      | Vercel (prod + preview), local  | no       | Default `claude-sonnet-4-6`. Row #11's eval pipeline can set this to A/B alternate models without code change (D1).                           |
| `ANTHROPIC_API_KEY_QA` | GitHub Actions slow-job secrets | no       | Reserved for row #11 (`triage-eval-dataset`) — not used by this PR's E2E (which mocks Anthropic). Listed here for forward-compat doc.         |

### Other repo deps

- Requires migration 007 to have applied locally (`pnpm db:reset`) before unit tests can run against the generated types.
- Requires PR #15 (`capture-flow`) shipped — depends on `claim_card_slot`, `cards.room_tag`, `dismissed` state, and the existing `/(app)/capture` form.

## Task order

Hard dependencies between subtasks. Implement and commit atomically per row.

1. **Migration 007** — `supabase/migrations/20260515HHMMSS_007_triage_route_handler.sql` (`start_triage` + `complete_triage` SECURITY DEFINER RPCs). Apply locally via `pnpm db:reset`.
2. **Regenerate types** — `pnpm db:gen-types` → `packages/core/src/supabase.types.ts` gains the two new functions.
3. **Add SDK** — `pnpm --filter @home-os/web add @anthropic-ai/sdk` (or equivalent — verify workspace package name during impl).
4. **`_lib/prompt.ts`** + paired test — `DEFAULT_TRIAGE_SYSTEM_PROMPT` + `resolveSystemPrompt()`.
5. **`_lib/photos.ts`** + paired test — `fetchCardPhotosAsBase64()`. Pure-fn around the supabase client; supabase mocked in tests.
6. **`_lib/parse-tool-output.ts`** + paired test — runtime validator.
7. **`_lib/anthropic.ts`** + paired test — Claude client wrapper. **Empirical-verify** the `web_search` tool name against the installed SDK version (see § Gotchas).
8. **`POST /api/triage/route.ts`** + paired test — tie it all together. Mocks every `_lib/*` helper.
9. **`/(app)/cards/[id]/page.tsx`** + paired test — state-machine UI.
10. **`/(app)/cards/[id]/_components/StartTriage.tsx`** + paired test — client trigger + PostHog wiring.
11. **`CaptureForm.tsx`** redirect change (1-line modify) + test extension.
12. **`middleware.ts`** GATED_PREFIXES extension + test extension.
13. **PostHog events** — three new rows in `METRICS.md`.
14. **Env wiring** — `.env.example` updates; document `ANTHROPIC_API_KEY` setup in BUILD-LOG.
15. **E2E spec** — `apps/web/e2e/triage-route-handler.spec.ts` with mocked Anthropic.
16. **CLAUDE.md** — § Where Things Happen entries + § Gotchas entries (3).

Rows 1–2 must finish before rows 3–8 (types). Row 8 must finish before row 10 (StartTriage POSTs to it). Rows 9–11 can be parallelized once the route is in. Rows 12–14 are independent. Row 15 needs everything else green.

## Gotchas

Non-obvious rules surfaced by this spec's design work. Add to CLAUDE.md § Gotchas as part of task 16.

1. **Verify the Anthropic `web_search` server-tool name against the installed SDK version before implementing.** The original release used `web_search_20250305`; subsequent SDK versions have shipped renamed / re-versioned variants. **Empirical-verify rule applies**: at task 7 time, open `node_modules/@anthropic-ai/sdk/` after install and grep for `'web_search'` in the type definitions; pin the exact constant in `_lib/anthropic.ts` with a code comment naming the SDK version. Do NOT take the original name from memory or from this spec — the SDK version pinned in `package.json` is the source of truth.

2. **`tool_choice: { type: 'tool', name: '...' }` forces the model to use the tool, but the model can still refuse** (e.g., by returning a `text` block expressing inability + no `tool_use` block; or returning a malformed `tool_use.input`). The route handler MUST defensively parse `response.content` to find the `tool_use` block + validate its payload at runtime (`parseInitialRead`). On parse failure: revert state to `capturing` + return 502 `triage_invalid_output`. This is the **graceful 503-class path** — surface a retryable error to the user, don't trust the type system to enforce model behavior.

3. **Vercel env-var limit is 4096 bytes per variable**. `TRIAGE_SYSTEM_PROMPT` is operator-tunable per D8 — keep the default + any operator-set override well under 4KB (target ≤ 3500 chars to leave headroom for trailing whitespace / encoding overhead). The `prompt.test.ts` asserts the default length to prevent regression.

4. **Photo bytes are loaded via the user-context Supabase client**, not the service role. RLS on `storage.objects` for the `card-photos` bucket already enforces "first path segment must match `auth.uid()::text`" (migration 004). The route handler relies on this — `fetchCardPhotosAsBase64` calls `supabase.storage.download(storage_path)` on the same client that the route handler authenticated. **Never use the service role for the photo fetch** — the user-context client + RLS is the trust boundary.

5. **The `start_triage` → Claude → `complete_triage` flow is not transactionally atomic across the network boundary.** If Claude succeeds but `complete_triage` fails (network drop), the card is stuck in `triaging`. The route's revert-on-error path catches this — it issues a best-effort `update cards set state='capturing' where id=? and state='triaging'`. If the revert itself fails, the card is stuck; Sentry tags the case and a future operator-side reaper script (out of scope for this PR) clears stragglers.

6. **`complete_triage` writes the full structured tool-use payload to `triage_conversations.content` as JSON-serialized text.** Row #2's Q&A UI parses it back to render the sources list + the persistent "How we diagnosed this" thread. Don't strip fields when persisting — the payload IS the audit trail.

7. **PostHog events fire from the client, not the route handler.** `apps/web/lib/posthog.ts` no-ops on SSR (it's browser-only init). All three D10 events are captured from `<StartTriage />` based on the route's response. Never add `posthog.capture(...)` to a route handler in this codebase.

8. **Don't redirect to `/cards/[id]` while the card is mid-create.** CaptureForm's 201 response includes `card_id`; the redirect happens _after_ the 201 lands (capture-flow guaranteed this is post-RPC + post-photo-upload). The `/cards/[id]` page server-renders against the new row immediately — Postgres MVCC + the user-context client guarantee read-your-writes within the same authenticated session, so there's no stale-read window.

9. **The `record_initial_read` tool returns `system_tag_proposed` + `contractor_tag_proposed`, but the card already has a `system_tag` from CAPTURE.** The route writes the AI-proposed values directly (overwriting the user's selection on the cards row). Row #2's Q&A surface owns "let the user accept or override the AI proposal"; until then, **we trust the AI proposal silently**. This is intentional per D3 and ceo-review § Scope — Phase 1 deliberately doesn't surface tag-disagreement UX.

10. **Refusing the request body's user_id**: the route derives `p_user` from `getUser().id` server-side and passes it to the SECURITY DEFINER RPCs — never trusts a body-provided user id (matches capture-flow's `claim_card_slot` posture). The RPC's internal `p_user = auth.uid()` guard is the second layer of the same defense.

11. **`searchParams` and `params` in Next.js 16 server components are async.** The card detail page at `apps/web/app/(app)/cards/[id]/page.tsx` must `await params` to read `id`. The existing `/(app)/capture/page.tsx` shows the pattern (capture-flow PR #15 had to thread this).

## Acceptance

User-verifiable success criteria — `/ak-pre-ship` Gate 9 captures one screenshot per Core user story verb under `specs/triage-route-handler/qa-walk/`.

1. **Capture-to-card-detail handoff** — after submitting a new card on `/(app)/capture`, the browser lands at `/cards/<uuid>`. The card's `created_at` is within the last 60 seconds and the row's `state='capturing'`.
2. **"Read this for me" button renders** — `/cards/<uuid>` for a `capturing` card shows the primary CTA labeled exactly "Read this for me".
3. **State transitions visible** — after clicking the button, the page transitions through the skeleton (`triaging`) into the diagnosis view (`diagnosed`) within 30 seconds (typical 10–15 s).
4. **Diagnosis content renders** — the diagnosis summary, severity chip, three "what I need to know" questions, and sources list all appear on the `diagnosed` body. The severity chip uses the four-tier color from `packages/ui/src/tokens.ts`.
5. **DB writes confirmed** — admin-client read shows `cards.state='diagnosed'`, `cards.diagnosis` non-null, `cards.severity` set, `cards.system_tag` + `cards.contractor_tag` set; a `triage_conversations` row exists for the card with `role='assistant'`, `round=1`, content is JSON-parseable.
6. **Error paths surfaced** — forced Anthropic 503 (via env-flag or test interceptor) returns to a retryable error banner on `/cards/<id>` and the card row reverts to `state='capturing'`.
7. **Refresh-race surfaced** — POSTing `/api/triage` for a card already in `state='triaging'` returns 202 `triage_in_progress`; the card detail page shows the skeleton.
8. **Already-triaged 409** — POSTing `/api/triage` for a card already in `state='diagnosed'` returns 409 `already_triaged`.
9. **Auth boundary** — POSTing `/api/triage` for a card owned by another user returns 404 `card_not_found` (no information leak).
10. **Anonymous bounce** — `/cards/<uuid>` while signed-out redirects to `/login?next=/cards/<uuid>` via middleware.
11. **PostHog events visible** — `triage_initial_read_started`, `triage_initial_read_completed`, `triage_initial_read_failed` appear in the PostHog event stream with the property shapes from § Metrics.

## Rollout

Operator checklist before merging:

1. **Add `ANTHROPIC_API_KEY` to Vercel** — Production + Preview environments. Use the project's Anthropic console-issued production key. Confirm Vercel UI shows the var present after adding.
2. **Add `ANTHROPIC_API_KEY` locally** to `apps/web/.env.local` (or wherever the project's local stack reads from).
3. **Decide on `TRIAGE_SYSTEM_PROMPT`** — leave unset for v0 launch (code default ships baseline behavior). When ready to iterate post-launch, set in Vercel + local; never check the override into git.
4. **Set `ANTHROPIC_API_KEY_QA` in GitHub Actions secrets** — reserved for row #11 (`triage-eval-dataset`). Not required for this PR's CI; safe to defer.
5. **Migration 007 deploys via `.github/workflows/deploy-migrations.yml`** on push-to-main, before Vercel's app deploy starts. Both `create or replace function` statements are idempotent; re-applying is safe.
6. **Post-merge smoke test** — sign into production with a real user, capture a card, run the triage flow end-to-end. Confirm a diagnosed card lands. Total time: < 30 s.

## Rollback

If the route handler is shipping broken in production (e.g., a prompt regression breaks `parseInitialRead` for most cards):

1. **First**: roll the prompt back via the `TRIAGE_SYSTEM_PROMPT` env var (no code deploy) — set to a known-good prior value. Vercel env-var changes take effect on next request after redeploy-trigger (~30 s).
2. **If env-rollback insufficient**: revert the merge commit on `main`. Vercel auto-deploys the prior state. Migration 007 stays in place — the new `start_triage` / `complete_triage` functions are forward-compatible (no caller in the prior code path). Reverting the migration is not required and is potentially destructive.
3. **If migration 007 itself is broken**: the rollback block at the bottom of the file drops both functions. Run via `psql` against the production DB connection string. **Do not** do this without a paired code revert.
4. **Stuck-state reaper**: if cards are stranded in `state='triaging'` (e.g., revert path failed during an outage), apply this query as a one-shot:

   ```sql
   update public.cards
     set state = 'capturing', updated_at = now()
   where state = 'triaging'
     and updated_at < now() - interval '2 minutes';
   ```

   Bounded by a 2-minute floor so we don't disrupt actively-running triage calls. Document the run in BUILD-LOG.

## Decision rows surfaced for Phase 0 sign-off (already resolved)

Confidence Calibration § stop-and-ask items present in this spec — all signed off in Phase 0 and recorded in the Decisions section above:

- **New DB columns/tables / RPCs** — D6 (migration 007 adds two new SECURITY DEFINER RPCs). No new columns or tables; existing columns are written by `complete_triage`.
- **New third-party API integration** — D1 + D2 (Anthropic SDK + web_search server tool).
- **Performance-sensitive code paths** — D5 + § Notes (triage call is 10–15 s p50; the `/cards/[id]` page is the user's wait surface — design carries the skeleton state, not a spinner; we deliberately avoid blocking the capture POST on Anthropic latency).
- **Security-related logic** — D6 (SECURITY DEFINER RPCs internally guard `p_user = auth.uid()`); § Gotchas #4 (photo bytes loaded via user-context client, never service role); § Gotchas #10 (route never trusts body-supplied user id).
- **New METRICS.md events** — D10 (three new events).

No schema-mutating migration in this PR (additive RPC creates only) → no backwards-incompatible flag needed. No first-integration-test threshold crossing (capture-flow PR #15 already added the project's first Playwright E2E + the first SECURITY DEFINER RPC pattern).
