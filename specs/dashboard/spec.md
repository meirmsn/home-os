<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: dashboard -->
<!-- date: 2026-05-27 -->

# Spec: dashboard

**Sources:**

- `ceo-review § Scope (Dashboard)` — primary scope: tiered card list, visual hierarchy, user-controlled reordering, cards hidden by default
- `.gstack/design-review-home-os-2026-05-02.md § Dashboard — Filtered Card List` — sort logic, tiers, card differentiation, spacing, responsive, empty states
- `.gstack/design-review-home-os-2026-05-02.md § Information Architecture (Dashboard)` — screen hierarchy
- `.gstack/design-review-home-os-2026-05-02.md § Visual Hierarchy (Dashboard Card Differentiation)` — Tier 1/2/PLANNED card treatments
- `.gstack/design-review-home-os-2026-05-02.md § Spacing and Layout` — token scale, dashboard card spacing
- `.gstack/design-review-home-os-2026-05-02.md § Color` — severity chips, dark ground, card surface hierarchy
- `.gstack/design-review-home-os-2026-05-02.md § Responsive Behavior (Dashboard)` — breakpoints, layout rules
- `specs/monitor-beta/spec.md § D6` — walkthrough mode deferred to this PR
- Prior spec `specs/monitor-beta/spec.md` — style + structure reference

Replaces the stub `/(app)/home/page.tsx` with the tiered priority card list — the primary navigation surface. Cards organized by urgency with visual hierarchy, filter tabs, empty states, and walkthrough mode for batching overdue monitoring check-ins.

---

## Product update

### Headline (user-facing)

The home page now shows your cards organized by urgency — items that need attention soon lead the list with full visual weight, while monitoring and planned cards step back. When monitoring items are overdue, a walkthrough prompt lets you check in on all of them in one session.

### Detail (team-facing)

Replaces the stub `/(app)/home/page.tsx` with a tiered card list. Tier 1: Act Soon cards (state `decide`/`diagnosed`, severity `urgent`/`soon`) + reminder-due PLANNED cards. Tier 2: overdue MONITOR cards + TRIAGE_PENDING. PLANNED tab with dot indicator. Filter bar (sticky tabs). Empty states for first-time and nothing-active. Walkthrough mode: inline prompt for stale monitoring items, sequences through overdue cards with check-in/change-path actions. Card thumbnails via `card_photos` signed URLs. 4 PostHog events.

---

## Decisions (resolved at spec time)

8 `/ak-spec`-time decisions resolved in Phase 0 with the user. Recorded below so Phase 1 preserves them verbatim and a crashed Phase 1 resumes without re-asking.

### D1: Skip `photo-comparison-ui` hard dep

**Decision:** Ship dashboard without `photo-comparison-ui`. The dashboard card list doesn't require photo comparison. Cards link to card detail pages that already work. Photo comparison is additive UX within detail, not blocking for the list surface.

**Rationale:** Unblocks the primary navigation surface without waiting for a feature that's independent of the card-list tier logic.

### D2: Walkthrough mode — include

**Decision:** Include walkthrough mode in this PR. Inline dashboard prompt for overdue monitoring cards. Deferred from `monitor-beta` (spec D6: "Walkthrough is an inline dashboard prompt that batches stale monitoring items — it requires the dashboard surface to exist").

**Rationale:** The `monitor-beta` spec explicitly deferred walkthrough to this PR. The dashboard surface is the prerequisite.

### D3: Manual card reordering — defer

**Decision:** Defer manual card reordering to a follow-up PR. Ship with AI-derived sort order (severity × consequence speed for Act Soon; staleness for overdue MONITOR; reminder date for PLANNED).

**Rationale:** ceo-review says "from day one" but drag-and-drop UX + order persistence adds ~2hr scope. The AI-derived sort covers the v0 use case; manual reorder ships as a fast follow.

### D4: Contractor-question-retrieval — exclude

**Decision:** Do not fold contractor-question-retrieval into this PR. It remains a separate PLAN row.

**Rationale:** Separate PLAN row with its own scope. Trim candidate says "fold into dashboard as a manual filter" but that's scope expansion beyond the dashboard's card-list + walkthrough charter.

### D5: Sort order storage — n/a (D3 deferred)

**Decision:** N/A — manual reordering deferred per D3.

**Rationale:** If D3 ships in a follow-up, localStorage is the v0 approach (no migration).

### D6: Dashboard PostHog events

**Decision:** 4 new PostHog events: `dashboard_viewed`, `dashboard_filter_changed`, `walkthrough_started`, `walkthrough_completed`.

**Rationale:** Standard funnel tracking for the primary navigation surface. `dashboard_viewed` fires once per page load. `dashboard_filter_changed` fires on tab switch. Walkthrough events track adoption of the batch check-in flow.

### D7: No migration needed

**Decision:** No migration. All data columns exist on `cards` (`severity`, `state`, `next_check_at`, `planned_reminder_date`, `system_tag`, `monitoring_cadence_days`). Pure UI change.

**Rationale:** Dashboard queries existing tables (`cards`, `card_photos`) with existing RLS policies.

### D8: TRIAGE_PENDING cards in dashboard

**Decision:** Show in Tier 2 with reduced visual weight. TRIAGE_PENDING chip, no severity implied. Top bar indicator: "N captures queued for triage".

**Rationale:** Per design-review § Async Queued State. Cards in async processing states (capturing, triaging) are present but not leading.

---

<!-- Phase 1 expansion begins here. Product update + Decisions above are verbatim from Phase 0. -->

## In scope

This PR delivers:

