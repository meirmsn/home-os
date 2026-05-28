<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: photo-comparison-ui -->
<!-- date: 2026-05-28 -->

# Spec: photo-comparison-ui

**Sources:**

- `.gstack/ceo-review-home-os-2026-05-01-r2.md § Scope (Photo comparison UI — human-only in Phase 1)` — primary scope
- `.gstack/design-review-home-os-2026-05-02.md § Photo Comparison UI` — design reference (layout, controls, missing-photo edge cases, spacing)
- `.gstack/design-review-home-os-2026-05-02.md § Photo Comparison Is a Card Capability, Not a State` — entry-point model
- `.gstack/pwa-spike-result.md §§ 4–7` — empirical feasibility: synced pinch-zoom (>58fps) + bounce cadences validated on iOS Safari
- `PLAN.md § Planned (v0)` row `photo-comparison-ui` — scope summary
- Prior spec `specs/monitor-beta/spec.md` — style + structure reference

Side-by-side, human-only comparison of any two photographed moments of a card —
synced pinch-zoom and instant-cut bounce mode to make subtle changes visible —
available from any card state with 2+ photo-bearing touchpoints.

---

## Product update

Both blurbs as approved at Phase 0.2. Single source-of-truth — `/ak-build`
Phase 4.1 copies them verbatim into the PR body's `## Product update`
section, Phase 5.6 copies Headline into BUILD-LOG `Headline:` and Detail
into `Summary:`, and `/ak-go-live` Step 6 uses Headline as the
deployed-to-prod lede. Verified against the diff at Phase 6 Gate A
(operator confirmation) + Gate B (automated claim-vs-diff cross-check).

### Headline (user-facing)

Compare any two photos of a home issue side by side — pinch to zoom both at
once, or rapidly flip between them to make subtle changes jump out. Available
on any issue you've photographed more than once.

### Detail (team-facing)

Adds a "Compare photos" surface reachable from MONITOR, PLANNED, and CLOSED
cards whenever the card has 2+ photo-bearing touchpoints. Side-by-side panels
with synchronized pinch-zoom + pan, and an instant-cut bounce mode (slow 1200 /
default 750 / fast 400 ms), plus per-slot (wide/medium/closeup) selection with
missing-slot greying. Reads existing `card_photos` rows — no schema change.

---

## Decisions (resolved at spec time)

Six `/ak-spec`-time decisions resolved in Phase 0 with the user. Recorded below
so Phase 1 preserves them verbatim and a crashed Phase 1 resumes without
re-asking.

### D1: Comparison mode scope — full, not trimmed

**Decision:** Ship the full comparison surface: side-by-side panels +
synchronized pinch-zoom (+ pan) + instant-cut bounce mode with a
user-adjustable cadence picker (slow 1200 ms / default 750 ms / fast 400 ms).

**Rationale:** The PLAN.md "side-by-side only" trim candidate is retired by
`pwa-spike-result.md §§ 4–7`, which empirically validated synced pinch-zoom at

> 58fps on iOS Safari (shared `{scale, originX, originY}` transform) and bounce
> mode at all three cadences, concluding "ships sync zoom in Phase 1 with
> confidence." Bounce mode is the feature's differentiator — side-by-side alone
> is barely better than manual photo scroll, which is the row's own stated
> "low risk if skipped."

### D2: Surface — dedicated sub-route, not an overlay

**Decision:** A dedicated sub-route `cards/[id]/compare`. The route's server
component fetches the card's photo touchpoints and batch-signs URLs (RLS-scoped),
then renders a full-bleed client `<PhotoComparison>` component. A "Compare
photos" action on each card-state view links to it; the back button returns to
the card.

**Rationale:** Matches the project's established server-component-fetches-photos
pattern (`cards/[id]/page.tsx`), keeps signed-URL generation server-side and
RLS-respecting, and gives a real back-button target + shareable URL. Still
"accessed from within the card" per design-review § "card capability, not a
state" — it is a card sub-route, not a top-level nav screen.

### D3: Default touchpoint pair + picker

**Decision:** Default the comparison to the **earliest** photo-bearing
touchpoint vs the **latest**. Two pickers let the user choose any two distinct
touchpoints. Pickers list only touchpoints that have ≥1 photo (text-only
check-ins are excluded from comparison entry points).

**Rationale:** design-review § entry-point edge cases. The per-state defaults
called out in design (PLANNED: capture ↔ latest check-in; CLOSED: capture ↔
finished photo) fall out naturally from earliest ↔ latest.

### D4: Slot selection + missing-photo handling

