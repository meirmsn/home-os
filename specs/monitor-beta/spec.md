<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: monitor-beta -->
<!-- date: 2026-05-26 -->

# Spec: monitor-beta (PR N)

**Sources:**

- `PLAN.md § Planned (monitor-beta)` — primary scope
- `.gstack/ceo-review-home-os-2026-05-01-r2.md § Scope (MONITOR beta) + § Card Lifecycle` — premises, scope boundaries, cadence, walkthrough, multi-photo, capture-with-reference
- `.gstack/eng-review-home-os-2026-05-01.md § Build Order step 10 + § Monitoring cadence + § Edge Cases #4-5` — schema columns, cadence storage, restore-to-triage, photo comparison edge case
- `.gstack/design-review-home-os-2026-05-02.md § MONITOR (Beta) + § Information Architecture (MONITOR Walkthrough) + § Card States` — UI surface, visual treatment, IA hierarchy
- `.gstack/pwa-spike-result.md` — camera input validation (Ship decision on Path A `<input capture>`)
- Prior spec `specs/close-flow/spec.md` — style + structure reference; this PR extends the card lifecycle with the monitoring surface
- `apps/web/app/(app)/cards/[id]/page.tsx` — state-switched body; monitoring branch currently renders a one-line stub
- `supabase/migrations/20260513184100_001_enums.sql` — `touchpoint_type` enum to extend with 'checkin'
- `supabase/migrations/20260513184101_002_tables.sql` — `cards.monitoring_cadence_days`, `cards.next_check_at` already exist

PR N delivers the MONITOR (beta) surface — the monitoring path from DECIDE. Adds a `check_ins` table + `'checkin'` touchpoint type, `POST /api/card/[id]/checkin` route with multi-photo support, full `<MonitorView />` replacing the current stub with cadence display, overdue indicator, check-in timeline with reference photos, inline check-in form, cadence adjustment, and a "Change path" action returning to DECIDE. Walkthrough mode deferred to `dashboard` PR.

---

## Product update

Both blurbs as approved at Phase 0.2. Single source-of-truth — `/ak-build`
Phase 4.1 copies them verbatim into the PR body's `## Product update`
section, Phase 5.6 copies Headline into BUILD-LOG `Headline:` and Detail
into `Summary:`, and `/ak-go-live` Step 6 uses Headline as the
deployed-to-prod lede.

### Headline (user-facing)

Cards set to Monitor now show a full monitoring view with check-in history, cadence tracking, and an overdue indicator — plus a multi-photo check-in flow that lets you record what you see with up to three photos alongside your previous check-in for easy comparison.

### Detail (team-facing)

Migration 015 extends `touchpoint_type` with `'checkin'` and adds a `check_ins` table for per-card check-in events. New `POST /api/card/[id]/checkin` route handles multipart form (optional notes + up to 3 photos) and atomically resets `cards.next_check_at`. `<MonitorView />` replaces the current one-line stub with cadence display, overdue chip, check-in timeline, reference-photo comparison, and inline check-in form. Cards in monitoring state gain a "Change path" action that returns them to DECIDE with full context.

---

## Decisions (resolved at spec time)

8 `/ak-spec`-time decisions resolved in Phase 0 with the user. Recorded below
so Phase 1 preserves them verbatim and a crashed Phase 1 resumes without
re-asking.

### D1: Schema — check-in event tracking

**Decision:** New `check_ins` table (`id uuid PK, card_id uuid FK, user_id uuid FK, created_at timestamptz, notes text`). One row per check-in event. Photos link via `card_photos.touchpoint_id = check_in.id` with `touchpoint_type='checkin'`. Each check-in UPDATEs `cards.next_check_at = now() + interval '1 day' * monitoring_cadence_days` to reset the cadence clock.

**Rationale:** A check-in is a first-class event with its own timestamp + optional notes. The existing `photo_slot` enum (wide/zoom/detail) groups the 1–3 photos under a parent touchpoint row. Same pattern as capture (touchpoint_id groups slots) and close (touchpoint_type distinguishes lifecycle stages).

