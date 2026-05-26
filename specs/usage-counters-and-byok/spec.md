<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: usage-counters-and-byok -->
<!-- date: 2026-05-26 -->

# Spec: usage-counters-and-byok (PR N)

**Sources:**

- `PLAN.md § Planned (usage-counters-and-byok)` — primary scope
- `.gstack/eng-review-home-os-2026-05-01.md § Business Logic (Usage limits + BYOK) + § BYOK key handling + § Triage Route Handler Logic + § Error Rescue Map #6/#7/#8` — usage limits, BYOK key transit, validation, error handling
- `.gstack/design-review-home-os-2026-05-02.md § Settings/Profile + § Settings — Usage Bar + § BYOK Key Validation + § Settings/Profile Visual Hierarchy` — UI surface, visual treatment, interaction states
- `.gstack/eng-review-home-os-2026-05-01.md § Data Model (usage_counters, users.byok_used)` — schema (already exists in migrations 002/003/006b)
- Prior spec `specs/close-flow/spec.md` — style + structure reference

Weekly triage usage bar + optional BYOK key for unlimited AI sessions. Surfaces the hidden 5/wk session cap with a clear progress bar and reset indicator on a new Settings screen, and lets power users bypass the cap by providing their own Anthropic API key.

---

## Product update

### Headline (user-facing)

A new Settings screen shows how many of your five weekly AI triage sessions you've used, with a progress bar that turns warm when you hit the limit and a reset-day indicator, plus an optional field to add your own Claude API key for unlimited sessions.

### Detail (team-facing)

Adds `/settings` route with usage bar (reads `usage_counters` via Supabase client) and BYOK key input (two-state UI per `users.byok_used`). Extends `confirm_triage` RPC to atomically increment `triage_session_count` with week-rollover. Adds `POST /api/key-validate` for minimal Anthropic API probe. Wires BYOK key transit through `POST /api/triage` and `/api/triage/answer` request bodies — free-tier users are blocked at the 5-session cap; BYOK users bypass it. Header gains a gear icon link to Settings.

---

## Decisions (resolved at spec time)

8 `/ak-spec`-time decisions resolved in Phase 0 with the user. Recorded below so Phase 1 preserves them verbatim and a crashed Phase 1 resumes without re-asking.

### D1: Triage session count increment mechanism

**Decision:** Extend `confirm_triage` RPC to atomically increment `usage_counters.triage_session_count` with week-rollover logic (same `claim_card_slot` pattern). The upsert resets `triage_session_count` to 0 when `week_start` has rolled past Monday, then increments.

**Rationale:** Keeps the count increment atomic with the state transition; no second round-trip. `confirm_triage` is the single place Q&A completes — centralizing the counter there matches the eng-review spec.

### D2: Usage check location and behavior

**Decision:** `POST /api/triage/answer` checks `usage_counters.triage_session_count >= 5` before calling Claude when this is the first Q&A round (not the initial read). Returns `{ error: 'TRIAGE_LIMIT_REACHED', resets: '<Monday ISO>' }`. BYOK requests skip this check entirely. Initial read always proceeds regardless of count.

**Rationale:** Eng-review § Triage Route Handler Logic step 3: usage check fires for free tier only, before Q&A begins (not before initial read). The initial read is free — users always see what the AI thinks before spending a session.

### D3: BYOK key transit

**Decision:** Request body JSON field `byok_key` on `POST /api/triage` and `POST /api/triage/answer`. Route handler uses `byok_key` when present, falls back to server `ANTHROPIC_API_KEY`. Key never touches DB/cookies/localStorage — React state only.

**Rationale:** Eng-review § BYOK key handling: "Held in React state (memory only). Cleared on tab close." Simplest secure transit — body field per request, no persistence layer.

### D4: BYOK validation endpoint

**Decision:** `POST /api/key-validate` accepts `{ key: string }`, makes a minimal `claude-haiku-4-5` `messages` call with 1 token max, returns `{ valid: true }` or `{ error: 'invalid_key' | 'out_of_credits' }`. Key never stored server-side.

**Rationale:** Eng-review § BYOK key handling: "make a minimal Claude API call before accepting." Haiku is cheapest for validation. Distinct 401 vs 402 per error rescue map #6/#7.

### D5: Settings page routing and navigation

**Decision:** New route `/settings` inside `(app)` route group. Header in `(app)/layout.tsx` gains a gear icon link to `/settings`. Settings is server-rendered for usage data, client-interactive for BYOK input.

**Rationale:** Settings is a standalone utility screen per design-review — focused, no tertiary content in Phase 1. Gear icon is the conventional settings affordance.

### D6: Usage bar visual treatment

**Decision:** Progress bar at 4px height, full-width. Fill: `--color-planned` (calm indigo) at 1–4 sessions, shifts to `--color-act-soon` (terracotta) at 5/5. "X of 5 sessions used" at 24px semibold. "Resets Monday" at 12px secondary color.

**Rationale:** Directly from design-review § Settings — Usage Bar + § Settings/Profile Visual Hierarchy. Urgency communicated by bar fill color, not text color change.

### D7: BYOK two-state UI

