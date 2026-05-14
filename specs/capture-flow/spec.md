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
