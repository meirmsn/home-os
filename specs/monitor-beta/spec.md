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

<!-- Phase 1 expansion begins here. Product update + Decisions above are verbatim from Phase 0. -->

## In scope

This PR delivers:

1. **Migration 015** — `check_ins` table, `touchpoint_type` enum extension with `'checkin'`, `record_checkin` SECURITY DEFINER RPC, and `commit_decide` update to accept `'monitoring'` as a source state.
2. **`POST /api/card/[id]/checkin`** — multipart form route (optional notes + up to 3 photos) calling the `record_checkin` RPC.
3. **`PATCH /api/card/[id]/cadence`** — JSON body route to adjust `monitoring_cadence_days` on a monitoring-state card (RLS-enforced direct UPDATE, same posture as PATCH /reminder).
4. **`<MonitorView />`** — server component replacing the one-line stub at `page.tsx:633-637`. Renders severity chip + "Monitoring" chip + cadence display + overdue indicator + check-in timeline + reference photos + "Check in now" CTA + "Change path" action.
5. **`<CheckInForm />`** — client component for the inline check-in expansion (notes + up to 3 photo slots + reference photos + submit).
6. **`<CheckInTimeline />`** — server component rendering the chronological list of past check-ins with photos.
7. **`<CadenceEditor />`** — client component for inline cadence adjustment (mirrors `<ReminderEditor />` pattern).
8. **Card detail page integration** — `page.tsx` wires `<MonitorView />` with server-fetched data (check-ins, photos, thread, cadence).
9. **PostHog events** — `monitor_checkin_submitted`, `monitor_view_opened`, `monitor_cadence_changed` (D8).
10. **METRICS.md** — three new event rows.

## Not in scope

- **Walkthrough mode** — deferred to `dashboard` PR (D6). Walkthrough is an inline dashboard prompt that batches stale monitoring items; requires the dashboard surface.
- **Photo comparison UI** — deferred to `photo-comparison-ui` PR. Check-in photos are shown in a simple grid alongside the reference; sync-zoom / bounce is a separate feature.
- **Push notifications / email for overdue check-ins** — future concern. The overdue indicator is passive (visible when the user opens the card).
- **Monitoring cadence suggestions from AI** — the AI already proposes `monitoring_cadence_days` at triage confirmation time. This PR does not add AI-driven cadence adjustment.

---

## Screens

### MonitorView (replaces stub at `page.tsx:633-637`)

**Header:**

| Element           | Render condition                        | Detail                                                                                                                            |
| ----------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Severity chip     | `card.severity` non-null                | Same `severityChipClasses()` treatment as PlannedView/ClosedView                                                                  |
| "Monitoring" chip | Always                                  | `bg-[var(--color-monitor)]/20 text-[var(--color-monitor)]` — calm teal, same as severity='monitor' chip color                     |
| Cadence display   | `card.monitoring_cadence_days` non-null | "Check back every N days" when not overdue                                                                                        |
| Overdue indicator | `card.next_check_at` in the past        | "Overdue — last checked X days ago" in `text-[var(--color-act-soon)]`. If no check-in ever recorded, "Overdue — no check-ins yet" |
| Diagnosis         | `card.diagnosis` non-null               | Same `text-sm text-[var(--color-text-secondary)]` as PlannedView                                                                  |

**Body sections (top to bottom):**

1. **Check-in timeline** (`<CheckInTimeline />`) — reverse-chronological list of check-ins. Each entry: date, optional notes, photo thumbnails (up to 3). Most recent entry is expanded by default; older entries are collapsed `<details>`. Empty state: "No check-ins yet."

2. **"Check in now" CTA** (`<CheckInForm />` collapsed state) — button styled like "Mark as closed" in CloseCardForm: `w-full rounded-lg border border-[var(--color-monitor)] px-4 py-3 text-sm font-medium text-[var(--color-monitor)]`. Expands inline on click.

3. **Check-in form** (`<CheckInForm />` expanded state):
   - Optional notes textarea (maxLength 500, same as close-flow spend_notes)
   - Up to 3 photo slots labeled "Wide", "Zoom", "Detail" — each an `<input type="file" accept="image/*" capture="environment">`
   - Reference photos section: "Last check-in photos" heading + thumbnails from the most recent prior check-in (or capture photos if no prior check-in). Shown only when prior photos exist.
   - "Submit check-in" confirm button + "Cancel" link
   - Error/retry states mirror CloseCardForm

4. **Cadence editor** (`<CadenceEditor />`) — "Check-in every N days" with an "Edit" link. On click, expands to a number input (min 1, max 365) + "Save" + "Cancel". Same inline expansion pattern as ReminderEditor.

