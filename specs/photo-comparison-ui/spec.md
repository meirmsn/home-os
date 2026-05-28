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