**Decision:** A slot selector over the real `photo_slot` enum — `wide` /
`medium` / `closeup` — defaulting to `wide`. Side-by-side shows the selected
slot for each date; a date missing that slot shows a "No photo for this slot on
[date]" placeholder and greys out at the slot level. Bounce mode is enabled only
when both selected dates have the selected slot.

**Rationale:** design-review § Photo Comparison — Missing Photos. Note the actual
enum is `wide/medium/closeup`, which maps to the design review's loose
"wide/zoom/detail" prose.

### D5: Data layer — no migration, no new RPC

**Decision:** No migration and no new RPC. The compare route's server component
queries existing `card_photos` rows for the card (RLS-scoped), groups them by
`touchpoint_id`, and batch-signs URLs via `createSignedUrls` (plural). Each
touchpoint's display date = `min(created_at)` across its photo rows.

**Rationale:** `card_photos` already stores `touchpoint_id`, `touchpoint_type`,
`slot`, `storage_path`, `created_at` — everything comparison needs. Batched
signing matches the CLAUDE.md dashboard guidance. No backend surface changes.

### D6: Metrics

**Decision:** Add one new PostHog event: `photo_comparison_opened` (properties:
`card_state`, `touchpoint_count`). No separate bounce/zoom interaction events in
this PR (deferrable if usage analysis later needs them).

**Rationale:** Approved as the minimal-default at Phase 0 (the proposed answer
on the [USER MUST DECIDE] row). Fits the existing snake_case `*_view_opened` /
`*_opened` event taxonomy in `METRICS.md`. Keeps the taxonomy lean while still
answering "is anyone using comparison?".

---

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens, Data
     model changes, API contracts, Offline behavior, Metrics, Files to
     create/modify, Tests, Dependencies, Task order, Gotchas, Acceptance /
     rollout / rollback. The Product update + Decisions sections above
     stay verbatim. -->

## In scope

This PR delivers a human-only photo-comparison surface as a **card sub-route**
(`cards/[id]/compare`) reachable from MONITOR, PLANNED, and CLOSED cards that
have **2+ photo-bearing touchpoints**. Concretely:

1. **`cards/[id]/compare/page.tsx`** — new server component. Re-validates the
   card under RLS, fetches all `card_photos` rows for the card, groups them by
   `touchpoint_id`, derives each touchpoint's display date as `min(created_at)`,
   batch-signs every storage path via `createSignedUrls` (plural), and renders a
   full-bleed `<PhotoComparison>`. Redirects back to `cards/[id]` when the card
   has fewer than 2 photo-bearing touchpoints (defense-in-depth — entry links are
   already gated).
2. **`<PhotoComparison>`** — new full-bleed client component under
   `cards/[id]/_components/`. Screenshot-ready layout: issue name / Photo A·B /
   Date A·B / wordmark / controls. Side-by-side panels butted edge-to-edge (no
   gap) on mobile, capped to a max width on desktop.
3. **Synced pinch-zoom + pan** — two `<img>` panels sharing one
   `{ scale, originX, originY }` transform; `touch-action: none` on the panels
   only. Validated >58fps on iOS Safari (`pwa-spike-result.md § 4`).
4. **Bounce mode + cadence picker** — instant-cut (no crossfade) toggle between
   the same slot across the two selected dates; user-adjustable cadence
   slow 1200 / default 750 / fast 400 ms (`pwa-spike-result.md §§ 5–7`). Enabled
   only when both selected dates have the selected slot.
5. **Date pickers + slot selector** — two date pickers (touchpoints with ≥1
   photo only) defaulting to earliest ↔ latest; a slot selector over
   `wide`/`medium`/`closeup` defaulting to `wide`. Missing-slot greying +
   "No photo for this slot on [date]" placeholder.
6. **Entry points** — a "Compare photos" link added to `<MonitorView>`,
   `<PlannedView>`, and `<ClosedView>`, gated on `photoTouchpointCount >= 2`.
7. **PostHog event** — `photo_comparison_opened` (`card_state`,
   `touchpoint_count`) per D6, fired once per (card × session) from a
   capture component (same sentinel pattern as `DecideViewOpenedCapture`).
8. **Docs** — `METRICS.md` event row, `ARCHITECTURE.md`/`README` touch only if a
   convention drifts (no schema change).

## Out of scope

- **No schema change** — no migration, no new RPC (D5). Reads existing
  `card_photos` rows.
- **AI change-detection / diff overlay** — Phase 2 concern
  (design-review § Photo Comparison UI: "No AI change detection until Phase 2").
