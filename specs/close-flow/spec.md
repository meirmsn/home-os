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

## Core user story

1. Open a planned card (chose DIY or Contractor at DECIDE).
2. Scroll below the reminder editor, tap "Mark as closed".
3. Optionally enter what you spent (e.g. "$85"), add a note ("Fixed the leak myself"), and snap a finished photo.
4. Tap "Close this card" — card transitions to `state='closed'`, page refreshes to `<ClosedView />`.
5. See the before/after photo pair (original capture on left, finished photo on right), spend log, severity chip, calm-green "Closed" chip, and collapsed diagnosis thread.

## In scope

- **Migration 013** (D1, D2) — extends `touchpoint_type` enum with `'close'` via the canonical rename-recreate dance (006a recipe). Adds `cards.actual_spend_cents int NULL` + `cards.spend_notes text NULL`. New SECURITY DEFINER RPC `close_card(p_user, p_card, p_spend_cents, p_spend_notes)` — guards `state='planned'` + `p_user = auth.uid()`, atomically sets `state='closed', closed_at=now(), actual_spend_cents, spend_notes`. Commented rollback recipe in-file per convention.
- **`POST /api/card/[id]/close`** (D4) — auth-gated multipart close route. Body fields: `spend_amount_cents` (optional number string), `spend_notes` (optional string ≤ 500 chars), `photo` (optional File). Route sequence: auth gate → validate → upload photo to Storage + INSERT `card_photos` (if photo present) → call `close_card` RPC. Returns 200 / 400 / 401 / 404 / 409 / 500.
- **`<CloseCardForm />` `'use client'` component** (D5) — mounted at the bottom of `<PlannedView />`, below `<ReminderEditor />`. Renders a "Mark as closed" button that expands to an inline form: optional dollar input (converted to cents client-side) + optional notes textarea (≤ 500 chars) + optional photo file input + "Close this card" confirm button + Cancel. Fires `card_close_started` on expand, `card_closed` on successful POST 200.
- **`<ClosedView />` server component** (D6) — replaces the current one-line stub in `cards/[id]/page.tsx` for `state='closed'`. Renders: severity chip + calm-green "Closed" chip (`--color-note` token) + closed_at date + before/after photo pair (D7) + spend log (if present) + "How we diagnosed this" collapsible.
- **`<BeforeAfterPhotos />` server component** (D7) — displays the before/after photo pair. Queries for earliest `touchpoint_type='primary'` (before) and latest `touchpoint_type='close'` (after). Side by side on desktop (grid-cols-2), stacked on mobile. Placeholder text when either photo is missing.
- **`apps/web/app/(app)/cards/[id]/page.tsx`** — extend the closed-state branch to render `<ClosedView />` with full props (severity, diagnosis, spend, thread, photo URLs). Extend `CardRow` type with `actual_spend_cents` and `spend_notes`. Add the `close` photo queries for signed URLs.
- **`<PlannedView />` extension** — mount `<CloseCardForm />` below `<ReminderEditor />` (the final interactive element before the "How we diagnosed this" collapsible).
- **2 new PostHog events in METRICS.md** per D8: `card_close_started`, `card_closed`.
- **CLAUDE.md** — path-map rows + gotchas for new surfaces.
- **E2E spec** `apps/web/e2e/close-flow.spec.ts` — 5 cases per § Tests § E2E below.
- **Regenerated `packages/core/src/supabase.types.ts`** — adds `'close'` to `touchpoint_type` enum, `actual_spend_cents` + `spend_notes` to `Tables['cards']['Row']` / `Insert` / `Update`, `close_card` to `Functions`.

## Out of scope

- **Re-open from closed** — CLOSED is terminal in v0 per ceo-review § Card Lifecycle. No "Undo close" or "Reopen" action.
- **Full photo comparison UI** (sync zoom, bounce mode, side-by-side slider) — PR #6 (`photo-comparison`) owns. This PR renders a static side-by-side pair only.
- **Dashboard closed-card treatment** — PR #5 (`dashboard`) owns. This PR ships the data; the dashboard reads it.
- **Spend analytics** (aggregate spend by system, trend over time) — post-v0.
- **Spend validation** (negative spend guard, currency normalization) — D1 explicitly allows null/zero; no CHECK constraint on negative.
- **Multi-photo close** (multiple finished photos per close event) — v0 ships one photo per close; the `card_photos` schema supports future additions.
- **Celebratory animation on close** — design-review mentions "celebratory animation on CLOSE"; deferred to a polish pass. The before/after pair IS the satisfaction moment.
- **Notifications on close** — out of v0 scope.

