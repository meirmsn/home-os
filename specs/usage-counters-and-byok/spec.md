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

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens, Data
     model changes, API contracts, Offline behavior, Metrics, Files to
     create/modify, Tests, Dependencies, Task order, Gotchas, Acceptance /
     rollout / rollback. The Product update + Decisions sections above
     stay verbatim. -->