5. **"Change path" button** — secondary action: `text-sm underline text-[var(--color-text-secondary)]`. POSTs to `/api/card/[id]/decide` with `{ path: 'decide' }`. Returns the card to DECIDE.

6. **"How we diagnosed this" collapsible** — same `<details>` + `<ConversationRow />` pattern as PlannedView/ClosedView. Renders the triage thread.

### Card detail page (`page.tsx`) modifications

- The `monitoring` branch (lines 633-637) is replaced with `<MonitorView />`.
- Server-side data fetch adds: check-ins query, check-in photo queries (signed URLs for reference + timeline photos), thread query (reuse existing pattern from planned/closed branches).
- `next_check_at` is added to the card SELECT column list.
- Overdue derivation: `const isOverdue = card.state === 'monitoring' && card.next_check_at !== null && new Date(card.next_check_at) <= new Date()`.

---

## Data model changes

### Migration 015: `YYYYMMDDHHMMSS_015_monitor_beta.sql`

```sql
-- Migration 015 — monitor-beta. Extends touchpoint_type enum with 'checkin',
-- creates check_ins table, adds record_checkin SECURITY DEFINER RPC,
-- updates commit_decide to accept 'monitoring' as source state.
--
-- Source: specs/monitor-beta/spec.md § Data model changes.
--
-- touchpoint_type rename-recreate dance (same recipe as migration 013 'close').
-- commit_decide function-dependency: must drop + recreate because we widen
-- the state predicate.

-- 1. Rename-recreate touchpoint_type enum with 'checkin' added.
alter type public.touchpoint_type rename to touchpoint_type_old;

create type public.touchpoint_type as enum (
  'primary',
  'context',
  'closeup',
  'close',
  'checkin'
);

alter table public.card_photos
  alter column touchpoint_type type public.touchpoint_type
  using touchpoint_type::text::public.touchpoint_type;

drop type public.touchpoint_type_old;

-- 2. check_ins table — one row per check-in event.
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  constraint check_ins_notes_max_length check (notes is null or length(notes) <= 500)
);

create index check_ins_card_id_idx on public.check_ins(card_id);
create index check_ins_user_id_idx on public.check_ins(user_id);

-- 3. RLS on check_ins (same owner-predicate pattern as card_photos).
alter table public.check_ins enable row level security;

create policy check_ins_select_own on public.check_ins
  for select using ((select auth.uid()) = user_id);
create policy check_ins_insert_own on public.check_ins
  for insert with check ((select auth.uid()) = user_id);
create policy check_ins_update_own on public.check_ins
  for update using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
create policy check_ins_delete_own on public.check_ins
  for delete using ((select auth.uid()) = user_id);

-- 4. record_checkin SECURITY DEFINER RPC.
--    Atomically: INSERT check_ins row + UPDATE cards.next_check_at.
--    Predicate-guard: state = 'monitoring' ONLY.
create or replace function public.record_checkin(
  p_user uuid,
  p_card uuid,
  p_notes text default null
)
returns table (
  checkin_id uuid,
  card_id uuid,
  next_check_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_checkin_id uuid;
  v_card_id uuid;
  v_next_check_at timestamptz;
  v_cadence int;
begin
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Read cadence from the card (state-guard + ownership guard).
  select public.cards.monitoring_cadence_days
    into v_cadence
    from public.cards
    where public.cards.id = p_card
      and public.cards.user_id = p_user
      and public.cards.state = 'monitoring'::public.card_state;

  if v_cadence is null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  -- Insert check-in row.
  insert into public.check_ins (card_id, user_id, notes)
    values (p_card, p_user, p_notes)
    returning public.check_ins.id into v_checkin_id;

  -- Reset cadence clock.
  update public.cards
    set next_check_at = now() + interval '1 day' * v_cadence,
        updated_at = now()
    where public.cards.id = p_card
      and public.cards.user_id = p_user
    returning public.cards.id, public.cards.next_check_at
      into v_card_id, v_next_check_at;

  return query select v_checkin_id, v_card_id, v_next_check_at;
end;
$$;

-- 5. Update commit_decide to also accept 'monitoring' as a source state.
--    Drop + recreate because we are widening the state predicate in every
--    branch. The function signature is unchanged.
drop function if exists public.commit_decide(uuid, uuid, text, int);

create or replace function public.commit_decide(
  p_user uuid,
  p_card uuid,
  p_path text,
  p_cadence int
)
returns table (
  card_id uuid,
  new_state public.card_state,
  new_chosen_path text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_card_id uuid;
  v_state public.card_state;
  v_chosen text;
begin
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_path is null or p_path not in (
    'diy', 'contractor', 'monitor', 'dismiss', 'decide'
  ) then
    raise exception 'invalid_path' using errcode = '22023';
  end if;

  if p_path = 'monitor' and (p_cadence is null or p_cadence <= 0) then
    raise exception 'cadence_required' using errcode = 'P0001';
  end if;

  if p_path = 'diy' then
    update public.cards
      set chosen_path = 'diy',
          state = 'planned'::public.card_state,
          updated_at = now()
      where public.cards.id = p_card
        and public.cards.user_id = p_user
        and public.cards.state in (
          'decide'::public.card_state,
          'planned'::public.card_state,
          'monitoring'::public.card_state
        )
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  elsif p_path = 'contractor' then
    update public.cards
      set chosen_path = 'contractor',
          state = 'planned'::public.card_state,
          updated_at = now()
      where public.cards.id = p_card
        and public.cards.user_id = p_user
        and public.cards.state in (
          'decide'::public.card_state,
          'planned'::public.card_state,
          'monitoring'::public.card_state
        )
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  elsif p_path = 'monitor' then
    update public.cards
      set chosen_path = 'monitor',
          state = 'monitoring'::public.card_state,
          monitoring_cadence_days = p_cadence,
          next_check_at = now() + interval '1 day' * p_cadence,
          updated_at = now()
      where public.cards.id = p_card
        and public.cards.user_id = p_user
        and public.cards.state in (
          'decide'::public.card_state,
          'planned'::public.card_state,
          'monitoring'::public.card_state
        )
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  elsif p_path = 'dismiss' then
    update public.cards
      set chosen_path = null,
          state = 'dismissed'::public.card_state,
          updated_at = now()
      where public.cards.id = p_card
        and public.cards.user_id = p_user
        and public.cards.state in (
          'decide'::public.card_state,
          'planned'::public.card_state,
          'monitoring'::public.card_state
        )
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  else
    -- p_path = 'decide' — re-open from planned or monitoring.
    update public.cards
      set chosen_path = null,
          state = 'decide'::public.card_state,
          updated_at = now()
      where public.cards.id = p_card
        and public.cards.user_id = p_user
        and public.cards.state in (
          'decide'::public.card_state,
          'planned'::public.card_state,
          'monitoring'::public.card_state
        )
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  end if;

  if v_card_id is null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  return query select v_card_id, v_state, v_chosen;
end;
$$;

-- 6. Grant privileges on check_ins (migration 008 ALTER DEFAULT PRIVILEGES
--    covers future tables, but the grant may not apply retroactively in
--    Supabase Cloud if the table is created by the migration runner user).
grant all on public.check_ins to authenticated;
grant all on public.check_ins to anon;

-- 7. Notify PostgREST to reload schema cache (new table + enum change).
notify pgrst, 'reload schema';

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.commit_decide(uuid, uuid, text, int);
-- DROP FUNCTION IF EXISTS public.record_checkin(uuid, uuid, text);
-- DROP POLICY IF EXISTS check_ins_delete_own ON public.check_ins;
-- DROP POLICY IF EXISTS check_ins_update_own ON public.check_ins;
-- DROP POLICY IF EXISTS check_ins_insert_own ON public.check_ins;
-- DROP POLICY IF EXISTS check_ins_select_own ON public.check_ins;
-- ALTER TABLE public.check_ins DISABLE ROW LEVEL SECURITY;
-- DROP TABLE IF EXISTS public.check_ins;
-- ALTER TYPE public.touchpoint_type RENAME TO touchpoint_type_new;
-- CREATE TYPE public.touchpoint_type AS ENUM ('primary', 'context', 'closeup', 'close');
-- ALTER TABLE public.card_photos
--   ALTER COLUMN touchpoint_type TYPE public.touchpoint_type
--   USING touchpoint_type::text::public.touchpoint_type;
-- DROP TYPE public.touchpoint_type_new;
-- -- Restore commit_decide to migration 011 body (state predicate without 'monitoring').
-- -- (See migration 011 for full function body.)
```