- **Per-interaction analytics** — no `bounce_started` / `zoom_used` events this
  PR (D6 — deferrable).
- **Crossfade / slider-wipe comparison modes** — instant-cut only; crossfade
  obscures the change being detected (design-review).
- **Backgrounding / Low-Power-Mode bounce policy** — "just accept drift" (let the
  rAF loop self-throttle); no pause-on-blur (`pwa-spike-result.md § Backgrounding`).
- **Generalizing `<BeforeAfterPhotos>`** — the static closed-state pair stays as
  is; `<PhotoComparison>` is a new, separate component (its file header already
  marks sync-zoom/bounce as "PR #6").
- **Sharing / export of the screenshot-ready frame** — layout is screenshot-ready
  (user takes an OS screenshot); no in-app export button.

---

## Screens & UI

### Route: `cards/[id]/compare` (`<PhotoComparison>` full-bleed)

Layout top-to-bottom (design-review § Photo Comparison UI "Screenshot-ready
layout" + § Information Architecture § Photo Comparison hierarchy):

| Order | Element                  | Detail                                                                                                                               |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Issue name               | Single line, centered. From `card.title` (fallback `card.initial_description` truncated). `text-sm font-medium`, centered.            |
| 2     | Photo A / Photo B panels | Maximum available width, butted edge-to-edge (no gap) on mobile; `max-w-*` cap centered on desktop. Each is a zoom/pan viewport.      |
| 3     | Date A / Date B          | Small, high-contrast, **below** each panel, never overlaid. `text-xs`, `--color-text-secondary`. Human short date of the touchpoint. |
| 4     | Home OS wordmark         | Small (~12px), `--color-text-secondary`, centered.                                                                                   |
| 5     | Controls                 | Date pickers + slot selector + bounce toggle + cadence picker. Minimal, bottom of screen.                                            |
| 6     | Back affordance          | "Back to issue" link → `cards/[id]`. Top-left, outside the screenshot frame.                                                         |

**Panel behavior**

- Both panels share one transform state `{ scale, originX, originY }`. A pinch on
  either panel updates the shared state; both `<img>` re-render with the same
  `transform: translate(...) scale(...)`. Pan (one-finger drag after zoom) moves
  both together. Double-tap (or "Reset zoom") returns to `scale: 1`.
- `touch-action: none` is set **on the panel elements only** (never `<html>` /
  `<body>`), so page scroll outside the panels is unaffected
  (`pwa-spike-result.md § 4`).
- Pointer-event handlers (`pointerdown`/`pointermove`/`pointerup` + a 2-pointer
  map) drive the gesture; no third-party gesture lib.

**Bounce mode**

- A toggle ("Bounce" / "Stop") starts an instant-cut alternation between the two
  selected dates' photo for the selected slot, at the picked cadence
  (`requestAnimationFrame`-driven timer comparing `performance.now()` deltas
  against the cadence ms; instant `<img>` source swap — no opacity transition).
- Cadence picker: three segmented options — Slow (1200) / Default (750) /
  Fast (400) ms, default 750.
- Bounce is **disabled** (control greyed, with a hint) unless both selected dates
  have the selected slot. Starting bounce while zoomed keeps the shared zoom
  transform (you can bounce a zoomed-in detail).

**Date pickers (A and B)**

- Each lists only touchpoints with ≥1 photo (text-only check-ins excluded). Each
  option shows the touchpoint's short date + a touchpoint-type hint
  ("Capture" / "Check-in" / "Finished"). The two pickers must select **distinct**
  touchpoints; selecting the same date in both is prevented (the other picker's
  matching option is disabled).
- Default: earliest photo-bearing touchpoint in A, latest in B.

**Slot selector**

- Segmented control over `wide` / `medium` / `closeup`, labeled "Wide" /
  "Medium" / "Close-up", default `wide`.
- For each selected date, if that date is missing the selected slot, that panel
  shows a greyed placeholder: "No photo for this slot on [date]". The other panel
  still renders its photo. Bounce is disabled while either panel is in the
  missing-slot state.

### Entry points (MonitorView / PlannedView / ClosedView)

A "Compare photos" link, rendered only when `photoTouchpointCount >= 2`:

- **`<ClosedView>`** — below `<BeforeAfterPhotos>` (the static pair is the hero;
  "Compare photos" deepens it). Closed cards almost always have ≥2 touchpoints
  (capture + finished), so this link is usually present.
- **`<MonitorView>`** — below `<CheckInTimeline>` (the timeline shows the moments;
  comparison overlays any two). Present once the card has a capture + ≥1 photo
  check-in (or 2+ photo check-ins).
- **`<PlannedView>`** — below the path detail / before-close summary. Present only
  for planned cards that already have 2+ photo touchpoints (rare in practice, but
  a planned card restored from monitoring can have them).

Link treatment: `text-sm underline text-[var(--color-text-secondary)]` with a
`data-testid="compare-photos-link"`, wrapped in `next/link` to
`/cards/${cardId}/compare`. Each view receives a `photoTouchpointCount: number`
prop (computed in `page.tsx`) and renders the link only when `>= 2`.

---

## Data model (no migration)

**No schema change, no new RPC** (D5). All reads target the existing
`card_photos` table (`supabase/migrations/20260513184101_002_tables.sql`):

| Column           | Type                            | Use in compare                                              |
| ---------------- | ------------------------------- | ----------------------------------------------------------- |
| `touchpoint_id`  | uuid                            | Group key — one comparison "date" per distinct value.       |
| `touchpoint_type`| enum `primary/context/closeup/close/checkin` | Hint label (Capture / Check-in / Finished); not a filter. |
| `slot`           | enum `photo_slot` = `wide/medium/closeup` | Slot selector axis.                              |
| `storage_path`   | text                            | Batch-signed via `createSignedUrls`.                        |
| `created_at`     | timestamptz                     | Touchpoint display date = `min(created_at)` over its rows.  |

Enum note (matches D4): the **real** `photo_slot` enum is `wide/medium/closeup`
(`20260513184100_001_enums.sql`), which the design review's loose
"wide/zoom/detail" prose maps onto. The UI labels are Wide / Medium / Close-up.

**`touchpoint_type` is not filtered.** A photo-bearing touchpoint is any
`touchpoint_id` group that has ≥1 photo, regardless of type. Capture (`primary`),
check-in (`checkin`), and finished (`close`) photos all participate. Text-only
check-ins have no `card_photos` rows, so they never appear as a touchpoint group
— this is exactly the "text-only check-ins excluded" rule, achieved for free by
grouping on `card_photos` rather than on `check_ins`.

### Server-side derivation (`compare/page.tsx`)

```text
1. supabase.from('card_photos')
     .select('touchpoint_id, touchpoint_type, slot, storage_path, created_at')
     .eq('card_id', id)
     .order('created_at', { ascending: true })       // RLS-scoped to owner
2. Group rows by touchpoint_id → Map<touchpointId, PhotoRow[]>.
3. For each group: date = min(created_at); type = group[0].touchpoint_type;
     slots = { wide?, medium?, closeup? } from the group's rows.
4. paths = every storage_path across all groups.
   const { data: signed } = await supabase.storage
     .from('card-photos')
     .createSignedUrls(paths, 60 * 10);               // 10-min TTL, BATCHED
   Build a Map<storage_path, signedUrl> from signed[].
5. touchpoints = sorted-by-date array of
     { id, date, type, photos: { wide?: url, medium?: url, closeup?: url } }.
6. photoTouchpointCount = touchpoints.length.
   if (photoTouchpointCount < 2) redirect(`/cards/${id}`).
7. Render <PhotoComparison issueName card={…} touchpoints={touchpoints}
     cardState={card.state} />.
```

`createSignedUrls` (plural) is the batched signing API — the current codebase
loops `createSignedUrl` (singular) per photo in `page.tsx`; this route is the
first plural call site (CLAUDE.md dashboard guidance: "batch via
`createSignedUrls` (plural) API" when N grows). `signed[]` entries can each carry
a per-path `error`; rows that fail to sign are dropped (treated as missing slot
for that touchpoint).

---

## Route & data contracts

### `GET cards/[id]/compare` (server component, not a JSON API)

Standard App Router page. No request body. Behavior:

| Condition                                   | Result                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| No session                                  | `(app)` layout redirects to `/login` (existing middleware).             |
| Card not found under RLS                    | `notFound()` (404) — same posture as `cards/[id]/page.tsx`.             |
| Card found, < 2 photo-bearing touchpoints   | `redirect('/cards/[id]')` — the entry link shouldn't have appeared.     |
| Card found, ≥ 2 photo-bearing touchpoints   | Renders `<PhotoComparison>`.                                            |
| `cards` SELECT PostgREST error              | `Sentry.captureException` (tags `surface: cards/[id]/compare`) → 404.    |

**Props into `<PhotoComparison>`:**

```ts
type ComparePhoto = { wide?: string; medium?: string; closeup?: string };
type CompareTouchpoint = {
  id: string;
  date: string;                       // ISO, = min(created_at)
  type: 'primary' | 'context' | 'closeup' | 'close' | 'checkin';
  photos: ComparePhoto;
};
type PhotoComparisonProps = {
  cardId: string;
  issueName: string;                  // card.title ?? truncated description
  cardState: 'monitoring' | 'planned' | 'closed' | string;
  touchpoints: CompareTouchpoint[];   // sorted by date asc, length >= 2
};
```

`<PhotoComparison>` owns all interaction state (`dateAId`, `dateBId`, `slot`,
`scale/originX/originY`, `bounceOn`, `cadenceMs`, `bounceFrame`) in React state /
refs. The server passes only signed URLs + metadata.

### Entry-link prop

`page.tsx` computes `photoTouchpointCount` once (distinct `touchpoint_id`s among
`card_photos` for the card) and threads it into the three view components. For
monitoring, this is derivable from the already-fetched check-in photos + capture
fallback; for planned/closed, add a lightweight count query
(`select touchpoint_id` distinct, or `select('touchpoint_id', { count })` + JS
dedupe). The count query is RLS-scoped and cheap.

---

## Offline / PWA behavior

- **No new offline surface.** The compare route needs live signed URLs from
  Supabase Storage (10-min TTL), so it requires a network connection — same as
  the existing single-photo render on `cards/[id]`. No service-worker caching of
  signed URLs (they expire; caching would serve dead links).
- **Touch-action scoping** (PWA-critical): `touch-action: none` on the two panels
  only. The rest of the page (controls, back link, body) keeps native scroll.
  This is the single most important PWA correctness detail — getting it on
  `<html>`/`<body>` would kill page scroll (`pwa-spike-result.md § 4`).
- **Bounce + backgrounding:** the rAF loop self-throttles to ~1Hz when the tab is
  backgrounded (iOS Safari) — accepted as-is (no pause-on-blur). When the tab
  returns to foreground, the next rAF tick resumes at the configured cadence; the
  loop reads `performance.now()` deltas so a long background gap just produces one
  late swap, not a burst.
- **Signed-URL expiry mid-session:** a 10-min TTL covers a normal comparison
  session. If a URL 404s after expiry, the panel shows the missing-slot
  placeholder (graceful) rather than a broken-image icon — `<img onError>` flips
  that panel to the placeholder state.

---

## Metrics

One new PostHog event per D6 (no schema, no Sentry additions beyond the route's
existing `captureException` on SELECT error).

| Event                     | When it fires                                                                                                                                                                                 | Key properties                                                          | Why we care                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `photo_comparison_opened` | Fired once per (card × browser session) from `<PhotoComparisonOpenedCapture />` mounted inside `<PhotoComparison>`. Session-storage sentinel `home_os.photo_comparison_opened_fired:<card_id>` deduplicates re-renders (same pattern as `DecideViewOpenedCapture`). | `{ card_state: string, touchpoint_count: number }` | Is anyone using comparison? `card_state` shows which lifecycle stage drives it; `touchpoint_count` shows how rich a history users compare against. Lean by design — no per-interaction events this PR (D6). |

**Sentry (diagnostic, not new taxonomy):** the compare route reuses the existing
`cards SELECT errored on detail page` style capture, tagged
`surface: cards/[id]/compare`, `stage: card_select` — a one-line addition to the
METRICS.md Sentry rows for the new surface tag.

---

## Files to create / modify

### New files

| File                                                                            | Purpose                                                                                  |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web/app/(app)/cards/[id]/compare/page.tsx`                                | Server route — fetch + group + batch-sign photos, gate < 2, render `<PhotoComparison>`.  |
| `apps/web/app/(app)/cards/[id]/compare/_lib/group-touchpoints.ts`               | Pure helper: rows → sorted touchpoint groups (`min(created_at)`, slot map). Unit-tested.  |
| `apps/web/app/(app)/cards/[id]/compare/_lib/group-touchpoints.test.ts`          | Unit tests for grouping + date derivation + count.                                       |
| `apps/web/app/(app)/cards/[id]/_components/PhotoComparison.tsx`                  | Full-bleed client comparison surface (panels, zoom, bounce, pickers).                    |
| `apps/web/app/(app)/cards/[id]/_components/PhotoComparison.test.tsx`            | Unit tests: default pair, slot/missing logic, bounce gating, layout.                     |
| `apps/web/app/(app)/cards/[id]/_components/PhotoComparisonOpenedCapture.tsx`     | Client component — once-per-session `photo_comparison_opened`.                            |
| `apps/web/app/(app)/cards/[id]/_components/PhotoComparisonOpenedCapture.test.tsx`| Unit tests for the capture sentinel.                                                     |
| `apps/web/e2e/photo-comparison.spec.ts`                                          | Playwright E2E — compare flow + entry gating.                                            |

### Modified files

| File                                                                  | Change                                                                                       |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/web/app/(app)/cards/[id]/page.tsx`                              | Compute `photoTouchpointCount`; thread it into MonitorView / PlannedView / ClosedView.       |
| `apps/web/app/(app)/cards/[id]/_components/MonitorView.tsx`           | Accept `photoTouchpointCount`; render "Compare photos" link when `>= 2`.                      |
| `apps/web/app/(app)/cards/[id]/_components/MonitorView.test.tsx`      | Add link-present / link-absent assertions.                                                    |
| `apps/web/app/(app)/cards/[id]/_components/PlannedView.tsx`           | Accept `photoTouchpointCount`; render "Compare photos" link when `>= 2`.                      |
| `apps/web/app/(app)/cards/[id]/_components/ClosedView.tsx`            | Accept `photoTouchpointCount`; render "Compare photos" link when `>= 2`.                      |
| `apps/web/app/(app)/cards/[id]/_components/PlannedView.test.tsx`      | Add link-present / link-absent assertions (if test file exists; else covered by E2E).        |
| `apps/web/app/(app)/cards/[id]/_components/ClosedView.test.tsx`       | Add link-present / link-absent assertions (if test file exists; else covered by E2E).        |
| `METRICS.md`                                                          | Add `photo_comparison_opened` event row + `cards/[id]/compare` Sentry surface row.           |
| `CLAUDE.md`                                                           | Add photo-comparison gotchas (touch-action scoping, plural signing, < 2 gate).               |

---

## Tests

### Unit (Vitest)

**`group-touchpoints.test.ts`**

- Groups rows by `touchpoint_id`; one group per distinct id.
- Touchpoint date = `min(created_at)` across the group's rows (multi-slot
  touchpoint with staggered timestamps picks the earliest).
- Slot map populates `wide`/`medium`/`closeup` from the group's rows; missing
  slots are `undefined`.
- Output sorted by date ascending; `count` = number of groups.
- Rows whose `storage_path` failed to sign are dropped from the slot map.

**`PhotoComparison.test.tsx`**

- Default pair = earliest (A) ↔ latest (B).
- Slot selector defaults to `wide`; switching to a slot a date lacks renders the
  "No photo for this slot on [date]" placeholder for that panel only.
- Bounce toggle is disabled when either panel is in the missing-slot state for the
  selected slot; enabled when both have it.
- Date pickers exclude already-selected touchpoint in the sibling picker (distinct
  selection enforced).
- Issue name, both dates, and wordmark are present in the screenshot-ready layout.
- Bounce state machine: starting toggles `bounceOn`; cadence options map to
  1200/750/400 ms (assert the chosen interval value, not real timing).

**`PhotoComparisonOpenedCapture.test.tsx`**

- Fires `photo_comparison_opened` once per card per session with
  `{ card_state, touchpoint_count }`.
- Does not re-fire on re-render (sessionStorage sentinel) — mirror
  `DecideViewOpenedCapture.test.tsx`.

**View tests (`MonitorView` / `PlannedView` / `ClosedView`)**

- "Compare photos" link renders when `photoTouchpointCount >= 2`.
- Link is absent when `photoTouchpointCount < 2` (the ≥2 gating contract).

### E2E (Playwright — `photo-comparison.spec.ts`)

- Seed a card (admin client) with 2+ photo touchpoints (capture + 1 check-in, or
  capture + finished) across `wide`/`medium` slots → open `cards/[id]` → assert
  "Compare photos" link present → click → assert compare route renders both
  panels, both dates, issue name, wordmark, bounce + slot controls.
- Seed a card with exactly 1 photo touchpoint → assert "Compare photos" link is
  **absent**, and direct navigation to `cards/[id]/compare` redirects back to
  `cards/[id]`.
- Slot-missing path: select a slot one date lacks → assert the placeholder text
  and that the bounce control is disabled.
- **RLS isolation is already pinned** by `apps/web/e2e/rls-isolation.spec.ts`
  (multi-user `card_photos` access across the `{user_id}/...` path segment). Do
  NOT duplicate that contract here — the compare route inherits it because it
  queries `card_photos` under the user-context client.

---

## Dependencies

No new npm packages. Uses existing deps:

- `@supabase/ssr` — server client (`createSignedUrls` plural is on the existing
  storage client).
- `posthog-js` — the one new event.
- `next/link` + App Router `redirect` / `notFound` — entry links + gating.
- Native Pointer Events + `requestAnimationFrame` + CSS transforms — zoom/pan/
  bounce. No gesture/animation library (the PWA spike proved hand-rolled handlers
  hold 60fps).

---

## Task order

Dependency-ordered. Each task is one atomic commit. Phase 2 consumes this list.

### Task 1: Photo-touchpoint data layer (`group-touchpoints` + compare route shell)

**Creates:**

- `apps/web/app/(app)/cards/[id]/compare/_lib/group-touchpoints.ts`
- `apps/web/app/(app)/cards/[id]/compare/_lib/group-touchpoints.test.ts`
- `apps/web/app/(app)/cards/[id]/compare/page.tsx` (fetch + group + batch-sign +
  `< 2` redirect; renders a minimal placeholder `<PhotoComparison>` stub until
  Task 2 fleshes it out — or land Task 1+2 together if cleaner).

**Depends on:** nothing. Foundation for the route + the entry-link count.

**Verify:** `group-touchpoints.test.ts` green; route compiles; navigating to
`compare` on a 1-touchpoint card redirects to `cards/[id]`.

### Task 2: `<PhotoComparison>` side-by-side + synced pinch-zoom/pan

**Creates:**

- `apps/web/app/(app)/cards/[id]/_components/PhotoComparison.tsx`
- `apps/web/app/(app)/cards/[id]/_components/PhotoComparison.test.tsx`

**Depends on:** Task 1 (consumes `CompareTouchpoint[]`).

**Pattern:** full-bleed layout (issue name / panels / dates / wordmark /
controls); two `<img>` sharing one `{ scale, originX, originY }`; Pointer Events
for pinch + pan; `touch-action: none` on panels only.

### Task 3: Bounce mode + cadence picker

**Modifies:** `PhotoComparison.tsx` (+ tests).

**Depends on:** Task 2.

**Pattern:** rAF loop comparing `performance.now()` deltas to cadence ms; instant
`<img>` source swap (no crossfade); segmented cadence picker
(slow 1200 / default 750 / fast 400 ms, default 750); bounce respects the shared
zoom transform.

### Task 4: Date pickers + slot selector + missing-photo edge cases

**Modifies:** `PhotoComparison.tsx` (+ tests).

**Depends on:** Tasks 2, 3.

**Pattern:** two date pickers (photo-bearing touchpoints only, distinct
selection, default earliest ↔ latest); slot selector `wide`/`medium`/`closeup`
default `wide`; missing-slot greying + "No photo for this slot on [date]"; bounce
disabled while either panel is missing the slot.

### Task 5: Compare sub-route wiring + entry points

**Modifies:**

- `apps/web/app/(app)/cards/[id]/page.tsx` — compute `photoTouchpointCount`,
  thread into the three views; finalize `compare/page.tsx` rendering the real
  `<PhotoComparison>`.
- `MonitorView.tsx`, `PlannedView.tsx`, `ClosedView.tsx` (+ their tests) — add
  `photoTouchpointCount` prop + "Compare photos" link gated `>= 2`.

**Depends on:** Tasks 1, 2, 3, 4 (the route must render the finished component).

**Pattern:** `next/link` to `/cards/${cardId}/compare`; link only when `>= 2`.

### Task 6: Metrics event + unit-test sweep + E2E

**Creates:**

- `apps/web/app/(app)/cards/[id]/_components/PhotoComparisonOpenedCapture.tsx`
- `apps/web/app/(app)/cards/[id]/_components/PhotoComparisonOpenedCapture.test.tsx`
- `apps/web/e2e/photo-comparison.spec.ts`

**Modifies:** `PhotoComparison.tsx` (mount the capture component), `METRICS.md`,
`CLAUDE.md`.

**Depends on:** Tasks 1–5.

**Pattern:** sentinel capture mirroring `DecideViewOpenedCapture`; E2E covers the
compare flow + entry gating + slot-missing path; reference (do not duplicate)
`rls-isolation.spec.ts`.

---

## Gotchas

### G1: `touch-action: none` belongs on the panels, NOT `<html>`/`<body>`

Scoping `touch-action: none` to the two photo panels lets pinch/pan work inside
them while leaving page scroll intact everywhere else. Putting it on the document
root kills scroll for the whole page. This is the load-bearing PWA correctness
detail from `pwa-spike-result.md § 4`.

### G2: Batched signing — `createSignedUrls` (plural), and per-path errors

This route is the codebase's first `createSignedUrls` (plural) call site (the rest
loop the singular form). Each `signed[]` entry can carry its own `error`; treat a
failed entry as a missing slot (drop it from the slot map) rather than throwing —
one un-signable photo shouldn't blank the whole comparison.

