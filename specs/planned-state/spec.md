<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: planned-state -->
<!-- date: 2026-05-17 -->

# Spec: planned-state (PR N)

**Sources:**

- `PLAN.md § Planned #1` — primary scope (this row)
- `.gstack/ceo-review-home-os-2026-05-01-r2.md § Card Lifecycle (PLANNED) + § Scope (PLANNED)` — premises, scope boundaries
- `.gstack/design-review-home-os-2026-05-02.md § PLANNED + § Card States — Visual Presentation + § Visual Hierarchy + § PLANNED Card — Never Overdue` — UI surface, chip styling, never-overdue treatment
- `.gstack/eng-review-home-os-2026-05-01.md § Tables (cards.planned_reminder_date) + § Build Order step 8 + § Card Lifecycle (PLANNED)` — schema column name, sequencing, lifecycle invariants
- Prior spec `specs/decide-state/spec.md` — style + structure reference; this PR extends the `<PlannedView />` stub PR #1 shipped
- `apps/web/app/(app)/cards/[id]/_components/PlannedView.tsx` (D10 stub from PR #1 — "PR #2 (planned-state) will expand with reminder dates, never-overdue treatment, dashboard-tier lift")
- `apps/web/app/(app)/cards/[id]/page.tsx` — state-switched body that already mounts `<PlannedView />`; this PR threads new props through
- `supabase/migrations/20260517031335_011_decide_state.sql` — `cards.chosen_path` + `cost_estimate_*_override` columns this PR reads but does not modify
- `packages/ui/src/tokens.ts` + `apps/web/app/globals.css` — `--color-planned: #5c6bc0` (calm indigo) token already exists

PR N delivers the PLANNED-state surface on top of PR #1's stub. Adds the optional reminder-date column + the user-facing reminder set/edit/clear flow, the calm-indigo "Revisit by [date]" chip with never-overdue semantics, and a "Before you close" summary that pulls materials/tools/contractor-questions from the existing decide-state jsonb. Closes PLAN row #1 (`planned-state`); unblocks rows #2 (`close-flow`) and #5 (`dashboard`) — the dashboard's reminder-due tier-1 lift will read the raw column + compute its own predicate at that time.

---

## Decisions (resolved at spec time)

9 `/ak-spec`-time decisions resolved in Phase 0 with the user. Recorded below so Phase 1 preserves them verbatim and a crashed Phase 1 resumes without re-asking.

### D1: Schema for the optional reminder date

**Decision:** Migration 012 adds `cards.planned_reminder_date date NULL`. Partial index on `(state, planned_reminder_date) WHERE state = 'planned'::public.card_state` for the future dashboard reminder-due query. No CHECK constraint on past/future — user can set anything. No `updated_at` trigger change needed (the existing `cards_updated_at` BEFORE UPDATE trigger from migration 005 already covers row touches).

**Rationale:** Eng-review § Tables already names this column. `date` (not `timestamptz`) matches the design intent — "Revisit by [date]" is calendar semantics, not clock. No CHECK because past dates are valid (user may set "remind me yesterday" intentionally; the never-overdue chip still applies). Partial index keyed on `state='planned'` keeps it small — capturing/triaging/decide cards never need it. Plain additive migration: no rename-recreate dance, no function signature changes, no privilege concerns (migration 008's `ALTER DEFAULT PRIVILEGES` already covers the new column).

### D2: API surface for set / edit / clear reminder

**Decision:** `PATCH /api/card/[id]/reminder` with body `{ reminder_date: 'YYYY-MM-DD' | null }` (null = clear). Auth-gated; user-context client + RLS for the UPDATE; no SECURITY DEFINER RPC. Allowed only in `state='planned'` — `decide` doesn't have a chosen path yet, `monitoring`/`closed`/`dismissed` are wrong states (reminders only make sense on a card the user has committed to but hasn't closed). Returns 200 / 400 / 401 / 404 / 409. Body validation in `_lib/parse-reminder-body.ts` (strict ISO `YYYY-MM-DD` regex + `Date` round-trip, OR explicit `null`).

**Rationale:** Mirrors `/estimate` PATCH posture from PR #1 (data, not state-machine transition). Direct UPDATE under RLS is sufficient — the only invariant is "owner only", which RLS enforces. No SECURITY DEFINER needed. Strict regex + `Date` round-trip rejects malformed strings like `'2026-13-45'` or `'tomorrow'` without false-accepting them via JS's permissive `new Date()`.

### D3: Never-overdue semantics

**Decision:** Server-side derived predicate `is_reminder_due = (state = 'planned' AND planned_reminder_date IS NOT NULL AND planned_reminder_date <= CURRENT_DATE)`. Three display states for the reminder UI:

- `planned_reminder_date IS NULL` → no chip rendered; reminder section shows "Set a reminder" affordance.
- `planned_reminder_date > CURRENT_DATE` (future) → calm "Revisit by [date]" subline (informational, secondary text color); reminder section shows Edit / Clear links. **Not** styled as due — no chip.
- `planned_reminder_date <= CURRENT_DATE` (due — today or past) → "Revisit by [date]" **chip** in calm indigo (`--color-planned`) outline, no fill. Lifts to the card header. Reminder section shows Edit / Clear links.

A card with no reminder date never appears "overdue" — never lifts to Tier 1 in PR #5's dashboard, never shows a chip here.

**Rationale:** Carries design-review § PLANNED Card — Never Overdue verbatim. The derived predicate is the single source of truth: this PR computes it inline on the card detail page (one expression, no view yet); PR #5 will read the same column + compute the same predicate when the dashboard lands. **No view in this migration** — adding `public.cards_with_reminder_status` now would be dead infra until PR #5 has a consumer, and PR #5 may want a different shape (joins, additional derived columns) once it can see its real query needs.

### D4: "What's needed before CLOSE" — content + UX

**Decision:** New `<BeforeCloseSummary />` server component mounted inside `<PlannedView />` between the existing PathCard and `<ChoosePath />`. Reads from the same jsonb columns PR #1 already populates (no schema change). Per-path content:

- **`chosen_path='diy'`**: "Before you close" callout listing materials + non-optional tools. Renders the first 5 entries inline with `+N more` link to expand; full list inside a native `<details>`. Optional tools (`tools[].optional === true`) excluded from the count + preview (user already owns them; not in the "to acquire" set).
- **`chosen_path='contractor'`**: "Contractor to schedule: <contractor_type>" headline + top-3 `questions_for_contractor[]` preview + "+N more questions" link inside a native `<details>` with the rest.
- **`chosen_path='monitor'`**: `<BeforeCloseSummary />` not rendered — the existing "Checking back every N days" line in `<PlannedView />` is the right level of summary.

Override jsonb wins over app jsonb when present (`override ?? estimate` — same pattern PR #1 codified). "Estimate unavailable" placeholder when the jsonb is null or fails to parse.

**Rationale:** Carries design-review § PLANNED's "Lists what's needed before CLOSE: materials, tools, contractor to schedule" literally. Reads from existing jsonb — zero new DB shape, zero new validation. Collapsed-by-default matches PLANNED's calm/receded treatment (no big checkboxes vying for attention; ad-hoc per-material checkboxes ship later if a usage signal asks for them). Mounting between PathCard and ChoosePath puts it where the reader looks next after the path summary.

### D5: Reminder UI inside `<PlannedView />`

**Decision:** New `<ReminderEditor />` `'use client'` component, mounted at the bottom of `<PlannedView />` after `<ChoosePath />`. Three render states keyed on `plannedReminderDate` + `isReminderDue`:

- **State A — no reminder set** (`plannedReminderDate === null`): "Set a reminder" text link that expands a native `<input type="date">` + Save / Cancel inline buttons.
- **State B — future reminder** (`plannedReminderDate > today`): "Revisit by [date]" subline (calm, secondary text — informational). Edit / Clear text links.
- **State C — reminder due** (`isReminderDue === true`): "Revisit by [date]" descriptive text (the chip in the page header is the urgency signal; this section keeps the management affordances). Edit / Clear text links.

Edit expands the same `<input type="date">`, pre-filled. Clear fires PATCH with `null` body. No date-picker library — native `<input type="date">` handles iOS / Android / desktop browsers. No `min` / `max` — user can pick any date (past or future).

**Rationale:** Three states cover the full UX matrix without modal proliferation. Native input avoids a date-picker dependency (saves bundle bytes; native UX matches the device). Edit / Clear as text links (not buttons) per design-review § DECIDE Buttons posture ("Change decision is a link, not a button" — same calm convention). Allowing past dates is intentional — a user who forgets a reminder for a week shouldn't have to fight the validation to set "today" or "yesterday" as the revisit date.

### D6: Dashboard tier-1 lift

**Decision:** DEFER to PR #5 (`dashboard`). This PR ships only the data model (D1) + the in-page derived predicate (D3). PR #5 reads the raw `planned_reminder_date` column from cards it lists + computes its own `is_reminder_due` predicate at query time; it owns the tier-1 lift, the PLANNED tab dot indicator, the system-icon thumbnail treatment.

**Rationale:** PR #5 is the dashboard surface; building tier-lift before the dashboard exists would land dead code. The data model + predicate definition land here; the surface lands in row #5. Same pattern PR #1 used for `<PlannedView />` (minimal stub, the rich surface follows in the dependent PR).

### D7: How dashboard / other consumers read `is_reminder_due`

**Decision:** **No SQL view in this PR.** PR #5 computes the predicate inline at its own query time, against the raw `planned_reminder_date` column. If PR #5 (or a later row) needs a centralized view, it adds one then with full knowledge of its consumers' query shapes (joins, additional derived columns, etc.).

**Rationale:** Adding `public.cards_with_reminder_status` now would ship dead infrastructure — this PR's only consumer is the card detail page, which computes the predicate inline against the SELECTed row (one boolean expression). Premature centralization. Migration 012 stays minimal: ALTER TABLE + index. YAGNI applies: the abstraction shows up when there's a second consumer, not when there's one.

### D8: PostHog events

**Decision:** 3 new events added to METRICS.md:

- `planned_reminder_set` — `{ card_id: string, reminder_date: string (ISO YYYY-MM-DD), days_out: number }` — fired by `<ReminderEditor />` after `PATCH /api/card/[id]/reminder` returns 200 from State A → State B/C transition. `days_out` is signed (negative when user sets a past date).
- `planned_reminder_cleared` — `{ card_id: string, had_future_date: boolean }` — fired after PATCH with `null` body returns 200. `had_future_date` distinguishes "cleared a future reminder" (regret) from "cleared an already-due reminder" (acknowledgment).
- `planned_reminder_edited` — `{ card_id: string, from_date: string (ISO), to_date: string (ISO), days_out: number }` — fired after PATCH from State B/C → State B/C transition (date changed, not cleared).

No `planned_reminder_due_viewed` event. PostHog's `$pageview` auto-capture already records per-route page views; the "did users return when due?" cohort is answerable by filtering `planned_reminder_set` against subsequent `planned_reminder_cleared` (or future `card_closed`) within N days of the reminder date.

**Rationale:** 3 write-events tied to explicit user actions: set / clear / edit. Each carries enough context to answer a calibration question (uptake, regret, churn). A passive `due_viewed` would add a per-card sessionStorage sentinel + extra telemetry volume to answer something page-view + cohort analysis already answers. The set→cleared/closed funnel is the calibration signal.

### D9: Migration 012 transaction shape

**Decision:** Single .sql file, `<ts>_012_planned_reminder.sql`. Three statements:

1. `ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS planned_reminder_date date;`
2. `CREATE INDEX IF NOT EXISTS cards_planned_reminder_due_idx ON public.cards (planned_reminder_date) WHERE state = 'planned'::public.card_state AND planned_reminder_date IS NOT NULL;`
3. Rollback section commented in-file (per PR #1's convention): DROP INDEX, DROP COLUMN.

No function signature changes. No enum touched. No view (per D7). Migration 008's `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated` already covers the new column for `authenticated` role reads (no per-column GRANT needed because we're adding a column to an existing table that already has the right grants).

**Rationale:** Plain additive migration — every statement is transaction-safe; no rename-recreate gymnastics, no function-dependency dance. Partial index (with `planned_reminder_date IS NOT NULL` in the predicate as well as `state='planned'`) keeps the index small and ensures it stays useful for the dashboard's "reminder-due in the next 7 days" sort. `OR IF NOT EXISTS` everywhere keeps re-apply idempotent against a partially-applied state.

---

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens, Data
     model changes, API contracts, Offline behavior, Metrics, Files to
     create/modify, Tests, Dependencies, Task order, Gotchas, Acceptance /
     rollout / rollback. The Decisions section above stays verbatim. -->

## Core user story

1. Open a planned card (chose DIY or Contractor at DECIDE).
2. Tap "Set a reminder", pick a future date, save.
3. See "Revisit by [date]" subline appear under the chosen-path summary.
4. Wait until the picked date (or seed `planned_reminder_date <= today` for QA), refresh — see the calm-indigo "Revisit by [date]" chip appear in the card header.
5. Open the "Before you close" callout, scan materials/tools (DIY) or contractor questions, then tap "Change decision" or proceed to CLOSE (deferred).

## In scope

- **Migration 012** (D1, D9) — additive `ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS planned_reminder_date date` + a partial index `cards_planned_reminder_due_idx ON public.cards (planned_reminder_date) WHERE state = 'planned'::public.card_state AND planned_reminder_date IS NOT NULL`. No enum touched, no rename-recreate, no function-dependency dance. Commented rollback recipe lives in-file per PR #27 convention. Migration 008's `ALTER DEFAULT PRIVILEGES` already covers the new column for `authenticated` SELECTs.
- **`PATCH /api/card/[id]/reminder`** (D2) — auth-gated reminder set / edit / clear route. Body `{ reminder_date: 'YYYY-MM-DD' | null }`. RLS-enforced direct UPDATE under the user context — no SECURITY DEFINER RPC. Body validation in `_lib/parse-reminder-body.ts` (strict ISO regex + `Date` round-trip; `null` = clear). State guard: only `state='planned'` allows reminder ops; everything else 409 `invalid_state`. Returns 200 / 400 / 401 / 404 / 409 / 500.
- **`<ReminderEditor />` `'use client'` component** (D5) — mounted at the bottom of `<PlannedView />` after `<ChoosePath />`. Three render states keyed on `plannedReminderDate` + `isReminderDue`: State A (no reminder; "Set a reminder" link → expanded native `<input type="date">` + Save / Cancel); State B (future reminder; "Revisit by [date]" subline + Edit / Clear text links); State C (due reminder; "Revisit by [date]" subline + Edit / Clear text links — the chip in the page header carries the urgency signal, not this surface). Fires `planned_reminder_set` / `planned_reminder_cleared` / `planned_reminder_edited` per D8 AFTER the PATCH 200, then `router.refresh()`.
- **`<ReminderDueChip />` server component** (D3) — calm-indigo outline chip ("Revisit by [date]", no fill) rendered in the card detail page header section, conditionally on `card.state === 'planned' && isReminderDue === true`. Uses Tailwind arbitrary-value classes `border-[var(--color-planned)] text-[var(--color-planned)]`. Future dates render no chip. No-reminder cards render no chip.
- **`<BeforeCloseSummary />` server component** (D4) — mounted inside `<PlannedView />` between the chosen-path `<PathCard />` and `<ChoosePath />`. Per-path content branching on `chosenPath`:
  - `chosen_path='diy'`: lists DIY materials + non-optional tools (filtered via `tools.filter(t => t.optional !== true)`) with `+N more` link expanding a native `<details>`. Shows the first 5 entries inline; remainder collapsed.
  - `chosen_path='contractor'`: shows "Contractor to schedule: <contractor_type>" headline + top-3 `questions_for_contractor[]` preview + "+N more questions" inside `<details>`.
  - `chosen_path='monitor'`: component returns `null` — the existing "Checking back every N days" line in `<PlannedView />` is the right level of summary.
  - Override jsonb wins over app jsonb via `(override ?? estimate)` (D4 — same pattern as PR #27's `<PathCard />`). "Estimate unavailable" placeholder when both are null.
- **`<PlannedView />` extension** (D5, D4) — extend the existing stub from PR #27 with:
  - `<BeforeCloseSummary />` mounted between the chosen-path `<PathCard />` and `<ChoosePath />` (skipped for `chosen_path='monitor'`).
  - `<ReminderEditor />` mounted at the bottom (after `<ChoosePath />` and before the "How we diagnosed this" collapsible).
  - New props `plannedReminderDate: string | null` and `isReminderDue: boolean`.
  - No change to the existing severity chip + "You chose:" banner + `<PathCard />` + `<ChoosePath />` composition.
- **`apps/web/app/(app)/cards/[id]/page.tsx`** — `CardRow` type extended with `planned_reminder_date: string | null`; SELECT list adds the new column; `isReminderDue` derived inline via `today.toISOString().slice(0,10) >= card.planned_reminder_date` for `state='planned' && planned_reminder_date != null`; `<ReminderDueChip />` mounted conditionally in the header section (above the body switch); `<PlannedView />` invocation threads the two new props.
- **`_components/_reminder-chip.ts`** (shared helper) — `reminderChipClasses()` lookup mirroring `_severity-chip.ts`. Returns `{border, text, label}` Tailwind-class strings using `--color-planned`. Underscore prefix excludes from App Router file-based routing. Lives alongside `_severity-chip.ts`. (Spec-time call: even though there's only one chip variant today, codifying the lookup matches the PR #27 convention and gives PR #4 — dashboard tier-1 lift — a re-use anchor.)
- **3 new PostHog events in METRICS.md** per D8: `planned_reminder_set`, `planned_reminder_cleared`, `planned_reminder_edited`.
- **CLAUDE.md § Where Things Happen** rows for: migration 012, the PATCH route + `_lib/parse-reminder-body.ts`, `<ReminderEditor />`, `<ReminderDueChip />`, `<BeforeCloseSummary />`, the `<PlannedView />` extension, the `_reminder-chip.ts` helper, the `page.tsx` extension. § Gotchas — new entries for items #1, #2, #3, #5, #7, #9 from § Gotchas below that aren't already documented.
- **E2E spec** `apps/web/e2e/planned-state.spec.ts` — 5 cases per § Tests § E2E below.
- **Regenerated `packages/core/src/supabase.types.ts`** — adds `planned_reminder_date: string | null` to `Tables['cards']['Row']` / `Insert` / `Update`. No new function signatures, no enum changes.
- **PLAN.md** — row #1 (`planned-state`) already flipped from Planned → Active by Phase 0.

## Out of scope

- **Dashboard tier-1 lift for reminder-due cards** (D6) — PR #4 (`dashboard`) owns. This PR ships the raw column + the in-page derived predicate only; PR #4 reads the column at its own query time and computes `is_reminder_due` inline. The partial index from D1 supports PR #4's "reminder-due in the next 7 days" sort.
- **`public.cards_with_reminder_status` SQL view** (D7) — explicitly NOT added. PR #4 (or a later row) adds a centralized view if its query shape benefits from one.
- **PLANNED tab dot indicator on dashboard** — PR #4 owns.
- **System-icon thumbnail treatment for PLANNED cards on the dashboard** — PR #4 owns.
- **Notifications / push / email** — out of v0 scope per ceo-review § Scope. Reminders are pull-only (visible on next visit).
- **Ad-hoc per-material checkboxes inside `<BeforeCloseSummary />`** — D4 explicitly notes "no big checkboxes vying for attention". Ships later if a usage signal asks for them.
- **CLOSE flow** — PR #1 (`close-flow`) owns. This PR's `<BeforeCloseSummary />` is read-only context; the actual "close this card" action ships in PR #1.
- **Reminder snooze / postpone semantics** — out of v0. User can manually edit the date to push it; no first-class "snooze 1 week" action.
- **Reminder validity windows** (e.g. max 1 year out) — D5 explicitly allows any date past or future.
- **Bulk reminder operations** (set / clear across multiple cards) — out of v0.

## Screens

### `/cards/[id]` — body extension for `state='planned'`

Header (room_tag · system_tag chip · created_at) + Photo block + Description block stay identical across all states. The `<ReminderDueChip />` mounts in the header section (before the body switch) conditionally:

| Header element        | `state='planned' && planned_reminder_date IS NULL` | `state='planned' && future date` | `state='planned' && due date` | All other states |
| --------------------- | -------------------------------------------------- | -------------------------------- | ----------------------------- | ---------------- |
| `<ReminderDueChip />` | hidden                                             | hidden                           | shown                         | hidden           |

### `<PlannedView />` — state table (D5)

The body composition for `state='planned'` extends PR #27's stub. The new `<BeforeCloseSummary />` + `<ReminderEditor />` slots mount conditionally:

| Element                     | `chosen_path='diy'` | `chosen_path='contractor'` | `chosen_path='monitor'` | `chosen_path=null` (invariant violation) |
| --------------------------- | ------------------- | -------------------------- | ----------------------- | ---------------------------------------- |
| Severity chip               | shown               | shown                      | shown                   | hidden                                   |
| "You chose:" banner         | shown               | shown                      | shown                   | hidden                                   |
| `<PathCard />`              | shown (DIY)         | shown (Contractor)         | hidden                  | hidden                                   |
| Monitor cadence line        | hidden              | hidden                     | shown                   | hidden                                   |
| `<BeforeCloseSummary />`    | shown               | shown                      | hidden                  | hidden                                   |
| `<ChoosePath />` (greyed)   | shown               | shown                      | shown                   | hidden                                   |
| `<ReminderEditor />`        | shown               | shown                      | shown                   | hidden                                   |
| "How we diagnosed this"     | shown (if thread)   | shown (if thread)          | shown (if thread)       | hidden                                   |
| Fallback "Decision pending" | hidden              | hidden                     | hidden                  | shown                                    |

### `<ReminderEditor />` — render states

Three render states keyed on `(plannedReminderDate, isReminderDue)`:

| State           | `plannedReminderDate` | `isReminderDue` | Visible elements                                                                                                  |
| --------------- | --------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------- |
| A (no reminder) | `null`                | `false`         | "Set a reminder" text link. On click → expand to: `<input type="date">` + Save / Cancel inline buttons.           |
| B (future)      | future date           | `false`         | "Revisit by [date]" subline (secondary text color). Edit / Clear text links.                                      |
| C (due)         | today or past         | `true`          | "Revisit by [date]" subline (secondary text color). Edit / Clear text links. (Chip in header is the urgency cue.) |

Edit expands the same `<input type="date">`, pre-filled with the current value. Clear fires PATCH with `{ reminder_date: null }`. No date-picker library; native `<input type="date">` handles iOS/Android/desktop. No `min`/`max` constraints (D5 — past dates intentional).

### `<BeforeCloseSummary />` — render states (D4)

| Variant      | Headline                                                      | Inline preview                                                                                                | Expanded `<details>` content                 |
| ------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `diy`        | "Before you close"                                            | First 5 of `materials[]` + non-optional `tools[]` (combined) with name + cost range. `+N more` link if N > 5. | Remainder of materials + non-optional tools. |
| `contractor` | "Contractor to schedule: `<contractor_type>`"                 | First 3 of `questions_for_contractor[]`. `+N more questions` link if N > 3.                                   | Remainder of questions.                      |
| `monitor`    | n/a — component returns `null`.                               | n/a                                                                                                           | n/a                                          |
| no-estimate  | "Estimate unavailable" placeholder rendered in the same slot. | n/a                                                                                                           | n/a                                          |

### `<ReminderDueChip />` — visual

Calm indigo outline only, no fill. Tailwind classes: `inline-block rounded-full border border-[var(--color-planned)] px-3 py-1 text-xs font-medium text-[var(--color-planned)]`. Label format: `Revisit by <Mon Jan 15>` (humanDate of `planned_reminder_date`). Renders in the page header section, after the room_tag · system_tag header line, before the body switch.

### Error states

| Surface                    | Error                                         | UI                                                                                                                                          |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `<ReminderEditor />` PATCH | 400 `invalid_reminder_date`                   | Inline error citing the field; user can re-edit. Save button re-enabled.                                                                    |
| `<ReminderEditor />` PATCH | 409 `invalid_state` (card moved past planned) | Inline banner: "Card state changed — refreshing…" + delayed `router.refresh()`.                                                             |
| `<ReminderEditor />` PATCH | 404 `not_found`                               | Inline banner: "Card not found — refreshing…" + delayed `router.refresh()` (RLS likely changed; surface defers to the page-level handling). |
| `<ReminderEditor />` PATCH | 500 / network                                 | Retryable banner with retry button; the user's picked date is preserved in the input.                                                       |

## Data model changes

### Migration 012 — `20260517<HHMMSS>_012_planned_reminder.sql`

**Statement order** (single .sql file, every statement transaction-safe):

1. **Additive column**:

   ```sql
   alter table public.cards
     add column if not exists planned_reminder_date date;
   ```

2. **Partial index** for PR #4's reminder-due dashboard query:

   ```sql
   create index if not exists cards_planned_reminder_due_idx
     on public.cards (planned_reminder_date)
     where state = 'planned'::public.card_state
       and planned_reminder_date is not null;
   ```

**Rollback** (commented in-file, recoverable by uncommenting and running as a follow-up migration if a schema-crisis demands it):

```sql
-- DROP INDEX IF EXISTS public.cards_planned_reminder_due_idx;
-- ALTER TABLE public.cards DROP COLUMN IF EXISTS planned_reminder_date;
```

No enum touched. No function signatures change. No `update` backfill (the new column defaults to NULL, which matches the semantic "no reminder set"). No new RLS policy — the existing `cards`-table policies from migration 003 cover the new column (RLS is row-grained, not column-grained, in Postgres + Supabase).

### Derived predicate `is_reminder_due` (D3, D7)

Defined here for human reference but not materialized in SQL (D7 — no view). The card detail page computes it inline; PR #4 will compute the same predicate at its own query time.

```sql
-- Logical definition (NOT in any view):
-- is_reminder_due = (
--   state = 'planned'::public.card_state
--   AND planned_reminder_date IS NOT NULL
--   AND planned_reminder_date <= CURRENT_DATE
-- )
```

TypeScript inline derivation (in `page.tsx`):

```ts
const todayIso = new Date().toISOString().slice(0, 10);
const isReminderDue =
  card.state === 'planned' &&
  card.planned_reminder_date != null &&
  card.planned_reminder_date <= todayIso;
```

Date-only string comparison avoids the UTC-vs-local-time drift (§ Gotchas #3). `card.planned_reminder_date` is a Postgres `date` and PostgREST returns it as the `'YYYY-MM-DD'` string shape; direct lexicographic comparison is correct because ISO dates are sort-stable.

## API contracts

### `PATCH /api/card/[id]/reminder`

**Request body**:

```ts
{
  reminder_date: 'YYYY-MM-DD' | null; // null = clear the reminder
}
```

**Validation** (`_lib/parse-reminder-body.ts`):

- `reminder_date` MUST be either:
  - The literal `null` (clear), OR
  - A string matching `/^\d{4}-\d{2}-\d{2}$/` AND `new Date(value)` round-trips to the same ISO date (rejects `'2026-13-45'`, `'2026-02-30'`, etc.).
- Extra fields tolerated (forward-compat).
- Missing body / non-object / `reminder_date` undefined → 400 `validation_failed` with `{field, reason}`.

**Response shapes**:

- **200** — `{ card_id: string, planned_reminder_date: string | null }`.
- **400** — `{ error: 'validation_failed', field: 'reminder_date', reason: string }`.
- **401** — `{ error: 'unauthenticated' }`.
- **404** — `{ error: 'not_found' }` — card doesn't exist or RLS hides it.
- **409** — `{ error: 'invalid_state' }` — card not in `state='planned'`. 404-vs-409 distinguished by a narrow `cards` re-read (matches PR #27's `/decide` route posture).
- **500** — `{ error: 'server_error' }` with Sentry capture.

**Side effects**: Direct UPDATE on `public.cards.planned_reminder_date` under the user's RLS context — no SECURITY DEFINER RPC. Body shape validated via `_lib/parse-reminder-body.ts` before write.

**`export const dynamic = 'force-dynamic'`**.

## Offline behavior

This PR is **online-only**. No service-worker caching of reminder dates. The card detail page already requires a network round-trip per visit (server-rendered); adding offline support for the reminder PATCH would be category creep. If the network fails, the retryable banner from § Error states surfaces; the user's input is preserved so they can retry on reconnect.

## Metrics

3 new PostHog events added to METRICS.md per D8. None of them need new Sentry call sites (route handler reuses PR #27's posture — Sentry capture on 500-class server errors only; 4xx are user errors).

| Event                      | Where fired                                                                                                                                           | Key properties                                                                                                              | Why we care                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `planned_reminder_set`     | `apps/web/app/(app)/cards/[id]/_components/ReminderEditor.tsx` after `PATCH /api/card/[id]/reminder` returns 200 from State A → State B/C transition. | `{ card_id: string, reminder_date: string (ISO YYYY-MM-DD), days_out: number }` — `days_out` is **signed** (Gotcha #9).     | Top of the reminder funnel — measures how often users adopt reminders at all. `days_out` distribution informs default-date defaults. |
| `planned_reminder_cleared` | `ReminderEditor.tsx` after PATCH with `null` body returns 200.                                                                                        | `{ card_id: string, had_future_date: boolean }` — distinguishes "regret" (future cleared) from "ack" (already-due cleared). | Reciprocal of `_set`. High `had_future_date=true` ratio = user UI/UX regret signal; high `false` ratio = healthy acknowledgment.     |
| `planned_reminder_edited`  | `ReminderEditor.tsx` after PATCH returns 200 from State B/C → State B/C (date changed, not cleared).                                                  | `{ card_id: string, from_date: string (ISO), to_date: string (ISO), days_out: number }`                                     | Measures reminder churn. High volume of forward-pushes = user pattern of avoidance; common shifts inform smarter defaults.           |

All three events fire **after** the PATCH 200 lands, not optimistically (Gotcha #6 — same as PR #27's `decide_path_chosen`). `router.refresh()` follows the event fire so server state is re-read.

No `planned_reminder_due_viewed` event (D8) — `$pageview` auto-capture + the set→cleared/closed funnel via cohort analysis answers "did users return when due?" without per-card sessionStorage sentinel overhead.

## Files to create/modify

**Create**:

- `supabase/migrations/<ts>_012_planned_reminder.sql` — D1, D9.
- `apps/web/app/api/card/[id]/reminder/route.ts` + paired test.
- `apps/web/app/api/card/[id]/reminder/_lib/parse-reminder-body.ts` + paired test (`_lib/` is App Router excluded from routing).
- `apps/web/app/(app)/cards/[id]/_components/ReminderEditor.tsx` + test.
- `apps/web/app/(app)/cards/[id]/_components/ReminderDueChip.tsx` + test.
- `apps/web/app/(app)/cards/[id]/_components/BeforeCloseSummary.tsx` + test.
- `apps/web/app/(app)/cards/[id]/_components/_reminder-chip.ts` + test (mirrors `_severity-chip.ts`).
- `apps/web/e2e/planned-state.spec.ts` — 5-case E2E spec.

**Modify**:

- `apps/web/app/(app)/cards/[id]/_components/PlannedView.tsx` — extend with `plannedReminderDate` + `isReminderDue` props, mount `<BeforeCloseSummary />` + `<ReminderEditor />` per § Screens. Update test to cover new render states.
- `apps/web/app/(app)/cards/[id]/page.tsx` — extend `CardRow` type with `planned_reminder_date: string | null`; add column to the SELECT list; derive `isReminderDue` inline; mount `<ReminderDueChip />` in the header conditionally; thread new props into `<PlannedView />`. Update test.
- `packages/core/src/supabase.types.ts` — regen via `pnpm db:gen-types` after migration apply.
- `CLAUDE.md § Where Things Happen` — new rows per § In scope. § Gotchas — codify Gotchas #1, #2, #3, #5, #7, #9 from § Gotchas below.
- `METRICS.md` — 3 new event rows per § Metrics.
- `apps/web/.env.example` — no new env vars; document section unchanged.
- `PLAN.md` — row #1 already flipped from Planned → Active by Phase 0 (this skill).

## Tests

Per-task table. Unit + route tests live alongside their source; the E2E lives in `apps/web/e2e/`.

| Task | Unit tests                                                                                                                                                                                                                                                                                                                                                                                                                                      | Integration / route tests                                                                                                                                                                                                                                                                                                              | E2E coverage                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| T1   | n/a (migration)                                                                                                                                                                                                                                                                                                                                                                                                                                 | n/a                                                                                                                                                                                                                                                                                                                                    | Verified via E2E + rollback round-trip CI                      |
| T2   | `parse-reminder-body.test.ts` — 12+ cases: valid `'2026-06-15'`, valid `null`, malformed `'2026-13-45'`, malformed `'2026-02-30'`, non-ISO `'06/15/2026'`, empty string, undefined, missing field, non-object body, extra fields tolerated, regex bypass `'2026-06-15extra'`, leap-year `'2024-02-29'`.                                                                                                                                         | `reminder/route.test.ts` — 14+ cases: 200 set future date; 200 set past date; 200 clear (null); 400 invalid_reminder_date; 400 missing body; 401 anon; 404 not-found; 409 wrong-state ×5 (capturing/triaging/diagnosed/decide/monitoring/closed/dismissed); RLS isolation (set fails on other-user card); concurrent state change 409. | Indirect via E2E                                               |
| T3   | `ReminderEditor.test.tsx` — 11+ cases: State A renders "Set a reminder" link; click expands input; Save fires PATCH; State B renders "Revisit by [date]" + Edit/Clear; State C renders "Revisit by [date]" + Edit/Clear; Edit pre-fills input; Clear fires PATCH null; 400 surfaces inline error; 500 retryable banner; PostHog event fires after 200; `days_out` is signed; `had_future_date` correct on Clear from State B vs State C.        | n/a                                                                                                                                                                                                                                                                                                                                    | E2E covers set / edit / clear                                  |
| T4a  | `ReminderDueChip.test.tsx` — 4+ cases: renders with correct label format; uses `--color-planned` token via class string; hidden when `isReminderDue=false`; humanDate format consistent with the rest of the page header.                                                                                                                                                                                                                       | n/a                                                                                                                                                                                                                                                                                                                                    | E2E covers due-date chip visibility                            |
| T4b  | `BeforeCloseSummary.test.tsx` — 12+ cases: DIY shows first 5 materials + non-optional tools; `tools[].optional===true` filtered out; `+N more` link expand reveals remainder; Contractor shows contractor_type + top 3 questions; Contractor `+N more` expand reveals remainder; monitor variant returns `null`; null estimate → "Estimate unavailable"; override wins over app estimate; empty materials/tools graceful; long names ellipsize. | n/a                                                                                                                                                                                                                                                                                                                                    | E2E covers DIY + Contractor variants                           |
| T4c  | `_reminder-chip.test.ts` — 3+ cases: locks the `--color-planned` token mapping; returns `{border, text, label}` triple; label format stable.                                                                                                                                                                                                                                                                                                    | n/a                                                                                                                                                                                                                                                                                                                                    | Indirect via T4a                                               |
| T5   | `PlannedView.test.tsx` — extend with 6+ new cases: `<BeforeCloseSummary />` mounted for DIY/Contractor; not mounted for Monitor; `<ReminderEditor />` mounted for all three chosen paths; reminder props threaded correctly; null planned_reminder_date renders State A; future renders State B; due renders State C.                                                                                                                           | n/a                                                                                                                                                                                                                                                                                                                                    | Indirect via E2E                                               |
| T6   | `cards/[id]/page.test.tsx` — extend with 5+ new cases: SELECT list includes `planned_reminder_date`; `<ReminderDueChip />` mounts when planned + due; not mounted when planned + future; not mounted when planned + null reminder; not mounted when state != planned; `isReminderDue` derivation correct across UTC-boundary cases.                                                                                                             | n/a                                                                                                                                                                                                                                                                                                                                    | Indirect via E2E                                               |
| T7   | n/a (E2E)                                                                                                                                                                                                                                                                                                                                                                                                                                       | n/a                                                                                                                                                                                                                                                                                                                                    | `apps/web/e2e/planned-state.spec.ts` — 5 cases per § E2E below |
| T8   | n/a (docs)                                                                                                                                                                                                                                                                                                                                                                                                                                      | n/a                                                                                                                                                                                                                                                                                                                                    | n/a                                                            |

### E2E spec (`apps/web/e2e/planned-state.spec.ts`) — 5 cases

All cases skip gracefully on non-local Supabase via `test.skip(!isLocalSupabase, …)` (matches PR #15 / #18 / #19 / #26 / #27 posture; CI slow-job is the canonical enforcement surface). Seeds planned cards directly in `state='planned'` via admin client (skipping the AI hop — `decide-state` E2E covers the AI → decide → planned transition).

1. **Happy path — set a future reminder (DIY card)**: Seed a planned card with `chosen_path='diy'`, populated `cost_estimate_diy`, no reminder. Sign in as owner, navigate to `/cards/<id>`. Assert `<PlannedView />` renders with the chosen-path detail. Assert `<BeforeCloseSummary />` shows DIY materials + non-optional tools (first 5, +N more link visible if >5). Assert `<ReminderEditor />` in State A. Click "Set a reminder", pick a date 7 days out, save. Assert PATCH 200 + State B subline "Revisit by …". Assert `<ReminderDueChip />` NOT in header (future). **Assert PostHog event** `planned_reminder_set` with `days_out=7`.

2. **Reminder-due chip appears (seed past date)**: Seed a planned card with `planned_reminder_date='2026-05-10'` (7 days ago, given today is 2026-05-17). Navigate. Assert `<ReminderDueChip />` visible in header with calm-indigo classes. Assert State C `<ReminderEditor />` (subline + Edit/Clear). Click Clear → assert PATCH 200 + State A. **Assert event** `planned_reminder_cleared` with `had_future_date=false`.

3. **Edit existing reminder + signed days_out**: Seed a planned card with `planned_reminder_date='2026-06-01'` (future). Click Edit, change to `'2026-05-10'` (past). Save. Assert PATCH 200, `<ReminderDueChip />` now visible (date is now in the past). **Assert event** `planned_reminder_edited` with `from_date='2026-06-01'`, `to_date='2026-05-10'`, `days_out=-7` (negative — Gotcha #9).

4. **BeforeCloseSummary — Contractor variant**: Seed a planned card with `chosen_path='contractor'`, populated `cost_estimate_hire` (contractor_type='plumber', `questions_for_contractor` length 7). Navigate. Assert headline "Contractor to schedule: plumber". Assert first 3 questions visible inline. Click `+4 more questions` → assert remaining 4 questions revealed. Assert `<BeforeCloseSummary />` NOT rendered for a separately-seeded Monitor card (`chosen_path='monitor'`).

5. **State guard — PATCH rejected on non-planned card**: Seed a card in `state='decide'`. Attempt direct `PATCH /api/card/<id>/reminder` (via `request.patch()` in Playwright — no UI surface exposes this for a decide-state card). Assert 409 `invalid_state`. Then via admin client move card to `state='dismissed'`, repeat — assert 409. Move to `state='monitoring'` — assert 409. (No event fired on any of these — failure path.)

## Dependencies

- **Hard depends on PR #27 (`decide-state`) merged into `main`** — extends its `<PlannedView />` stub, threads through its existing `chosenPath` + `cost_estimate_*_override` props, re-uses the locked jsonb shapes from `_lib/estimate-shapes.ts`. Migration 011 must be applied (it is — confirmed in `git log main`).
- **Hard depends on PR #1 (`decide-state` foundational)** — `cards.chosen_path`, `cost_estimate_diy`, `cost_estimate_hire`, override columns all originate there. Same PR as #27.
- **Soft-precedes PR #4 (`dashboard`)** — adds the data model (`planned_reminder_date` column + partial index) + the in-page derived predicate that PR #4 will replicate at its dashboard query time for the tier-1 lift.
- **Soft-precedes PR #1 (`close-flow`)** — `<BeforeCloseSummary />` is read-only context for the CLOSE action PR #1 ships.
- **No conflict with the dependabot PRs** open against main.
- **No SDK version changes** in this PR.
- **No new third-party API integrations** (per Confidence Calibration — no stop-and-ask).
- **No auth flow changes** (RLS already enforces ownership on the cards table; the new column inherits the row-grained policies from migration 003).
- **`@supabase/ssr`** stays at the existing pin.

## Task order

(/ak-implement reads this list verbatim. Each task is dependency-ordered; ⟶ marks the critical chain. Tracker tasks #3–#10 mirror this list.)

1. **T1: Migration 012 + types regen.** ⟶ Foundation. Write the migration per § Data model changes, apply locally via `pnpm db:reset`, regenerate types via `pnpm db:gen-types`. Verify the new column appears in `packages/core/src/supabase.types.ts` and the partial index exists in pg_catalog. Commit: `feat(planned-state): migration 012 — cards.planned_reminder_date + partial index`.
2. **T2: `PATCH /api/card/[id]/reminder` route + `_lib/parse-reminder-body.ts` + tests.** ⟶ Depends on T1 (column exists). Body parser with strict ISO regex + Date round-trip + null shape. Route handler with auth + state guard + RLS-enforced UPDATE + 404-vs-409 disambiguation. ~14 route tests + ~12 parser tests.
3. **T3: `<ReminderEditor />` client component + tests.** ⟶ Depends on T2 (PATCH route). Three render states (A/B/C). PostHog event firing after 200. ~11 tests.
4. **T4: `<ReminderDueChip />` + `<BeforeCloseSummary />` + `_reminder-chip.ts` + tests.** Independent of T2/T3. `<ReminderDueChip />` reads `planned_reminder_date` + uses `--color-planned`. `<BeforeCloseSummary />` reads chosen_path + estimates (override-or-app). Helper + ~19 component tests.
5. **T5: `<PlannedView />` extension + tests.** Depends on T3, T4. Thread new props through; mount `<BeforeCloseSummary />` + `<ReminderEditor />` per § Screens. Extend existing test with 6+ new cases.
6. **T6: `cards/[id]/page.tsx` wiring.** Depends on T1 (types), T4 (chip), T5 (PlannedView). Extend CardRow + SELECT list; derive `isReminderDue`; mount `<ReminderDueChip />` conditionally in header; thread props into `<PlannedView />`. Extend existing test with 5+ new cases.
7. **T7: `apps/web/e2e/planned-state.spec.ts`.** Depends on T2, T3, T4, T5, T6. The 5-case Playwright spec per § Tests § E2E.
8. **T8: Docs.** CLAUDE.md path-map + Gotchas, METRICS.md events, PLAN.md already flipped (Phase 0). Final commit.

## Gotchas

These are the load-bearing traps for this PR. The ones not already documented get folded into CLAUDE.md § Gotchas as part of T8.

1. **Native `<input type="date">` value format is `'YYYY-MM-DD'`** — matches Postgres `date` column shape exactly, no conversion needed. Browsers handle locale display in the picker UI (US users see `06/15/2026`, EU users see `15/06/2026`) while still returning the ISO form to JS. Server-side parser must validate via strict regex `/^\d{4}-\d{2}-\d{2}$/` AND a `new Date(value)` round-trip to reject `'2026-13-45'` / `'2026-02-30'` / `'2026-04-31'`. JS's permissive `new Date()` will coerce `'2026-13-45'` to a different valid date (e.g. `'2027-01-14'`) without throwing — the round-trip-equals-input check is the rejection point.

2. **`isReminderDue` computed in two layers — by design, not by accident.** The route handler does NOT compute it (just updates the column). The card detail page computes it inline on read. PR #4 (dashboard) will also compute it inline at its query time, independently. The shared predicate text lives in § Data model changes for human reference; D7 explicitly rejected centralizing it in a SQL view. Two consumers + zero infrastructure is the right shape until a third consumer appears.

3. **Date comparison vs CURRENT_DATE — UTC drift trap.** Postgres `CURRENT_DATE` is server-timezone-dependent; Supabase runs UTC. The card detail page computes `isReminderDue` on the Node server-side render, where `new Date()` returns wall-clock UTC. **Strip time before comparison**: use `today.toISOString().slice(0, 10)` (a `'YYYY-MM-DD'` string) and compare lexicographically against `card.planned_reminder_date` (also a `'YYYY-MM-DD'` string from PostgREST). Direct lexicographic string comparison is correct because ISO dates are sort-stable. **Do NOT compare timestamps** — `new Date('2026-05-17')` is `2026-05-17T00:00:00.000Z`, but `new Date()` includes hours/minutes/seconds, so `new Date() >= new Date('2026-05-17')` becomes flaky around midnight UTC. The string-only comparison is the canonical recipe.

4. **State guard in the PATCH route — only `state='planned'` allows reminder ops.** A user setting a reminder on a `decide`-state card via direct API call (curl, devtools, malicious browser tab) MUST get 409 `invalid_state`. RLS alone doesn't enforce this (RLS is owner-only, not state-machine-aware). Implement the guard explicitly in the route: do a narrow `cards` re-read on `invalid_state` to distinguish 404 vs 409 (matches PR #27's `/decide` route posture). Test the rejection explicitly for `state IN ('capturing', 'triaging', 'diagnosed', 'decide', 'monitoring', 'closed', 'dismissed')` — all six should 409.

5. **Migration 008's `ALTER DEFAULT PRIVILEGES` already covers the new column.** No per-column GRANT statement needed in migration 012 — the `authenticated` role inherits SELECT on the new column automatically because the migration is `ADD COLUMN` on an existing already-granted table. This is a different posture from migration 008 (which added the default privileges to defend against the prod-only "new tables invisible to `authenticated`" trap codified in CLAUDE.md § Gotchas). New COLUMNS on existing tables are fine; new TABLES would need either the default privileges or an explicit GRANT.

6. **Reminder events fire AFTER the PATCH 200, not optimistically.** Same pattern as PR #27's `decide_path_chosen` + `decide_path_changed`. The sequence inside `<ReminderEditor />`: `await fetch(PATCH) → response.ok → posthog.capture(...) → router.refresh()`. Firing optimistically would over-report (PATCH could 4xx/5xx and the user retries; each retry would fire again). Firing on completion gives the funnel a clean "intent-to-set vs realized-set" signal — except we don't even track intent in this PR (no `_started` event); the realized-set IS the metric.

7. **No view in migration 012 — D7.** Adding `public.cards_with_reminder_status` would be dead infra: this PR's only consumer is the card detail page (which derives the predicate inline against a SELECTed row); PR #4 may want a different shape (joins to other state aggregations, different WHERE predicates, different selected columns). Premature centralization. The cost of YAGNI in this codebase is one boolean expression duplicated in two places; the cost of premature view is rewriting it when PR #4 lands. Don't add the view here.

8. **`tools[].optional === true` filter in `<BeforeCloseSummary />`** — non-optional tools go in the "to acquire" preview; optional tools are user-already-owned and shouldn't appear in the close-list count or preview. Filter via `tools.filter(t => t.optional !== true)` (note: `!== true` not `=== false` — defaulting to non-optional when the flag is absent, since `optional?: boolean` per D3 means undefined = required). This filter mirrors how a homeowner would scan the list: "what do I need to buy?" — not "what tools exist?". The filter is the difference between a calm scannable list and a noisy inventory.

9. **`days_out` in PostHog events is signed** — negative values are legitimate. When a user sets `'2026-05-10'` and today is `2026-05-17`, `days_out` is `-7` (reminder is already overdue by 7 days). This is a real user intent — they want a card marked due-now. Don't `Math.abs(...)` it in the event payload; the sign is the signal. Compute via `Math.floor((new Date(reminder_date).getTime() - new Date().setHours(0,0,0,0)) / 86400000)` and document the signed semantic in the METRICS.md row.

10. **Path-map freshness hook — T8 must touch CLAUDE.md.** CLAUDE.md § Where Things Happen has `kit/scripts/commit-hooks/check-docs-freshness-project.sh` blocking PRs that add a triggering surface without updating the section. This PR adds: 1 route + 1 parser + 4 components + 1 helper + 1 migration + 2 modified files (`page.tsx`, `PlannedView.tsx`) — all triggering. T8's commit must update CLAUDE.md or the pre-commit hook fails. The hook checks per-commit, so as long as T8's commit touches CLAUDE.md, the hook is satisfied.

11. **`<PlannedView />` prop additions are additive, not replacing.** The existing stub from PR #27 takes 10 props (cardId, severity, diagnosis, chosenPath, diyEstimate, diyOverride, contractorEstimate, contractorOverride, monitoringCadenceDays, thread). This PR adds 2 more (plannedReminderDate, isReminderDue) — total 12. Do NOT remove or rename existing props; the existing test file asserts on every one. Just append to `PlannedViewProps` and consume in the JSX.

12. **`<input type="date">` `min` / `max` are intentionally NOT set** — D5 allows any date past or future. iOS Safari's date picker will respect them if set; explicitly omitting them lets the user scroll back to any month / year. The validation gate is the route handler (which accepts any valid ISO date), not the picker UI.

## Acceptance criteria

- Local `pnpm db:reset` applies migration 012 cleanly on a fresh database (no errors, no warnings).
- A planned-state card with `planned_reminder_date=null` renders State A `<ReminderEditor />` ("Set a reminder" link).
- Setting a future date via the UI persists to `cards.planned_reminder_date`; State B subline renders; no `<ReminderDueChip />` in header.
- Setting a past date (or letting time pass — seeded via admin client in E2E) renders State C subline + `<ReminderDueChip />` in header with calm-indigo classes.
- Clearing a reminder fires PATCH `null`, returns to State A, no chip in header.
- Editing a reminder fires PATCH with the new date, fires `planned_reminder_edited` event with signed `days_out`.
- `<BeforeCloseSummary />` renders DIY materials + non-optional tools for DIY chosen path (first 5 + `+N more`); renders Contractor headline + top-3 questions for Contractor chosen path; returns null for Monitor.
- PATCH /api/card/[id]/reminder rejects with 409 `invalid_state` on all non-planned states.
- All 3 PostHog events fire with the documented prop shapes (verified via E2E posthog-js instrumentation).
- Existing `<PlannedView />` test still passes (additive prop changes); existing `cards/[id]/page.tsx` test still passes.
- `pnpm turbo run lint typecheck test:unit build` passes locally.
- CI fast-job + slow-job green; Vercel preview deploys; planned-state card on the preview shows all three reminder states correctly.

## Rollout / rollback

**Rollout** (post-merge to main):

1. `.github/workflows/deploy-migrations.yml` auto-applies migration 012 on push to main (additive — no production downtime; no data backfill).
2. Vercel auto-deploys the web app with the new route + components.
3. Existing planned-state cards (none in prod yet — first planned-state ships in PR #27) get the `planned_reminder_date=NULL` default automatically; no backfill needed.
4. Production smoke: navigate to a planned-state card, set a reminder a few days out, refresh, verify "Revisit by …" subline. Manually edit the DB to set the date to yesterday (or use a seeded card); refresh, verify the indigo chip appears in the header.

**Rollback** (if the new route / components fail in production):

1. Revert the merge commit on main. Vercel re-deploys the previous bundle.
2. Migration 012 stays applied (rolling back the schema would drop the `planned_reminder_date` column and any user-set reminder dates). Forward-fix the route / component bugs; do not roll back the schema. The rollback recipe is recoverable from the commented-out section inside `<ts>_012_planned_reminder.sql`, but reserved for a true schema crisis.
3. The old code path (PR #27) reads cards without `planned_reminder_date`. After rollback the column still exists but no code path reads or writes it — entirely inert. The previous PR #27 bundle gracefully ignores the new column (SELECT lists were narrowly scoped pre-rollback).

**Forward-only follow-ups** — none deferred to a later PR within `planned-state` scope. Reminder notifications, snooze, bulk operations, and dashboard tier-1 lift are all explicitly out of scope; they ship in their owning PRs (PR #4 dashboard, post-v0 for notifications).