### Key migration notes

- **`touchpoint_type` rename-recreate**: same recipe as migration 013 (`'close'`). No function-dependency dance needed — no functions reference `touchpoint_type` in return-type signatures.
- **`commit_decide` drop+recreate**: the function body changes (widening the state predicate in every branch to include `'monitoring'`). Also adds `next_check_at = now() + interval '1 day' * p_cadence` to the `monitor` branch so the cadence clock starts when the user chooses the Monitor path.
- **`check_ins` RLS**: uses the subquery form `(select auth.uid()) = user_id` per CLAUDE.md SQL conventions.
- **`record_checkin` search_path**: `public, pg_temp` per CLAUDE.md SECURITY DEFINER conventions.
- **No `check_ins.touchpoint_id`**: the check-in's UUID (`check_ins.id`) serves as the `touchpoint_id` in `card_photos` rows. Same pattern as close-flow (where `touchpointId = crypto.randomUUID()` in the route handler maps to `card_photos.touchpoint_id`).

### RPC inventory additions

| RPC                                       | Defined in | Purpose                                                                                          | Errors                                                                             |
| ----------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `record_checkin(p_user, p_card, p_notes)` | 015        | Atomic check-in: INSERT `check_ins` + UPDATE `cards.next_check_at`. Guards `state='monitoring'`. | `42501` on auth mismatch; `P0001 invalid_state` when card not in monitoring state. |