### D2: Schema — touchpoint_type enum extension

**Decision:** Add `'checkin'` to the `touchpoint_type` enum via rename-recreate (same recipe as migration 013 `'close'`).

**Rationale:** Distinguishes check-in photos from capture (`primary`/`context`/`closeup`) and close (`close`) photos in queries. Consistent with the enum-extension pattern established in migration 013.

### D3: Cadence clock reset on ad-hoc check-in

**Decision:** `POST /api/card/[id]/checkin` atomically INSERTs the `check_ins` row and UPDATEs `cards.next_check_at = now() + interval '1 day' * monitoring_cadence_days` via a SECURITY DEFINER RPC `record_checkin`. Ad-hoc check-ins (outside the scheduled cadence) follow the same path — any check-in resets the clock.

**Rationale:** Per ceo-review: "ad-hoc check-ins supported at any time (resets cadence clock)." The atomic RPC prevents a partial write where the check-in row exists but the cadence isn't reset.

### D4: MonitorView UI structure

**Decision:** New `<MonitorView />` server component replacing the current one-line stub at `page.tsx:633-637`. Renders: severity chip + "Monitoring" chip (calm `--color-monitor` token) + cadence display ("Check back in N days" / "Overdue — last checked X days ago") + check-in history timeline + "Check in now" CTA + "Change path" secondary action.

**Rationale:** Design-review § MONITOR: "Primary signal: MONITOR chip + last check-in date + whether check-in is due." Matches the existing PlannedView/ClosedView component pattern.

### D5: Check-in flow UX

**Decision:** Inline expansion on `<MonitorView />` (same pattern as `<CloseCardForm />` on PlannedView). "Check in now" button expands to: optional notes textarea + multi-photo capture (up to 3 slots: wide/zoom/detail, using `<input type="file" accept="image/*" capture="environment">` per PWA spike Ship decision) + reference photos from last check-in shown alongside for angle matching + "Submit check-in" confirm button. No page transition.

**Rationale:** Ceo-review: "multi-photo check-in sets (wide / zoom / detail, full resolution)" + "capture with reference (previous check-in photos shown alongside the camera before shooting, so the user can match angle and framing naturally)."

### D6: Walkthrough mode — deferred

**Decision:** Defer walkthrough mode to the `dashboard` PR. Walkthrough is an inline dashboard prompt ("4 items need a check-in — Start walkthrough") that batches stale monitoring items — it requires the dashboard surface to exist. The `monitor-beta` PR ships per-card check-in mechanics only.

**Rationale:** Per eng-review: walkthrough is "inline dashboard prompt — not modal, not bottom sheet." The dashboard is a separate PLAN.md row (`dashboard`, Lev 3.2, blocked on `monitor-beta`). Shipping the per-card mechanics first is the correct dependency order.

### D7: State transition — monitoring → decide

**Decision:** The existing `commit_decide` RPC already accepts `'monitoring'` as a source state for the `path='decide'` transition. Add a "Change path" button on MonitorView that POSTs to `/api/card/[id]/decide` with `path='decide'`. This returns the card to the DECIDE surface where the user sees all options: PLANNED / keep MONITOR / DISMISS.

**Rationale:** Per ceo-review: "After any check-in, user returns to DECIDE: PLANNED / keep MONITOR / DISMISS." The user can also change path without doing a check-in first — the "Change path" button is always available on MonitorView.

### D8: New METRICS events

**Decision:** Three new PostHog events: `monitor_checkin_submitted` (card_id, photo_count, has_notes, is_overdue), `monitor_view_opened` (card_id, days_since_last_checkin, is_overdue), `monitor_cadence_changed` (card_id, old_cadence, new_cadence).

**Rationale:** Track engagement with the monitoring surface — check-in frequency, photo adoption, overdue rate, and cadence adjustment patterns.

---

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens, Data
     model changes, API contracts, Offline behavior, Metrics, Files to
     create/modify, Tests, Dependencies, Task order, Gotchas, Acceptance /
     rollout / rollback. The Product update + Decisions sections above
     stay verbatim. -->