## Screens

### `/cards/[id]` — body extension for `state='planned'` (close action)

The `<PlannedView />` body gains `<CloseCardForm />` mounted below `<ReminderEditor />`, before the "How we diagnosed this" collapsible:

| Element                       | `chosen_path='diy'` | `chosen_path='contractor'` | `chosen_path='monitor'` | `chosen_path=null` |
| ----------------------------- | ------------------- | -------------------------- | ----------------------- | ------------------ |
| (existing) Severity chip      | shown               | shown                      | shown                   | hidden             |
| (existing) "You chose"        | shown               | shown                      | shown                   | hidden             |
| (existing) PathCard           | shown               | shown                      | hidden                  | hidden             |
| (existing) Monitor cadence    | hidden              | hidden                     | shown                   | hidden             |
| (existing) BeforeCloseSummary | shown               | shown                      | hidden                  | hidden             |
| (existing) ChoosePath         | shown               | shown                      | shown                   | hidden             |
| (existing) ReminderEditor     | shown               | shown                      | shown                   | hidden             |
| **CloseCardForm (new)**       | **shown**           | **shown**                  | **shown**               | **hidden**         |
| (existing) "How we diagnosed" | shown (if thread)   | shown (if thread)          | shown (if thread)       | hidden             |

### `<CloseCardForm />` — render states

| State      | Visible elements                                                                                                                                                                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collapsed  | "Mark as closed" button (full-width, calm-green outline, `--color-note` token).                                                                                                                                                                                                                                         |
| Expanded   | Dollar input (`<input type="number" step="0.01" min="0" placeholder="Amount spent ($)">`) + notes textarea (`<textarea placeholder="Notes (e.g. parts, who did the work)" maxLength={500}>`) + photo file input ("Add a finished photo for your before & after") + "Close this card" confirm button + Cancel text link. |
| Submitting | Form inputs disabled, confirm button shows spinner / "Closing…" text. Cancel hidden.                                                                                                                                                                                                                                    |

Dollar-to-cents conversion: `Math.round(parseFloat(value) * 100)` — NaN / empty / negative → null (treated as "no spend recorded"). Server receives `spend_amount_cents` as an integer or absent.

### `/cards/[id]` — body for `state='closed'` (`<ClosedView />`)

Replaces the current one-line stub ("Card closed on [date]"). Full composition:

| Element                 | When rendered                                 | Detail                                                                                                                                          |
| ----------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Severity chip           | always (if severity non-null)                 | Same `severityChipClasses()` shared helper as other states.                                                                                     |
| "Closed" chip           | always                                        | Calm-green filled chip: `bg-[var(--color-note)]/20 text-[var(--color-note)]`, label "closed".                                                   |
| Closed date             | always (closed_at non-null)                   | "Closed on [humanDate]" subline.                                                                                                                |
| Before/after photo pair | always (with placeholders for missing photos) | `<BeforeAfterPhotos />` — side by side desktop, stacked mobile. "Before" label + date on capture photo; "After" label + date on finished photo. |
| Spend log               | when `actual_spend_cents` is non-null         | "You spent: $XX.XX" + spend_notes (if present) below.                                                                                           |
| "How we diagnosed this" | when thread has rows                          | Collapsed `<details>` with `<ConversationRow />` per row (same as PlannedView/DecideView).                                                      |

### `<BeforeAfterPhotos />` — render states

| Scenario                  | Before slot (left/top)                    | After slot (right/bottom)                 |
| ------------------------- | ----------------------------------------- | ----------------------------------------- |
| Both photos present       | Capture photo + "Before · [date]" caption | Finished photo + "After · [date]" caption |
| Only capture, no finished | Capture photo + "Before · [date]" caption | "No finished photo" placeholder           |
| Only finished, no capture | "No capture photo" placeholder            | Finished photo + "After · [date]" caption |
| Neither                   | "No capture photo" placeholder            | "No finished photo" placeholder           |

Layout: `grid grid-cols-1 md:grid-cols-2 gap-4`. Each slot is a rounded card with the photo filling the container + a small caption below.

### Error states

| Surface             | Error                                         | UI                                                                                                        |
| ------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `<CloseCardForm />` | 400 `validation_failed`                       | Inline error citing the failing field; form stays expanded, user can re-edit.                             |
| `<CloseCardForm />` | 409 `invalid_state` (card moved past planned) | Inline banner: "Card state changed — refreshing…" + delayed `router.refresh()`.                           |
| `<CloseCardForm />` | 404 `not_found`                               | Inline banner: "Card not found — refreshing…" + delayed `router.refresh()`.                               |
| `<CloseCardForm />` | 500 / network                                 | Retryable banner with retry button; form state preserved (spend, notes, photo selection).                 |
| `<CloseCardForm />` | Photo upload fails (Storage error)            | Route still calls `close_card` RPC — card closes without the photo. Sentry capture on the upload failure. |