### `commit_decide` changes

The existing `commit_decide` RPC (migration 011) is dropped and recreated with two changes:

1. **State predicate widened**: every branch's WHERE clause changes from `state in ('decide', 'planned')` to `state in ('decide', 'planned', 'monitoring')`. This enables "Change path" from MonitorView.
2. **`next_check_at` set on monitor path**: the `monitor` branch now also sets `next_check_at = now() + interval '1 day' * p_cadence` so the cadence clock starts immediately when the user chooses Monitor.

---

## API contracts

### `POST /api/card/[id]/checkin`

Multipart form data. Same posture as `POST /api/card/[id]/close`.

**Request:**

| Field          | Type                | Required | Validation                         |
| -------------- | ------------------- | -------- | ---------------------------------- |
| `notes`        | string (form field) | No       | Max 500 chars, trimmed, empty→null |
| `photo_wide`   | File                | No       | Must be `image/*` MIME             |
| `photo_zoom`   | File                | No       | Must be `image/*` MIME             |
| `photo_detail` | File                | No       | Must be `image/*` MIME             |

**Response envelopes:**

| Status | Body                                                  | When                                                    |
| ------ | ----------------------------------------------------- | ------------------------------------------------------- |
| 200    | `{ checkin_id, card_id, next_check_at, photo_count }` | Success                                                 |
| 400    | `{ error: 'validation_failed', field, reason }`       | Bad UUID, bad form data, non-image file, notes too long |
| 401    | `{ error: 'unauthorized' }`                           | No session or forbidden RPC                             |
| 404    | `{ error: 'not_found' }`                              | Card doesn't exist under RLS                            |
| 409    | `{ error: 'invalid_state' }`                          | Card not in `monitoring` state                          |
| 500    | `{ error: 'server_error' }`                           | Unexpected RPC/DB error                                 |

**Photo upload sequence** (per photo slot present):

1. Generate `touchpointId = crypto.randomUUID()` — this is the `check_ins.id` value returned by the RPC (reuse it for all photos in this check-in).
   - Correction: generate a single `touchpointId` BEFORE the RPC call. The RPC returns `checkin_id`. Use `checkin_id` as the `touchpoint_id` for all photo rows. But since we need to upload photos before we have the RPC result... Instead: use `checkin_id` from the RPC response as `touchpoint_id` for the photos (photos upload AFTER RPC, unlike close-flow where photo is first).
   - **Final ordering**: RPC first (record_checkin), then photo uploads. If a photo upload fails, the check-in row still exists (recoverable — retry upload or skip). This is the inverse of close-flow's ordering because here the check-in row IS the core event and photos are supplementary.

2. Storage path: `{user_id}/cards/{card_id}/touchpoints/{checkin_id}/{slot}.jpg` where slot is `wide`, `zoom`, or `detail`.
3. `card_photos` INSERT: `{ card_id, user_id, touchpoint_id: checkin_id, touchpoint_type: 'checkin', slot, storage_path }`.
4. Photo upload failure: Sentry warning, continue to next photo. Do NOT fail the request.

### `PATCH /api/card/[id]/cadence`

JSON body. Same posture as `PATCH /api/card/[id]/reminder`.

**Request:**

```json
{ "cadence_days": 14 }
```

| Field          | Type    | Required | Validation      |
| -------------- | ------- | -------- | --------------- |
| `cadence_days` | integer | Yes      | 1-365 inclusive |

**Response envelopes:**

| Status | Body                                                  | When                                     |
| ------ | ----------------------------------------------------- | ---------------------------------------- |
| 200    | `{ card_id, monitoring_cadence_days, next_check_at }` | Success                                  |
| 400    | `{ error: 'validation_failed', field, reason }`       | Bad UUID, bad JSON, cadence out of range |
| 401    | `{ error: 'unauthorized' }`                           | No session                               |
| 404    | `{ error: 'not_found' }`                              | Card doesn't exist under RLS             |
| 409    | `{ error: 'invalid_state' }`                          | Card not in `monitoring` state           |
| 500    | `{ error: 'server_error' }`                           | Unexpected DB error                      |

