<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: capture-flow -->
<!-- date: 2026-05-13 -->

# Spec: capture-flow (PR 3)

**Sources:**

- `PLAN.md § Planned row 1` (`capture-flow`) — primary scope summary
- `.gstack/ceo-review-home-os-2026-05-01-r2.md § Scope (CAPTURE)` + § Decisions Resolved Now (#3, #5) — product + DISMISS framing
- `.gstack/eng-review-home-os-2026-05-01.md § Build Order step 4` + § Data Model + § Error Rescue Map (#1, #2, #3, #9) — architecture + failure modes
- `.gstack/design-review-home-os-2026-05-02.md § Card Model` + § Interaction States (DISMISS Flow) + § Card States (TRIAGE_PENDING) — UX
- `.gstack/pwa-spike-result.md § 1 (Camera Path A → Ship)` + § Spike follow-ups for `capture-flow` — camera capability + upload-success polish
- Shipped surfaces on main: PR #9 schema (`supabase/migrations/{001..005}_*.sql`), PR #10 auth (`apps/web/app/(app)/{layout,home/page}.tsx`, `apps/web/middleware.ts`)
- Prior spec `specs/auth-magic-link/spec.md` — style + structure reference

The CAPTURE flow: a photo (optional) + required description + system tag + room tag, behind a card-cap check (20/wk, atomic via Postgres function), with client-side preservation on cap-hit, a "new issue or update?" picker, and the DISMISS-state surface (list view + restore) wired so the lifecycle is reversible from day one.

---

## Decisions (resolved at spec time)

13 `/ak-spec`-time decisions resolved in Phase 0 with the user. Recorded below so Phase 1 preserves them verbatim and a crashed Phase 1 resumes without re-asking.

### D1: Route shape — `/(app)/capture` + Capture CTA on `/(app)/home`

**Decision:** The form lives at `apps/web/app/(app)/capture/page.tsx` (server shell + `'use client'` form child). A minimal "+ Capture" CTA on `/(app)/home` is the only entry point until `dashboard` (row #9) replaces `/home`.

**Rationale:** Mirrors auth PR D3 — `(app)/` route group is the authenticated shell, route group adds no URL segment. Single route, mobile-first PWA. The CTA-on-home approach also gives `dashboard` a clean handoff later (it owns `/home` next).

### D2: Schema extensions — migration 006 in this PR

**Decision:** Add `supabase/migrations/<ts>_006_capture_flow.sql` extending PR #9's schema with what `capture-flow` needs:

1. `alter table public.cards add column room_tag text` (eng-review specs "room + system" location; PR #9 left this out)
2. `alter type card_state add value 'dismissed'` — the DISMISSED terminal state per design-review (PR #9's enum omitted it)
3. `alter table public.usage_counters add column week_start date not null default date_trunc('week', (now() at time zone 'utc'))::date` — Monday-UTC week anchor for the 20/wk cap (eng-review § Business Logic Usage limits)
4. `alter table public.cards add constraint cards_description_max_length check (initial_description is null or char_length(initial_description) <= 2000)` (D12)
5. `create or replace function public.claim_card_slot(...)` (D3) — atomic week-rollover + counter increment + INSERT
6. RLS: grant the function `security definer` with `search_path = public, pg_catalog` (pinned per PR #9 convention)

**Rationale:** Each item is a strict prerequisite for the user-visible scope in PLAN row 1. ALTER TYPE ADD VALUE is supported from Postgres 12+ and works outside a transaction block (the only constraint; migration runner handles this). Adding the migration in this PR keeps the feature self-contained.

### D3: Card-cap enforcement — atomic Postgres function `claim_card_slot`

**Decision:** Cap enforcement lives in a `security definer` Postgres function called via Supabase RPC from a Next route handler. Pseudocode:

```sql
function public.claim_card_slot(p_user uuid, p_title text, p_description text,
                                 p_system_tag system_tag, p_room_tag text)
returns table (card_id uuid, card_count_after int)
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare
  v_monday date := date_trunc('week', (now() at time zone 'utc'))::date;
  v_count int;
begin
  -- upsert + week-rollover in one statement
  insert into usage_counters (user_id, card_count, week_start, updated_at)
    values (p_user, 0, v_monday, now())
  on conflict (user_id) do update
    set card_count = case when usage_counters.week_start = v_monday
                          then usage_counters.card_count
                          else 0 end,
        week_start = v_monday,
        updated_at = now()
  returning card_count into v_count;

  if v_count >= 20 then
    raise exception 'card_cap_reached' using errcode = 'P0001';
  end if;

  update usage_counters set card_count = card_count + 1, updated_at = now()
    where user_id = p_user
    returning card_count into v_count;

  return query
    insert into cards (user_id, title, initial_description, system_tag, room_tag, state)
    values (p_user, p_title, p_description, p_system_tag, p_room_tag, 'capturing')
    returning id, v_count;
end;
$$;
```

The route handler additionally enforces `auth.uid() = p_user` (defense-in-depth — RLS will already reject mismatched access in callers). Photo upload happens AFTER successful claim. On `card_cap_reached`, route handler returns 429 with `{ error: 'card_cap_reached', resets_on: '<next-monday-iso>' }`.

**Rationale:** Single source of truth for the 20/wk cap. Eliminates the race where two concurrent submits each see 19/20 and both succeed. Photo-upload-after-claim eliminates orphan Storage files (eng-review § Rescue #3). 429 is the semantically correct HTTP code for rate-limited.

### D4: "New issue or update?" prompt + picker

**Decision:** A two-button inline toggle at the top of the capture form (default: "New issue"). Tapping "Update existing" expands a card picker rendered as a server component listing the user's cards in non-`closed`, non-`dismissed` state, sorted `updated_at desc`, with a search input shown when `count > 5`. Each row shows: title, system_tag icon, last-updated date, state chip.

Picking a card from the picker submits to `/(app)/capture?cardId=<id>` — but since the update / check-in flow ships in `monitor-beta` (row #7), this PR renders the picker UI but the cardId path falls through to a non-blocking notice: "Updating existing cards ships in the next release — for now, please create a new card." (no error, just informative). The picker UI is exercised end-to-end; only the post-pick submit defers.

**Rationale:** Design-review § Card Model spells out the picker. PLAN row 1 includes it. Building the surface here (since DISMISS list view shares the row layout) without wiring its check-in submit keeps the PR scoped to "new card" while satisfying the PLAN row requirement.

### D5: Photo capture — Path A only

**Decision:** Single mechanism: `<input type="file" accept="image/*" capture="environment">`. No `getUserMedia` Path B (deferred per pwa-spike result § 2). Photo is OPTIONAL — submit succeeds with no photo, card is created without a `card_photos` row, card detail invites adding one later (design-review § CAPTURE failures #1, #12).

After capture: show preview thumbnail + file size readout + ✓ "Uploaded" chip once Storage POST resolves (pwa-spike § Spike follow-ups for capture-flow #1 — make upload feedback explicit).

**Rationale:** Pwa-spike § 1 validated Path A delivers full-sensor JPEG on iOS Safari. Spike § Spike follow-ups names the explicit-success-feedback gap.

### D6: Required vs optional fields

**Decision:**

- **Required**: `initial_description` (non-empty after trim, ≤ 2000 chars per D12), `system_tag` (one of the 9 enum values), `room_tag` (free-text room name, ≤ 80 chars per validation).
- **Optional**: photo.

Client form blocks submit until required fields are valid; server route handler also validates pre-RPC.

**Rationale:** Triage runs on `initial_description` if photo fails. System tag is the primary categorization signal. Room tag is mandatory because the eng + design reviews consistently spec "location tag (room + system)" — both halves.

### D7: Async-queued state — card lands in `capturing`

**Decision:** Newly created cards land in `state = 'capturing'` (the existing default). This PR does **not** call `/api/triage` (row #2 wires that). Card detail UI shows the "Reading your capture…" progressive-loading chip per design-review § Card States (TRIAGE_PENDING), but no triage POST fires — the chip is the placeholder state. When row #2 ships, its capture-completed-side-effect hook transitions cards from `capturing` → `triaging`.

**Rationale:** Cleanest deferral — schema default already matches, no transient extra state needed. The eng-review treats `capturing` as the "initial-read pending" state and `triaging` as the post-call-to-Anthropic state.

### D8: DISMISS UX scope in this PR

**Decision:** Ship in this PR:

1. `apps/web/app/(app)/dismissed/page.tsx` — server component listing the user's dismissed cards (`state = 'dismissed'`), sorted `updated_at desc`. Empty state: "Nothing dismissed yet."
2. Restore inline-confirm strip (symmetric with design-review § DISMISS Flow's strip): "Restoring will start a new AI triage session — these are limited. [Restore] [Cancel]". Limit-reached variant: "You've hit the weekly cap — restoring will queue triage until Monday."
3. `POST /api/card/[id]/restore` — flips state back to `capturing`. (The 5/wk triage cap belongs to row #11 `usage-counters-and-byok`; this PR's restore does not count against triage sessions because they don't exist yet. The card-creation cap also doesn't fire on restore because no new card is inserted.)

Defer to future rows: the "Tap DISMISS" button face (lives on DECIDE in row #4 + MONITOR in row #7); the actual DISMISS-from-DECIDE confirm flow.

**Rationale:** Validates DISMISS as a first-class state with reversible UX (ceo-review D3: "Design DISMISS UX before implementing CAPTURE") without requiring DECIDE/MONITOR. Tests seed dismissed cards directly. Restore's "what triage session does this consume?" copy will tighten when row #11 ships — flagged in spec § Open follow-ups.

### D9: METRICS events — 3 new posthog capture sites

**Decision:** Three new `posthog.capture` events fired from the client:

1. `capture_started` — fires once on capture form mount per session. Properties: `{}`.
2. `capture_completed` — fires after successful `POST /api/card` returns 201 + photo upload (if any) resolves. Properties: `{ has_photo: boolean, system_tag: string, room_tag_length: number, is_update: false }`. (`is_update` will land `true` when row #7 wires check-ins.)
3. `capture_cap_hit` — fires when the route handler returns `card_cap_reached`. Properties: `{ resets_on: string }`.

All three additions land in `METRICS.md § Events` per the authoring rules. No Sentry-side events (no new error classes; existing `Sentry.captureException` patterns cover failures).

**Rationale:** Auth PR funnel pattern. `capture_cap_hit` is the leading indicator of friction that says "the user wants to keep capturing but the cap blocks them" — high signal for whether 20/wk is the right number. `is_update` placeholder reserves the property shape for row #7 without a future METRICS.md edit.

### D10: Storage layout — `touchpoint_type='primary'`, `slot='wide'`

**Decision:** One `card_photos` row per CAPTURE photo. `touchpoint_type='primary'`, `slot='wide'`. Path: `{user_id}/cards/{card_id}/touchpoints/{touchpoint_id}/wide.jpg`. `touchpoint_id` is a fresh uuid generated client-side and passed through the route handler so the photo row + the cards row reference the same touchpoint.

**Rationale:** PR #9's enum values are `primary | context | closeup` and `wide | medium | closeup` — `primary` + `wide` is the natural "the photo at capture-time" combo. Storage RLS already gates writes to `{auth.uid()}/...` per PR #9 § Storage policies.

### D11: Client-side preservation on cap-hit

**Decision:** When the route handler returns 429 `{ error: 'card_cap_reached', resets_on }`:

- Form fields (description, system_tag, room_tag, photo blob in component state) are preserved untouched.
- Submit button is replaced with a banner: "You've logged 20 issues this week — cap resets <human-date>. Your description and photo are saved here."
- No Storage upload has happened yet (claim_card_slot runs first), so there's nothing to roll back.
- A "Save for later" link is intentionally NOT added in this PR — no draft persistence (would need a `drafts` table); the React state is the preservation surface. Refresh loses the draft. Trade-off accepted: the cap is hit infrequently in v0; full draft persistence is out of scope.

**Rationale:** PLAN row 1 mandates "client-side preservation on cap-hit." Eng-review § Rescue #3 + #9 frame it the same way. Saving photo-blob-as-base64 to localStorage was considered and rejected (multi-MB blob → quota issues + privacy footprint).

### D12: Description CHECK constraint — 2000 chars

**Decision:** Add `check (initial_description is null or char_length(initial_description) <= 2000)` to `public.cards` in migration 006. Client uses `<textarea maxLength={2000}>`. Route handler also validates pre-RPC.

**Rationale:** Defense in depth. 2000 chars is generous for a paragraph of context. Bounded so a misbehaving client can't fill up rows.

### D13: Form layout

**Decision:** Single screen, stacked fields, mobile-first:

1. New/Update toggle (D4)
2. Description textarea (D6 — required, 2000-char max)
3. Photo button (D5 — optional, Path A, preview + ✓ chip on upload)
4. System tag select (D6 — required, native `<select>` with 9 options from the enum)
5. Room tag text input (D6 — required, 80-char max)
6. Submit button (disabled until required fields valid)

Form uses progressive enhancement: server component renders the shell, client child handles state + photo + submit. No multi-step wizard.

**Rationale:** Design-review favors single-screen calm — keeps cognitive load low. Field order leads with description (the highest-information field) and ends with the lowest-info-required (room tag). Photo placement after description matches the natural "tell me what's going on, then optionally show me" flow.

---

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens, Data
     model changes, API contracts, Offline behavior, Metrics, Files to
     create/modify, Tests, Dependencies, Task order, Gotchas, Acceptance /
     rollout / rollback. The Decisions section above stays verbatim. -->

## Core user story

A signed-in homeowner lands on `/home` (the minimal authenticated landing from PR #10) and taps the "+ Capture" CTA (D1). The browser navigates to `/(app)/capture` — a server-rendered shell that mounts the `'use client'` `<CaptureForm />` child. PostHog fires `capture_started` once on mount (D9). The homeowner toggles between "New issue" (default) and "Update existing"; tapping "Update existing" expands the existing-card picker (D4) — a server-rendered list of their non-`closed`, non-`dismissed` cards sorted `updated_at desc`, searchable when count > 5. (Picking a card routes to `/capture?cardId=<id>` and shows a non-blocking notice that update flows ship in `monitor-beta` row #7 — D4.) For a new issue, the homeowner writes a description (required, ≤ 2000 chars per D6/D12), optionally captures a photo via `<input type="file" accept="image/*" capture="environment">` (D5 — Path A only), picks a system tag (required, native `<select>` over the 9 enum values per D6), and types a free-text room tag (required, ≤ 80 chars per D6). They tap Submit.

The client posts `multipart/form-data` to `POST /api/card` carrying description + system_tag + room_tag + a client-generated `touchpoint_id` (uuid) + the optional photo blob. The route handler validates inputs (defense-in-depth per D6/D12), then calls `supabase.rpc('claim_card_slot', { p_user, p_title, p_description, p_system_tag, p_room_tag })` (D3). The Postgres function atomically week-rolls the user's `usage_counters` row, raises `card_cap_reached` (P0001) if `card_count >= 20`, otherwise increments the counter and inserts the `cards` row in `state = 'capturing'` (D7). On success, the handler uploads the photo (if present) to `card-photos/{user_id}/cards/{card_id}/touchpoints/{touchpoint_id}/wide.jpg` (D10), inserts the matching `card_photos` row with `touchpoint_type='primary' / slot='wide'`, and returns 201 `{ card_id, card_count_after }`. The client fires `capture_completed` (D9) and routes back to `/home`.

If `claim_card_slot` raises `card_cap_reached`, the handler returns 429 `{ error: 'card_cap_reached', resets_on: '<next-monday-iso>' }` BEFORE any storage upload runs (no orphan file possible per D3 + eng-review § Rescue #3). The form swaps Submit for a banner ("You've logged 20 issues this week — cap resets <human-date>. Your description and photo are saved here.") and fires `capture_cap_hit` (D9). All form state — including the photo blob in component state — is preserved (D11). A refresh loses the draft (D11 trade-off accepted).

Separately, a homeowner who has dismissed cards in earlier flows (seeded directly today since DECIDE hasn't shipped) can navigate to `/(app)/dismissed`. The server-rendered list shows their `state = 'dismissed'` cards, sorted `updated_at desc`, with the design-review § DISMISS Flow's symmetric inline-confirm strip on each card: "Restoring will start a new AI triage session — these are limited. [Restore] [Cancel]" (D8). Tapping Restore POSTs to `/api/card/[id]/restore`, which flips the card back to `state = 'capturing'`. The list re-renders without the restored card. (Restore does NOT count against the card cap — no new row is inserted — and does not count against triage sessions because none exist yet in v0; D8.)

## In scope

This PR ships, atomically:

1. **Migration 006** — `supabase/migrations/<ts>_006_capture_flow.sql` extending PR #9's schema per D2: `cards.room_tag text`, `card_state` enum gets the `'dismissed'` value, `usage_counters.week_start date NOT NULL DEFAULT ...`, the `cards_description_max_length` CHECK constraint (D12), and the SECURITY DEFINER `claim_card_slot` function (D3) with `set search_path = public, pg_catalog`.
2. **Regenerated types** — `packages/core/src/supabase.types.ts` rebuilt from the local stack so `Database['public']['Tables']['cards']['Row'].room_tag`, the new `card_state` literal `'dismissed'`, and `Database['public']['Functions']['claim_card_slot']` are all typed.
3. **`POST /api/card` route handler** — `apps/web/app/api/card/route.ts`. Accepts `multipart/form-data` (description + system_tag + room_tag + touchpoint_id + optional photo). Auth via `supabase.auth.getUser()`. Validates server-side. Calls `claim_card_slot` RPC (D3). On success uploads photo (if present) to Storage (D10) and inserts `card_photos` row. Returns 201 `{ card_id, card_count_after }` or 429 `{ error: 'card_cap_reached', resets_on }`. (D3, D6, D10, D11)
4. **`POST /api/card/[id]/restore` route handler** — `apps/web/app/api/card/[id]/restore/route.ts`. Auth-gated. Verifies the card is owned by the caller AND currently in `state = 'dismissed'`. Updates `state = 'capturing'` via the user-context Supabase client (RLS-enforced). Returns 200 `{ card_id }` or 404 `{ error: 'not_found' }` / 409 `{ error: 'invalid_state' }`. (D8)
5. **`CaptureForm` client component** — `apps/web/app/(app)/capture/_components/CaptureForm.tsx`. `'use client'`. Holds form state including the photo blob (per D11). Fires `capture_started` once on mount via a `useEffect` ref-guard. On submit, POSTs to `/api/card` and routes back to `/home` on 201. On 429 shows the cap-hit banner without resetting state. (D5, D6, D9, D11, D13)
6. **Capture page server shell + existing-card picker** — `apps/web/app/(app)/capture/page.tsx` (server component). Mounts `<CaptureForm />`. When `searchParams.cardId` is set, renders the non-blocking "updates ship in the next release" notice instead (D4). The existing-card picker is server-rendered as `apps/web/app/(app)/capture/_components/ExistingCardPicker.tsx` (server component) — fetches user's non-`closed`/`dismissed` cards via the SSR Supabase client, sorts `updated_at desc`, shows a search input when `count > 5`. (D4)
7. **Dismissed list + Restore inline-confirm** — `apps/web/app/(app)/dismissed/page.tsx` (server component) renders the user's dismissed cards. Each row mounts `apps/web/app/(app)/dismissed/_components/RestoreStrip.tsx` (`'use client'`) that handles the inline confirm + POST to `/api/card/[id]/restore`. Empty state copy: "Nothing dismissed yet." (D8)
8. **`/home` Capture CTA** — modify `apps/web/app/(app)/home/page.tsx` to add the "+ Capture" link to `/capture`. Minimal styling; this is the only entry point until `dashboard` (row #9) replaces `/home`. (D1)
9. **METRICS.md** — append three new rows for `capture_started`, `capture_completed`, `capture_cap_hit` (D9).
10. **CLAUDE.md § Where Things Happen** — append entries for the migration, the capture page + form + picker, the dismissed page + restore strip, the two route handlers, and the regenerated types.
11. **Middleware gated-prefix extension** — `apps/web/middleware.ts` `GATED_PREFIXES` adds `/capture` and `/dismissed` so anonymous hits bounce to `/login?next=<path>`. (The `(app)` route group is _not_ a URL segment, so the prefix list is the enforcement surface — see D6 of `auth-magic-link/spec.md`.) Unit-extend `apps/web/middleware.test.ts` accordingly.
12. **E2E** — `apps/web/e2e/capture-flow.spec.ts` (new) full round-trip + `apps/web/e2e/rls-isolation.spec.ts` (modify) extended to cover migration 006's columns (`room_tag` on cards, `week_start` on usage_counters) and the `claim_card_slot` RPC.

## Out of scope (deferred)

Explicit non-goals — surfaced now so a reviewer doesn't ask "where's X?":

- **Triage call from capture submit** — D7. New cards land in `state = 'capturing'` and stay there until `triage-route-handler` (row #2) wires the side-effect transition to `triaging`. The card detail "Reading your capture…" chip per design-review § TRIAGE_PENDING is a row-#2 concern, not this PR's; this PR's surface is the form + the lifecycle bookkeeping.
- **Update / check-in submit path** — D4. The existing-card picker UI ships fully exercised here, but the post-pick path (POST a check-in touchpoint against an existing card) ships in `monitor-beta` (row #7). The `cardId` query parameter falls through to a non-blocking notice in this PR.
- **DISMISS-from-DECIDE entry** — D8. The "Tap DISMISS" button face lives on DECIDE (row #4) and MONITOR (row #7). This PR ships the destination surface (list + restore) only. Tests seed `state = 'dismissed'` rows directly via the admin client.
- **Draft persistence on refresh** — D11. The cap-hit banner preserves React state, not localStorage. Photo-blob-as-base64 in localStorage was considered and rejected (multi-MB quota issues + privacy footprint). Refresh loses the draft. Full drafts ship later if we add a `drafts` table.
- **Triage-session cap copy on restore** — D8. The 5/wk triage cap is owned by `usage-counters-and-byok` (row #11). This PR's restore-strip copy is the design-review § Restore From DISMISSED standard text; the precise "you've hit the weekly cap" variant ships when that cap exists.
- **Camera Path B (`getUserMedia`)** — D5. Spike § 1 picked Path A. Path B is deferred unless a future use case forces it.
- **Photo compression / resize** — D5 + ceo-review D5 ("Full resolution, no compression"). Upload the file as-is. Storage RLS sized at user scope.
- **`apps/web/app/(app)/spike/**`cleanup** — operator-only surface from`pwa-spike`; per BUILD-LOG TODO it gets removed in `photo-comparison-ui` (row #9) alongside the bundled sample JPEGs. Not this PR's surface.

## Screens

### `/(app)/capture` (authenticated)

**Purpose:** The only place a homeowner creates a new card (D1). Mobile-first, single-screen, stacked fields (D13).

**Visual hierarchy (design-review § Information Architecture):**

- Primary: Description textarea — the highest-information field, leads the form per D13.
- Secondary: Photo button + preview thumbnail + "✓ Uploaded" chip on success (D5). System tag `<select>` and room tag input below the photo block.
- Tertiary: New/Update toggle at the top — present but visually quiet (a two-button inline toggle, default "New issue", per D4). When "Update existing" is selected, the picker takes over the body and the rest of the form collapses (D4).
- Submit button at the bottom — disabled until the three required fields validate (D6).

**Key elements (D5, D6, D9, D11, D13):**

- New/Update toggle (D4): two `<button type="button">` toggles in an `aria-label="Capture mode"` group. Default `aria-pressed="true"` on "New issue".
- Description: `<textarea name="description" required maxLength={2000}>` (D6 + D12). Inline character counter shown when length > 1500.
- Photo: `<input type="file" name="photo" accept="image/*" capture="environment">` rendered as a styled label (D5 — Path A). On change, `FileReader` populates a `<img>` preview + the file's byte size. The blob stays in React state until submit (D11). After submit upload completes, the label swaps to a "✓ Uploaded" chip (D5 — pwa-spike § Spike follow-up #1).
- System tag: `<select name="system_tag" required>` with the 9 options from the `system_tag` enum (`plumbing`, `electrical`, `hvac`, `roof`, `exterior`, `interior`, `appliance`, `safety`, `other`) — D6.
- Room tag: `<input name="room_tag" type="text" required maxLength={80}>` (D6).
- Submit: `<button type="submit" disabled={!isValid || stage === 'submitting'}>Save card</button>`.
- `capture_started` (D9) fires once on mount via a `useEffect(() => { ... }, [])` + a `useRef` guard.

**Copy hints:**

- Heading: "Capture an issue"
- Subhead (calm-authority, OVERVIEW.md): "What's going on? Add a photo if you've got one."
- Submit button (idle): "Save card"
- Submit button (in-flight): "Saving…" (`aria-disabled` during the await)
- Cap-hit banner (D11): "You've logged 20 issues this week — cap resets **{human-date}**. Your description and photo are saved here."
- Update-mode notice (D4): "Updating existing cards ships in the next release — for now, please create a new card."

**Error states:**

- 429 `card_cap_reached` → banner replaces Submit; form fields stay; `capture_cap_hit` fires (D9, D11).
- Network error mid-POST → generic copy ("Couldn't save — try again in a moment."), photo blob and fields preserved.
- Server validation rejection (400) → inline error under the offending field; PII-free Sentry capture.
- Photo upload failure AFTER card insert succeeds → card persists without a photo row, banner: "Card saved — photo didn't upload. You can add one later." (eng-review § Rescue #1; matches D5 "photo optional" posture.)

### `/(app)/capture?cardId=<uuid>` (authenticated, update-mode landing)

**Purpose:** The post-pick fallthrough state from D4. UI is the picker's chosen card surfaced as a non-blocking notice. No form rendered.

**Key elements:**

- A `<section>` with the picked card's title, system tag, and last-updated date.
- Notice copy: "Updating existing cards ships in the next release — for now, please [create a new card](/capture)."
- No form, no buttons beyond the link back to `/capture`.

### `/(app)/dismissed` (authenticated)

**Purpose:** The DISMISS state's destination surface — list + restore (D8). Validates DISMISS as a first-class, reversible state per ceo-review D3.

**Visual hierarchy:**

- Primary: One card row per dismissed card. Each row shows: title, system_tag icon, dismissed-date, and the symmetric inline-confirm strip (D8 — design-review § DISMISS Flow).
- Secondary: Empty state copy when no dismissed cards exist.
- Tertiary: None — this is a focused utility surface.

**Key elements (D8):**

- Page heading: "Dismissed"
- Each row's RestoreStrip (`'use client'`) shows two buttons: `[Restore]` `[Cancel]`. Default "collapsed" state: the strip shows only a "Restore" trigger; tap expands it to the confirm strip with the copy "Restoring will start a new AI triage session — these are limited." Tap Restore → POST to `/api/card/[id]/restore`; on 200 the row removes itself from the DOM (optimistic update) and a small toast announces "Restored — find it on /home." (Toast omission acceptable in v0; the row removal IS the confirmation per design-review § PLANNED Confirmation analog.)
- Empty state: "Nothing dismissed yet."

**Copy hints:**

- Restore button face: "Restore"
- Confirm strip body: "Restoring will start a new AI triage session — these are limited."
- Restored-toast: "Restored — find it under your active cards."

**Error states:**

- 404 from restore POST → row stays; small inline error "Card not found." (Defensive — a tampered DOM id would land here.)
- 409 from restore POST → row stays; inline error "Card is not in a dismissed state." (Race with another tab.)
- Network error → inline error "Couldn't restore — try again in a moment."

## Data model changes

Migration 006 (`supabase/migrations/<ts>_006_capture_flow.sql`) extends the shipped schema. **Note (gotcha § Gotchas):** `ALTER TYPE ... ADD VALUE` cannot run inside a transaction in Postgres < 12 _and_ the Supabase CLI wraps each `.sql` file in a transaction by default. The `ADD VALUE` statement must be in its own file or paired with `BEGIN; COMMIT;` discipline. Cleanest path: a SECOND migration file `<ts>_006a_card_state_dismissed.sql` containing **only** the `ALTER TYPE`, with `<ts>_006b_capture_flow.sql` carrying the rest. Both run in order via the migration runner. See § Gotchas for the operator note.

### `006a_card_state_dismissed.sql` — enum addition (D2 #2)

```sql
-- Migration 006a — extend card_state with the 'dismissed' terminal value.
-- Lives alone in its own file because ALTER TYPE ADD VALUE cannot run
-- inside a transaction; Supabase migrate wraps each file in a transaction.
-- Splitting keeps 006b atomic-and-transactional for everything else.

alter type public.card_state add value 'dismissed';

-- ROLLBACK: not supported for ALTER TYPE ... ADD VALUE in standard
-- Postgres. Recreating the enum without the value would orphan any
-- dependent column. Acceptable for v0 pre-launch.
```

### `006b_capture_flow.sql` — columns + constraint + RPC (D2 #1, #3, #4, #5, #6)

```sql
-- Migration 006b — capture-flow schema extensions.
-- Source: specs/capture-flow/spec.md § Data model changes.
--
-- Adds:
--   1. cards.room_tag column (D2 #1).
--   2. usage_counters.week_start column with default Monday-UTC anchor (D2 #3).
--   3. cards_description_max_length CHECK constraint (D2 #4 + D12).
--   4. public.claim_card_slot SECURITY DEFINER function (D2 #5 + D3).
-- Splits the 'dismissed' enum value into 006a per Postgres ALTER TYPE
-- transaction limitation (see § Gotchas in spec.md).

-- 1. cards.room_tag — free-text room name per D6. Optional in the DB;
-- the route handler validates non-empty + length ≤ 80 (defense in depth).
alter table public.cards
  add column room_tag text;

-- 2. usage_counters.week_start — Monday-UTC anchor used by claim_card_slot
-- (D3) to detect week rollover atomically. Default value is the current
-- Monday-UTC date so existing rows backfill cleanly.
alter table public.usage_counters
  add column week_start date not null
    default date_trunc('week', (now() at time zone 'utc'))::date;

-- 3. cards_description_max_length — D12. The route handler also validates
-- pre-RPC; this is the floor.
alter table public.cards
  add constraint cards_description_max_length
  check (
    initial_description is null
    or char_length(initial_description) <= 2000
  );

-- 4. claim_card_slot — atomic week-rollover + counter increment + INSERT,
-- per D3. Returns the new card id + post-increment count so the route
-- handler can render the right "X of 20" surface to the user.
create or replace function public.claim_card_slot(
  p_user uuid,
  p_title text,
  p_description text,
  p_system_tag system_tag,
  p_room_tag text
)
returns table (card_id uuid, card_count_after int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_monday date := date_trunc('week', (now() at time zone 'utc'))::date;
  v_count int;
begin
  -- upsert + week-rollover in one statement. The CASE expression resets
  -- card_count to 0 when week_start has rolled.
  insert into usage_counters (user_id, card_count, week_start, updated_at)
  values (p_user, 0, v_monday, now())
  on conflict (user_id) do update
    set card_count = case
          when usage_counters.week_start = v_monday
          then usage_counters.card_count
          else 0
        end,
        week_start = v_monday,
        updated_at = now()
  returning card_count into v_count;

  if v_count >= 20 then
    raise exception 'card_cap_reached' using errcode = 'P0001';
  end if;

  update usage_counters
    set card_count = card_count + 1,
        updated_at = now()
    where user_id = p_user
  returning card_count into v_count;

  return query
    insert into cards (
      user_id, title, initial_description, system_tag, room_tag, state
    )
    values (
      p_user, p_title, p_description, p_system_tag, p_room_tag, 'capturing'
    )
    returning id, v_count;
end;
$$;

-- ROLLBACK:
-- drop function if exists public.claim_card_slot(uuid, text, text, system_tag, text);
-- alter table public.cards drop constraint if exists cards_description_max_length;
-- alter table public.usage_counters drop column if exists week_start;
-- alter table public.cards drop column if exists room_tag;
-- (Note: ALTER TYPE ADD VALUE in 006a is not reversible — see 006a.)
```

**Storage:** No new bucket. Existing `card-photos` bucket + RLS from migration 004 covers the CAPTURE upload path (D10). Path remains `{user_id}/cards/{card_id}/touchpoints/{touchpoint_id}/wide.jpg`; the leading-segment RLS check guarantees a user can only upload under their own prefix.

**RLS posture for `claim_card_slot`:** The function is `security definer` (D3) so it bypasses RLS for the privileged `usage_counters` row read + the `cards` INSERT. The route handler enforces `auth.uid() = p_user` BEFORE calling the RPC (defense in depth — a future caller that passes a foreign uid would be rejected at handler level even before hitting the function). `set search_path = public, pg_catalog` matches the PR #9 trigger convention (migration 005).

## API contracts

Two new HTTP surfaces.

### `POST /api/card`

**Input:** `multipart/form-data`:

- `description: string` (required, ≤ 2000 chars after trim, non-empty after trim).
- `system_tag: string` (required, one of the 9 enum values).
- `room_tag: string` (required, ≤ 80 chars after trim, non-empty after trim).
- `touchpoint_id: string` (required, valid uuid v4 — client-generated; the photo row + the cards row reference this same touchpoint per D10).
- `photo: File` (optional). MIME type must start with `image/`.

**Auth:** session cookie via `apps/web/lib/supabase/server.ts`. `supabase.auth.getUser()` is the gate; returns 401 `{ error: 'unauthorized' }` on null.

**Behavior:**

1. Auth check; reject 401 on missing user.
2. Validate inputs server-side (D6). Reject 400 `{ error: 'validation_failed', fields: { ... } }` on any mismatch.
3. `supabase.rpc('claim_card_slot', { p_user: user.id, p_title: <derived>, p_description, p_system_tag, p_room_tag })` (D3). Title is derived: first 80 chars of description, trimmed to the last whitespace boundary, suffixed with `…` if truncated. (No separate title field in the form per D13.)
4. On Postgres exception `card_cap_reached` (errcode P0001) → return 429 `{ error: 'card_cap_reached', resets_on: '<next-monday-iso>' }` where `resets_on` is `date_trunc('week', now() at time zone 'utc')::date + 7` rendered as `YYYY-MM-DD`. Per D3 + eng-review § Rescue #3, no Storage upload has happened yet — there's nothing to roll back.
5. On other Postgres exception → 500 `{ error: 'server_error' }` + `Sentry.captureException`.
6. On success: if `photo` is present, upload to `card-photos/{user_id}/cards/{card_id}/touchpoints/{touchpoint_id}/wide.jpg` via the user-context Supabase client (RLS-enforced). Then insert `card_photos` row with `touchpoint_type='primary', slot='wide', storage_path=<path>, touchpoint_id=<the same uuid>`. If the storage upload fails, the card persists without a photo row — return 201 `{ card_id, card_count_after, photo_uploaded: false }` (eng-review § Rescue #1). If the `card_photos` INSERT fails after a successful upload, log to Sentry but still return 201 with `photo_uploaded: false` and a `Sentry` reference (the orphan Storage file is acceptable — it's RLS-scoped to the user and can be reaped later).
7. On success with photo: return 201 `{ card_id, card_count_after, photo_uploaded: true }`.
8. On success without photo: return 201 `{ card_id, card_count_after, photo_uploaded: false }`.

**Output schemas:**

```ts
// 201 Created
type CardCreated = {
  card_id: string; // uuid
  card_count_after: int; // 1..20
  photo_uploaded: bool;
};

// 429 Too Many Requests
type CardCapReached = {
  error: 'card_cap_reached';
  resets_on: string; // ISO date e.g. '2026-05-18'
};

// 400 Bad Request
type ValidationFailed = {
  error: 'validation_failed';
  fields: Partial<
    Record<
      'description' | 'system_tag' | 'room_tag' | 'touchpoint_id' | 'photo',
      string
    >
  >;
};

// 401 Unauthorized
type Unauthorized = { error: 'unauthorized' };

// 500 Internal Server Error
type ServerError = { error: 'server_error' };
```

**Notes:**

- `export const dynamic = 'force-dynamic'` — same posture as the auth callback / signout handlers (cookies are read implicitly).
- Title derivation lives in a helper `apps/web/app/api/card/_lib/title-from-description.ts` with a paired unit test — table-driven across truncation boundaries, whitespace edge cases, and the empty-input defense.
- Storage upload uses the user's session Supabase client, not the service role — leaning on the storage RLS policy from migration 004 (path-segment scoped) to enforce isolation, NOT the route handler. Same trust posture as `apps/web/lib/supabase/server.ts`.

### `POST /api/card/[id]/restore`

**Input:** path param `id: string` (uuid). No body.

**Auth:** session cookie. 401 on null user.

**Behavior:**

1. Auth check; reject 401 on missing user.
2. Validate `id` is a uuid. 400 `{ error: 'validation_failed' }` otherwise.
3. `supabase.from('cards').update({ state: 'capturing' }).eq('id', id).eq('state', 'dismissed').select('id').single()` via the user-context client. RLS (migration 003) already enforces `user_id = auth.uid()`; the `.eq('state', 'dismissed')` predicate makes the update idempotent and races cleanly with concurrent edits.
4. If `error.code === 'PGRST116'` (no row returned) → distinguish "not found in dismissed state" via a second `.select` — return 404 `{ error: 'not_found' }` if the card doesn't exist (or isn't owned by the user, RLS shape), or 409 `{ error: 'invalid_state' }` if it exists but isn't dismissed.
5. On success: return 200 `{ card_id: id }`.

**Output schemas:**

```ts
// 200 OK
type RestoreSuccess = { card_id: string };

// 404 Not Found
type NotFound = { error: 'not_found' };

// 409 Conflict
type InvalidState = { error: 'invalid_state' };

// 400 / 401 / 500 — same shape as POST /api/card.
```

**Notes:**

- No `posthog.capture` from this endpoint — D9 covers only the three capture-flow events. Restore-event coverage will land if `monitor-beta` / `decide-state` need it.
- No card-cap consumption (D8 — restore re-uses an existing row; no INSERT).
- No triage-session consumption either, because no triage sessions exist in v0 (`triage-route-handler` row #2 wires that surface; restore-counts-vs-triage copy lives there per D8).
- `export const dynamic = 'force-dynamic'`.

## Files to create

| File                                                                 | Purpose                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/<ts>_006a_card_state_dismissed.sql`             | Adds `'dismissed'` to `card_state` enum. Standalone file per § Gotchas.                                                                                                                                                                  |
| `supabase/migrations/<ts>_006b_capture_flow.sql`                     | `cards.room_tag`, `usage_counters.week_start`, `cards_description_max_length` CHECK, `claim_card_slot` SECURITY DEFINER function.                                                                                                        |
| `apps/web/app/api/card/route.ts`                                     | `POST /api/card` route handler (D3, D6, D9, D10, D11).                                                                                                                                                                                   |
| `apps/web/app/api/card/route.test.ts`                                | Vitest — mocked Supabase RPC + Storage; success-path, cap-hit, validation, photo-failure-but-card-persists, auth-failure.                                                                                                                |
| `apps/web/app/api/card/_lib/title-from-description.ts`               | Pure-fn helper that derives the card title from the first ~80 chars of description.                                                                                                                                                      |
| `apps/web/app/api/card/_lib/title-from-description.test.ts`          | Vitest — table-driven across truncation boundaries + edge cases.                                                                                                                                                                         |
| `apps/web/app/api/card/[id]/restore/route.ts`                        | `POST /api/card/[id]/restore` route handler (D8).                                                                                                                                                                                        |
| `apps/web/app/api/card/[id]/restore/route.test.ts`                   | Vitest — success, 404 (no card), 409 (not dismissed), 401, 400.                                                                                                                                                                          |
| `apps/web/app/(app)/capture/page.tsx`                                | Server shell that mounts `<CaptureForm />` or the update-mode notice (D1, D4).                                                                                                                                                           |
| `apps/web/app/(app)/capture/page.test.tsx`                           | Vitest — renders form by default; renders update-mode notice with `searchParams.cardId`.                                                                                                                                                 |
| `apps/web/app/(app)/capture/_components/CaptureForm.tsx`             | `'use client'` form (D5, D6, D9, D11, D13).                                                                                                                                                                                              |
| `apps/web/app/(app)/capture/_components/CaptureForm.test.tsx`        | Vitest — fires `capture_started` on mount; validates submit blocks until required fields; 429 path shows banner + fires `capture_cap_hit` + preserves blob; 201 path routes to /home + fires `capture_completed`; photo upload feedback. |
| `apps/web/app/(app)/capture/_components/ExistingCardPicker.tsx`      | Server component — lists user's non-`closed`/`dismissed` cards (D4).                                                                                                                                                                     |
| `apps/web/app/(app)/capture/_components/ExistingCardPicker.test.tsx` | Vitest — renders rows; renders search input above 5 rows; empty-state.                                                                                                                                                                   |
| `apps/web/app/(app)/dismissed/page.tsx`                              | Server-rendered dismissed list (D8).                                                                                                                                                                                                     |
| `apps/web/app/(app)/dismissed/page.test.tsx`                         | Vitest — renders rows for dismissed cards; renders empty state.                                                                                                                                                                          |
| `apps/web/app/(app)/dismissed/_components/RestoreStrip.tsx`          | `'use client'` inline-confirm strip (D8).                                                                                                                                                                                                |
| `apps/web/app/(app)/dismissed/_components/RestoreStrip.test.tsx`     | Vitest — collapsed → expand → confirm POSTs to `/api/card/[id]/restore`; 404 + 409 + network error paths.                                                                                                                                |
| `apps/web/e2e/capture-flow.spec.ts`                                  | Playwright full round-trip — sign-in (via Inbucket helper), capture, assert 201, assert card row + photo row, then dismiss-via-admin + restore via the UI, skip on non-local.                                                            |

## Files to modify

| File                                  | Action     | Why                                                                                                                                                                                                         |
| ------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/(app)/home/page.tsx`    | modify     | Add the "+ Capture" CTA link to `/capture` (D1). Update the paired `page.test.tsx` to assert the link is present.                                                                                           |
| `apps/web/middleware.ts`              | modify     | `GATED_PREFIXES` adds `/capture` and `/dismissed` so anonymous hits bounce.                                                                                                                                 |
| `apps/web/middleware.test.ts`         | modify     | Add cases asserting `/capture` and `/dismissed` (and `/capture?...`, `/dismissed/...`) redirect anonymous users to `/login?next=<path>`.                                                                    |
| `packages/core/src/supabase.types.ts` | regenerate | `pnpm db:gen-types` after migration 006a + 006b apply. Adds `'dismissed'` to `card_state`, `room_tag` to cards, `week_start` to usage_counters, and `claim_card_slot` to `Database['public']['Functions']`. |
| `apps/web/e2e/rls-isolation.spec.ts`  | modify     | Extend two-user assertions to cover `room_tag` (cards) + `week_start` (usage_counters) + cross-user `claim_card_slot` RPC calls (assert it raises on a foreign uid).                                        |
| `METRICS.md`                          | append     | Three new rows per D9.                                                                                                                                                                                      |
| `CLAUDE.md` § Where Things Happen     | append     | One entry per new path.                                                                                                                                                                                     |

## Tests

### Unit tests (Vitest)

1. **`title-from-description.test.ts`** — table-driven: empty, 1-char, exactly-80-char, 81-char (truncates to last whitespace + adds `…`), 79-char-no-whitespace (truncates at 80 + adds `…`), trailing whitespace, unicode (counts grapheme-cluster-safely or accepts byte truncation — document which).
2. **`api/card/route.test.ts`** —
   - 401 when `getUser()` returns null.
   - 400 on empty description / missing system_tag / room_tag > 80 / invalid touchpoint_id.
   - 201 on happy path — assert RPC called with the right shape, Storage upload called with the expected path, card_photos INSERT called.
   - 201 with `photo_uploaded: false` when no photo provided.
   - 201 with `photo_uploaded: false` when Storage upload throws (card persists).
   - 429 on `card_cap_reached` Postgres exception — assert `resets_on` ISO date; assert no Storage call fired; assert Sentry NOT called (cap-hit is expected behavior, not an error).
   - 500 on other Postgres exception — assert Sentry called.
3. **`api/card/[id]/restore/route.test.ts`** —
   - 401 when `getUser()` returns null.
   - 400 when path id isn't a uuid.
   - 200 on happy path — assert UPDATE called with `.eq('state', 'dismissed')` + state-set to `'capturing'`.
   - 404 when the second `.select` returns no row.
   - 409 when the card exists but is in a non-dismissed state.
4. **`(app)/capture/page.test.tsx`** —
   - With no `searchParams.cardId`: renders `<CaptureForm />`.
   - With `searchParams.cardId='<uuid>'`: renders the update-mode notice; does NOT render the form.
5. **`(app)/capture/_components/CaptureForm.test.tsx`** —
   - On mount: `posthog.capture('capture_started')` fires exactly once (re-mount via re-render does not re-fire — `useRef` guard).
   - Submit disabled until description + system_tag + room_tag all present.
   - On 201: `posthog.capture('capture_completed', { has_photo, system_tag, room_tag_length, is_update: false })` fires; router pushes `/home`.
   - On 429: banner renders with `resets_on` rendered as human-friendly date; `posthog.capture('capture_cap_hit', { resets_on })` fires; form state (including photo blob) preserved (assert by inspecting the `<input type="file">` mirror state — we hold the File in component state since input.files is read-only).
   - On photo selection: preview thumbnail renders, byte size shown.
   - After successful submit upload: "✓ Uploaded" chip swap.
6. **`(app)/capture/_components/ExistingCardPicker.test.tsx`** —
   - Renders one row per non-`closed`/`dismissed` card, sorted `updated_at desc`.
   - Does NOT render `closed` or `dismissed` cards.
   - When `count > 5`, renders the search input; when `≤ 5`, doesn't.
   - Empty state copy when the user has no eligible cards.
7. **`(app)/dismissed/page.test.tsx`** —
   - Renders one row per `state = 'dismissed'` card, sorted `updated_at desc`, each wrapping a `<RestoreStrip>`.
   - Empty state when no dismissed cards.
8. **`(app)/dismissed/_components/RestoreStrip.test.tsx`** —
   - Initial collapsed state shows just `[Restore]`.
   - Tap Restore → confirm strip appears with the canonical copy.
   - Tap `[Restore]` (the confirm) → POST `/api/card/[id]/restore` with the right id; on 200, calls `onRestored(id)` prop.
   - 404 / 409 / network error → inline error copy, no `onRestored` call.
9. **`middleware.test.ts`** (modify) — extend the existing six redirect-rule cases (PR #10) with:
   - `/capture` anon → `/login?next=/capture`.
   - `/capture?cardId=<uuid>` anon → `/login?next=/capture?cardId=<uuid>` (assert query is preserved).
   - `/dismissed` anon → `/login?next=/dismissed`.
   - `/capture` authed → unchanged (pass-through).
   - `/dismissed` authed → unchanged.

### E2E test (Playwright)

**`apps/web/e2e/capture-flow.spec.ts`** — full round-trip, skipped on non-local via `test.skip(!isLocalSupabase, …)` so CI fast-job reports skipped; slow-job is the enforcement surface (mirrors `rls-isolation.spec.ts` + `magic-link.spec.ts` patterns).

Setup (`beforeAll`): use `adminClient()` to seed a user (`auth.admin.createUser` with `email_confirm: true`). Sign in via `signInWithPassword` so the test doesn't depend on Inbucket for a non-auth-feature test.

Cases:

1. **Happy path** — navigate to `/home`, click "+ Capture", fill description + system_tag + room_tag, upload a tiny bundled PNG, submit. Assert redirect to `/home`. Assert via admin client: one `cards` row exists with `state='capturing' / system_tag='<x>' / room_tag='<y>' / initial_description='<z>'`; one `card_photos` row at the expected storage path with `touchpoint_type='primary' / slot='wide'`. Assert `usage_counters.card_count = 1` for the user.
2. **Cap-hit** — seed `usage_counters.card_count = 20, week_start = today's Monday-UTC` via admin client. Submit a capture. Assert UI: banner copy contains "20 issues this week"; form fields still populated. Assert via admin client: no new `cards` row; no Storage object under `<user>/cards/...`.
3. **Restore from dismissed** — seed a card with `state='dismissed'` via admin client. Navigate to `/dismissed`. Assert one row. Click Restore → confirm → assert the row removes itself from the DOM. Assert via admin client: the card's `state` is now `'capturing'`.

### RLS isolation extension

`apps/web/e2e/rls-isolation.spec.ts` (modify) — add three assertions to the existing two-user matrix:

1. SELECT/UPDATE on `cards.room_tag` cross-user — A cannot see B's room_tag value via a column-narrowed select.
2. SELECT on `usage_counters.week_start` cross-user — A cannot see B's week_start.
3. RPC `claim_card_slot(p_user = userB_id, ...)` called as user A — should either error at the route handler defense-in-depth check (if we ever expose the RPC over PostgREST) OR `security definer` makes the function callable with a foreign uid (D3); the test documents the behavior we ship and asserts it. The user-facing surface (`POST /api/card`) never accepts `p_user` from the client — it derives from `auth.uid()`. The test pins this contract.

### Test-presence hook coverage

Every new `.ts`/`.tsx` under `apps/web/app/api/` and `apps/web/app/(app)/` is paired with a sibling `*.test.{ts,tsx}`. The two `_lib/` files (`title-from-description.ts` + its test) live underscore-prefixed which excludes them from App Router file-based routing but NOT from the test-presence glob — explicit sibling test is the right shape (mirrors the `(app)/spike/_lib/*.test.ts` precedent on main per CLAUDE.md). The Playwright spec is its own test artifact. No new entries needed in `.devshop-test-coverage-exempt`.

## Dependencies

**No new npm packages.** The PR uses APIs already in the workspace:

- `@supabase/ssr` (existing) — `createServerClient` reads cookies in route handlers + server components.
- `@supabase/supabase-js` (transitively pinned) — `supabase.rpc('claim_card_slot', ...)`, `supabase.storage.from('card-photos').upload(...)`, `supabase.from('cards').update(...)`.
- `posthog-js` (existing) — `capture_started` / `capture_completed` / `capture_cap_hit` events.
- `@sentry/nextjs` (existing) — `Sentry.captureException` on the 500 paths and orphan-Storage-row warnings.
- `next/navigation` `redirect` / `useRouter`; `next/server` `NextResponse`.
- `crypto.randomUUID()` (Web Crypto, available in both browser + Next runtime) — client-generates the `touchpoint_id`. Same posture as the spike's storage-path helper on main.

**Upstream blocker:** PR #10 (`feature/auth-magic-link`) and PR #9 (`feature/supabase-schema-and-rls`) must both be on `main` before this PR merges. (Both have landed as of `2026-05-13` per `BUILD-LOG.md` — no live gate.)

**No `packages/core` exports added.** The new RPC type is reachable via the regenerated `Database['public']['Functions']['claim_card_slot']` shape; no new wrapper is needed in `packages/core` for v0.

## Task order

Canonical 11-task list, dependency-ordered. Each task is a single atomic commit; verification step per task. Order matches the Phase 0 `/ak-build` TaskCreate tracker.

1. **Task 1 — Migration 006a + 006b**
   Files: `supabase/migrations/<ts>_006a_card_state_dismissed.sql`, `supabase/migrations/<ts>_006b_capture_flow.sql`.
   Commit: `feat(capture-flow): add migration 006 (room_tag, week_start, dismissed enum, claim_card_slot)`
   Verify: `pnpm db:reset` clean against the local stack; `psql -c "\df claim_card_slot"` shows the function; `psql -c "select unnest(enum_range(null::card_state))"` shows `dismissed`.

2. **Task 2 — Regenerate `supabase.types.ts`**
   File: `packages/core/src/supabase.types.ts`.
   Commit: `chore(capture-flow): regenerate supabase types for migration 006`
   Verify: `pnpm -w typecheck` clean; grep confirms `'dismissed'` literal in `card_state` and `claim_card_slot` in Functions.

3. **Task 3 — `POST /api/card` route handler + title helper**
   Files: `apps/web/app/api/card/route.ts`, `apps/web/app/api/card/route.test.ts`, `apps/web/app/api/card/_lib/title-from-description.ts`, `apps/web/app/api/card/_lib/title-from-description.test.ts`.
   Commit: `feat(capture-flow): add POST /api/card with cap enforcement`
   Verify: `pnpm --filter web vitest run app/api/card` clean.

4. **Task 4 — `POST /api/card/[id]/restore` route handler**
   Files: `apps/web/app/api/card/[id]/restore/route.ts`, `apps/web/app/api/card/[id]/restore/route.test.ts`.
   Commit: `feat(capture-flow): add POST /api/card/[id]/restore`
   Verify: `pnpm --filter web vitest run app/api/card/\\[id\\]/restore` clean.

5. **Task 5 — `CaptureForm` client component**
   Files: `apps/web/app/(app)/capture/_components/CaptureForm.tsx`, `apps/web/app/(app)/capture/_components/CaptureForm.test.tsx`.
   Commit: `feat(capture-flow): add CaptureForm client component`
   Verify: `pnpm --filter web vitest run 'app/(app)/capture/_components/CaptureForm'` clean.

6. **Task 6 — Capture page server shell + ExistingCardPicker**
   Files: `apps/web/app/(app)/capture/page.tsx`, `apps/web/app/(app)/capture/page.test.tsx`, `apps/web/app/(app)/capture/_components/ExistingCardPicker.tsx`, `apps/web/app/(app)/capture/_components/ExistingCardPicker.test.tsx`.
   Commit: `feat(capture-flow): add /capture page shell + existing-card picker`
   Verify: `pnpm --filter web vitest run 'app/(app)/capture'` clean.

7. **Task 7 — Dismissed list + RestoreStrip**
   Files: `apps/web/app/(app)/dismissed/page.tsx`, `apps/web/app/(app)/dismissed/page.test.tsx`, `apps/web/app/(app)/dismissed/_components/RestoreStrip.tsx`, `apps/web/app/(app)/dismissed/_components/RestoreStrip.test.tsx`.
   Commit: `feat(capture-flow): add /dismissed list view + restore strip`
   Verify: `pnpm --filter web vitest run 'app/(app)/dismissed'` clean.

8. **Task 8 — `/home` Capture CTA + middleware gated-prefix extension**
   Files: `apps/web/app/(app)/home/page.tsx` (modify), `apps/web/app/(app)/home/page.test.tsx` (modify), `apps/web/middleware.ts` (modify), `apps/web/middleware.test.ts` (modify).
   Commit: `feat(capture-flow): wire Capture CTA on /home and gate /capture + /dismissed`
   Verify: `pnpm --filter web vitest run 'app/(app)/home|middleware'` clean.

9. **Task 9 — METRICS.md events**
   File: `METRICS.md` — append the three rows from D9.
   Commit: `docs(capture-flow): document capture_started / capture_completed / capture_cap_hit`
   Verify: `bash kit/scripts/commit-hooks/check-docs-freshness-project.sh` clean.

10. **Task 10 — CLAUDE.md docs update**
    File: `CLAUDE.md § Where Things Happen` — append entries per § Files to create above.
    Commit: `docs(capture-flow): document /capture, /dismissed, /api/card, migration 006`
    Verify: `bash kit/scripts/commit-hooks/check-docs-freshness-project.sh` clean; pre-commit clean.

11. **Task 11 — E2E + RLS isolation extension**
    Files: `apps/web/e2e/capture-flow.spec.ts` (new), `apps/web/e2e/rls-isolation.spec.ts` (modify).
    Commit: `test(capture-flow): add capture E2E + extend RLS isolation for migration 006`
    Verify: `pnpm --filter web exec playwright test e2e/capture-flow.spec.ts e2e/rls-isolation.spec.ts` passes against the local stack.

### Task-order delta vs Phase 0 preview

No deltas. The 11 tasks above match the Phase 0 `/ak-build` TaskCreate tracker (P2/T1..T11) 1:1. The middleware gated-prefix extension folds into Task 8 (CTA wiring on /home) rather than a separate task — both are single-line modifies and a sibling test extension, and they share a verification step.

## Gotchas

- **`ALTER TYPE card_state ADD VALUE 'dismissed'` cannot run inside a transaction**, and the Supabase CLI wraps each `.sql` file in a single transaction. Splitting the migration into `006a_card_state_dismissed.sql` (ALTER TYPE alone, transaction-free) + `006b_capture_flow.sql` (everything else, transactional) is the canonical workaround. Both run in order via the migration runner; both deploy via `.github/workflows/deploy-migrations.yml` on push-to-main. Postgres 12+ relaxed this for non-default schemas but `public` still falls under the constraint — don't merge them.

- **`SECURITY DEFINER` functions need a pinned `search_path`** (mirrors PR #9 `create_public_user_profile`). `claim_card_slot` sets `search_path = public, pg_catalog` — omitting this lets a caller in a schema-shadowed search_path hijack the `usage_counters` / `cards` references. The convention is established (migration 005 uses `set search_path = public`); migration 006b's variant adds `pg_catalog` so built-ins (`now()`, `date_trunc`) resolve unambiguously when called by users in custom schemas. Don't drop the pin.

- **429 in the route handler corresponds to `errcode = 'P0001'` + the message `'card_cap_reached'`** — distinguish the canonical "cap hit" exception from other P0001 raises by message, not just errcode. Postgres exceptions surface via `supabase.rpc(...)` as `{ error: { code: 'P0001', message: 'card_cap_reached', ... } }`. The handler reads `error.message === 'card_cap_reached'` to decide 429-vs-500. Any other P0001 message → 500 + Sentry capture.

- **Photo blob in React state cannot exceed the browser memory budget**. iOS Safari rate-limits memory aggressively; a 50MB Path A photo + a base64-mirror in localStorage would blow the per-tab quota. Solution: keep the `File` in React state ONLY (no localStorage mirror, no base64 conversion). On cap-hit (D11), the blob stays in state; on refresh, it's lost (D11 trade-off). Don't add a "save draft" path that mirrors the blob to localStorage — quota + privacy footprint.

- **`.trim()` on every `NEXT_PUBLIC_*` env read** is already canonical at the SSR client factory (CLAUDE.md § Gotchas). The route handler inherits this via `apps/web/lib/supabase/server.ts`. Don't re-establish; don't read env vars at any new site without `.trim()`.

- **`auth.uid() = p_user` defense-in-depth lives at the route handler**, not in the SQL function. `claim_card_slot` is `security definer` (D3) so RLS doesn't fire inside it — the function trusts `p_user`. The handler MUST pass `user.id` from `supabase.auth.getUser()` directly, never from request body. This contract is asserted in the route handler test (mock `getUser` returns user A, but the handler RPC call is made with `p_user = userA.id` regardless of what the request body says — the handler doesn't accept a user_id from the client).

- **`storage.foldername(name)[1]` is 1-indexed** (migration 004). The first path segment is the user's uuid. Storage upload path MUST be `{user.id}/cards/{card_id}/touchpoints/{touchpoint_id}/wide.jpg` exactly — a leading slash, an extra segment, or a typo silently fails the RLS policy and returns a `403` (not a graceful "auth missing"). Construct the path via a shared helper if a second caller emerges (none in this PR).

- **`crypto.randomUUID()` is available in both browser + Next runtime** for the client-side `touchpoint_id` generation. No polyfill needed for Next 16 server runtime. The uuid is generated client-side (D10) and sent over the wire so the photo row + card row reference the same touchpoint without a server round-trip to mint it.

- **The `card_state` enum's `'dismissed'` value is non-rollbackable** in standard Postgres — `ALTER TYPE ... DROP VALUE` doesn't exist. Migration 006a's rollback comment documents this explicitly. Acceptable for v0 pre-launch (no homeowner data exists yet); if a real rollback is ever needed, the path is `CREATE TYPE card_state_new AS ENUM (without 'dismissed'); ALTER TABLE cards ALTER COLUMN state TYPE card_state_new USING state::text::card_state_new; DROP TYPE card_state; ALTER TYPE card_state_new RENAME TO card_state;` — destructive on any `state='dismissed'` rows.

- **`usage_counters.week_start` is `NOT NULL DEFAULT date_trunc('week', (now() at time zone 'utc'))::date`**. The default ANCHORS new rows at the current Monday-UTC. `claim_card_slot` then handles week rollover via the ON CONFLICT CASE expression. Don't drop the default — first-card-of-the-week INSERT relies on it being populated before the CASE compares.

- **The capture form does NOT call `/api/triage`** (D7). Cards land in `state = 'capturing'` and stay there. When `triage-route-handler` (row #2) ships, it adds a side-effect (`supabase-functions/` webhook or a route-handler post-write call) that transitions `capturing` → `triaging`. This PR's E2E asserts the post-capture state is `'capturing'` — don't write a test that expects `triaging` (it'd fail until row #2).

- **`(app)` route group is NOT a URL segment** (auth PR D6 gotcha). Middleware's `GATED_PREFIXES = ['/home']` was sufficient for PR #10; this PR adds `/capture` and `/dismissed`. Don't try to gate the route group itself — gate the explicit URL prefixes.

## Acceptance

A PR can land when ALL of:

- [ ] PR #9 and PR #10 are on `main` (already true as of 2026-05-13).
- [ ] All 11 tasks committed atomically per § Task order.
- [ ] `pnpm -w typecheck` clean (catches missing `room_tag` / `'dismissed'` / `claim_card_slot` in the regenerated types).
- [ ] `pnpm --filter web vitest run` clean (all new unit test files plus the existing suite).
- [ ] `pnpm --filter web exec playwright test e2e/capture-flow.spec.ts e2e/rls-isolation.spec.ts` passes against the local stack.
- [ ] `bash kit/scripts/commit-hooks/check-docs-freshness-project.sh` clean — CLAUDE.md path map and METRICS.md events both updated.
- [ ] Manual smoke (local, mobile viewport):
  1.  Submit a capture with description + system + room + photo from `/home` → land back on `/home` → admin-client SELECT confirms one `cards` row with `state='capturing'` and one `card_photos` row at the expected path.
  2.  Submit 20 captures in a single week; the 21st renders the cap-hit banner with `resets_on` rendered as `<human-date>`; no orphan Storage object created; `posthog.capture('capture_cap_hit')` fires.
  3.  Admin-seed a card with `state='dismissed'`, navigate to `/dismissed`, restore it; row removes itself; the card now has `state='capturing'`.
- [ ] Branch protection's required checks all green.

## Rollout

- **Merge order:** Both blockers (#9, #10) are already on main — no live gate.
- **Vercel:** Auto-deploys on merge to `main`. The deployed app gains `/capture`, `/dismissed`, `POST /api/card`, `POST /api/card/[id]/restore`. The "+ Capture" CTA appears on `/home`.
- **`deploy-migrations.yml`:** Runs on push to main. Applies `006a_card_state_dismissed.sql` first, then `006b_capture_flow.sql`. Both are RUN-TWICE-safe individually (006a's `ALTER TYPE ADD VALUE` errors-but-idempotents on re-run if you guard it; 006b's `ALTER TABLE ADD COLUMN IF NOT EXISTS` posture — see migration file for the exact syntax). Verify `claim_card_slot` exists via `\df` after deploy.
- **`deploy-functions.yml`:** No-op (no edge functions added).
- **Feature flag:** None. The surface is gated behind authentication (low blast radius — pre-launch, no real homeowners). The CTA on `/home` is the only entry point, so any post-deploy regression is contained.
- **Operator follow-ups:** none required for this PR. After the next `monitor-beta` (row #7) deploy, the update-mode notice on `/capture?cardId=<id>` becomes obsolete — its removal lives in that PR.

## Rollback

Acceptable to revert pre-launch — no real homeowner data exists yet.

1. Revert the PR via `gh pr revert` or `git revert <merge-sha>` + new PR.
2. **Migration cleanup (operator-side, Supabase CLI):**
   - `supabase migration repair --status reverted <ts>_006b_capture_flow` then `supabase migration repair --status reverted <ts>_006a_card_state_dismissed` — these mark the migrations as reverted in `supabase_migrations.schema_migrations` WITHOUT running the ROLLBACK SQL. The ROLLBACK comments at the bottom of each `.sql` file are the canonical rollback recipe (mirrors PR #9 convention).
   - Apply the 006b ROLLBACK SQL manually via `psql` if needed: `drop function if exists public.claim_card_slot(...); alter table public.cards drop constraint if exists cards_description_max_length; alter table public.usage_counters drop column if exists week_start; alter table public.cards drop column if exists room_tag;`.
   - **006a is non-rollbackable** in standard Postgres (no `ALTER TYPE ... DROP VALUE`). Leave `'dismissed'` in the enum — it's a benign extra value. The destructive recreate-the-type recipe (see § Gotchas) is only needed if a hard re-roll is mandated.
3. **Storage cleanup:** Any `card-photos/<user>/cards/<card_id>/touchpoints/<touchpoint_id>/wide.jpg` objects from pre-revert captures persist as orphan files (the `cards` row may also persist if the migration ROLLBACK is skipped). They're RLS-scoped to the user; no other user can read them. Acceptable to leave in place.
4. **PostHog backfill:** Pre-revert `capture_started` / `capture_completed` / `capture_cap_hit` events stay in the ingest stream. Acceptable — correctly attributed to the pre-revert deploy window.
5. **Vercel auto-redeploys** the revert PR on merge; production loses `/capture`, `/dismissed`, and the API routes. The CTA on `/home` 404s post-revert if the home-page change is also reverted (it is, since it's part of the PR).

If real homeowner data has begun to land before a rollback decision is made (i.e., post-launch), do NOT revert blindly — design a forward-fix that preserves any user cards and only reverts the buggy surface.