## Data model changes

### Migration 013 — `<ts>_013_close_flow.sql`

**Statement order** (single .sql file, transaction-safe):

1. **Rename-recreate `touchpoint_type` enum** with `'close'` added (same 006a recipe). The dependent `card_photos.touchpoint_type` column must be recast. No functions depend on this enum's type signature, so no DROP FUNCTION dance needed (unlike `card_state` in migration 011):

   ```sql
   alter type public.touchpoint_type rename to touchpoint_type_old;

   create type public.touchpoint_type as enum (
     'primary',
     'context',
     'closeup',
     'close'
   );

   alter table public.card_photos
     alter column touchpoint_type type public.touchpoint_type
     using touchpoint_type::text::public.touchpoint_type;

   drop type public.touchpoint_type_old;
   ```

2. **Additive columns on `cards`**:

   ```sql
   alter table public.cards
     add column if not exists actual_spend_cents int,
     add column if not exists spend_notes text;
   ```

   No CHECK constraint on negative — D1 explicitly allows null/zero/any integer. `spend_notes` has no DB-level length constraint; the route handler enforces ≤ 500 chars.

3. **`close_card` SECURITY DEFINER RPC**:

   ```sql
   create or replace function public.close_card(
     p_user uuid,
     p_card uuid,
     p_spend_cents int default null,
     p_spend_notes text default null
   )
   returns table (
     card_id uuid,
     new_state public.card_state,
     closed_at timestamptz
   )
   language plpgsql
   security definer
   set search_path = public, pg_catalog
   as $$
   declare
     v_card_id uuid;
     v_state public.card_state;
     v_closed_at timestamptz;
   begin
     if p_user is distinct from auth.uid() then
       raise exception 'forbidden' using errcode = '42501';
     end if;

     update public.cards
       set state = 'closed'::public.card_state,
           closed_at = now(),
           actual_spend_cents = p_spend_cents,
           spend_notes = p_spend_notes,
           updated_at = now()
       where public.cards.id = p_card
         and public.cards.user_id = p_user
         and public.cards.state = 'planned'::public.card_state
       returning public.cards.id, public.cards.state, public.cards.closed_at
         into v_card_id, v_state, v_closed_at;

     if v_card_id is null then
       raise exception 'invalid_state' using errcode = 'P0001';
     end if;

     return query select v_card_id, v_state, v_closed_at;
   end;
   $$;
   ```

   Predicate-guard: `state = 'planned'` only — stricter than `commit_decide`'s `IN ('decide', 'planned')` because close is a one-way terminal transition. Column references fully qualified per PR #24 lesson.

**Rollback** (commented in-file):

```sql
-- DROP FUNCTION IF EXISTS public.close_card(uuid, uuid, int, text);
-- ALTER TABLE public.cards DROP COLUMN IF EXISTS spend_notes;
-- ALTER TABLE public.cards DROP COLUMN IF EXISTS actual_spend_cents;
-- Rename-recreate touchpoint_type back to (primary, context, closeup):
-- ALTER TYPE public.touchpoint_type RENAME TO touchpoint_type_new;
-- CREATE TYPE public.touchpoint_type AS ENUM ('primary', 'context', 'closeup');
-- ALTER TABLE public.card_photos
--   ALTER COLUMN touchpoint_type TYPE public.touchpoint_type
--   USING touchpoint_type::text::public.touchpoint_type;
-- DROP TYPE public.touchpoint_type_new;
```

### Existing columns leveraged (no change)

- `cards.closed_at timestamptz` — already exists since migration 002; populated by `close_card` RPC via `closed_at = now()`.
- `cards.chosen_path text` — read by `<ClosedView />` to display the chosen path context; no write.
- `card_photos.touchpoint_type` — existing column; the new `'close'` enum value distinguishes finished photos from capture photos.

## API contracts

### `POST /api/card/[id]/close`

**Request body**: `multipart/form-data` — parsed via `request.formData()` (same posture as `POST /api/card`).

| Field                | Type                 | Required | Validation                                                                                   |
| -------------------- | -------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `spend_amount_cents` | string (number-like) | no       | Must be parseable as a non-negative integer via `parseInt(value, 10)`. NaN / empty → null.   |
| `spend_notes`        | string               | no       | ≤ 500 chars. Empty string → null. Trimmed.                                                   |
| `photo`              | File                 | no       | Must be `image/*` MIME type. Max size enforced by Supabase Storage bucket config (existing). |