**Implementation**: RLS-enforced direct UPDATE (no SECURITY DEFINER RPC needed — single-row UPDATE, no multi-table atomicity). `.update({ monitoring_cadence_days: cadence_days, next_check_at: new Date(Date.now() + cadence_days * 86400000).toISOString() }).eq('id', id).eq('state', 'monitoring')`. 404-vs-409 disambiguation via narrow re-read (same as reminder route).

Note: `next_check_at` is recalculated from `now() + cadence_days` on cadence change, not from the last check-in time. This is intentional — changing cadence means "I want to check back in N days from now."

---

## Metrics

Three new PostHog events per D8.

| Event                       | When it fires                                                                                                                                                                                                                                                                | Key properties                                                                      | Why we care                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `monitor_checkin_submitted` | Fired from `<CheckInForm />` after `POST /api/card/[id]/checkin` returns 200 (realized check-in, not optimistic).                                                                                                                                                            | `{ card_id: string, photo_count: number, has_notes: boolean, is_overdue: boolean }` | Measures check-in engagement — photo adoption rate, note adoption rate, and overdue-vs-on-time ratio. The overdue rate is the headline metric for "is the cadence system working?" |
| `monitor_view_opened`       | Fired once per (card x browser session) from a `<MonitorViewOpenedCapture />` client component mounted inside `<MonitorView />`. Session-storage sentinel `home_os.monitor_view_opened_fired:<card_id>` deduplicates re-renders (same pattern as `DecideViewOpenedCapture`). | `{ card_id: string, days_since_last_checkin: number \| null, is_overdue: boolean }` | Top of the monitoring funnel — measures how often users revisit monitoring cards. `days_since_last_checkin` distribution informs default cadence calibration.                      |
| `monitor_cadence_changed`   | Fired from `<CadenceEditor />` after `PATCH /api/card/[id]/cadence` returns 200.                                                                                                                                                                                             | `{ card_id: string, old_cadence: number, new_cadence: number }`                     | Measures cadence adjustment patterns — do users shorten or lengthen? High adjustment rate means AI-proposed cadences are poorly calibrated.                                        |

**Sentry events** (diagnostic, not PostHog):

| Event                                                                    | When                                                                                                                                                                                                                             | Tags/Extra                                                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Sentry.captureException` — `POST /api/card/[id]/checkin` route handler  | Storage upload errors (`stage: 'storage_upload'`), card_photos INSERT errors (`stage: 'card_photos_insert'`), unexpected record_checkin RPC errors (`stage: 'record_checkin'`). Photo-upload failures do NOT block the check-in. | `tags: { route: 'POST /api/card/[id]/checkin', stage }; extra: { card_id, user_id }` |
| `Sentry.captureMessage` — `record_checkin returned no row`               | Defensive — RPC returns successfully but with no row data.                                                                                                                                                                       | `tags: { route: 'POST /api/card/[id]/checkin' }`                                     |
| `Sentry.captureException` — `PATCH /api/card/[id]/cadence` route handler | PostgREST errors during UPDATE (`stage: 'update'`) or 404-vs-409 re-read (`stage: 'lookup'`).                                                                                                                                    | `tags: { route: 'PATCH /api/card/[id]/cadence', stage }`                             |

---

## Files to create/modify

### New files

| File                                                                          | Purpose                                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/YYYYMMDDHHMMSS_015_monitor_beta.sql`                     | Migration 015 — check_ins table + touchpoint_type extension + record_checkin RPC + commit_decide update |
| `apps/web/app/api/card/[id]/checkin/route.ts`                                 | POST /api/card/[id]/checkin — check-in submission                                                       |
| `apps/web/app/api/card/[id]/checkin/route.test.ts`                            | Unit tests for checkin route                                                                            |
| `apps/web/app/api/card/[id]/cadence/route.ts`                                 | PATCH /api/card/[id]/cadence — cadence adjustment                                                       |
| `apps/web/app/api/card/[id]/cadence/_lib/parse-cadence-body.ts`               | Body parser for cadence route                                                                           |
| `apps/web/app/api/card/[id]/cadence/route.test.ts`                            | Unit tests for cadence route                                                                            |
| `apps/web/app/(app)/cards/[id]/_components/MonitorView.tsx`                   | Server component — monitoring state body                                                                |
| `apps/web/app/(app)/cards/[id]/_components/MonitorView.test.tsx`              | Unit tests for MonitorView                                                                              |
| `apps/web/app/(app)/cards/[id]/_components/CheckInForm.tsx`                   | Client component — inline check-in form                                                                 |
| `apps/web/app/(app)/cards/[id]/_components/CheckInForm.test.tsx`              | Unit tests for CheckInForm                                                                              |
| `apps/web/app/(app)/cards/[id]/_components/CheckInTimeline.tsx`               | Server component — check-in history                                                                     |
| `apps/web/app/(app)/cards/[id]/_components/CheckInTimeline.test.tsx`          | Unit tests for CheckInTimeline                                                                          |
| `apps/web/app/(app)/cards/[id]/_components/CadenceEditor.tsx`                 | Client component — cadence adjustment                                                                   |
| `apps/web/app/(app)/cards/[id]/_components/CadenceEditor.test.tsx`            | Unit tests for CadenceEditor                                                                            |
| `apps/web/app/(app)/cards/[id]/_components/MonitorViewOpenedCapture.tsx`      | Client component — once-per-session PostHog event                                                       |
| `apps/web/app/(app)/cards/[id]/_components/MonitorViewOpenedCapture.test.tsx` | Unit tests for the capture component                                                                    |