1. **Dashboard data query + tiering logic** — server-side query on `cards` + `card_photos` with RLS, categorized into Tier 1 (Act Soon + reminder-due PLANNED), Tier 2 (overdue MONITOR + TRIAGE_PENDING), PLANNED tab, and off-default sets. Signed URLs for card thumbnails. All derivation (tiering, sort, overdue, reminder-due) computed server-side.
2. **`<DashboardCard />`** — presentational component with Tier 1 and Tier 2 visual variants. Full viewport width + 16:9 photo for Tier 1 Act Soon; system icon + "Revisit by" chip for Tier 1 reminder-due PLANNED; 4:3 photo + reduced text for Tier 2. Links to `/cards/[id]`.
3. **`<FilterBar />`** — sticky tab bar below the app header: "Needs attention" (default, Tier 1 + Tier 2), "Planned" (dedicated PLANNED tab with dot indicator when any reminder is due), "All" (all non-closed/dismissed). Horizontally scrollable on mobile.
4. **Empty states** — first-time (0 cards ever created): centered prompt + capture CTA. Nothing-active (cards exist, none in Tier 1 or Tier 2): PLANNED cards at full weight + "Nothing needs a decision right now" copy + capture CTA.
5. **Walkthrough mode** — inline dashboard prompt when overdue monitoring cards exist ("N items need a check-in -- Start walkthrough"). Sequences through overdue cards one at a time with an inline check-in form (reuses `<CheckInForm />` from monitor-beta) + keep monitoring / change path actions. Not a modal.
6. **Top bar queued-triage indicator** — "N captures queued for triage" badge in the `(app)` layout header when TRIAGE_PENDING cards exist.
7. **PostHog events** — `dashboard_viewed`, `dashboard_filter_changed`, `walkthrough_started`, `walkthrough_completed` (D6).
8. **Home page integration + tests** — replaces the stub `page.tsx`, wires all components, updates existing page test.

## Not in scope

- **Manual card reordering** — deferred per D3. AI-derived sort order only.
- **Contractor question retrieval** — excluded per D4. Separate PLAN row.
- **Photo comparison UI** — excluded per D1. Cards link to detail pages.
- **Push notifications / email** — overdue indicators are passive (visible when the user opens the dashboard).
- **Sort order persistence** — deferred per D5. No localStorage or DB storage.

---

## Screens

### Dashboard home (`/(app)/home/page.tsx`)

**Layout (top to bottom):**

1. **Queued-triage indicator** (conditional) — rendered in the `(app)` layout header, not in the page body. "N captures queued for triage" text in `--text-secondary-inverse`, positioned left of the email in the header bar. Only renders when `triagePendingCount > 0`.

2. **FilterBar** — sticky below the app header (`sticky top-0 z-10`). Three tabs:
   - "Needs attention" (default) — shows Tier 1 + Tier 2 cards
   - "Planned" — shows all PLANNED cards; dot indicator when any reminder is due
   - "All" — shows all cards except `closed` and `dismissed`

3. **Card list** — renders cards for the active tab:

   **"Needs attention" tab (default):**

   | Section                      | Cards                                                                                                   | Sort order                                                                                                     | Visual treatment                                                                                                                               |
   | ---------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
   | Tier 1: Act Soon             | `state in ('decide', 'diagnosed')` AND `severity in ('urgent', 'soon')` AND `severity_confirmed = true` | `urgent` before `soon`; within same severity, `created_at asc` (oldest first — longest-waiting gets attention) | Full width, 16:9 photo, ~20px title, severity chip over photo bottom-left, consequence line (diagnosis truncated to 1 line)                    |
   | Tier 1: Reminder-due PLANNED | `state = 'planned'` AND `planned_reminder_date <= today`                                                | `planned_reminder_date asc` (oldest reminder first)                                                            | Full width, system icon at 16:9 (no photo), ~20px title, "Revisit by [date]" chip in calm indigo outline, "DIY" or "Contractor" secondary line |
   | Tier 2: Overdue MONITOR      | `state = 'monitoring'` AND `next_check_at < now()`                                                      | staleness desc (most overdue first, computed as `now() - next_check_at`)                                       | 4:3 photo, ~16px title, severity chip smaller, "Overdue" subline                                                                               |
   | Tier 2: TRIAGE_PENDING       | `state in ('capturing', 'triaging')`                                                                    | `created_at desc` (newest first — last captured is top of mind)                                                | 4:3 photo (or placeholder), ~16px title, "TRIAGE PENDING" chip in `--text-secondary-inverse` with `--color-surface-input` bg                   |

   **"Planned" tab:**

   | Section     | Cards               | Sort order                                                                                                   | Visual treatment                                                                                                                |
   | ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
   | All PLANNED | `state = 'planned'` | DIY before Contractor (grouped); within group, `planned_reminder_date asc nulls last` then `updated_at desc` | No photo — system icon only, ~16px title regular weight, "PLANNED - DIY" or "PLANNED - Contractor" chip in calm neutral outline |

   **"All" tab:**
   Union of Tier 1 + Tier 2 + PLANNED + fresh MONITOR (not overdue) + diagnosed (severity confirmed, not act-soon). Sorted by state priority (act-soon states first, then monitoring, then planned, then diagnosed-confirmed-cosmetic/monitor, then triage-pending), then by the within-tier sort for each group.

4. **Walkthrough prompt** (conditional) — appears above the card list on the "Needs attention" tab when overdue monitoring cards exist. Inline card-like element on `--color-surface-raised`:
   - "N items need a check-in -- Start walkthrough" text + Start button
   - On start: replaces the card list with a single-card walkthrough view

5. **Empty states** — see below.

### Empty states

**First-time empty (0 cards ever created):**

- No tabs, no filter bar
- Centered on dark ground: "Nothing logged yet. What's been on your mind about the house?"
- `[Start capture]` link to `/capture` — full-width on mobile, auto-width centered on desktop
- Same `--color-surface-primary` button style as the existing "+ Capture" link

**Nothing-active empty (cards exist, none qualify for Tier 1 or Tier 2 on "Needs attention" tab):**

- FilterBar still visible (user may want "Planned" or "All" tabs)
- "Nothing needs a decision right now." copy in `--text-secondary-inverse`, centered
- If PLANNED cards exist: show them at full visual weight below the copy (same treatment as Tier 1 — promoted to fill the visual gap)
- Capture CTA below: "Capture something new" link to `/capture`