### G3: Touchpoint date = `min(created_at)`, not `max`

A multi-slot touchpoint (wide + medium + closeup) has three rows with slightly
staggered `created_at`. The displayed date must be `min(created_at)` so the
"date" is when the moment began, matching the capture/check-in event time — not
the last slot uploaded.

### G4: Text-only check-ins fall out for free by grouping on `card_photos`

The "date picker only surfaces moments with ≥1 photo" rule is satisfied by
grouping on `card_photos` rows (not on `check_ins`). A text-only check-in has no
`card_photos` rows, so it never becomes a touchpoint group — no explicit filter
needed. Do NOT join `check_ins` to surface photo-less moments.

### G5: `photo_slot` enum is `wide/medium/closeup` (not "wide/zoom/detail")

The design review's prose says "wide/zoom/detail"; the real DB enum
(`001_enums.sql`) is `wide/medium/closeup`. Use the real enum values in code; the
human labels are Wide / Medium / Close-up. (Note: `touchpoint_type` ALSO has a
`closeup` value — distinct axis; don't conflate slot `closeup` with touchpoint
type `closeup`.)

### G6: ≥2 gating is enforced in TWO places (link + route redirect)

The entry link is gated on `photoTouchpointCount >= 2`, and the route itself
redirects to `cards/[id]` when `< 2`. Both are needed: the link is the primary UX
gate; the route redirect is defense-in-depth against a hand-typed `/compare` URL
or a stale link. When the gate threshold changes, update both.