**Route sequence**:

1. Auth gate (`getUser()` → 401 if null).
2. UUID validation on `[id]` param.
3. Parse `formData()`.
4. Validate fields (spend_amount_cents, spend_notes, photo MIME).
5. **If photo present**: upload to Storage at `{user.id}/cards/{card_id}/touchpoints/{uuid}/wide.jpg` (new `touchpoint_id` generated server-side), INSERT into `card_photos` with `touchpoint_type='close'`, `slot='wide'`. Upload failure → Sentry capture + continue (card still closes without the photo).
6. Call `close_card` RPC with parsed spend values.
7. Return response.

**Response shapes**:

- **200** — `{ card_id: string, state: 'closed', closed_at: string }`.
- **400** — `{ error: 'validation_failed', field: string, reason: string }`.
- **401** — `{ error: 'unauthorized' }`.
- **404** — `{ error: 'not_found' }` — card doesn't exist or RLS hides it.
- **409** — `{ error: 'invalid_state' }` — card not in `state='planned'`. 404-vs-409 distinguished by a narrow `cards` re-read (matches `/decide` route posture).
- **500** — `{ error: 'server_error' }` with Sentry capture.

**Side effects**: Photo uploaded to Storage + `card_photos` INSERT (if photo present), then `close_card` RPC atomically transitions state + writes spend. No PostHog server-side; `<CloseCardForm />` fires the events from the client.

**`export const dynamic = 'force-dynamic'`**.

## Offline behavior

This PR is **online-only**. The close action requires a network round-trip (multipart POST with optional photo upload + RPC call). The card detail page is server-rendered; there is no offline form persistence. If the network fails, the retryable banner from § Error states surfaces; form state (spend, notes, photo selection) is preserved so the user can retry on reconnect.

## Metrics

2 new PostHog events added to METRICS.md per D8. No new Sentry call sites beyond the standard route handler posture (Sentry capture on 500-class server errors + photo upload failures only; 4xx are user errors).