**Tab-specific empty:**

- "Planned" tab with 0 PLANNED cards: "No planned items." centered copy
- "All" tab with 0 non-closed cards: same as first-time empty

### Walkthrough mode

**Entry:** Inline prompt on the "Needs attention" tab — "N items need a check-in -- Start walkthrough"

**Session flow:**

1. User clicks "Start walkthrough" -- `walkthrough_started` PostHog event fires
2. Card list is replaced with a single walkthrough card view:
   - Card title + severity chip + system tag
   - Photo thumbnail (latest check-in photo or capture photo)
   - Overdue indicator: "Last checked N days ago" or "No check-ins yet"
   - Inline `<CheckInForm />` (reused from monitor-beta) with the card's reference photos
   - After form submit (or skip): two options: "Keep monitoring" (stays in monitoring, advances to next card) / "Change path" (navigates to `/cards/[id]` for the full DECIDE surface)
3. Progress indicator: "Card N of M" at the top
4. After all cards: "All caught up!" confirmation + return to dashboard -- `walkthrough_completed` PostHog event fires with `{ cards_checked: number, cards_skipped: number }`
5. "Exit walkthrough" link always available (returns to normal dashboard view without firing `walkthrough_completed`)

**Not a modal.** The walkthrough replaces the card list content area inline. The FilterBar remains visible but disabled during the walkthrough (greyed out tabs, no click). The header/nav remain fully functional.

### DashboardCard component

**Tier 1 Act Soon card:**

- Full viewport width (`w-full`), `bg-[var(--color-surface-tier1)]` (`#F7F7F5`)
- Photo: 16:9 aspect ratio, `object-cover`, rounded-lg top corners
- Severity chip: positioned over photo bottom-left with 8px inset, filled background per severity color system
- Title: `text-xl font-semibold` (20px), `--color-text-primary-inverse`, below photo with `space-4` padding
- Consequence line: `text-sm --color-text-secondary-inverse`, single line truncated with `line-clamp-1`, below title
- System tag: `text-xs` chip, top-right of photo with 8px inset
- Touch target: entire card is an `<a>` wrapping to `/cards/[id]`, `min-h-11`

**Tier 1 Reminder-due PLANNED card:**

- Full viewport width, `bg-[var(--color-surface-tier1)]`
- System icon placeholder: 16:9 aspect ratio, `bg-[var(--color-surface-input)]` with centered system-tag icon (text fallback: system tag name in `text-2xl font-light --text-secondary-inverse`)
- Title: same as Act Soon
- "Revisit by [date]" chip: calm indigo outline (`border-[#7B6BA8] text-[#7B6BA8]`), `rounded-full px-3 py-1 text-xs`
- "DIY" or "Contractor" secondary line: `text-sm --text-secondary-inverse`

**Tier 2 card:**

- Inset with `mx-4`, `bg-[var(--color-surface-tier2)]` (`#EEECEA`)
- Photo: 4:3 aspect ratio, `object-cover`, `rounded-md`
- Title: `text-base font-semibold` (16px) — size reduction does the receding, not opacity
- Severity chip: present, same color system, `text-[10px]` (smaller than Tier 1)
- TRIAGE_PENDING variant: chip reads "TRIAGE PENDING" in `text-[var(--text-secondary-inverse)] bg-[var(--color-surface-input)]`

**PLANNED card (in PLANNED tab):**

- Inset with `mx-4`, `bg-[var(--color-surface-planned)]` (`#E2E0DC`)
- No photo — system icon only (same placeholder as reminder-due)
- Title: `text-base font-normal` (16px, regular weight)
- Status chip: "PLANNED - DIY" or "PLANNED - Contractor" in calm neutral outline

**Spacing between cards:**

- Between Tier 1 cards: `space-6` (32px)
- Between Tier 1 and first Tier 2: `space-6` (32px)
- Between Tier 2 cards: `space-4` (16px)
- Between PLANNED section header and first card: `space-3` (12px)
- Card internal padding: `space-4` (16px) all sides

**Section headers (on dark ground):**
Small caps, 12px, 16px left margin, `--text-secondary-inverse`. "ACT SOON", "NEEDS CHECK-IN", "TRIAGE PENDING" — ambient labels.

### Responsive behavior

**Mobile (<600px):**

- Tier 1 card: full bleed, 16:9 photo, 16px side margins on text
- Tier 2 cards: 16px side margins, 4:3 photo
- PLANNED section: 16px side margins, no photo — system icon only
- Filter tabs: horizontally scrollable single row, sticky below top nav, does not wrap

**Tablet (600px-899px):**

- Tier 1 card: full width unchanged
- Tier 2 + PLANNED: 2-column grid, 24px gutter
- Filter tabs: full row, no scroll

**Desktop (900px+):**

- Max content width 720px, centered
- All cards single column within that bound
- Dark background visible on both sides — frames content

---

## Data model changes

No migration. Per D7, all data columns already exist on `cards` and `card_photos`. The dashboard queries existing tables with existing RLS policies.

### Query shape

The home page issues a single `cards` SELECT for the authenticated user:

```sql
SELECT id, state, title, initial_description, severity, severity_confirmed,
       system_tag, room_tag, chosen_path, planned_reminder_date,
       next_check_at, monitoring_cadence_days, created_at, updated_at
FROM cards
WHERE user_id = auth.uid()
  AND state NOT IN ('closed', 'dismissed')
ORDER BY created_at DESC
```

RLS handles the `user_id` filter; the explicit WHERE is defense-in-depth.

For each card with a photo, a second query fetches the latest `card_photos` row with `touchpoint_type='primary'` and `slot='wide'` (same pattern as card detail page), then generates a signed URL (10-minute TTL).

**Tiering is computed in TypeScript, not SQL.** The query returns all active cards; the page categorizes them into tiers. This avoids a complex SQL query and keeps the tiering logic testable in unit tests.

### Card count query

A separate count query determines first-time vs nothing-active empty state:

```sql
SELECT count(*) FROM cards WHERE user_id = auth.uid()
```

If count is 0 → first-time empty. If count > 0 but no cards qualify for the active tab → tab-specific empty.

### TRIAGE_PENDING count (for top bar)

```sql
SELECT count(*) FROM cards
WHERE user_id = auth.uid()
  AND state IN ('capturing', 'triaging')
```

Passed from the home page to the layout via a URL search param or a parallel server component. Implementation: a `<TriagePendingBadge />` server component in the layout that runs its own query (same pattern as `getUser()` — parallel server component renders, cached within the request).

---

## API contracts

No new API routes. The dashboard is a pure server-rendered page that reads from existing tables via the Supabase server client. All data fetching happens in the page's server component.

The walkthrough check-in reuses the existing `POST /api/card/[id]/checkin` route from monitor-beta. The "Change path" action in walkthrough links to `/cards/[id]` (the full card detail page) rather than calling an API inline — keeps the walkthrough simple.

---

## Offline behavior

The dashboard is server-rendered on every request (`export const dynamic = 'force-dynamic'`). No offline support. If the user is offline, the standard Next.js error page renders. The PWA shell (if cached) shows the layout chrome but the main content area will fail to load.

Future consideration: static shell with `loading.tsx` skeleton + client-side revalidation. Out of scope for this PR.

---

## Metrics

Four new PostHog events per D6.

| Event                      | When it fires                                                                                                                                                                                  | Key properties                                                                                                                                         | Why we care                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dashboard_viewed`         | Fired once per page load from a `<DashboardViewedCapture />` client component mounted by the home page. No sessionStorage dedup — every page load counts (the user returned to the dashboard). | `{ total_cards: number, tier1_count: number, tier2_count: number, planned_count: number, triage_pending_count: number, has_overdue_monitor: boolean }` | Measures dashboard engagement and provides a snapshot of the user's card distribution at view time. `has_overdue_monitor` is the walkthrough-eligible signal.            |
| `dashboard_filter_changed` | Fired from `<FilterBar />` when the user clicks a tab that is different from the current active tab.                                                                                           | `{ from_tab: 'attention' \| 'planned' \| 'all', to_tab: 'attention' \| 'planned' \| 'all' }`                                                           | Measures navigation patterns within the dashboard — do users explore beyond the default tab? High `attention→planned` rate validates the dedicated PLANNED tab decision. |
| `walkthrough_started`      | Fired from the walkthrough prompt component when the user clicks "Start walkthrough".                                                                                                          | `{ overdue_count: number }`                                                                                                                            | Top of the walkthrough funnel — measures adoption of the batch check-in flow.                                                                                            |
| `walkthrough_completed`    | Fired when the user finishes all overdue cards in the walkthrough (not on early exit).                                                                                                         | `{ cards_checked: number, cards_skipped: number }`                                                                                                     | Bottom of the walkthrough funnel. `cards_skipped` (exited via "Change path" or skipped without check-in) measures whether the walkthrough flow is too rigid.             |

**Sentry events** (diagnostic, not PostHog):

| Event                                                                 | When                                                                  | Tags/Extra                                                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Sentry.captureException` — `cards SELECT errored on home page`       | Home page cards SELECT returns a PostgREST error                      | `tags: { surface: 'home', stage: 'cards_select' }; extra: { user_id, error_message, error_code }` |
| `Sentry.captureException` — `card_photos SELECT errored on home page` | card_photos query or signed URL generation fails for a card thumbnail | `tags: { surface: 'home', stage: 'card_photos' }; extra: { card_id, user_id }`                    |

---

## Files to create/modify

### New files

| File                                                                  | Purpose                                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/(app)/home/_lib/tier-cards.ts`                          | Pure function: takes array of card rows + `now` timestamp, returns `{ tier1: Card[], tier2: Card[], planned: Card[], all: Card[], overdueMonitor: Card[] }`. All tiering + sorting logic lives here — testable without rendering. |
| `apps/web/app/(app)/home/_lib/tier-cards.test.ts`                     | Unit tests for tiering + sorting logic (the bulk of the spec's correctness guarantees).                                                                                                                                           |
| `apps/web/app/(app)/home/_components/DashboardCard.tsx`               | Presentational component — Tier 1, Tier 2, PLANNED, and TRIAGE_PENDING card variants. Pure props, no data fetching.                                                                                                               |
| `apps/web/app/(app)/home/_components/DashboardCard.test.tsx`          | Unit tests for DashboardCard visual variants.                                                                                                                                                                                     |
| `apps/web/app/(app)/home/_components/FilterBar.tsx`                   | Client component — sticky tab bar with "Needs attention" / "Planned" / "All" tabs. Manages active tab state. Fires `dashboard_filter_changed`.                                                                                    |
| `apps/web/app/(app)/home/_components/FilterBar.test.tsx`              | Unit tests for FilterBar tab switching + event firing.                                                                                                                                                                            |
| `apps/web/app/(app)/home/_components/EmptyState.tsx`                  | Presentational component — first-time and nothing-active empty states.                                                                                                                                                            |
| `apps/web/app/(app)/home/_components/EmptyState.test.tsx`             | Unit tests for EmptyState variants.                                                                                                                                                                                               |
| `apps/web/app/(app)/home/_components/WalkthroughMode.tsx`             | Client component — walkthrough session: sequences through overdue cards, embeds `<CheckInForm />`, fires walkthrough PostHog events.                                                                                              |
| `apps/web/app/(app)/home/_components/WalkthroughMode.test.tsx`        | Unit tests for WalkthroughMode session flow.                                                                                                                                                                                      |
| `apps/web/app/(app)/home/_components/WalkthroughPrompt.tsx`           | Presentational component — "N items need a check-in -- Start walkthrough" prompt card.                                                                                                                                            |
| `apps/web/app/(app)/home/_components/WalkthroughPrompt.test.tsx`      | Unit tests for WalkthroughPrompt.                                                                                                                                                                                                 |
| `apps/web/app/(app)/home/_components/DashboardViewedCapture.tsx`      | Client component — fires `dashboard_viewed` PostHog event once per page load. Same pattern as `DecideViewOpenedCapture` but without sessionStorage dedup (every load counts).                                                     |
| `apps/web/app/(app)/home/_components/DashboardViewedCapture.test.tsx` | Unit tests for DashboardViewedCapture.                                                                                                                                                                                            |
| `apps/web/app/(app)/_components/TriagePendingBadge.tsx`               | Server component — "N captures queued for triage" text in the header. Runs its own `cards` count query. Renders null when count is 0.                                                                                             |
| `apps/web/app/(app)/_components/TriagePendingBadge.test.tsx`          | Unit tests for TriagePendingBadge.                                                                                                                                                                                                |

### Modified files

| File                                    | Change                                                                                                                                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/(app)/home/page.tsx`      | Full rewrite — replaces stub with dashboard server component: cards query, card_photos query, tiering, signed URLs, wires DashboardCard + FilterBar + EmptyState + WalkthroughMode + DashboardViewedCapture |
| `apps/web/app/(app)/home/page.test.tsx` | Full rewrite — tests for tiered rendering, empty states, walkthrough prompt visibility, redirect on no user                                                                                                 |
| `apps/web/app/(app)/layout.tsx`         | Add `<TriagePendingBadge />` server component in header                                                                                                                                                     |
| `METRICS.md`                            | Add 4 PostHog event rows + 2 Sentry rows                                                                                                                                                                    |
| `CLAUDE.md`                             | Add dashboard gotchas (tiering server-side, walkthrough reuses CheckInForm, reminder-due derivation dual-site)                                                                                              |