**Decision:** Detect via `users.byok_used` boolean. State A (first-time): brief explainer + link to console.anthropic.com + input + validate button. State B (returning): input field only. Set `byok_used = true` on first successful validation via the key-validate endpoint.

**Rationale:** Directly from eng-review § BYOK key handling: "Two UI states" + "Detect via `users.byok_used` boolean." Reduces friction for returning users who already understand what a key is.

### D8: New METRICS events

**Decision:** Two new events: `byok_key_validated` (fires on successful key validation from Settings) and `triage_limit_reached` (fires client-side when the triage answer route returns `TRIAGE_LIMIT_REACHED`). Both are PostHog `posthog.capture(...)` events.

**Rationale:** These inform the `pro-tier` row in PRODUCT-ROADMAP ("only if free tier + BYOK telemetry shows demand"). `byok_key_validated` measures adoption; `triage_limit_reached` measures friction.

---

## Core user story

1. Open the Settings screen from the header gear icon.
2. See the usage bar showing "X of 5 sessions used" with a progress bar and reset-day indicator.
3. Enter a personal Anthropic API key, tap Validate, and see "Key accepted" inline confirmation.
4. Return to a card in triage, submit Q&A answers — the session uses the BYOK key and bypasses the weekly cap.

## In scope

- **Migration 014** (D1) — extends `confirm_triage` RPC to atomically increment `usage_counters.triage_session_count` with week-rollover logic (same `claim_card_slot` pattern from 006b). Drops and recreates `confirm_triage` to add the counter increment. Sets `users.byok_used = true` via a new helper RPC `mark_byok_used(p_user uuid)` (SECURITY DEFINER, `p_user = auth.uid()` guard). Commented rollback recipe in-file per convention.
- **`POST /api/key-validate`** (D4) — auth-gated endpoint. Accepts `{ key: string }`, makes a minimal `claude-haiku-4-5` messages call with `max_tokens=1`, returns `{ valid: true }` or `{ error: 'invalid_key' | 'out_of_credits' }`. On success, calls `mark_byok_used` RPC to set `users.byok_used = true` (first time only).
- **`POST /api/triage` + `POST /api/triage/answer` modifications** (D2, D3) — both routes accept an optional `byok_key` field in the request body JSON. When present, the BYOK key is used for the Anthropic call instead of the server `ANTHROPIC_API_KEY`. The `/api/triage/answer` route adds a usage check before the Claude call: if no `byok_key` and this is Q&A (not initial read), check `usage_counters.triage_session_count >= 5` and return `{ error: 'TRIAGE_LIMIT_REACHED', resets: '<next Monday ISO>' }` if exceeded.
- **BYOK key React context provider** — `ByokKeyProvider` wrapping the `(app)` layout. Holds the key in React state (memory only — never localStorage/sessionStorage/cookies). Provides `{ byokKey, setByokKey, clearByokKey }` to descendants. Cleared on sign-out.
- **`/settings` page** (D5, D6, D7) — new route in `(app)/settings/`. Server-rendered usage data (reads `usage_counters` via user-context Supabase client), client-interactive BYOK section. Usage bar: full-width 4px progress bar, `X of 5` text, reset-day line. BYOK section: two-state UI per D7 (State A first-time with explainer; State B returning with input only).
- **Header gear icon** (D5) — `(app)/layout.tsx` header gains a gear icon (`<svg>` inline or Heroicons `Cog6ToothIcon`) linking to `/settings`.
- **Limit-reached UI in triage flow** — when `POST /api/triage/answer` returns `TRIAGE_LIMIT_REACHED`, `<AnswerThread />` renders an inline banner: "You've used your 5 AI triage sessions this week — resets Monday. Add your own Claude API key or set your path manually below." with a link to `/settings`.
- **2 new PostHog events in METRICS.md** per D8: `byok_key_validated`, `triage_limit_reached`.
- **CLAUDE.md** — path-map rows + gotchas for new surfaces.
- **Regenerated `packages/core/src/supabase.types.ts`** — adds `mark_byok_used` to `Functions`, adds the updated `confirm_triage` signature.

## Out of scope

- **Server-side BYOK key storage** — key is never persisted to DB/cookies/localStorage. React state only per D3.
- **BYOK for card creation (capture)** — capture route uses `claim_card_slot` for the 20/wk card cap; BYOK doesn't bypass the card cap, only the triage session cap.
- **Settings beyond usage + BYOK** — no profile editing, no notification preferences, no theme toggle in v0.
- **API key rotation / multiple keys** — single key at a time, re-enter to change.
- **Key-validate rate limiting** — no server-side rate limit on `/api/key-validate` in v0 (auth gate + the Anthropic call itself provides backpressure). If abuse appears, add rate limiting post-v0.
- **Usage history / charts** — the usage bar shows current week only.
- **Configurable session cap** — hardcoded to 5 in the RPC + route handler. The env var `FREE_TIER_WEEKLY_SESSIONS` from the eng-review is deferred to when it's needed.

## Screens

### `/settings` — usage bar + BYOK input

The page is a single-column layout centered on desktop (`max-w-lg mx-auto`), full-width on mobile.

#### Usage section

