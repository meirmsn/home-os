<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: contractor-question-retrieval -->
<!-- date: 2026-05-28 -->

# Spec: contractor-question-retrieval (PR 13 of v0 Phase 1 build order)

**Sources:**

- `PLAN.md § Planned (v0)` — `contractor-question-retrieval` row (Leverage 1.6) — primary scope
- `PRODUCT-ROADMAP.md` — v+ excluded scheduling note; v1 `cross-card-contractor-surfacing` (this feature's taxonomy is its foundation)
- `.gstack/ceo-review-home-os-2026-05-01-r2.md § Scope (Contractor question tags)` + `§ Sequencing` + `§ metrics` — retrieval-by-type framing, trim option, metric intent
- `.gstack/eng-review-home-os-2026-05-01.md § Build Order step 13` + `§ Gating dependencies` — retrieval grouped by contractor type, 30-day nudge, depends on DECIDE + MONITOR questions
- Prior spec `specs/decide-state/spec.md` — `ContractorExpansion` shape (`questions_for_contractor[]`), `contractor_tag` vs granular `contractor_type` distinction (Gotcha #7), estimate override semantics
- Prior spec `specs/dashboard/spec.md` + `apps/web/app/(app)/home/_lib/tier-cards.ts` — pure-fn list/group pattern to mirror

A cross-card retrieval view that gathers the contractor questions triage generated on each card and groups them by the type of pro the user would call (plumber, electrician, HVAC, …), so the user has a ready pre-appointment checklist. A per-group nudge surfaces when questions for a trade have sat unaddressed for ≥30 days. Read-only presentation over data that already exists — no schema change.

---

## Product update

Both blurbs as approved at Phase 0.2. Single source-of-truth — `/ak-build`
Phase 4.1 copies them verbatim into the PR body's `## Product update`
section, Phase 5.6 copies Headline into BUILD-LOG `Headline:` and Detail
into `Summary:`, and `/ak-go-live` Step 6 uses Headline as the
deployed-to-prod lede. Verified against the diff at Phase 6 Gate A
(operator confirmation) + Gate B (automated claim-vs-diff cross-check).

### Headline (user-facing)

A new Contractor Questions view collects every question your triage suggested across all your cards, grouped by the kind of pro you'd call — plumber, electrician, HVAC, and more — so you walk into any service visit with a ready checklist. When questions for one trade have sat for a month, the app gently nudges you to book the visit.

### Detail (team-facing)

New `/(app)/contractor-questions` route reads `questions_for_contractor[]` from each card's effective contractor expansion (`cost_estimate_hire_override ?? cost_estimate_hire`), filters to non-closed/dismissed cards with a non-`diy` `contractor_tag`, and groups by that tag with human-readable labels. Each group renders a copy-friendly checklist; a group whose oldest open card is ≥30 days old shows an appointment nudge. A dashboard entry point links in. Read-only presentation feature — no schema migration (the data already exists from decide-state) — plus 2 new PostHog events.

---

## Decisions (resolved at spec time)

4 `/ak-spec`-time decisions resolved in Phase 0 with the user. Recorded below
so Phase 1 preserves them verbatim and a crashed Phase 1 resumes without
re-asking.

### D1: Dedicated retrieval route vs dashboard filter tab

**Decision:** Build a dedicated route `apps/web/app/(app)/contractor-questions/page.tsx` with an entry point on the dashboard (`/home`). NOT a dashboard filter tab.

**Rationale:** The PLAN hook frames this as a "retrieval view … with a 30-day appointment nudge" and scopes it as its own PR. The dashboard-tab form is the ceo-review _trim_ option, reserved for "if scope is too wide"; at ~2–3 hr this is not too wide. A purpose-built view carries the per-group nudge banner more naturally than a tab inside the tiered dashboard.

### D2: Card inclusion + grouping key

**Decision:** Include all cards whose `state` is NOT `closed` and NOT `dismissed`, that have ≥1 entry in `questions_for_contractor` (from the effective contractor expansion), AND whose card-level `contractor_tag` is non-null and not `diy`. Group by the card-level `contractor_tag` enum value.

**Rationale:** eng-review step 13 requires questions "from both DECIDE and MONITOR" — so inclusion is not limited to `chosen_path = 'contractor'`. Card-level `contractor_tag` is the "which pro would you call" routing bucket; the granular per-job `cost_estimate_hire.contractor_type` (Gotcha #7) can differ and is job-specific, so it is NOT the grouping key. `diy`-tagged cards are not contractor visits → excluded. Taxonomy is the closed 8-value enum (`diy / handyman / plumber / electrician / hvac_tech / roofer / general_contractor / specialist`); the source's "custom free-text tag" idea is unbuilt and out of scope.

### D3: 30-day appointment nudge trigger + placement

**Decision:** Per contractor-type group, compute the age of the group's oldest included card (by `created_at`). When that age is ≥30 days, render an appointment-nudge banner inside that group: "You have N open questions for your {Type} contractor." No nudge below the threshold. Nudge lives in the group section header area of the retrieval view (not the dashboard).

**Rationale:** Appointment scheduling is explicitly Phase 2 (`PRODUCT-ROADMAP.md § v+`), so there is no appointment date to anchor the "30-day" window to — card age is the only available signal. The chosen reading: a trade whose oldest open question-card is ≥30 days old is one the user has been sitting on, worth a gentle "book the visit" nudge. Threshold is a single named constant (`NUDGE_AGE_DAYS = 30`) so it is trivially tunable.

### D4: New metric events

**Decision:** Add exactly 2 PostHog events:

- `contractor_questions_view_opened` — `{ group_count: number, total_question_cards: number }` — fired once per (browser session) on retrieval-view mount (sessionStorage sentinel, mirroring `decide_view_opened` / `monitor_view_opened`).
- `contractor_appointment_nudge_shown` — `{ contractor_type: string, question_count: number, oldest_card_days: number }` — fired when a group's nudge banner renders.

**Rationale:** ceo-review § metrics wants "how often opened" plus nudge surfacing. Kept lean — no per-question / per-expand interaction events this PR. Both rows added to `METRICS.md` with the existing authoring shape. Operator approved adding these at Phase 0.

---

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens, Data
     model changes, API contracts, Offline behavior, Metrics, Files to
     create/modify, Tests, Dependencies, Task order, Gotchas, Acceptance /
     rollout / rollback. The Product update + Decisions sections above
     stay verbatim. -->

## Core user story

1. Open the dashboard and tap the "Contractor questions" entry point.
2. See the questions grouped by trade (Plumber, Electrician, HVAC, …), each group listing its cards' questions.
3. See an appointment nudge on any trade whose oldest open card is ≥30 days old.

## In scope

- A new read-only route `apps/web/app/(app)/contractor-questions/page.tsx` (server component) that:
  - Resolves the authenticated user (redirect to `/login` if absent — mirror `home/page.tsx`).
  - SELECTs the user's cards (RLS-scoped client) with the columns the grouping lib needs: `id, title, initial_description, state, contractor_tag, chosen_path, cost_estimate_hire, cost_estimate_hire_override, created_at`.
  - On PostgREST error: `Sentry.captureException` tagged `surface: 'contractor-questions', stage: 'cards_select'` with `extra: { user_id, error_message, error_code }`, then fall through treating the result as an empty list (mirror `home/page.tsx` + `cards/[id]/page.tsx`).
  - Passes the rows + `Date.now()` into the pure grouping lib, renders the resulting groups.
- A pure grouping/filter lib `apps/web/app/(app)/contractor-questions/_lib/group-contractor-questions.ts`:
  - **Filter** (per D2): keep a card iff `state NOT IN ('closed','dismissed')` AND `contractor_tag != null` AND `contractor_tag != 'diy'` AND the effective contractor expansion (`cost_estimate_hire_override ?? cost_estimate_hire`) parses via `parseContractorExpansion` to a value with `questions_for_contractor.length >= 1`.
  - **Effective-expansion resolution**: `cost_estimate_hire_override ?? cost_estimate_hire` — override wins when present (even if base also present). A null/absent/invalid effective expansion → card excluded (no questions to show).
  - **Validation**: run the raw jsonb through `parseContractorExpansion` (shared module — do NOT re-implement); a card whose effective expansion fails validation is excluded (defensive — should not happen for cards that reached `decide`, but the jsonb is user/LLM-sourced).
  - **Group** by card-level `contractor_tag` (NOT `cost_estimate_hire.contractor_type` — CLAUDE.md Gotcha #7). One group per distinct tag among the kept cards.
  - **Per-group nudge derivation**: compute the age in whole days of the group's oldest included card by `created_at`, using the project's UTC-slice calendar-date pattern (`todayIso(now)` minus the card's UTC date slice — never compare raw `Date` objects). `nudge = oldestCardDays >= NUDGE_AGE_DAYS` (constant `NUDGE_AGE_DAYS = 30`, exported from the lib).
  - **Output shape**: `{ groups: ContractorQuestionGroup[]; totalQuestionCards: number }` where each group = `{ contractorType: ContractorTag; cards: { cardId; title; questions: string[]; createdAt }[]; questionCount: number; oldestCardDays: number; showNudge: boolean }`. Group ordering: by display-label alphabetical (stable, deterministic for tests + snapshot). Card ordering within a group: oldest `created_at` first (the card driving the nudge sorts to the top). `totalQuestionCards` = count of included cards across all groups.
- A `contractor_tag` → display-label util `apps/web/app/(app)/contractor-questions/_lib/contractor-tag-label.ts` (NONE exists today): `handyman→Handyman, plumber→Plumber, electrician→Electrician, hvac_tech→HVAC, roofer→Roofer, general_contractor→General Contractor, specialist→Specialist`. `diy` is excluded from the view by D2 and has no entry / returns a safe fallback (the tag string) if ever passed.
- Client `_components`:
  - `ContractorQuestionsView.tsx` — renders the groups, each group's question list (copy-friendly: questions rendered as discrete list items the user can read/screenshot/copy), and the per-group nudge banner. Empty state when `groups.length === 0`.
  - `ContractorAppointmentNudge.tsx` — the per-group banner. Copy: `You have {questionCount} open questions for your {Label} contractor.` Fires `contractor_appointment_nudge_shown` on mount.
  - `ContractorQuestionsViewOpenedCapture.tsx` — zero-output client component, fires `contractor_questions_view_opened` once per browser session (sessionStorage sentinel `home_os.contractor_questions_view_opened_fired`), mirroring `MonitorViewOpenedCapture`.
- A dashboard entry point: a link/button to `/contractor-questions` placed in the dashboard header region (in `DashboardShell`, near/under the `FilterBar`). It is a plain `next/link` styled with the dark-charcoal tokens; always shown (the destination renders its own empty state).

## Out of scope

- Any schema migration / new column / new RPC — the data already exists (CLAUDE.md context, D2). This is a read-only presentation feature.
- Appointment scheduling, calendar integration, or an actual appointment date (explicitly Phase 2 per `PRODUCT-ROADMAP.md § v+`). The nudge is age-derived, not appointment-derived (D3).
- Per-question / per-card interaction events (expand, copy, check-off) — D4 keeps metrics to exactly 2 events.
- Editing questions or the contractor expansion from this view (that lives on `cards/[id]` via the estimate override flow).
- Grouping by the granular `cost_estimate_hire.contractor_type` (D2 — group by card-level `contractor_tag`).
- Free-text / custom contractor tags (the source's unbuilt idea; taxonomy is the closed 8-value enum — D2).
- A dashboard filter-tab form of this feature (the ceo-review trim option, rejected in D1).

## Screens

**Route `/contractor-questions`** (`(app)` group — inherits the app shell/nav from `(app)/layout.tsx`):

- **Populated**: a stacked list of groups. Each group is a section: header showing the trade label + its question/card count; optional nudge banner directly under the header (only when `showNudge`); then the cards, each card showing its title (or `initial_description` fallback) and its `questions_for_contractor` as a readable list.
- **Empty** (`groups.length === 0`): a calm empty state — short copy explaining that contractor questions appear here once triage suggests a pro-path issue with questions (no anxiety amplification). Mirror the tone of `home/_components/EmptyState`.

**Dashboard `/home`**: an entry-point link ("Contractor questions" / equivalent) in the header region, routing to `/contractor-questions`.

## Render conditions

### Contractor Questions view

| Element                                | 0 included cards (empty) | ≥1 group, group oldest card < 30d | ≥1 group, group oldest card ≥ 30d |
| -------------------------------------- | ------------------------ | --------------------------------- | --------------------------------- |
| Empty state                            | shown                    | hidden                            | hidden                            |
| Group section (header + question list) | hidden                   | shown                             | shown                             |
| `ContractorAppointmentNudge` banner    | hidden                   | hidden                            | shown                             |
| `ContractorQuestionsViewOpenedCapture` | shown (mounts, fires)    | shown (mounts, fires)             | shown (mounts, fires)             |

Note: the nudge column resolves **per group** — in a multi-group view some groups show the banner and others don't, depending on each group's own oldest-card age.

### Dashboard entry point

| Element                            | first-time empty dashboard                                   | dashboard with cards |
| ---------------------------------- | ------------------------------------------------------------ | -------------------- |
| "Contractor questions" link/button | n/a (EmptyState first-time variant short-circuits the shell) | shown                |

## Data model changes

**None.** This feature reads existing columns only:

- `cards.contractor_tag` — native Postgres enum (migration 001/002): `diy | handyman | plumber | electrician | hvac_tech | roofer | general_contractor | specialist`.
- `cards.cost_estimate_hire` (jsonb) + `cards.cost_estimate_hire_override` (jsonb) — `ContractorExpansion` shape (decide-state); `questions_for_contractor: string[]` carries the questions. Effective = `cost_estimate_hire_override ?? cost_estimate_hire`.
- `cards.state` (migration 011 enum), `cards.chosen_path`, `cards.created_at`, `cards.title`, `cards.initial_description`.

No migration, no `pnpm db:gen-types` regen, no `pnpm db:advisor` run (no SQL touched).

## API contracts

**No new API routes.** The route is a server component that reads directly via the RLS-scoped Supabase server client (`@/lib/supabase/server`), exactly like `home/page.tsx` and `cards/[id]/page.tsx`. No client-side fetch, no Route Handler.

- **Auth**: `supabase.auth.getUser()`; redirect to `/login` when no user. RLS on `cards` scopes the SELECT to the owner — no explicit `owner_id` filter needed (defense-in-depth comes from RLS, mirroring the dashboard).
- **Inputs**: none (no query params; the view shows all qualifying cards for the user).
- **Outputs**: server-rendered HTML.
- **Error surface**: PostgREST error on the cards SELECT → Sentry `captureException` (tagged) + render empty (graceful), never a 500 page. There is no `data: null` swallow risk because we explicitly check `error` and treat `data ?? []`.

## Offline behavior

**(a) Online-only with error state.** Server-rendered page; no offline cache, no optimistic state, no sync. If the SELECT fails the page renders the empty state (degraded-but-calm), and the failure is captured to Sentry. No service-worker caching is added for this route in v0. (Default posture per spec template — not upgraded.)

## Metrics

Two NEW events (D4), both added to `METRICS.md` in this PR (rows already authored at spec time):

- **`contractor_questions_view_opened`** — `{ group_count: number, total_question_cards: number }`. Fired once per browser session from `ContractorQuestionsViewOpenedCapture.tsx` (sessionStorage sentinel `home_os.contractor_questions_view_opened_fired`). Mirrors `decide_view_opened` / `monitor_view_opened` dedup semantics.
- **`contractor_appointment_nudge_shown`** — `{ contractor_type: string, question_count: number, oldest_card_days: number }`. Fired on mount of each rendered `ContractorAppointmentNudge` banner (i.e. once per group whose oldest card is ≥30 days).

No existing events are modified. `contractor_type` in the second event is the card-level `contractor_tag` enum string (e.g. `'plumber'`), not the display label.

## Files to create / modify

**Create**

- `apps/web/app/(app)/contractor-questions/page.tsx` — server component (fetch + Sentry-on-error + render).
- `apps/web/app/(app)/contractor-questions/_lib/group-contractor-questions.ts` — pure filter/group/nudge lib + `NUDGE_AGE_DAYS`, types.
- `apps/web/app/(app)/contractor-questions/_lib/group-contractor-questions.test.ts` — vitest unit tests.
- `apps/web/app/(app)/contractor-questions/_lib/contractor-tag-label.ts` — `contractor_tag` → display-label util.
- `apps/web/app/(app)/contractor-questions/_lib/contractor-tag-label.test.ts` — vitest unit tests for the label map.
- `apps/web/app/(app)/contractor-questions/_components/ContractorQuestionsView.tsx` — client view (groups + empty state).
- `apps/web/app/(app)/contractor-questions/_components/ContractorAppointmentNudge.tsx` — per-group nudge banner + event.
- `apps/web/app/(app)/contractor-questions/_components/ContractorQuestionsViewOpenedCapture.tsx` — once-per-session view event.
- `apps/web/app/(app)/contractor-questions/_components/ContractorQuestionsView.test.tsx` — render test (vitest + Testing Library).
- `apps/web/e2e/contractor-questions.spec.ts` — Playwright E2E (375px + 1440px).

**Modify**

- `apps/web/app/(app)/home/_components/DashboardShell.tsx` — add the `/contractor-questions` entry-point link in the header region.
- `apps/web/app/(app)/home/_components/DashboardShell.test.tsx` (if present) — assert the entry-point link renders.
- `METRICS.md` — 2 new event rows (done at spec time).

## Tests

**Unit — `group-contractor-questions.test.ts`** (thorough, per the task brief):

1. Empty input → `{ groups: [], totalQuestionCards: 0 }`.
2. All-excluded: a card in `closed`, a card in `dismissed`, a `diy`-tagged card, a card with a valid expansion but `questions_for_contractor: []`, and a card with null effective expansion → all excluded → empty result.
3. Single group: multiple cards same `contractor_tag` → one group, correct `questionCount`, cards oldest-first.
4. Multiple groups: cards across `plumber` / `electrician` / `hvac_tech` → 3 groups, alphabetical-by-label ordering deterministic.
5. Override-vs-base source: a card with both `cost_estimate_hire` and `cost_estimate_hire_override` → questions come from the override; a card with only base → questions from base; a card whose override is present but its `questions_for_contractor` differs from base → asserts override wins.
6. Nudge boundary: oldest card at exactly 29 days (`showNudge=false`), exactly 30 days (`showNudge=true`), exactly 31 days (`showNudge=true`) — assert the `NUDGE_AGE_DAYS` boundary using a fixed injected `now` and UTC-sliced `created_at` values.
7. Invalid jsonb: a card whose effective expansion fails `parseContractorExpansion` (e.g. missing `questions_for_contractor`) is excluded, not thrown.

**Unit — `contractor-tag-label.test.ts`**: every non-`diy` tag maps to its expected label; fallback behavior for an unknown/`diy` value.

**Render — `ContractorQuestionsView.test.tsx`**: renders groups + question items; renders the nudge banner only for groups with `showNudge`; renders the empty state for empty groups. (Mock `posthog-js` capture as in existing capture tests.)

**E2E — `contractor-questions.spec.ts`**: seed a user with ≥1 contractor-path card carrying questions (reuse existing e2e seed/helpers like `decide-state.spec.ts`); navigate from `/home` via the entry point; assert the view shows the group + questions at 375px and 1440px; assert the nudge appears for an aged card. Produce the qa-walk artifacts for the 3 Core-user-story verbs.

This is a UI surface (new route + dashboard link), so per `conventions.md § Non-Negotiables — Testing` it requires a Playwright E2E at both breakpoints; the new spec is picked up by the active slow-job CI step automatically (no Decision row needed for slow-job activation — this is a post-2026-05-19 scaffold with an active stub).

## Dependencies

- **Code**: `parseContractorExpansion` + `ContractorExpansion` + `ContractorTag` / `CONTRACTOR_TAG_VALUES` from `@/app/api/triage/_lib/estimate-shapes` (and its `parse-tool-output` re-export). The UTC-slice helper pattern from `home/_lib/tier-cards.ts` (`todayIso`) — either import or replicate the one-liner with a citing comment.
- **Runtime**: `posthog-js` (already a dep), `@sentry/nextjs` (already wired), `@/lib/supabase/server`.
- **Upstream feature**: decide-state (provides the `ContractorExpansion` data) and monitor-beta (cards can be `monitoring` and still carry questions — D2 includes them). Both already shipped.
- No new npm packages.

## Task order

1. **Grouping + filter lib + unit tests** — write `group-contractor-questions.ts` (filter per D2, effective-expansion resolution via `parseContractorExpansion`, group-by `contractor_tag`, UTC-slice oldest-card-age + `NUDGE_AGE_DAYS=30` nudge derivation, deterministic ordering) and its full `group-contractor-questions.test.ts` (the 7 cases above). Pure logic first so the boundary + nudge math is locked before any UI.
2. **`contractor-tag-label` util + tests** — the `contractor_tag` → display-label map + `contractor-tag-label.test.ts`.
3. **Retrieval route + view + nudge + empty state** — `page.tsx` (auth + RLS-scoped SELECT + Sentry-on-error + empty fall-through), `ContractorQuestionsView.tsx` (groups, copy-friendly question lists, empty state with calm tone, dark-charcoal tokens), `ContractorAppointmentNudge.tsx` (per-group banner with the D3 copy), plus `ContractorQuestionsView.test.tsx` render test.
4. **Dashboard entry point** — add the `/contractor-questions` link in `DashboardShell.tsx` header region; update its render test.
5. **Metrics events** — wire `ContractorQuestionsViewOpenedCapture.tsx` (once-per-session sentinel) firing `contractor_questions_view_opened` and the `contractor_appointment_nudge_shown` capture inside the nudge banner. (METRICS.md rows already added.)
6. **Playwright E2E** — `contractor-questions.spec.ts` at 375px + 1440px, including the dashboard-link navigation and the nudge case; capture qa-walk artifacts per Core-user-story verb.

(≤15 tasks → flat list. Tasks 1–2 are foundational pure logic; 3–5 are the vertical slice of the Core user story; 6 is verification.)

## Gotchas

- **Group by card-level `contractor_tag`, NOT `cost_estimate_hire.contractor_type`.** CLAUDE.md Gotcha #7 / D2: the granular per-job `contractor_type` inside the expansion can differ from the card's routing tag and is job-specific. The "which pro would you call" bucket is the card-level enum.
- **Effective expansion is `cost_estimate_hire_override ?? cost_estimate_hire`** — override wins when present. Reading only the base would show stale questions for any card the user edited. Both go through the shared `parseContractorExpansion` validator (CLAUDE.md "locked-jsonb-shape validation lives in TWO places" — do NOT inline a third validator here; reuse the shared module).
- **Calendar-date / UTC-slice for the nudge age.** Derive oldest-card age via the UTC-slice string pattern used in `tier-cards.ts` (`todayIso`) + card-detail reminder-due derivation — never subtract raw `Date` objects (DST / timezone drift would make the 30-day boundary flap). This is now a THIRD calendar-date derivation site alongside the two CLAUDE.md names; keep the recipe identical (per `kit/docs/guide/date-handling.md § Trap 2: Date comparison vs CURRENT_DATE — UTC drift`).
- **`questions_for_contractor` can be empty / the expansion can be null/invalid.** A card may have a `contractor_tag` but no usable expansion (never reached decide, or `_override` cleared it). Exclude such cards from the view rather than rendering an empty group — the filter requires `>= 1` validated question.
- **Once-per-session view event uses a sessionStorage sentinel that can throw** (Safari Private Browsing) — wrap in try/catch and fall through to firing anyway, exactly like `MonitorViewOpenedCapture` (the upstream PostHog dedup tolerates the rare double-fire).
- **PostgREST `error` must be checked explicitly** — a swallowed `data: null` would silently render the empty state on a real DB error and hide a regression. Check `error`, Sentry-capture it, then `data ?? []` (per `kit/docs/guide/database-queries.md`).
- **`NUDGE_AGE_DAYS` is a single exported constant** (D3) so the threshold is tunable in one place and the boundary tests pin it.

## Acceptance / rollout / rollback

**Acceptance**

- Visiting `/contractor-questions` as an authed user with ≥1 qualifying card shows the cards grouped by trade with their questions; visiting with none shows the calm empty state; unauthenticated visit redirects to `/login`.
- A group whose oldest included card is ≥30 days old shows the appointment nudge with the exact D3 copy and the correct question count; younger groups show no nudge.
- `closed` / `dismissed` / `diy` cards and cards without ≥1 valid question never appear.
- The dashboard exposes a working entry-point link to the view.
- `contractor_questions_view_opened` fires once per browser session; `contractor_appointment_nudge_shown` fires once per rendered nudge banner with the documented props.
- Unit + render + E2E (375px & 1440px) suites pass; `METRICS.md` carries the 2 new rows.

**Rollout**

- Standard PR → preview → merge-to-main → Vercel prod. No migration, so no deploy-migrations gating, no backwards-incompatibility concern (`conventions.md § Deploy Boundaries` does not apply — read-only, no schema mutation). No feature flag; the route + dashboard link ship together.

**Rollback**

- Pure additive, read-only feature with no schema or data writes. Rollback = revert the PR (removes the route, the lib, the dashboard link, and the 2 METRICS rows). No data migration to unwind, no in-flight state to reconcile. The 2 PostHog events simply stop firing.
