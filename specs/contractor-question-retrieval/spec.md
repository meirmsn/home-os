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