| Element         | Condition | Detail                                                                                                                            |
| --------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Section label   | always    | "AI triage this week" — 14px, `--color-text-secondary-inverse`.                                                                   |
| Count text      | always    | "X of 5 sessions used" — 24px semibold, `--color-text-primary-inverse`.                                                           |
| Progress bar    | always    | 4px height, full-width, rounded. Fill: `--color-planned` at 1-4, `--color-act-soon` at 5/5. Background: `--color-surface-raised`. |
| Reset indicator | always    | "Resets Monday" — 12px, `--color-text-secondary-inverse`.                                                                         |

#### BYOK section

| Element         | State A (first-time: `byok_used=false`)                         | State B (returning: `byok_used=true`)    |
| --------------- | --------------------------------------------------------------- | ---------------------------------------- |
| Section label   | shown — "Claude API key" 12px small caps                        | shown — "Claude API key" 12px small caps |
| Explainer text  | shown — brief paragraph + link to console.anthropic.com         | hidden                                   |
| Key input       | shown — `type="password"` 48px height, placeholder "sk-ant-..." | shown — same                             |
| Validate button | shown                                                           | shown                                    |
| Inline feedback | shown on validate result                                        | shown on validate result                 |

### BYOK validation states

| User action          | UI response                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Tap "Validate"       | Button shows "Validating..." (disabled), same text-update-not-spinner pattern as triage loading.                                              |
| Success (200)        | "Key accepted" inline green text below input. Key is stored in ByokKeyProvider context. If first time, `byok_used` flips to true server-side. |
| Invalid key (401)    | "Key didn't work -- check and try again" inline red text below input.                                                                         |
| Out of credits (402) | "This key is out of credits -- check your Anthropic billing" inline red text + link to `https://console.anthropic.com/settings/billing`.      |
| Network error        | "Couldn't validate -- check your connection and try again" inline.                                                                            |

### Triage limit-reached banner (in `<AnswerThread />`)

When `POST /api/triage/answer` returns `{ error: 'TRIAGE_LIMIT_REACHED', resets: '...' }`:

| Element      | Detail                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Banner       | Inline warning block (same styling as existing error banners in AnswerThread). Background: `--color-act-soon/10`. |
| Message text | "You've used your 5 AI triage sessions this week -- resets Monday."                                               |
| CTA link     | "Add your own Claude API key" linking to `/settings`. Below that: "or set your path manually below."              |
| Send button  | Disabled while limit is reached (re-enabled if user adds a BYOK key and returns).                                 |

### Header — gear icon

The gear icon appears in the header's right-side cluster, between the email display and the Sign out button. It's a 20px icon (`Cog6ToothIcon` or inline SVG), wrapped in a `<Link href="/settings">`, styled with `--color-text-secondary-inverse` and `hover:text-[var(--color-text-primary-inverse)]`.

## Render conditions

### Settings page elements

| Element             | `byok_used=false` | `byok_used=true` | usage count 0-4 | usage count 5      |
| ------------------- | ----------------- | ---------------- | --------------- | ------------------ |
| Usage count text    | shown             | shown            | shown           | shown              |
| Progress bar        | shown             | shown            | shown (indigo)  | shown (terracotta) |
| Reset indicator     | shown             | shown            | shown           | shown              |
| Explainer paragraph | shown             | hidden           | n/a             | n/a                |
| Key input           | shown             | shown            | shown           | shown              |
| Validate button     | shown             | shown            | shown           | shown              |

### Triage answer flow elements

| Element              | free-tier, under limit | free-tier, at limit | BYOK key present |
| -------------------- | ---------------------- | ------------------- | ---------------- |
| Send/Skip buttons    | shown                  | hidden              | shown            |
| Limit-reached banner | hidden                 | shown               | hidden           |
| Answer input         | shown                  | shown (disabled)    | shown            |

## Data model changes

### Migration 014 -- `<ts>_014_usage_counters_and_byok.sql`

**Statement order** (single .sql file, transaction-safe):

1. **`mark_byok_used` SECURITY DEFINER RPC** -- sets `users.byok_used = true` for the calling user on first successful BYOK key validation:

   ```sql
   create or replace function public.mark_byok_used(
     p_user uuid
   )
   returns void
   language plpgsql
   security definer
   set search_path = public, pg_catalog
   as $$
   begin
     if p_user is distinct from auth.uid() then
       raise exception 'forbidden' using errcode = '42501';
     end if;

     update public.users
       set byok_used = true
       where id = p_user
         and byok_used = false;
   end;
   $$;
   ```

   Predicate-guard: `byok_used = false` so repeated calls are no-ops. No RETURNING needed -- void return.