---

## Tests

### Tiering logic tests (`tier-cards.test.ts`)

The core correctness layer — all tiering, filtering, and sorting logic is tested here without rendering.

- **Tier 1 Act Soon**: includes `decide` + `diagnosed` cards with severity `urgent`/`soon` and `severity_confirmed=true`; excludes `severity_confirmed=false`; excludes `cosmetic`/`monitor` severity; sorts `urgent` before `soon`, oldest `created_at` first within severity.
- **Tier 1 Reminder-due PLANNED**: includes `planned` cards where `planned_reminder_date <= today`; excludes future-dated reminders; excludes null reminders; sorts by `planned_reminder_date asc`.
- **Tier 1 ordering**: Act Soon cards appear before reminder-due PLANNED cards.
- **Tier 2 Overdue MONITOR**: includes `monitoring` cards where `next_check_at < now`; excludes fresh (not overdue) monitoring cards; sorts by staleness desc.
- **Tier 2 TRIAGE_PENDING**: includes `capturing` + `triaging` cards; sorts by `created_at desc`.
- **Tier 2 ordering**: overdue MONITOR before TRIAGE_PENDING.
- **PLANNED tab**: includes all `planned` cards; groups DIY before Contractor; sorts by `planned_reminder_date asc nulls last` then `updated_at desc`.
- **All tab**: excludes `closed` and `dismissed`; includes everything else.
- **Overdue monitor list**: returns only `monitoring` cards where `next_check_at < now` (for walkthrough eligibility).
- **Edge case — card with null severity**: excluded from Tier 1 Act Soon even if state is `decide`.
- **Edge case — card with severity `cosmetic` in decide state**: excluded from Tier 1, included in "All".
- **Edge case — monitoring card with null `next_check_at`**: not treated as overdue (excluded from Tier 2 overdue).

### Component tests

**`DashboardCard.test.tsx`**:

- Renders Tier 1 Act Soon card with photo, severity chip, title, consequence line, system tag.
- Renders Tier 1 reminder-due PLANNED card with system icon, "Revisit by" chip, path label.
- Renders Tier 2 card with smaller photo, smaller text, severity chip.
- Renders TRIAGE_PENDING card with "TRIAGE PENDING" chip.
- Renders PLANNED tab card with system icon, "PLANNED - DIY" chip.
- Links to `/cards/[id]`.
- Renders placeholder when no photo URL.

**`FilterBar.test.tsx`**:

- Renders three tabs; "Needs attention" active by default.
- Click "Planned" → fires `dashboard_filter_changed` with `{ from_tab: 'attention', to_tab: 'planned' }`.
- Click same active tab → no event fired.
- Dot indicator on "Planned" tab when `hasReminderDue=true`.
- Disabled state during walkthrough (tabs greyed, no click).

**`EmptyState.test.tsx`**:

- First-time: renders prompt text + capture CTA link to `/capture`.
- Nothing-active: renders "Nothing needs a decision right now." + promoted PLANNED cards + capture CTA.
- Tab-specific: renders "No planned items." for empty Planned tab.

**`WalkthroughMode.test.tsx`**:

- Renders card info + check-in form for first overdue card.
- Progress indicator shows "Card 1 of N".
- After check-in submit: shows keep/change options; "Keep monitoring" advances to next card.
- "Change path" links to `/cards/[id]`.
- After all cards: shows "All caught up!" + fires `walkthrough_completed`.
- "Exit walkthrough" returns to normal view without firing completion event.
- Fires `walkthrough_started` on mount.

**`WalkthroughPrompt.test.tsx`**:

- Renders count and "Start walkthrough" button.
- Does not render when overdue count is 0.

**`DashboardViewedCapture.test.tsx`**:

- Fires `dashboard_viewed` with correct properties on mount.
- Re-fires on re-mount (no sessionStorage dedup — every page load counts).

**`TriagePendingBadge.test.tsx`**:

- Renders "N captures queued" text when count > 0.
- Renders null when count is 0.
- Handles singular ("1 capture queued") vs plural.

### Page-level tests (`page.test.tsx`)

- Renders dashboard cards when user has active cards.
- Shows first-time empty state when user has 0 cards.
- Shows nothing-active empty state when all cards are closed/dismissed.
- Shows walkthrough prompt when overdue monitoring cards exist.
- Redirects to `/login` when no user (defense-in-depth).
- FilterBar is present when cards exist.