### Modified files

| File                                     | Change                                                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/(app)/cards/[id]/page.tsx` | Replace monitoring stub with `<MonitorView />`, add check-ins + photos server fetch, add `next_check_at` to card SELECT, add overdue derivation, add thread fetch for monitoring state |
| `supabase/README.md`                     | Add migration 015 row, record_checkin RPC row, check_ins RLS section, commit_decide update note, touchpoint_type enum update                                                           |
| `METRICS.md`                             | Add 3 PostHog event rows + 3 Sentry rows                                                                                                                                               |
| `CLAUDE.md`                              | Add monitor-beta gotchas (check-in ordering, cadence clock reset)                                                                                                                      |

---

## Tests

### Route tests

**`apps/web/app/api/card/[id]/checkin/route.test.ts`** — mirrors `close/route.test.ts` structure:

- **Happy paths**: 200 with no notes/photos; 200 with notes; 200 with 1 photo; 200 with 3 photos; 200 when photo upload fails (check-in still succeeds); 200 when card_photos INSERT fails.
- **Validation 400s**: invalid UUID; invalid form data; non-image MIME; notes > 500 chars.
- **Auth + state**: 401 no session; 401 RPC forbidden; 404 card not found; 409 wrong state; 500 unexpected RPC error; 500 RPC returns empty data.

**`apps/web/app/api/card/[id]/cadence/route.test.ts`** — mirrors `reminder/route.test.ts` structure:

- **Happy paths**: 200 with valid cadence; 200 recalculates next_check_at.
- **Validation 400s**: invalid UUID; invalid JSON; cadence < 1; cadence > 365; cadence non-integer.
- **Auth + state**: 401 no session; 404 not found; 409 wrong state; 500 DB error.

### Component tests

**`MonitorView.test.tsx`**: renders severity chip + monitoring chip; renders cadence display; renders overdue indicator when past due; renders "No check-ins yet" empty state; renders check-in timeline with entries; renders diagnosis.

**`CheckInForm.test.tsx`**: collapsed state renders CTA button; expand fires `monitor_checkin_submitted` event name reservation; submit calls fetch with FormData; cancel resets form; error states render; retry works.

**`CheckInTimeline.test.tsx`**: renders chronological check-in entries; most recent is expanded; shows photo thumbnails; shows notes; empty state.

**`CadenceEditor.test.tsx`**: displays current cadence; expand shows number input; validates range 1-365; submit calls fetch; fires `monitor_cadence_changed` event; cancel resets.

**`MonitorViewOpenedCapture.test.tsx`**: fires `monitor_view_opened` once per card per session; does not re-fire on re-render; uses sessionStorage sentinel (same pattern as `DecideViewOpenedCapture.test.tsx`).

---

## Dependencies

No new npm packages. All functionality uses existing dependencies:

- `posthog-js` — already installed (PostHog events)
- `@sentry/nextjs` — already installed (error capture)
- `@supabase/ssr` — already installed (server client)
- Native `FormData` / `File` / `crypto.randomUUID()` — browser + Node built-ins

---

## Task order

Dependency-ordered implementation tasks. Each task is one atomic commit.

### Task 1: Migration 015 — `check_ins` table + touchpoint_type extension + RPCs

**Creates:**

- `supabase/migrations/YYYYMMDDHHMMSS_015_monitor_beta.sql`

**Updates:**

- `supabase/README.md` — add migration 015 row, record_checkin RPC, commit_decide update note, check_ins table, touchpoint_type enum

**Depends on:** nothing (foundation for all other tasks)

**Verify:** `pnpm db:reset` succeeds, `pnpm db:gen-types` regenerates types with `check_ins` table and `'checkin'` touchpoint_type.

### Task 2: `POST /api/card/[id]/checkin` route + tests

**Creates:**

- `apps/web/app/api/card/[id]/checkin/route.ts`
- `apps/web/app/api/card/[id]/checkin/route.test.ts`

**Depends on:** Task 1 (needs `record_checkin` RPC + `check_ins` table in generated types)

**Pattern:** follow `close/route.ts` for multipart form parsing, photo upload, RPC call, error handling. Key difference: RPC first, photos after (inverse of close-flow ordering — see API contracts section).

### Task 3: `PATCH /api/card/[id]/cadence` route + tests

**Creates:**

- `apps/web/app/api/card/[id]/cadence/route.ts`
- `apps/web/app/api/card/[id]/cadence/_lib/parse-cadence-body.ts`
- `apps/web/app/api/card/[id]/cadence/route.test.ts`

**Depends on:** Task 1 (needs `monitoring_cadence_days` + `next_check_at` columns queryable)

**Pattern:** follow `reminder/route.ts` for JSON body, RLS-enforced direct UPDATE, 404-vs-409 disambiguation.

### Task 4: `<CheckInTimeline />` server component + tests

**Creates:**

- `apps/web/app/(app)/cards/[id]/_components/CheckInTimeline.tsx`
- `apps/web/app/(app)/cards/[id]/_components/CheckInTimeline.test.tsx`

**Depends on:** nothing (pure presentational component, receives props)

**Pattern:** server component. Receives an array of check-in entries with photo URLs. Most recent entry expanded, older ones collapsed via `<details>`.

### Task 5: `<CheckInForm />` client component + tests

**Creates:**

- `apps/web/app/(app)/cards/[id]/_components/CheckInForm.tsx`
- `apps/web/app/(app)/cards/[id]/_components/CheckInForm.test.tsx`

**Depends on:** Task 2 (calls `POST /api/card/[id]/checkin`)

**Pattern:** follow `CloseCardForm.tsx` for inline expansion, FormData construction, fetch call, error/retry states, PostHog event firing.

### Task 6: `<CadenceEditor />` client component + tests

**Creates:**

- `apps/web/app/(app)/cards/[id]/_components/CadenceEditor.tsx`
- `apps/web/app/(app)/cards/[id]/_components/CadenceEditor.test.tsx`

**Depends on:** Task 3 (calls `PATCH /api/card/[id]/cadence`)

**Pattern:** follow `ReminderEditor.tsx` for inline expansion, JSON fetch, error states, PostHog event firing.

### Task 7: `<MonitorViewOpenedCapture />` client component + tests

**Creates:**

- `apps/web/app/(app)/cards/[id]/_components/MonitorViewOpenedCapture.tsx`
- `apps/web/app/(app)/cards/[id]/_components/MonitorViewOpenedCapture.test.tsx`

**Depends on:** nothing (standalone client component)

**Pattern:** follow `DecideViewOpenedCapture.tsx` exactly — sessionStorage sentinel, once-per-card-per-session posthog.capture.

### Task 8: `<MonitorView />` server component + tests

**Creates:**

- `apps/web/app/(app)/cards/[id]/_components/MonitorView.tsx`
- `apps/web/app/(app)/cards/[id]/_components/MonitorView.test.tsx`

**Depends on:** Tasks 4, 5, 6, 7 (composes CheckInTimeline, CheckInForm, CadenceEditor, MonitorViewOpenedCapture)

**Pattern:** follow `PlannedView.tsx` / `ClosedView.tsx` for server component composition with severity chip, diagnosis, collapsible thread.

### Task 9: Card detail page integration + PostHog events + METRICS.md

**Modifies:**

- `apps/web/app/(app)/cards/[id]/page.tsx` — replace monitoring stub, add server-side data fetches, wire props to MonitorView
- `METRICS.md` — add 3 PostHog + 3 Sentry event rows
- `CLAUDE.md` — add monitor-beta gotchas

**Depends on:** Task 8 (needs MonitorView component to exist)

**Key changes to page.tsx:**

- Add `next_check_at` to the card SELECT column list.
- Add `check_ins` query: fetch all check-ins for the card, ordered by `created_at desc`.
- Add check-in photos query: for each check-in, fetch `card_photos` rows where `touchpoint_type='checkin'` and `touchpoint_id=check_in.id`, generate signed URLs.
- Add thread fetch for `monitoring` state (reuse the existing thread-fetch pattern from the `diagnosed`/`decide`/`planned`/`closed` branches — extend the condition).
- Replace the monitoring stub `<section>` with `<MonitorView />` passing all required props.
- Compute `isOverdue` for the monitoring state.

---

## Gotchas

### G1: Check-in photo ordering — RPC first, photos after

Unlike close-flow (photo-first, state-second), the check-in route calls `record_checkin` RPC first, then uploads photos. Rationale: in close-flow, the photo is the hero artifact and the state transition is terminal — losing the photo is unrecoverable. In check-in flow, the check-in event itself is the core signal (cadence clock reset) and photos are supplementary — an orphaned check-in row without photos is still valuable. If the order were reversed (photos first), a failed RPC would leave orphaned photos with no parent check-in row.

### G2: `commit_decide` state predicate widening

The migration drops and recreates `commit_decide` with `'monitoring'` added to the state predicate in every branch. This means a monitoring-state card can transition to any path (diy, contractor, monitor, dismiss, decide) — the "Change path" button on MonitorView is just one use case. The broader predicate is intentional.

### G3: `next_check_at` initialization on monitor path

The updated `commit_decide` now sets `next_check_at = now() + interval '1 day' * p_cadence` when `p_path = 'monitor'`. Without this, a card entering monitoring state would have `next_check_at = null` until the first check-in, making the overdue indicator useless on first visit.

### G4: Overdue derivation uses server time, not client time

`isOverdue` is computed server-side in page.tsx as `new Date(card.next_check_at) <= new Date()`. This avoids timezone drift between client and server. The component receives `isOverdue` as a boolean prop — it never recomputes it.

### G5: Check-in photos use `check_ins.id` as `touchpoint_id`

The `card_photos.touchpoint_id` for check-in photos is the `check_ins.id` (the UUID returned by `record_checkin` as `checkin_id`). This groups all photos from a single check-in under one touchpoint, matching the capture pattern where `touchpoint_id` groups the wide/zoom/detail slots.

### G6: Cadence editor recalculates `next_check_at` from now, not from last check-in

When the user changes cadence via `PATCH /api/card/[id]/cadence`, `next_check_at` is set to `now() + cadence_days`, not `last_check_in_at + cadence_days`. This is intentional — the user is saying "I want to check back in N days from now." If they change cadence from 30 to 7, they want the next check-in in 7 days, not in `last_check_in + 7 days` (which might be in the past).

### G7: Reference photos query — fallback to capture photos

The check-in form shows reference photos for angle matching. The query priority is: (1) photos from the most recent check-in (`touchpoint_type='checkin'`, latest `created_at`), (2) if no check-ins exist, the capture photos (`touchpoint_type='primary'`). This fallback ensures first-time check-ins show the original capture as reference.

### G8: `check_ins` RLS uses subquery form

Per CLAUDE.md SQL conventions: `(select auth.uid()) = user_id`. The subquery lets Postgres initplan the auth.uid() call once per statement instead of re-evaluating per row.

---

## Acceptance / rollout / rollback

### Acceptance criteria

1. A card in `monitoring` state shows `<MonitorView />` instead of the stub text.
2. The monitoring chip renders in `--color-monitor` teal alongside the severity chip.
3. Cadence display shows "Check back every N days" when not overdue.
4. Overdue indicator shows in `--color-act-soon` when `next_check_at` is past.
5. "Check in now" button expands to the inline form with notes + 3 photo slots.
6. Reference photos from the last check-in (or capture) are shown in the form.
7. Submitting a check-in creates a `check_ins` row, resets `next_check_at`, and uploads photos.
8. Check-in timeline shows past check-ins with dates, notes, and photo thumbnails.
9. Cadence editor allows adjusting `monitoring_cadence_days` (1-365).
10. "Change path" button returns the card to DECIDE.
11. All three PostHog events fire with correct properties.
12. All route tests pass. All component tests pass.
13. `pnpm db:reset` + `pnpm db:gen-types` succeed with the new migration.
14. `pnpm db:advisor` reports no new unexempted findings.

### Rollout

Standard Vercel preview-per-PR → merge-to-main → prod deploy. Migration 015 deploys via the existing `deploy-migrations.yml` CI workflow.

### Rollback

1. Revert the PR (git revert the merge commit).
2. Migration rollback: run the `-- ROLLBACK:` block in migration 015 against the production database. This drops `check_ins`, restores `touchpoint_type` to the 4-value enum, and restores `commit_decide` to the migration-011 body.
3. Any `check_ins` rows and `touchpoint_type='checkin'` photo rows are dropped by the table drop + enum rollback. This is acceptable for a beta feature — no production data preservation guarantee on rollback.
