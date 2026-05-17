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