---

## Dependencies

No new npm packages. All functionality uses existing dependencies:

- `posthog-js` — already installed (PostHog events)
- `@sentry/nextjs` — already installed (error capture)
- `@supabase/ssr` — already installed (server client)
- `next/link` — built-in (card navigation)
- `next/navigation` — built-in (redirect, useRouter)
- `react` — built-in (useState, useEffect, useRef)

Cross-PR component dependency:

- `<CheckInForm />` from `apps/web/app/(app)/cards/[id]/_components/CheckInForm.tsx` — reused in walkthrough mode. The component accepts `cardId`, `isOverdue`, and `referencePhotos` props. The walkthrough passes the current overdue card's props.
- `<CheckInTimeline />` types (`CheckInPhoto`, `CheckInEntry`) — reused for type compatibility.

---

## Task order

Dependency-ordered implementation tasks. Each task is one atomic commit.

### Task 1: Dashboard data query + tiering logic

**Creates:**

- `apps/web/app/(app)/home/_lib/tier-cards.ts`
- `apps/web/app/(app)/home/_lib/tier-cards.test.ts`

**Depends on:** nothing (pure logic, no rendering)

**Detail:** Export a `tierCards(cards: DashboardCardRow[], now: number)` function that takes the raw card rows and current timestamp, returns `{ tier1: DashboardCardRow[], tier2: DashboardCardRow[], planned: DashboardCardRow[], all: DashboardCardRow[], overdueMonitor: DashboardCardRow[] }`. Define the `DashboardCardRow` type (subset of cards table columns needed for tiering + display). All sorting logic (severity ordering, staleness, reminder date) lives here. Export a `todayIso(now: number): string` helper for reminder-due comparison (same UTC-slice pattern as card detail page — never compare Date objects for calendar dates).

**Verify:** `vitest run apps/web/app/(app)/home/_lib/tier-cards.test.ts` passes.

### Task 2: DashboardCard component (Tier 1 + Tier 2 variants)

**Creates:**

- `apps/web/app/(app)/home/_components/DashboardCard.tsx`
- `apps/web/app/(app)/home/_components/DashboardCard.test.tsx`

**Depends on:** nothing (pure presentational, receives props)

**Detail:** Server component. Props: `card: DashboardCardRow`, `tier: 'tier1-act-soon' | 'tier1-reminder' | 'tier2' | 'tier2-triage' | 'planned'`, `photoUrl: string | null`. Renders the appropriate visual variant per tier. Uses `next/link` to wrap the card as a link to `/cards/[id]`. Imports `severityChipClasses` from the shared `_severity-chip.ts` helper (or re-exports the function from the card detail page's internal module — check if it's already a shared export).