| Event                | Where fired                                                                                                                         | Key properties                                                                                                                                                                                           | Why we care                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `card_close_started` | `apps/web/app/(app)/cards/[id]/_components/CloseCardForm.tsx` when the user taps "Mark as closed" (expand event — measures intent). | `{ card_id: string }`                                                                                                                                                                                    | Top of the close funnel — measures how many planned cards surface intent to close. Drop vs `card_closed` is the friction signal.                                   |
| `card_closed`        | `CloseCardForm.tsx` after `POST /api/card/[id]/close` returns 200 (realized close — not optimistic).                                | `{ card_id: string, chosen_path: 'diy' \| 'contractor' \| 'monitor', has_spend_log: boolean, has_finished_photo: boolean, days_in_planned: number }` — `days_in_planned` is approximate (see Gotcha #8). | Bottom of the close funnel. `has_spend_log` / `has_finished_photo` measure optional-field adoption. `days_in_planned` is the headline metric — time to resolution. |

Both events fire from the client — `card_close_started` on form expand (one-per-expand, no sessionStorage dedup needed — user can re-expand after Cancel), `card_closed` after the POST 200 lands and before `router.refresh()`.

## Files to create/modify

**Create**:

- `supabase/migrations/<ts>_013_close_flow.sql` — D1, D2, D3.
- `apps/web/app/api/card/[id]/close/route.ts` + paired test.
- `apps/web/app/(app)/cards/[id]/_components/CloseCardForm.tsx` + test.
- `apps/web/app/(app)/cards/[id]/_components/ClosedView.tsx` + test.
- `apps/web/app/(app)/cards/[id]/_components/BeforeAfterPhotos.tsx` + test.
- `apps/web/e2e/close-flow.spec.ts` — 5-case E2E spec.

**Modify**:

- `apps/web/app/(app)/cards/[id]/_components/PlannedView.tsx` — mount `<CloseCardForm />` below `<ReminderEditor />`. New prop: none (CloseCardForm reads `cardId` already threaded). Only change is the JSX insertion.
- `apps/web/app/(app)/cards/[id]/page.tsx` — extend `CardRow` type with `actual_spend_cents: number | null` + `spend_notes: string | null`; add those columns to the SELECT list; replace the closed-state stub with `<ClosedView />`; add close-photo signed URL queries for the before/after pair.
- `packages/core/src/supabase.types.ts` — regen via `pnpm db:gen-types` after migration apply (adds `'close'` to `touchpoint_type`, `actual_spend_cents` + `spend_notes` to cards, `close_card` to functions).
- `CLAUDE.md` — path-map rows for migration 013, the new route, the three new components. Gotchas for close-flow-specific traps.
- `METRICS.md` — 2 new event rows per § Metrics.
- `PLAN.md` — row (`close-flow`) already flipped from Planned → Active by Phase 0.

## Tests

Per-task table. Unit + route tests live alongside their source; the E2E lives in `apps/web/e2e/`.

| Task | Unit tests                                                                                                                                                                                                                                                                                                                                                                                                                             | Integration / route tests                                                                                                                                                                                                                                                                                                                                                                                                                   | E2E coverage                                                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| T1   | n/a (migration)                                                                                                                                                                                                                                                                                                                                                                                                                        | n/a                                                                                                                                                                                                                                                                                                                                                                                                                                         | Verified via E2E + rollback round-trip CI                   |
| T2   | n/a (route tests below)                                                                                                                                                                                                                                                                                                                                                                                                                | `close/route.test.ts` — 14+ cases: 200 close without spend or photo; 200 close with spend_amount_cents + spend_notes; 200 close with photo (mocked Storage); 200 close with all three fields; 400 invalid spend_amount_cents (non-numeric string); 400 spend_notes too long (>500); 400 photo non-image MIME; 401 anon; 404 not-found; 409 wrong-state ×6 (capturing/triaging/diagnosed/decide/monitoring/dismissed/closed); RLS isolation. | Indirect via E2E                                            |
| T3   | `CloseCardForm.test.tsx` — 12+ cases: collapsed renders "Mark as closed" button; click expands form; dollar input converts to cents; empty dollar → null; notes trimmed + capped; photo input accepts image; Cancel collapses; submit fires POST with correct FormData; 200 triggers router.refresh; 409 shows inline banner; 500 shows retryable banner; PostHog `card_close_started` fires on expand; `card_closed` fires after 200. | n/a                                                                                                                                                                                                                                                                                                                                                                                                                                         | E2E covers happy path + error path                          |
| T4   | `ClosedView.test.tsx` — 10+ cases: renders severity chip; renders "Closed" chip (calm green); renders closed_at date; renders spend log when present; hides spend when null; renders "How we diagnosed this" collapsible; empty thread → no collapsible; null severity → no severity chip; chosen path shown in context; diagnosis text present.                                                                                       | n/a                                                                                                                                                                                                                                                                                                                                                                                                                                         | E2E covers full ClosedView render                           |
| T4b  | `BeforeAfterPhotos.test.tsx` — 6+ cases: both photos present → side by side; only before → placeholder for after; only after → placeholder for before; neither → both placeholders; captions show dates; responsive grid classes present.                                                                                                                                                                                              | n/a                                                                                                                                                                                                                                                                                                                                                                                                                                         | E2E covers both-present + missing-after scenarios           |
| T5   | `PlannedView.test.tsx` — extend with 2+ new cases: `<CloseCardForm />` mounted for all three chosen paths; `<CloseCardForm />` NOT mounted when `chosenPath=null` (invariant-violation fallback).                                                                                                                                                                                                                                      | n/a                                                                                                                                                                                                                                                                                                                                                                                                                                         | Indirect via E2E                                            |
| T6   | `cards/[id]/page.test.tsx` — extend with 4+ new cases: SELECT list includes `actual_spend_cents` + `spend_notes`; `<ClosedView />` renders when state='closed'; closed-state photo query returns signed URLs; no ClosedView when state != 'closed'.                                                                                                                                                                                    | n/a                                                                                                                                                                                                                                                                                                                                                                                                                                         | Indirect via E2E                                            |
| T7   | n/a (E2E)                                                                                                                                                                                                                                                                                                                                                                                                                              | n/a                                                                                                                                                                                                                                                                                                                                                                                                                                         | `apps/web/e2e/close-flow.spec.ts` — 5 cases per § E2E below |
| T8   | n/a (docs)                                                                                                                                                                                                                                                                                                                                                                                                                             | n/a                                                                                                                                                                                                                                                                                                                                                                                                                                         | n/a                                                         |

### E2E spec (`apps/web/e2e/close-flow.spec.ts`) — 5 cases

All cases skip gracefully on non-local Supabase via `test.skip(!isLocalSupabase, …)` (matches PR #15 / #18 / #19 / #26 / #27 / #28 posture; CI slow-job is the canonical enforcement surface). Seeds planned cards directly in `state='planned'` via admin client (skipping the AI hop — `planned-state` E2E covers the DECIDE → PLANNED transition).

1. **Happy path — close a DIY card with spend + photo**: Seed a planned card with `chosen_path='diy'`, populated `cost_estimate_diy`, `planned_reminder_date=null`. Upload a capture photo (`touchpoint_type='primary'`) via admin client. Sign in as owner, navigate to `/cards/<id>`. Assert `<PlannedView />` renders. Assert `<CloseCardForm />` collapsed ("Mark as closed" visible). Click "Mark as closed" — assert form expands. **Assert PostHog** `card_close_started` fires. Enter spend "$85.50", notes "Fixed the leak myself", attach a photo file. Click "Close this card". Assert POST 200. Assert page refreshes to `<ClosedView />`. Assert severity chip + "Closed" chip (calm green) + "Closed on [date]" visible. Assert before/after photo pair visible (capture on left, finished on right). Assert spend log "You spent: $85.50" + notes visible. **Assert PostHog** `card_closed` with `{ has_spend_log: true, has_finished_photo: true, chosen_path: 'diy' }`.

2. **Close without spend or photo (minimal close)**: Seed a planned card with `chosen_path='contractor'`. No capture photo. Click "Mark as closed" → expand → leave spend and photo empty → "Close this card". Assert POST 200. Assert `<ClosedView />` renders. Assert no spend log section. Assert before/after pair shows "No capture photo" + "No finished photo" placeholders. **Assert PostHog** `card_closed` with `{ has_spend_log: false, has_finished_photo: false, chosen_path: 'contractor' }`.

3. **Close with photo but no spend**: Seed a planned card with `chosen_path='diy'`. Upload a capture photo. Click "Mark as closed" → expand → attach only a finished photo (no spend). Assert POST 200. Assert before/after pair shows both photos (capture + finished). Assert no spend log section.

4. **State guard — 409 on non-planned card**: Seed a card in `state='decide'`. Attempt direct `POST /api/card/<id>/close` (via `request.post()` in Playwright). Assert 409 `invalid_state`. Move card to `state='closed'` via admin client → assert 409. Move to `state='dismissed'` → assert 409. Move to `state='monitoring'` → assert 409. (No event fired on any of these.)

5. **Cancel preserves form state**: Seed a planned card. Click "Mark as closed" → expand. Enter spend "$42", notes "test". Click Cancel → form collapses. Click "Mark as closed" again → form expands with empty fields (no persistence across collapses — user re-enters). Assert no POST was fired on Cancel. **Assert** `card_close_started` fires on EACH expand (no dedup — each expand is a fresh intent signal).

## Dependencies

- **Hard depends on PR #28 (`planned-state`) merged into `main`** — extends `<PlannedView />` with `<CloseCardForm />`. Migration 012 must be applied (it is — `planned_reminder_date` column exists).
- **Hard depends on PR #27 (`decide-state`) merged into `main`** — `cards.chosen_path`, `cost_estimate_diy`, `cost_estimate_hire`, override columns, `commit_decide` RPC, `<PlannedView />`, `<PathCard />`, `<ChoosePath />`.
- **Soft-precedes PR #5 (`dashboard`)** — adds the spend columns + close_card RPC that the dashboard's closed-card tier will read.
- **Soft-precedes PR #6 (`photo-comparison`)** — ships the static before/after pair; PR #6 adds sync zoom + bounce mode + slider on top.
- **No conflict with the dependabot PRs** open against main.
- **No SDK version changes** in this PR.
- **No new third-party API integrations** — no AI calls at close time.
- **No auth flow changes** — RLS already enforces ownership on `cards` + `card_photos` tables.
- **`@supabase/ssr`** stays at the existing pin.

## Task order

(/ak-implement reads this list verbatim. Each task is dependency-ordered; ⟶ marks the critical chain. Tracker tasks mirror this list.)

1. **T1: Migration 013 + types regen.** ⟶ Foundation. Write the migration per § Data model changes, apply locally via `pnpm db:reset`, regenerate types via `pnpm db:gen-types`. Verify `'close'` appears in `touchpoint_type` enum in `packages/core/src/supabase.types.ts`, `actual_spend_cents` + `spend_notes` on `Tables['cards']`, and `close_card` in `Functions`. Commit: `feat(close-flow): migration 013 — touchpoint_type{close} + actual_spend_cents + spend_notes + close_card RPC`.
2. **T2: `POST /api/card/[id]/close` route + tests.** ⟶ Depends on T1 (RPC exists, enum extended, columns exist). Multipart form handler with auth + validation + Storage upload + RPC call. ~14 route tests covering the full envelope matrix.
3. **T3: `<CloseCardForm />` client component + tests.** ⟶ Depends on T2 (POST route). "Mark as closed" button → expand → inline form → POST. PostHog events. ~12 tests.
4. **T4: `<ClosedView />` + `<BeforeAfterPhotos />` server components + tests.** Independent of T2/T3 (pure data rendering). `<ClosedView />` composes severity chip + closed chip + date + spend + photo pair + thread. `<BeforeAfterPhotos />` handles the four photo-present/absent states. ~16 component tests total.
5. **T5: `<PlannedView />` extension.** Depends on T3. Mount `<CloseCardForm />` below `<ReminderEditor />` in the JSX. Extend existing test with 2+ new cases.
6. **T6: `cards/[id]/page.tsx` closed-state wiring.** Depends on T1 (types), T4 (ClosedView + BeforeAfterPhotos). Extend `CardRow` + SELECT list with `actual_spend_cents` + `spend_notes`; replace the closed-state stub with `<ClosedView />`; add close-photo signed URL queries. Extend existing test with 4+ new cases.
7. **T7: `apps/web/e2e/close-flow.spec.ts`.** Depends on T2, T3, T4, T5, T6. The 5-case Playwright spec per § Tests § E2E.
8. **T8: Docs.** CLAUDE.md path-map + Gotchas, METRICS.md events, PLAN.md bookkeeping. Final commit.

## Gotchas

These are the load-bearing traps for this PR. The ones not already documented get folded into CLAUDE.md § Gotchas as part of T8.

1. **`touchpoint_type` rename-recreate has NO function-dependency dance** — unlike `card_state` in migration 011, no functions reference `touchpoint_type` in their return-type signatures. The `card_photos.touchpoint_type` column is the only dependent; the recast `using touchpoint_type::text::public.touchpoint_type` handles it. Do NOT add a DROP FUNCTION step for this enum — there are none to drop.

2. **Photo upload BEFORE the RPC call — photo-first, state-second.** The route uploads the photo to Storage + INSERTs `card_photos` BEFORE calling `close_card`. This mirrors `POST /api/card`'s posture (photo upload after cap claim). The reason is: if the photo upload fails, we still want to close the card (the spend log is the primary data; the photo is "encouraged" not required). If the RPC fails AFTER the photo upload, we have an orphaned photo — acceptable (Storage has lifecycle policies; `card_photos` row is orphaned but harmless). The reverse order (RPC first, then photo) would close the card and then fail the photo — the user would need to re-open to add the photo, but CLOSED is terminal. Photo-first is the correct order.

3. **`spend_amount_cents` is transmitted as a string in FormData, not a number.** `formData.get('spend_amount_cents')` returns a string. The route handler must `parseInt(value, 10)` and reject NaN. Empty string / absent field → null (no spend). The client converts dollars to cents via `Math.round(parseFloat(dollarValue) * 100)` before setting the FormData field. Do NOT trust the client's conversion — the server re-validates.

4. **`close_card` RPC predicate-guards on `state = 'planned'` ONLY — not `IN ('decide', 'planned')`.** This is intentionally stricter than `commit_decide`. Close is a terminal transition; there's no "re-open from closed" in v0. A card in `decide` state has not been committed to a path yet and should not be closeable. Test the rejection explicitly for all non-planned states.

5. **Signed URLs for the before/after pair expire after 10 minutes (same TTL as the existing capture photo on the card detail page).** The page is server-rendered; the signed URL is fresh on each visit. No client-side refresh of expired URLs is needed.

6. **Dollar-to-cents float trap.** `0.1 + 0.2 === 0.30000000000000004` in JS. The client computes `Math.round(parseFloat(value) * 100)` — `Math.round` absorbs the float dust. The server stores `int` (cents) and never does float arithmetic. Display-time: `(actual_spend_cents / 100).toFixed(2)` for the "$XX.XX" label in `<ClosedView />`. Do not use `(cents / 100).toString()` — it drops trailing zeros ("$85.5" instead of "$85.50").

7. **`cards.closed_at` is already in the schema since migration 002 but was never populated until this PR.** The `close_card` RPC writes `closed_at = now()`. Existing cards (all in states before closed) have `closed_at IS NULL`. The `<ClosedView />` handles null `closed_at` gracefully (suppresses the date line).

8. **`days_in_planned` in the `card_closed` PostHog event is approximate.** There's no `planned_entered_at` timestamp column. The best proxy: `Math.floor((Date.now() - new Date(card.updated_at).getTime()) / 86400000)`. `cards.updated_at` is bumped by `commit_decide` when entering planned, but also by reminder set/edit/clear (the `cards_updated_at` BEFORE UPDATE trigger from migration 005 fires on every row touch). For v0 with very few users, the imprecision from reminder ops (typically same-session, < 1 day error) is acceptable. If higher precision is needed later, a `planned_entered_at timestamptz` column can be added to `cards` and backfilled from `updated_at` at migration time.

9. **`<CloseCardForm />` fires `card_close_started` on EVERY expand, not once-per-session.** Unlike `decide_view_opened` (which deduplicates via sessionStorage), each "Mark as closed" tap is a fresh intent signal. A user who expands, cancels, and re-expands fires the event twice — this is the correct behavior for measuring friction (how many attempts before success?).

10. **`touchpoint_id` for the close photo is generated SERVER-SIDE via `crypto.randomUUID()`.** Unlike the capture flow (where the client generates `touchpoint_id` for offline-readiness), the close flow is online-only. The server generates the UUID to avoid client-fabricated UUIDs and simplifies the FormData contract (no `touchpoint_id` field in the multipart body).

11. **The existing `cards/[id]/page.tsx` already queries `closed_at` in the SELECT list — verify it's present.** The SELECT string from the page already includes `closed_at`. This PR adds `actual_spend_cents` and `spend_notes` to the SELECT. The `CardRow` type must be extended to include both new fields.

12. **Path-map freshness hook — T8 must touch CLAUDE.md.** Same trap as prior PRs: the freshness hook blocks PRs that add a triggering surface without updating CLAUDE.md § Where Things Happen. This PR adds: 1 route + 3 components + 1 migration — all triggering. T8's commit must update CLAUDE.md.

## Acceptance criteria

- Local `pnpm db:reset` applies migration 013 cleanly on a fresh database (no errors, no warnings).
- A planned-state card renders `<CloseCardForm />` (collapsed "Mark as closed" button) below the reminder editor.
- Expanding the form, entering spend + notes + photo, and clicking "Close this card" transitions the card to `state='closed'` with `actual_spend_cents`, `spend_notes`, and a `card_photos` row with `touchpoint_type='close'` populated.
- The page refreshes to `<ClosedView />` showing: severity chip, calm-green "Closed" chip, "Closed on [date]", before/after photo pair, spend log, and "How we diagnosed this" collapsible.
- Closing without spend or photo succeeds (all fields optional).
- Photo upload failure does not block the close transition — card closes without the photo, Sentry captures the upload error.
- `POST /api/card/[id]/close` rejects with 409 `invalid_state` on all non-planned states.
- Both PostHog events fire with the documented prop shapes (verified via E2E posthog-js instrumentation).
- Existing `<PlannedView />` test still passes (additive JSX insertion); existing `cards/[id]/page.tsx` test still passes.
- `pnpm turbo run lint typecheck test:unit build` passes locally.
- CI fast-job + slow-job green; Vercel preview deploys; closing a planned card on the preview produces the full ClosedView.

## Rollout / rollback

**Rollout** (post-merge to main):

1. `.github/workflows/deploy-migrations.yml` auto-applies migration 013 on push to main (additive — no production downtime; no data backfill). The `touchpoint_type` rename-recreate is transaction-safe and the three existing values round-trip cleanly.
2. Vercel auto-deploys the web app with the new route + components.
3. Existing planned-state cards get the new `actual_spend_cents=NULL` + `spend_notes=NULL` defaults automatically; no backfill needed.
4. Production smoke: navigate to a planned-state card, tap "Mark as closed", enter spend + notes + photo, confirm. Verify ClosedView renders with the before/after pair + spend log + "Closed" chip.

**Rollback** (if the new route / components fail in production):

1. Revert the merge commit on main. Vercel re-deploys the previous bundle.
2. Migration 013 stays applied (rolling back the schema would drop `actual_spend_cents`, `spend_notes`, the `'close'` enum value from `touchpoint_type`, and the `close_card` function). Forward-fix the route / component bugs; do not roll back the schema. The rollback recipe is in the commented section of the migration file, reserved for a true schema crisis.
3. The old code path (PR #28) renders the one-line "Card closed on [date]" stub for closed cards. After rollback the new columns still exist but no code path reads or writes them — entirely inert. The `'close'` touchpoint type value exists in the enum but no code path inserts rows with it after rollback.

**Forward-only follow-ups** — none deferred to a later PR within `close-flow` scope. Photo comparison enhancements (sync zoom, bounce mode) ship in PR #6. Dashboard closed-card tier ships in PR #5. Spend analytics are post-v0.