2. **Drop + recreate `confirm_triage`** to add atomic `triage_session_count` increment with week-rollover (same `claim_card_slot` upsert pattern from migration 006b):

   ```sql
   -- Drop existing confirm_triage (migration 011 shape).
   drop function if exists public.confirm_triage(
     uuid, uuid, text, public.severity, public.system_tag, public.contractor_tag,
     int, text, int, boolean, text, jsonb, jsonb
   );

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
     p_user_answer text,
     p_diy_expansion jsonb,
     p_contractor_expansion jsonb
   )
   returns table (card_id uuid)
   language plpgsql
   security definer
   set search_path = public, pg_catalog
   as $$
   declare
     v_card_id uuid;
     v_monday date := (date_trunc('week', (now() at time zone 'utc'))::date);
   begin
     if p_user is distinct from auth.uid() then
       raise exception 'forbidden' using errcode = '42501';
     end if;

     -- Atomic predicate-guard (same as migration 011 body).
     update public.cards
       set diagnosis = p_diagnosis,
           severity = p_severity,
           system_tag = p_system_tag,
           contractor_tag = p_contractor_tag,
           monitoring_cadence_days = p_monitoring_cadence_days,
           severity_confirmed = true,
           state = 'decide'::public.card_state,
           cost_estimate_diy = p_diy_expansion,
           cost_estimate_hire = p_contractor_expansion,
           updated_at = now()
       where public.cards.id = p_card
         and public.cards.user_id = p_user
         and public.cards.state = 'diagnosed'
         and public.cards.severity_confirmed = false
       returning public.cards.id into v_card_id;

     if v_card_id is null then
       raise exception 'qa_invalid_state' using errcode = 'P0001';
     end if;

     -- Optional user reply row.
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

     -- Atomic triage_session_count increment with week-rollover
     -- (same claim_card_slot upsert pattern from migration 006b).
     insert into usage_counters (user_id, triage_session_count, card_count, week_start, updated_at)
     values (p_user, 1, 0, v_monday, now())
     on conflict (user_id) do update
       set triage_session_count = case
             when usage_counters.week_start = v_monday
             then usage_counters.triage_session_count + 1
             else 1
           end,
           week_start = v_monday,
           updated_at = now();

     return query select v_card_id;
   end;
   $$;
   ```

   Key difference from migration 011's `confirm_triage`: the final `INSERT ... ON CONFLICT` block that atomically increments `triage_session_count` with week-rollover. The card-state transition + counter increment happen in the same transaction -- no window for a count-vs-state mismatch.

**Rollback** (commented in-file):

```sql
-- DROP FUNCTION IF EXISTS public.mark_byok_used(uuid);
-- Drop the 014 confirm_triage and restore the 011 body:
-- DROP FUNCTION IF EXISTS public.confirm_triage(
--   uuid, uuid, text, public.severity, public.system_tag, public.contractor_tag,
--   int, text, int, boolean, text, jsonb, jsonb
-- );
-- Then re-create confirm_triage using the migration 011 body
-- (see 20260517031335_011_decide_state.sql § 6).
```

### Existing schema leveraged (no change)

- `usage_counters` table — already exists (migration 002 + 006b). Columns: `user_id`, `triage_session_count`, `card_count`, `week_start`, `updated_at`. RLS (migration 003) + GRANTs (migration 008) already in place.
- `users.byok_used boolean` — already exists (migration 002), defaults to `false`.

## API contracts

### `POST /api/key-validate`

**Request body**: `application/json`.

| Field | Type   | Required | Validation                                        |
| ----- | ------ | -------- | ------------------------------------------------- |
| `key` | string | yes      | Must be non-empty string, trimmed. Max 200 chars. |

**Route sequence**:

1. Auth gate (`getUser()` -> 401 if null).
2. Parse + validate body.
3. Instantiate `Anthropic` SDK with the user-supplied key.
4. Call `client.messages.create({ model: 'claude-haiku-4-5', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })`.
5. On success: call `mark_byok_used` RPC via the user-context Supabase client. Return `{ valid: true }`.
6. On 401 from Anthropic: return `{ error: 'invalid_key' }` (HTTP 200 with error field -- NOT 401, because the user IS authenticated with our app).
7. On 402 from Anthropic: return `{ error: 'out_of_credits' }` (HTTP 200).
8. On other Anthropic error / network throw: return `{ error: 'validation_failed' }` (HTTP 500) + Sentry capture.

**Response shapes**:

- **200** -- `{ valid: true }` or `{ error: 'invalid_key' | 'out_of_credits' }`.
- **400** -- `{ error: 'validation_failed', fields: { key: 'reason' } }`.
- **401** -- `{ error: 'auth_required' }`.
- **500** -- `{ error: 'server_error' }`.

**`export const dynamic = 'force-dynamic'`**.

### `POST /api/triage` -- modifications

**New optional body field**:

| Field      | Type   | Required | Validation         |
| ---------- | ------ | -------- | ------------------ |
| `byok_key` | string | no       | Non-empty, trimmed |

**Changed behavior** (step 7 in the existing route):