### G7: Bounce reads `performance.now()` deltas, not a fixed `setInterval`

Use a rAF loop that swaps the displayed frame when `now - lastSwap >= cadenceMs`.
This self-corrects after a backgrounded throttle (one late swap, not a burst) and
matches the spike's drift measurement model. Avoid `setInterval(cadenceMs)` —
iOS Safari clamps background intervals and would queue a burst on resume.

### G8: Distinct touchpoint selection in the two date pickers

A and B must select different touchpoints. Enforce by disabling the option in
picker B that equals picker A's selection (and vice versa). Defaulting A=earliest
and B=latest guarantees distinctness on first render (since count ≥ 2).

### G9: Signed-URL expiry → `<img onError>` falls back to the placeholder

The 10-min TTL can lapse during a long session. An expired URL should flip that
panel to the "No photo for this slot on [date]" placeholder via `<img onError>`,
not show a broken-image glyph. This reuses the missing-slot rendering path.

---

## Acceptance / rollout / rollback

### Acceptance criteria

1. A card with 2+ photo-bearing touchpoints shows a "Compare photos" link on
   MONITOR / PLANNED / CLOSED views; a card with < 2 does not.
2. `cards/[id]/compare` renders two side-by-side panels (edge-to-edge on mobile),
   defaulting to earliest ↔ latest, with both dates, issue name, and the wordmark
   in frame (screenshot-ready).
3. Pinch on either panel zooms both in sync; one-finger drag pans both; page
   scroll outside the panels still works.
4. Bounce mode instant-cuts between the two dates at the picked cadence
   (slow/default/fast); it is disabled when either panel lacks the selected slot.
5. The slot selector (wide/medium/closeup, default wide) switches both panels; a
   date missing the slot shows "No photo for this slot on [date]" and greys.
6. Direct navigation to `cards/[id]/compare` on a < 2-touchpoint card redirects to
   `cards/[id]`.
7. `photo_comparison_opened` fires once per card per session with `card_state` +
   `touchpoint_count`.
8. All unit tests pass; the Playwright E2E (`photo-comparison.spec.ts`) passes.
9. `pnpm lint` + `pnpm typecheck` + `pnpm test` green. No DB advisor run needed
   (no migration).

### Rollout

Standard Vercel preview-per-PR → merge-to-main → prod deploy. No migration, so
nothing deploys via `deploy-migrations.yml`. Pure frontend + read-only query
change — zero data risk.

### Rollback

Revert the PR (git revert the merge commit). No schema, no data migration, no
backfill — the revert fully restores prior behavior. The "Compare photos" links
and the `compare` route disappear; nothing else changes. No production data
touched at any point.
