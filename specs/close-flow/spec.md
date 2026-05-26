<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: close-flow -->
<!-- date: 2026-05-26 -->

# Spec: close-flow (PR N)

**Sources:**

- `PLAN.md § Planned (close-flow)` — primary scope
- `.gstack/ceo-review-home-os-2026-05-01-r2.md § Scope (CLOSE) + § Card Lifecycle` — premises, scope boundaries
- `.gstack/design-review-home-os-2026-05-02.md § Card States — Visual Presentation (CLOSED) + § Photo Comparison Is a Card Capability` — UI surface, visual treatment
- `.gstack/eng-review-home-os-2026-05-01.md § Tables (card_photos.touchpoint_type, cards.closed_at) + § Build Order step 9 + § Card Lifecycle (PLANNED → CLOSE)` — schema column names, sequencing, lifecycle invariants
- Prior spec `specs/planned-state/spec.md` — style + structure reference; this PR extends the PLANNED view with the close action
- `apps/web/app/(app)/cards/[id]/_components/PlannedView.tsx` — mounts the close form below ReminderEditor
- `apps/web/app/(app)/cards/[id]/page.tsx` — state-switched body; closed branch currently renders a one-line stub
- `supabase/migrations/20260513184100_001_enums.sql` — `touchpoint_type` enum (primary, context, closeup) to extend with 'close'
- `supabase/migrations/20260513184101_002_tables.sql` — `cards.closed_at timestamptz` already exists; cards + card_photos tables

PR N delivers the CLOSE flow — the final step from PLANNED. Adds the optional spend log columns + 'close' touchpoint type, the `close_card` SECURITY DEFINER RPC, `POST /api/card/[id]/close` route, `<CloseCardForm />` on PlannedView, and a full `<ClosedView />` replacing the current one-line stub with before/after photo pair + spend log + severity + diagnosis thread. Completes the card lifecycle end-to-end (capture → triage → decide → planned → closed).

---

## Product update

### Headline (user-facing)

Cards can now be marked as closed after the user completes their repair or schedules their contractor, with an optional record of what they spent and a finished photo that automatically pairs with the original capture for a visual before-and-after.

### Detail (team-facing)

Adds the PLANNED → CLOSED state transition (step 9 in ceo-review build order). Migration 013 extends the `touchpoint_type` enum with `'close'` and adds `actual_spend_cents` + `spend_notes` to cards. New `close_card` SECURITY DEFINER RPC enforces the state guard atomically. `POST /api/card/[id]/close` handles multipart form (optional spend + optional photo) in the same posture as `POST /api/card`. `<CloseCardForm />` on PlannedView is the user-facing trigger; `<ClosedView />` replaces the current one-line stub with before/after photo pair + spend log + severity chip + diagnosis thread.

---

## Decisions (resolved at spec time)

8 `/ak-spec`-time decisions resolved in Phase 0 with the user. Recorded below so Phase 1 preserves them verbatim and a crashed Phase 1 resumes without re-asking.

### D1: Schema for spend log

**Decision:** Migration 013 adds `cards.actual_spend_cents int NULL` + `cards.spend_notes text NULL`. No CHECK on negative — a zero or null spend is valid ("I didn't track it"). Cents (integer) avoids floating-point; matches the cost*estimate*\* jsonb `amount_low`/`amount_high` shape at the storage layer.

**Rationale:** Simple additive columns; the spend log is a flat value + optional note, not a structured line-item list. Mirrors the existing `closed_at timestamptz` column already on cards since migration 002.

### D2: touchpoint_type enum extension

**Decision:** Same migration adds `'close'` to the `touchpoint_type` enum via rename-recreate (same 006a recipe). This lets `card_photos` distinguish finished photos from capture photos.

**Rationale:** Eng-review proposed `CAPTURE | CHECKIN | CLOSE` as touchpoint lifecycle stages; the current enum (`primary | context | closeup`) describes the first capture only. Adding `'close'` extends the lifecycle dimension without breaking existing queries that filter on `'primary'`.

### D3: State transition mechanism

**Decision:** New SECURITY DEFINER RPC `close_card(p_user uuid, p_card uuid, p_spend_cents int DEFAULT NULL, p_spend_notes text DEFAULT NULL)` — guards `state='planned'` + `p_user = auth.uid()`, atomically sets `state='closed', closed_at=now(), actual_spend_cents, spend_notes`. No re-open from closed in v0 — CLOSED is terminal per ceo-review.

**Rationale:** Follows the commit_decide pattern (one RPC per state-machine transition). Direct UPDATE under RLS would also work, but the RPC centralizes the state guard + multi-column atomic write.

### D4: Close API route shape

**Decision:** `POST /api/card/[id]/close` with `multipart/form-data` body: `spend_amount_cents` (optional number), `spend_notes` (optional string ≤ 500 chars), `photo` (optional File). Route uploads photo to Storage + INSERTs card_photos, then calls `close_card` RPC. Envelope: 200 / 400 / 401 / 404 / 409 / 500.

**Rationale:** Mirrors `POST /api/card` pattern — multipart because photo is inline. The existing POST /api/card handles `formData()` + Storage upload; close reuses the same posture.

### D5: Close action UX on PlannedView

**Decision:** New `<CloseCardForm />` client component at the bottom of `<PlannedView />`, below `<ReminderEditor />`. Renders a "Mark as closed" button that expands to an inline form: optional currency input (dollars, converted to cents client-side) + optional notes textarea + optional photo file input + "Close this card" confirm button + Cancel. No modal — inline expansion matches the `<ReminderEditor />` set-a-reminder pattern.

**Rationale:** Low-friction close: the button is always visible on planned cards. The inline form avoids a page transition. Photo is encouraged via placeholder text ("Add a finished photo for your before & after") but never required.

### D6: ClosedView UI

**Decision:** New `<ClosedView />` server component replacing the current stub. Renders: severity chip + "Closed" chip (calm green, `--color-note` token — resolved, not urgent) + closed_at date + before/after photo pair (original capture on left, finished photo on right — side by side on desktop, stacked on mobile) + spend log (if present) + "How we diagnosed this" collapsible.

**Rationale:** Design-review says "CLOSED: Primary signal = CLOSED chip + finished photo prominent. Primary action = View before/after." The before/after pair is the hero of the closed state.

### D7: Before/after photo pair

**Decision:** Query card_photos for earliest `touchpoint_type='primary'` (original capture) and latest `touchpoint_type='close'` (finished photo). Display both with their respective dates. When either photo is missing, show placeholder text ("No capture photo" / "No finished photo").

**Rationale:** Automatic before/after record per ceo-review § CLOSE. The timestamped pair is the durable evidence of the repair.

### D8: PostHog events

**Decision:** Two events: `card_close_started` (user opens the close form — measures intent) + `card_closed` (`{ card_id, chosen_path, has_spend_log, has_finished_photo, days_in_planned }`). `days_in_planned` = days between the card entering planned state and close.

**Rationale:** Mirrors the decide funnel shape (opened → chosen). `days_in_planned` is the headline metric — how long do users take from decision to resolution?

---

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens, Data
     model changes, API contracts, Offline behavior, Metrics, Files to
     create/modify, Tests, Dependencies, Task order, Gotchas, Acceptance /
     rollout / rollback. The Product update + Decisions sections above
     stay verbatim. -->