- If `body.byok_key` is present and non-empty: use it as the Anthropic API key instead of `process.env.ANTHROPIC_API_KEY`.
- If `body.byok_key` is absent: fall back to server key (existing behavior).
- On Anthropic 401 when using BYOK key: return `{ error: 'byok_invalid' }` with HTTP 401 (error rescue map #6). Do NOT revert state -- the triage attempt is NOT counted against the user's usage.
- On Anthropic 402 when using BYOK key: return `{ error: 'byok_out_of_credits' }` with HTTP 402 (error rescue map #7).

No usage check on the initial-read route -- initial read is always free per D2.

### `POST /api/triage/answer` -- modifications

**New optional body field**: same `byok_key` as above.

**Changed behavior** (between steps 4 and 5 in the existing route):

- **Usage check** (new step, free tier only): if no `byok_key` in body, query `usage_counters` for the user + current week. If `triage_session_count >= 5`, return:
  ```json
  {
    "error": "TRIAGE_LIMIT_REACHED",
    "resets": "2026-06-01T00:00:00.000Z"
  }
  ```
  HTTP 429. `resets` is the next Monday UTC 00:00:00 ISO string.
- **BYOK key pass-through** (step 6): same as `/api/triage` -- use `byok_key` when present, fall back to server key.
- **BYOK error handling**: same 401/402 distinction as `/api/triage`.
- **No usage check when BYOK key is present** -- BYOK users bypass the cap entirely.

Note: the usage check queries `usage_counters` via the user-context Supabase client (RLS-scoped). The `claim_card_slot` pattern already handles the case where no row exists for the user -- the check must handle `null` (treat as count=0, under limit).

## Offline behavior

This PR is **online-only with error state** (option a).

- **Usage bar data**: fetched server-side on `/settings` page render. No client-side cache. Stale if user opens Settings in one tab and completes a triage in another -- acceptable for v0; the user can refresh.
- **BYOK key**: held in React state (memory only). Cleared on tab close / page refresh / sign-out. The user re-enters the key after a hard refresh. This is intentional per D3 -- the key never touches any persistence layer.
- **Limit-reached banner**: rendered client-side from the API response. If offline, the triage answer fetch itself fails and the existing network-error banner surfaces -- the limit-reached banner never appears offline.

## Metrics

2 new PostHog events added to METRICS.md per D8. No new Sentry call sites beyond the standard route handler posture.

| Event                  | Where fired                                                                                                                              | Key properties             | Why we care                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `byok_key_validated`   | `apps/web/app/(app)/settings/_components/ByokKeyInput.tsx` after `POST /api/key-validate` returns `{ valid: true }`.                     | `{}`                       | Measures BYOK adoption -- the denominator for "what fraction of users bring their own key?" Informs the `pro-tier` row.   |
| `triage_limit_reached` | `apps/web/app/(app)/cards/[id]/_components/AnswerThread.tsx` when `POST /api/triage/answer` returns `{ error: 'TRIAGE_LIMIT_REACHED' }`. | `{ resets: string }` (ISO) | Leading indicator of "users want more triage sessions than the free cap allows" -- informs whether 5 is the right number. |

Both events fire from the client -- `byok_key_validated` after the validate endpoint confirms, `triage_limit_reached` when the error response is received (before rendering the banner).

## Files to create/modify

**Create**:

- `supabase/migrations/<ts>_014_usage_counters_and_byok.sql` -- D1.
- `apps/web/app/api/key-validate/route.ts` + `route.test.ts` -- D4.
- `apps/web/app/(app)/settings/page.tsx` -- D5, D6 (server component, reads usage data).
- `apps/web/app/(app)/settings/_components/UsageBar.tsx` -- D6 (server component).
- `apps/web/app/(app)/settings/_components/ByokKeyInput.tsx` + test -- D7 (client component).
- `apps/web/app/(app)/_components/ByokKeyProvider.tsx` -- React context provider (client component).
- `apps/web/e2e/usage-counters-and-byok.spec.ts` -- E2E spec.

**Modify**:

- `apps/web/app/(app)/layout.tsx` -- mount `<ByokKeyProvider>` wrapping children; add gear icon link to `/settings` in header.
- `apps/web/app/api/triage/route.ts` -- accept optional `byok_key` in body; use as Anthropic API key when present; add BYOK-specific 401/402 error responses.
- `apps/web/app/api/triage/answer/route.ts` -- accept optional `byok_key` in body; add usage check (free tier, step between card load and Anthropic call); use BYOK key when present; add BYOK-specific 401/402 error responses + `TRIAGE_LIMIT_REACHED` response.
- `apps/web/app/api/triage/_lib/anthropic.ts` -- no change needed (already accepts `apiKey` param).
- `apps/web/app/api/triage/_lib/anthropic-qa.ts` -- no change needed (already accepts `apiKey` param).
- `apps/web/app/(app)/cards/[id]/_components/AnswerThread.tsx` -- handle `TRIAGE_LIMIT_REACHED` response; render limit-reached banner with CTA link to `/settings`; pass `byokKey` from context to triage/answer fetch body. Fire `triage_limit_reached` PostHog event.
- `apps/web/app/(app)/cards/[id]/_components/StartTriage.tsx` -- pass `byokKey` from context to triage fetch body.
- `packages/core/src/supabase.types.ts` -- regen via `pnpm db:gen-types` (adds `mark_byok_used` to Functions, updated `confirm_triage` signature).
- `CLAUDE.md` -- path-map rows for migration 014, the new route, the new components, the context provider. Gotchas for BYOK-specific traps.
- `METRICS.md` -- 2 new event rows per section Metrics.

## Tests

| Task | Unit tests                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Integration / route tests                                                                                                                                                                                                                                                                                                                                                                           | E2E coverage                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| T1   | n/a (migration)                                                                                                                                                                                                                                                                                                                                                                                                                                              | n/a                                                                                                                                                                                                                                                                                                                                                                                                 | Verified via E2E + rollback round-trip CI                 |
| T2   | n/a (route tests below)                                                                                                                                                                                                                                                                                                                                                                                                                                      | `key-validate/route.test.ts` -- 8+ cases: 200 valid key; 200 invalid_key (401 from Anthropic); 200 out_of_credits (402 from Anthropic); 400 missing key; 400 empty key; 401 unauthenticated; 500 network error; mark_byok_used called on success.                                                                                                                                                   | Indirect via E2E                                          |
| T3   | n/a (route tests below)                                                                                                                                                                                                                                                                                                                                                                                                                                      | `triage/route.test.ts` -- extend with 3+ new cases: BYOK key pass-through uses body key; BYOK 401 returns byok_invalid; BYOK 402 returns byok_out_of_credits. `triage/answer/route.test.ts` -- extend with 5+ new cases: TRIAGE_LIMIT_REACHED at count 5 (free tier); under-limit proceeds normally; BYOK key skips usage check; BYOK 401/402 handling; usage_counters NULL row treated as count 0. | Indirect via E2E                                          |
| T4   | `ByokKeyProvider.test.tsx` -- 4+ cases: provides byokKey initially null; setByokKey updates context; clearByokKey resets to null; children re-render on key change.                                                                                                                                                                                                                                                                                          | n/a                                                                                                                                                                                                                                                                                                                                                                                                 | Indirect via E2E                                          |
| T5   | `UsageBar.test.tsx` -- 4+ cases: renders count text; progress bar fill at 3/5; bar color indigo under limit; bar color terracotta at 5/5. `ByokKeyInput.test.tsx` -- 8+ cases: State A renders explainer + input + validate; State B hides explainer; validate success shows "Key accepted" + fires PostHog event; validate invalid_key shows error; validate out_of_credits shows error + billing link; empty input rejects; loading state disables button. | n/a                                                                                                                                                                                                                                                                                                                                                                                                 | E2E covers happy path                                     |
| T6   | `layout.test.tsx` -- extend with 2+ new cases: gear icon link present; gear icon links to /settings.                                                                                                                                                                                                                                                                                                                                                         | n/a                                                                                                                                                                                                                                                                                                                                                                                                 | Indirect via E2E                                          |
| T7   | `AnswerThread.test.tsx` -- extend with 3+ new cases: TRIAGE_LIMIT_REACHED renders banner; banner has link to /settings; PostHog triage_limit_reached fires on limit error.                                                                                                                                                                                                                                                                                   | n/a                                                                                                                                                                                                                                                                                                                                                                                                 | E2E covers limit-reached scenario                         |
| T8   | n/a (E2E)                                                                                                                                                                                                                                                                                                                                                                                                                                                    | n/a                                                                                                                                                                                                                                                                                                                                                                                                 | `apps/web/e2e/usage-counters-and-byok.spec.ts` -- 5 cases |
| T9   | n/a (docs)                                                                                                                                                                                                                                                                                                                                                                                                                                                   | n/a                                                                                                                                                                                                                                                                                                                                                                                                 | n/a                                                       |

### E2E spec (`apps/web/e2e/usage-counters-and-byok.spec.ts`) -- 5 cases

All cases skip gracefully on non-local Supabase via `test.skip(!isLocalSupabase, ...)` (matches existing E2E posture). Seeds usage data directly via admin client.

1. **Settings page renders usage bar**: Sign in, navigate to `/settings`. Assert "AI triage this week" label visible. Assert "0 of 5 sessions used" text. Assert progress bar rendered with indigo fill. Assert "Resets Monday" visible.

2. **Usage bar at limit shows terracotta**: Seed `usage_counters` row with `triage_session_count=5` and current `week_start`. Navigate to `/settings`. Assert "5 of 5 sessions used". Assert progress bar fill uses `--color-act-soon` (terracotta).

3. **BYOK key validation happy path**: Navigate to `/settings`. Assert explainer paragraph visible (State A, `byok_used=false`). Enter a valid test key in the input. Click "Validate". Assert "Key accepted" inline. **Assert PostHog** `byok_key_validated` fires. Navigate away and back -- assert explainer paragraph hidden (State B, `byok_used` now true).

4. **Triage limit blocks Q&A for free-tier user**: Seed a card in `state='diagnosed'` with `severity_confirmed=false`. Seed `usage_counters` with `triage_session_count=5`. Sign in, navigate to `/cards/<id>`. Enter an answer, click Send. Assert limit-reached banner visible with "resets Monday" text. Assert link to `/settings` present. **Assert PostHog** `triage_limit_reached` fires. Assert Send button disabled.

5. **BYOK key bypasses triage limit**: Same setup as case 4, but first navigate to `/settings` and enter a valid BYOK key. Return to `/cards/<id>`. Enter an answer, click Send. Assert Q&A proceeds normally (no limit banner). Assert the triage answer fetch body includes `byok_key`.

## Dependencies

- **No hard dependencies on other unmerged PRs** -- this PR extends `confirm_triage` (migration 011, already on main) and leverages `usage_counters` (migration 002 + 006b, already on main).
- **Soft-precedes `monitor-beta`** -- the monitor-beta feature's check-in walkthrough will also consume triage sessions; the counter infrastructure ships here first.
- **No SDK version changes** in this PR. Uses `@anthropic-ai/sdk` at the existing pin.
- **No new npm packages** -- the Anthropic SDK is already a dependency; the key-validate endpoint uses it directly.
- **No auth flow changes** -- RLS already enforces ownership on `usage_counters` + `users` tables.

## Task order

(/ak-implement reads this list verbatim. Each task is dependency-ordered.)

1. **T1: Migration 014 + types regen.** Foundation. Write the migration per section Data model changes, apply locally via `pnpm db:reset`, regenerate types via `pnpm db:gen-types`. Verify `mark_byok_used` in Functions, updated `confirm_triage` signature in types. Commit: `feat(usage-counters-and-byok): migration 014 -- mark_byok_used RPC + confirm_triage triage_session_count increment`.
2. **T2: `POST /api/key-validate` route + tests.** Depends on T1 (`mark_byok_used` RPC exists). Auth-gated key validation endpoint. ~8 route tests covering the full envelope matrix.
3. **T3: `POST /api/triage` + `POST /api/triage/answer` modifications + tests.** Depends on T1 (updated `confirm_triage` with counter increment). Add `byok_key` body field acceptance, usage check in answer route, BYOK-specific error responses. ~8 new/extended route tests.
4. **T4: `ByokKeyProvider` React context.** Independent of T2/T3. Client component wrapping `(app)` layout children with `{ byokKey, setByokKey, clearByokKey }` context. ~4 tests.
5. **T5: `/settings` page + `UsageBar` + `ByokKeyInput` components + tests.** Depends on T2 (validate endpoint) and T4 (context provider). Server page reads usage data; ByokKeyInput calls validate endpoint and writes to context. ~12 component tests.
6. **T6: Header gear icon in `(app)/layout.tsx`.** Depends on T4 (ByokKeyProvider mount in same file). Add gear icon link to `/settings` in header. Extend existing layout test with 2+ cases.
7. **T7: Limit-reached UI in `<AnswerThread />` + `<StartTriage />` BYOK pass-through.** Depends on T3 (TRIAGE_LIMIT_REACHED response) and T4 (context consumer). Handle limit error in AnswerThread, render banner with CTA. Pass `byokKey` from context to triage fetch calls. ~3 new AnswerThread test cases.
8. **T8: `apps/web/e2e/usage-counters-and-byok.spec.ts`.** Depends on T2, T3, T5, T6, T7. The 5-case Playwright spec per section Tests section E2E.
9. **T9: Docs.** CLAUDE.md path-map + Gotchas, METRICS.md events. Final commit.

## Gotchas

1. **`confirm_triage` DROP + CREATE required, not CREATE OR REPLACE.** The migration must DROP the existing function before recreating it. The function signature (parameter list) is identical between migration 011 and 014, so `CREATE OR REPLACE` would technically work for the body change. However, the explicit DROP + CREATE pattern makes the migration diff self-documenting about what changed (the counter increment block). The rollback recipe must restore the migration 011 body.

2. **Week-rollover in the counter increment resets `triage_session_count` to 1, not 0-then-increment.** The `ON CONFLICT DO UPDATE SET triage_session_count = CASE WHEN week_start = v_monday THEN triage_session_count + 1 ELSE 1 END` pattern sets the count directly to 1 on week rollover (the current confirmation IS the first session of the new week). This matches `claim_card_slot`'s card_count pattern which resets to 0 then increments in a separate UPDATE -- but here we do it in one step for simplicity since there's no cap-check between reset and increment.

3. **BYOK key must NEVER be logged, persisted, or included in error payloads.** The key transits through the request body JSON -> route handler variable -> Anthropic SDK constructor -> garbage collected. Do not include `byok_key` in Sentry extra data, console logs, or error response bodies. The only evidence of BYOK usage is: (a) `users.byok_used = true` on the user row, (b) the `byok_key_validated` PostHog event (which carries NO key data), (c) the absence of a `TRIAGE_LIMIT_REACHED` error for a user at the cap.

4. **Usage check in `/api/triage/answer` must handle NULL `usage_counters` row.** A user who has never completed a triage session has no row in `usage_counters`. The Supabase query `from('usage_counters').select('triage_session_count, week_start').eq('user_id', user.id).maybeSingle()` returns `data: null`. Treat null as count=0 (under limit). Do NOT treat null as "at limit" -- that would block first-time users.

5. **The initial-read route (`POST /api/triage`) does NOT check the usage counter.** Per D2, the initial read is always free -- users always see what the AI thinks before spending a session. Only the Q&A answer route checks the counter. This is an intentional asymmetry.

6. **BYOK key cleared on page refresh is a feature, not a bug.** The key lives in React state (memory only) per D3. A hard refresh clears it. The user must re-enter the key. This is the security posture -- no persistence means no key-at-rest risk. The UX cost (re-entering after refresh) is acceptable for v0 power users.

7. **`key-validate` returns HTTP 200 for both valid keys and invalid/out-of-credits keys.** The endpoint wraps the Anthropic error in a 200 response body (`{ error: 'invalid_key' }`) rather than proxying the Anthropic 401 as an HTTP 401. Reason: the user IS authenticated with our app (the auth gate passed). An HTTP 401 from our endpoint would be confusing -- it would look like our session expired, not like the BYOK key is bad. The body-level error field disambiguates.

8. **`mark_byok_used` is idempotent.** The RPC guards on `byok_used = false`, so calling it on a user who has already validated a key is a no-op. This means the validate endpoint can unconditionally call the RPC without checking the current state first -- the predicate-guard does the work.

9. **`triage_session_count` increment fires on EVERY `confirm_triage` call, including BYOK sessions.** The counter tracks total sessions, not free-tier sessions only. The usage CHECK (`>= 5`) is what the route handler enforces for free-tier users; the counter itself is a neutral metric. This means BYOK users' counters go above 5 -- the bar on Settings shows the true count even when above the cap. The display text changes to "X sessions this week" (no "of 5" cap suffix) when BYOK key is active.

10. **Gear icon position: between email and Sign out, not at the far right.** The header layout is `home-os [email] [gear] [sign-out]`. The gear icon is a navigation link, not an action button -- it sits with the nav cluster, not with the sign-out form. This prevents mis-taps between the gear and sign-out on mobile.

11. **The `resets` field in the `TRIAGE_LIMIT_REACHED` response is the NEXT Monday UTC.** Computed server-side as `date_trunc('week', now() AT TIME ZONE 'utc') + interval '7 days'` (which gives next Monday 00:00 UTC). The client renders this as a human-readable date relative to the user's timezone. Do NOT compute the reset date client-side -- server is the source of truth for the week boundary.

12. **Path-map freshness hook -- T9 must touch CLAUDE.md.** Same trap as prior PRs: the freshness hook blocks PRs that add a triggering surface without updating CLAUDE.md. This PR adds: 1 route + 4 components + 1 migration + 1 context provider -- all triggering. T9's commit must update CLAUDE.md.

## Acceptance criteria

- Local `pnpm db:reset` applies migration 014 cleanly on a fresh database (no errors, no warnings).
- `confirm_triage` RPC atomically increments `usage_counters.triage_session_count` with week-rollover on triage confirmation.
- `POST /api/key-validate` validates a BYOK key via a minimal Anthropic API call and returns `{ valid: true }` or the appropriate error.
- `POST /api/triage/answer` blocks free-tier users at `triage_session_count >= 5` with `TRIAGE_LIMIT_REACHED` and the next-Monday reset date.
- `POST /api/triage` and `POST /api/triage/answer` accept a `byok_key` body field and use it for the Anthropic call when present, bypassing the usage check.
- `/settings` page renders the usage bar with correct count, progress bar color (indigo under limit, terracotta at limit), and reset-day indicator.
- BYOK key input validates via the endpoint, shows inline success/error feedback, and stores the key in React context (memory only).
- First-time users see the explainer paragraph (State A); returning users (`byok_used=true`) see input only (State B).
- Gear icon in the header links to `/settings`.
- `<AnswerThread />` renders the limit-reached banner with CTA link to `/settings` when the triage answer route returns `TRIAGE_LIMIT_REACHED`.
- Both PostHog events fire with the documented prop shapes.
- `pnpm turbo run lint typecheck test:unit build` passes locally.
- CI fast-job + slow-job green; Vercel preview deploys; Settings page renders on the preview.

## Rollout / rollback

**Rollout** (post-merge to main):

1. `.github/workflows/deploy-migrations.yml` auto-applies migration 014 on push to main. The migration is purely additive (new function `mark_byok_used`, modified function body for `confirm_triage`) -- no column adds, no enum changes, no production downtime.
2. Vercel auto-deploys the web app with the new route + components.
3. Existing `usage_counters` rows gain no new columns -- the migration only changes function bodies. `triage_session_count` begins incrementing on the next triage confirmation.
4. Production smoke: complete a triage Q&A, navigate to `/settings`, verify the count incremented and the bar reflects it. Enter a test BYOK key, validate, verify "Key accepted" and the explainer hides on reload.

**Rollback** (if the new route / components fail in production):

1. Revert the merge commit on main. Vercel re-deploys the previous bundle.
2. Migration 014 stays applied (`mark_byok_used` function and the updated `confirm_triage` body remain in the DB). The old code path does not call `mark_byok_used` and does not read `triage_session_count` in the route handler -- the extra counter increment in `confirm_triage` is harmless (writes to `usage_counters` that nothing reads). Forward-fix the route / component bugs; do not roll back the schema.
3. After rollback: the `/settings` route 404s (Next.js returns a default 404 page for unmapped routes). The gear icon link is gone (old layout code). The triage routes accept no `byok_key` field (old code ignores unknown body fields via validation). The limit-reached banner never renders (old AnswerThread doesn't handle the error class). Everything degrades to the pre-feature state cleanly.

**Forward-only follow-ups**: none deferred to a later PR within `usage-counters-and-byok` scope. The `pro-tier` row in PRODUCT-ROADMAP is explicitly downstream -- "only if free tier + BYOK telemetry shows demand."