If `_severity-chip.ts` is not importable from the home page (it's in `cards/[id]/_components/`), create a shared copy at `apps/web/app/(app)/_lib/severity-chip.ts` and update both import sites. Alternatively, reference the same severity chip inline (the color mapping is 4 lines — DRY-tension is tolerable here if the import path is awkward).

**Verify:** `vitest run apps/web/app/(app)/home/_components/DashboardCard.test.tsx` passes.

### Task 3: FilterBar component (sticky tabs)

**Creates:**

- `apps/web/app/(app)/home/_components/FilterBar.tsx`
- `apps/web/app/(app)/home/_components/FilterBar.test.tsx`

**Depends on:** nothing (standalone client component)

**Detail:** `'use client'` component. Props: `activeTab: 'attention' | 'planned' | 'all'`, `onTabChange: (tab) => void`, `hasReminderDue: boolean`, `disabled: boolean`. Renders three tab buttons in a sticky bar. Fires `dashboard_filter_changed` PostHog event on tab switch (only when the new tab differs from the current). Dot indicator on "Planned" tab: `<span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#7B6BA8]" />` (calm indigo, same as reminder chip color).

Sticky positioning: `sticky top-0 z-10 bg-[var(--color-background)] border-b border-[var(--color-border-subtle)] px-4 py-2`. Mobile: `overflow-x-auto whitespace-nowrap`. Desktop: `flex justify-center`.

Tab button styling: active tab `font-semibold text-[var(--color-text-primary-inverse)] border-b-2 border-[var(--color-text-primary-inverse)]`; inactive tab `font-normal text-[var(--color-text-secondary-inverse)]`. Disabled state: `opacity-50 pointer-events-none`.

**Verify:** `vitest run apps/web/app/(app)/home/_components/FilterBar.test.tsx` passes.

### Task 4: Empty states (first-time + nothing-active)

**Creates:**

- `apps/web/app/(app)/home/_components/EmptyState.tsx`
- `apps/web/app/(app)/home/_components/EmptyState.test.tsx`

**Depends on:** Task 2 (nothing-active may render promoted PLANNED cards via `<DashboardCard />`)

**Detail:** Server component. Props: `variant: 'first-time' | 'nothing-active' | 'tab-empty'`, `promotedPlannedCards?: DashboardCardRow[]`, `tabName?: string`. First-time: centered prompt text + `<Link href="/capture">` CTA. Nothing-active: copy + promoted PLANNED cards (rendered as Tier 1 full-weight cards) + capture CTA. Tab-empty: simple centered text "No {tabName} items."

**Verify:** `vitest run apps/web/app/(app)/home/_components/EmptyState.test.tsx` passes.

### Task 5: Walkthrough mode (prompt + session flow)

**Creates:**

- `apps/web/app/(app)/home/_components/WalkthroughPrompt.tsx`
- `apps/web/app/(app)/home/_components/WalkthroughPrompt.test.tsx`
- `apps/web/app/(app)/home/_components/WalkthroughMode.tsx`
- `apps/web/app/(app)/home/_components/WalkthroughMode.test.tsx`

**Depends on:** Task 2 (may render card info), monitor-beta's `<CheckInForm />` (reused)

**Detail:**

`WalkthroughPrompt`: Server component. Props: `overdueCount: number`. Renders the prompt card. Does not render when count is 0.

`WalkthroughMode`: `'use client'` component. Props: `overdueCards: WalkthroughCard[]` (card id, title, severity, system_tag, photoUrl, isOverdue, referencePhotos, cadenceDays). State: `currentIndex: number`, `checkedCount: number`, `skippedCount: number`, `completed: boolean`.

Renders one card at a time: card info header + `<CheckInForm cardId={card.id} isOverdue={true} referencePhotos={card.referencePhotos} />`. After the check-in form submits (detected via `useRouter().refresh()` or a callback prop), shows two buttons: "Keep monitoring" (increment `currentIndex`) and "Change path" (`<Link href="/cards/[id]">`).

The `<CheckInForm />` import path crosses from `home/_components/` to `cards/[id]/_components/`. This is a valid Next.js import (no route-group boundary on imports, only on routing). If the import path feels fragile, consider moving `CheckInForm` to a shared location — but for v0 the cross-reference is acceptable (same app, same package).

Progress: "Card {currentIndex + 1} of {total}" text at top.

When `currentIndex >= overdueCards.length`: show "All caught up!" + fire `walkthrough_completed`.

**Verify:** `vitest run apps/web/app/(app)/home/_components/WalkthroughMode.test.tsx` and `WalkthroughPrompt.test.tsx` pass.

### Task 6: Top bar queued-triage indicator

**Creates:**

- `apps/web/app/(app)/_components/TriagePendingBadge.tsx`
- `apps/web/app/(app)/_components/TriagePendingBadge.test.tsx`

**Modifies:**

- `apps/web/app/(app)/layout.tsx` — add `<TriagePendingBadge />` in the header

**Depends on:** nothing (standalone server component)

**Detail:** Server component. Runs `supabase.from('cards').select('id', { count: 'exact', head: true }).in('state', ['capturing', 'triaging'])` to get the count. Renders `<span data-testid="triage-pending-badge">N capture(s) queued for triage</span>` in `text-xs text-[var(--color-text-secondary-inverse)]` when count > 0. Renders `null` when count is 0.

Positioned in the layout header: insert before the email `<span>` element. The layout already runs `getUser()` — the badge's `createClient()` reuses the same cookie context (Supabase server client caches within the request).

**Verify:** `vitest run apps/web/app/(app)/_components/TriagePendingBadge.test.tsx` passes.

### Task 7: Dashboard PostHog events

**Creates:**

- `apps/web/app/(app)/home/_components/DashboardViewedCapture.tsx`
- `apps/web/app/(app)/home/_components/DashboardViewedCapture.test.tsx`

**Depends on:** nothing (standalone client component)

**Detail:** `'use client'` component. Props: `totalCards: number`, `tier1Count: number`, `tier2Count: number`, `plannedCount: number`, `triagePendingCount: number`, `hasOverdueMonitor: boolean`. Fires `dashboard_viewed` on mount via `useEffect` with a `useRef` guard (fire once per mount, not per re-render — but DO re-fire on remount/page navigation). No sessionStorage dedup (D6 says "once per page load", and page loads are full server renders with `force-dynamic`).

Pattern: same as `SignInCompletedCapture` (useRef guard) but simpler (no identify call, no sessionStorage).

**Verify:** `vitest run apps/web/app/(app)/home/_components/DashboardViewedCapture.test.tsx` passes.

### Task 8: Home page integration + tests

**Modifies:**

- `apps/web/app/(app)/home/page.tsx` — full rewrite
- `apps/web/app/(app)/home/page.test.tsx` — full rewrite
- `METRICS.md` — add 4 PostHog + 2 Sentry event rows
- `CLAUDE.md` — add dashboard gotchas

**Depends on:** Tasks 1-7 (composes all components)

**Detail — page.tsx rewrite:**

1. Auth check (same pattern as current stub).
2. Cards query: `supabase.from('cards').select(columns).not('state', 'in', '(closed,dismissed)')` — fetch all active cards.
3. Total card count: `supabase.from('cards').select('id', { count: 'exact', head: true })` — for first-time empty detection.
4. Card photos query: for each card with a photo, fetch latest `touchpoint_type='primary'`, `slot='wide'` photo and generate signed URL. Batch this efficiently (fetch all primary/wide photos in one query, then sign URLs in parallel). For monitoring cards, also fetch latest check-in photos for walkthrough reference.
5. Call `tierCards(cardRows, Date.now())` to categorize.
6. Derive `hasReminderDue` (any planned card with `planned_reminder_date <= todayIso`).
7. Render: `<FilterBar />` + card list (switched by active tab) + `<WalkthroughPrompt />` (conditional) + `<EmptyState />` (conditional) + `<DashboardViewedCapture />`.

The page is a server component. The `<FilterBar />` is a client component that manages tab state. The page passes all three tab's card lists as props; the client component shows/hides based on active tab. This avoids client-side data fetching — the server pre-renders all data, and the client just toggles visibility.

Implementation pattern for tab switching without client fetch: render three `<div>` sections (one per tab) in the server component, each with a `data-tab="attention|planned|all"` attribute. The `<FilterBar />` client component uses CSS to show/hide (`hidden` class toggle) rather than conditional rendering — this way the server pre-renders everything and the client just toggles display. Alternative: use URL search params (`?tab=planned`) for server-side tab switching with full page reloads — but this adds latency on tab change. The CSS-toggle approach is better for v0.

**Detail — METRICS.md:**

Add 4 PostHog rows + 2 Sentry rows per the Metrics section above.

**Detail — CLAUDE.md gotchas:**

Add:

- Tiering logic lives in `_lib/tier-cards.ts`, not SQL — keeps it testable and avoids complex query. Both the home page and (future) any dashboard widget must use the same function.
- Reminder-due derivation is now in TWO places: card detail page (`page.tsx` line ~363) and dashboard (`tier-cards.ts`). Same UTC-slice pattern. When calendar-date derivation changes, audit both sites.
- Walkthrough reuses `<CheckInForm />` from `cards/[id]/_components/` — a cross-route-group import. If CheckInForm's props change, the walkthrough breaks. Add a comment at the import site.
- Dashboard photo query batches signed URLs — if the user has 20+ active cards, this is 20+ storage.createSignedUrl calls. Acceptable for v0 (each call is ~5ms to Supabase Storage). If latency becomes an issue, batch via `createSignedUrls` (plural) API.

**Verify:** `vitest run apps/web/app/(app)/home/` passes all tests. Manual: navigate to `/home` in the dev environment, verify card list renders with correct tiering.

---

## Gotchas

### G1: Tiering logic is TypeScript, not SQL

The dashboard fetches all active cards in a single query and categorizes them in `tier-cards.ts`. This is deliberate — the tiering rules (severity + state + reminder date + overdue + confirmed flag) are complex enough that a SQL query with CASE/UNION would be hard to maintain and impossible to unit test. The trade-off: the client receives all active cards (max ~20 per the card cap). At this scale, the in-memory sort is negligible.

### G2: Reminder-due derivation — dual-site

`planned_reminder_date <= todayIso` is now computed in TWO places: the card detail page (`apps/web/app/(app)/cards/[id]/page.tsx` line ~363) and the dashboard tiering logic (`apps/web/app/(app)/home/_lib/tier-cards.ts`). Both use the same UTC-slice pattern (`new Date(now).toISOString().slice(0, 10)`). If this derivation changes, audit both sites. Spec § D7 explicitly rejected centralizing in a SQL view — the abstraction surfaces when the derivation needs a third consumer.

### G3: Photo query fan-out on large card counts

For each active card, the page fetches the latest primary/wide photo and generates a signed URL. With the 20-card weekly cap, this is at most ~20 sequential photo queries + signed URL calls. Each takes ~5ms. Total: ~100ms additional latency on a dashboard with 20 active cards. Acceptable for v0. If the card cap rises or latency becomes an issue, batch the photo query (single SELECT with a window function to pick the latest per card) and use `createSignedUrls` (plural API).

### G4: Walkthrough CheckInForm cross-import

`<WalkthroughMode />` imports `<CheckInForm />` from `apps/web/app/(app)/cards/[id]/_components/CheckInForm.tsx`. This is a cross-route-group import. Next.js route groups (`(app)`) are routing boundaries, not module boundaries — the import works. But if `CheckInForm`'s props change in a future PR, the walkthrough breaks silently (TypeScript catches it at build, but a refactor that changes prop names without updating the walkthrough import would be a bug). Add a `// Used by: WalkthroughMode.tsx (dashboard)` comment at the CheckInForm export.

### G5: FilterBar CSS-toggle vs conditional render

The page pre-renders all three tab contents server-side and uses CSS (`hidden` class) to toggle visibility based on the active tab. This means the DOM includes all tabs' cards even when only one is visible. For 20 cards this is negligible. If card count grows, switch to URL-param-based tab switching (full server re-render per tab) or client-side conditional rendering with `Suspense`.

### G6: `DashboardViewedCapture` fires on every page load

Unlike `DecideViewOpenedCapture` (once per card per session), the dashboard event fires on every mount. This is intentional — the dashboard is the primary navigation surface, and "how often do users return to the dashboard?" is a core engagement metric. The `useRef` guard prevents double-firing from React strict-mode double-mount in development.

### G7: TriagePendingBadge runs its own query

The `<TriagePendingBadge />` server component in the layout runs a `cards` count query on every request. This is a HEAD request with `count: 'exact'` — no row data transferred, just the count header. The Supabase server client reuses the same cookie context as `getUser()`. The query is cheap (~2ms) and cached within the request. This is simpler than passing the count from the home page to the layout (which would require a non-trivial data-passing pattern across the layout/page boundary in App Router).

### G8: Walkthrough "Keep monitoring" does not call any API

When the user clicks "Keep monitoring" after a check-in in walkthrough mode, no API call is needed — the card stays in `monitoring` state with a freshly-reset `next_check_at` (the check-in submission already handled that). The button just advances the walkthrough to the next card. "Change path" navigates to the full card detail page where the user can use the existing DECIDE surface.

---

## Acceptance / rollout / rollback

### Acceptance criteria

1. Navigating to `/home` shows the tiered card list instead of the stub text.
2. Tier 1 Act Soon cards (decide/diagnosed, urgent/soon, confirmed) render at full visual weight with 16:9 photo and severity chip.
3. Tier 1 reminder-due PLANNED cards render with system icon and "Revisit by [date]" indigo chip.
4. Tier 2 overdue MONITOR cards render with reduced visual weight and "Overdue" indicator.
5. Tier 2 TRIAGE_PENDING cards render with "TRIAGE PENDING" chip.
6. FilterBar tabs switch between "Needs attention", "Planned", and "All" views.
7. "Planned" tab shows dot indicator when any planned card has a reminder due.
8. First-time empty state renders the prompt + capture CTA when the user has 0 cards.
9. Nothing-active empty state renders when all cards are closed/monitoring(fresh)/dismissed.
10. Walkthrough prompt appears when overdue monitoring cards exist.
11. Walkthrough mode sequences through overdue cards with inline check-in + keep/change options.
12. Top bar shows "N captures queued for triage" when TRIAGE_PENDING cards exist.
13. All 4 PostHog events fire with correct properties.
14. All tiering logic unit tests pass.
15. All component tests pass.
16. All page-level tests pass.
17. `pnpm build` succeeds (no type errors from cross-route-group import).

### Rollout

Standard Vercel preview-per-PR -> merge-to-main -> prod deploy. No migration involved (D7). The change is a pure UI replacement — the stub page becomes the real dashboard.

### Rollback

1. Revert the PR (git revert the merge commit).
2. The stub page is restored. No data migration needed — the dashboard only reads existing data.
3. The `<TriagePendingBadge />` in the layout is removed by the revert. No layout-level state to clean up.
4. METRICS.md and CLAUDE.md changes revert cleanly.
