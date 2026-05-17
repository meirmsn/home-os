<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: decide-state -->
<!-- date: 2026-05-16 -->

# Spec: decide-state (PR N)

**Sources:**

- `PLAN.md § Planned #1` — primary scope (this row)
- `PRODUCT-ROADMAP.md § v0 § 1 (decide-state)` — long-horizon context
- `.gstack/design-review-home-os-2026-05-02.md § DECIDE — Dual-Path Exploration + § Card States — DECIDE confirmed` — UI surface
- `.gstack/eng-review-home-os-2026-05-01.md § Build Order step 7 + § Business Logic (cadence)` — server-side state machine + cadence handling
- `.gstack/ceo-review-home-os-2026-05-01-r2.md § Scope (DECIDE) + § User-input budget at CAPTURE` — premises, scope boundaries
- Prior spec `specs/triage-conversation/spec.md` — style + structure reference; this PR extends its `confirm_assessment` tool with DIY/contractor expansion fields
- `apps/web/app/(app)/cards/[id]/page.tsx` (line 16 note: "row #3 owns the decide-state surface" — the placeholder waiting for this PR)
- `supabase/migrations/20260513184101_002_tables.sql` — pre-existing `cards.fix_steps_diy / cost_estimate_diy / fix_steps_hire / cost_estimate_hire / monitoring_cadence_days` jsonb columns this PR finally populates
- `supabase/migrations/20260516111757_010_triage_conversation.sql` — `cards.severity_confirmed` (PR #26) + the `confirm_triage` RPC this PR updates

PR N delivers the dual-path DIY/Contractor exploration surface on top of PR #26's confirmed assessment. Confirm flow now lands cards at the new `decide` state (instead of `diagnosed + severity_confirmed=true`). User sees DIY + Contractor cards side by side, can expand either to explore the full breakdown, can edit any cost estimate ("edited" badge + reset link), and commits via "Choose DIY" / "Choose Contractor" / "Set to Monitor" / "Dismiss" which transitions the card to `planned` / `monitoring` / `dismissed`. Closes PLAN row #1 (`decide-state`); unblocks rows #2 (`planned-state`), #4 (`monitor-beta`), and #7 (`contractor-question-retrieval`).

---

## Decisions (resolved at spec time)

11 `/ak-spec`-time decisions resolved in Phase 0 with the user. Recorded below so Phase 1 preserves them verbatim and a crashed Phase 1 resumes without re-asking.

### D1: State machine — extend `card_state` enum or stay with boolean flags?

**Decision:** Extend `card_state` enum: add `'decide'` and `'planned'` values via the canonical rename-recreate dance (migration 011, transaction-safe). Confirm flow now lands at `decide` (not `diagnosed + severity_confirmed=true`). Path commitment transitions `decide → planned` (DIY/Contractor) or `decide → monitoring` (Monitor) or `decide → dismissed` (Dismiss).

**Rationale:** PR #26's D2 explicitly noted "row #2 (decide-state) will introduce richer states." Matches eng-review's FSM verbatim (`CAPTURE → TRIAGE_PENDING → TRIAGE_PROVISIONAL → DECIDE → MONITOR/PLANNED/DISMISS`). The recurring nature ("cards return to DECIDE after every check-in") maps cleanly with `decide` as a first-class state — PR #4 (`monitor-beta`) will land MONITOR check-ins back at `decide`. We've executed the rename-recreate dance twice already (migration 006a `dismissed`, migration 010 backfill) — known territory with the transaction-friendly recipe codified in 006a.

### D2: Where do DIY/Contractor cost estimates come from?

**Decision:** Extend PR #26's `confirm_assessment` tool with two substructure fields — `diy_expansion` and `contractor_expansion` — generated atomically with the confirmation in the existing Q&A flow. No separate AI endpoint, no skeleton-loading state.

**Rationale:** One AI call covers confirmation + expansion (no extra latency, no extra Anthropic cost). Design review explicitly says "Default DECIDE view shows both paths simultaneously" — a "Loading…" skeleton on first entry would betray that. Bloats the tool schema modestly but `_lib/parse-qa-output.ts`'s runtime validator already enforces a defensive parse pass — adding two more validated substructures keeps the trust-boundary pattern consistent. Alternative (`POST /api/decide/generate` on first view) doubles AI cost and requires a paint shift; rejected.

### D3: JSON shape of `cost_estimate_diy` and `cost_estimate_hire`

**Decision:** Lock down structured jsonb shapes at migration 011 time. Both columns stay `jsonb` (no new typed columns); the runtime validator (`_lib/parse-qa-output.ts`) enforces the shape.

`cost_estimate_diy`:

```ts
{
  skill_level: 'beginner' | 'intermediate' | 'advanced',
  time_hours_min: number,
  time_hours_max: number,
  materials: { name: string, cost_min: number, cost_max: number }[],
  tools: { name: string, cost_min: number, cost_max: number, optional?: boolean }[],
  total_min: number,
  total_max: number,
  gotchas: string,
  abort_condition: string,
  steps: string[]
}
```

`cost_estimate_hire`:

```ts
{
  contractor_type: contractor_tag_enum,
  cost_range_min: number,
  cost_range_max: number,
  questions_for_contractor: string[],
  red_flags: string[],
  good_completion: string
}
```

`fix_steps_diy` / `fix_steps_hire` jsonb columns from migration 002 are deprecated in this PR (`steps[]` rolls into `cost_estimate_diy` per § D3 above; `questions_for_contractor[]` rolls into `cost_estimate_hire`). They stay in the schema (no migration drop) but become unused. Tracked for cleanup in TODOS.md.

**Rationale:** Locked shapes + runtime validator at the LLM trust boundary keep the defense-in-depth pattern consistent with PR #19 (`record_initial_read`) + PR #26 (Q&A tools). Stored as `jsonb` so future field additions don't need schema migrations — the validator is the contract. Deprecating `fix_steps_*` rather than dropping avoids a column-rename migration; the existing jsonb columns roll up the deprecated steps fields.

### D4: User-edited estimates — how stored?

**Decision:** Add parallel override columns: `cost_estimate_diy_override jsonb`, `cost_estimate_hire_override jsonb`. NULL = no override; non-NULL = user's edited shape (same schema as the non-override column). "Reset to app estimate" = `UPDATE cards SET <col>_override = NULL`. UI distinguishes "edited" badge when override is non-null.

**Rationale:** Single source of truth per state (app-generated vs user-edited). "Reset" is a single SQL NULL set, no merge logic. Survives AI re-generation in PR #4's MONITOR re-triage without losing user edits (the original `cost_estimate_*` columns get overwritten; overrides persist). Alternative (one column with a `_user_edited: true` flag inside the jsonb) muddies the "original vs edited" distinction and complicates reset.

### D5: Path commitment endpoint

**Decision:** `POST /api/cards/[id]/decide` with body `{ path: 'diy' | 'contractor' | 'monitor' | 'dismiss', monitoring_cadence_days?: int }` (cadence only required when `path='monitor'`). New SECURITY DEFINER RPC `commit_decide(p_user, p_card, p_path, p_cadence)` atomically:

- Writes `cards.chosen_path = p_path` (or NULL when `p_path='dismiss'`/`'monitor'` — see § Gotchas).
- For `path='diy'` or `'contractor'`: transitions `state = 'planned'`.
- For `path='monitor'`: transitions `state = 'monitoring'`, persists `monitoring_cadence_days = p_cadence`.
- For `path='dismiss'`: transitions `state = 'dismissed'`.
- Predicate-guards on `state IN ('decide', 'planned')` — `planned` re-enters allowed for "Change decision". `monitoring`/`closed`/`dismissed` paths return 409 `invalid_state`.

**Rationale:** Mirrors `claim_card_slot` / `start_triage` / `confirm_triage` posture — one RPC per write-cluster, internal `p_user = auth.uid()` guard, `set search_path = public, pg_catalog`, qualified column refs (Gotcha PR #24). Predicate-guard prevents concurrent commits.

### D6: Estimate-edit endpoint

**Decision:** `PATCH /api/cards/[id]/estimate` with body `{ path: 'diy' | 'contractor', estimate: <override-jsonb> | null }` (null = reset). RLS-enforced direct UPDATE on `cost_estimate_<path>_override`. No SECURITY DEFINER RPC needed.

**Rationale:** Single-row UPDATE under the user's RLS context. No state-machine invariants to protect (override is data, not a transition). Server-side validates the body against the locked jsonb shape from D3 via a shared `_lib/parse-estimate-override.ts` helper before writing. Predicate-guards on `state IN ('decide', 'planned', 'monitoring')` so edits remain possible after path commitment (user might revise a contractor estimate after getting a real quote).

### D7: Manual-path UI (limit reached, no AI estimates)

**Decision:** DEFER to PR #8 (`usage-counters-and-byok`). This PR does NOT render the manual-path-only DECIDE view; every confirmed card today has AI estimates (Q&A is always available).

**Rationale:** The trigger for manual-path is "AI sessions used up this week", which depends on the weekly Q&A cap that PR #8 wires. Today every confirmed card carries `cost_estimate_diy` + `cost_estimate_hire` jsonb from the extended `confirm_assessment` tool. Manual-path UI today would render dead code until PR #8 ships. Roadmap dependency: PR #1 (`decide-state`) does NOT depend on PR #8, but the manual-path _UI rendering_ logically does — defer the surface, ship the schema (overrides are usable today regardless of source).

### D8: Contractor question retrieval view

**Decision:** DEFER to PR #7 (`contractor-question-retrieval`). This PR only **generates** `questions_for_contractor[]` as part of the contractor expansion (per D3). PR #7 owns the grouping / retrieval / 30-day nudge.

**Rationale:** Roadmap row #7 explicitly owns the retrieval surface ("retrieval view grouped by contractor type"). This PR's responsibility ends at populating the array on the card; PR #7 reads across cards to surface the consolidated view.

### D9: PostHog events

**Decision:** 6 new events added to METRICS.md:

- `decide_view_opened` — `{ card_id: string }` — fired by `<DecideView />` on first render after `state='decide'`.
- `decide_path_expanded` — `{ card_id: string, path: 'diy' | 'contractor' }` — fired when user taps to expand either path card.
- `decide_estimate_edited` — `{ card_id: string, path: 'diy' | 'contractor' }` — fired by `<EstimateEditor />` on save.
- `decide_estimate_reset` — `{ card_id: string, path: 'diy' | 'contractor' }` — fired when user taps "Reset to app estimate".
- `decide_path_chosen` — `{ card_id: string, chosen_path: 'diy' | 'contractor' | 'monitor' | 'dismiss', monitoring_cadence_days: number | null }` — fired on successful `POST /api/cards/[id]/decide`.
- `decide_path_changed` — `{ card_id: string, from_path: 'diy' | 'contractor' | 'monitor' | 'dismiss', to_path: 'diy' | 'contractor' | 'monitor' | 'dismiss' }` — fired when user re-opens decide via "Change decision" and commits a different path.

**Rationale:** Calibrates the dual-path-exploration hypothesis from ceo-review (do users actually compare both paths, or jump straight to one?) and the edit-frequency hypothesis (how often are AI estimates wrong enough that users override?). Six events keep the funnel granular without bloating METRICS.md.

### D10: PLANNED state surface

**Decision:** Minimal stub for this PR. `<PlannedView />` renders chosen path + the chosen-path's relevant detail (DIY: materials/tools/steps; Contractor: contractor_type + questions_for_contractor) + a "Change decision" link that POSTs `path='decide'` reset (re-opens decide; predicate-guard allows planned → decide).

Reminder dates, never-overdue treatment, reminder-due chip lift to Tier 1, and the full "what's needed before CLOSE" experience are PR #2 (`planned-state`) scope.

**Rationale:** Keeps this PR's surface area focused on the decide → planned _transition_. PR #2 owns the rich PLANNED experience. Same pattern PR #19 (`triage-route-handler`) used for `diagnosed` — showed something useful as a placeholder; PR #26 filled out the conversation surface.

### D11: Migration 011 backfill ordering

**Decision:** Migration 011 sequence (in this exact order, single .sql file, transaction-safe per the rename-recreate recipe codified in migration 006a):

1. Rename + recreate `card_state` enum with new values: `'capturing', 'triaging', 'diagnosed', 'decide', 'planned', 'monitoring', 'closed', 'dismissed'`. ALTER COLUMN cast + drop old type per the 006a recipe.
2. Add new `cards` columns: `chosen_path text NULL`, `cost_estimate_diy_override jsonb NULL`, `cost_estimate_hire_override jsonb NULL`. CHECK constraint on `chosen_path IN ('diy', 'contractor', 'monitor') OR chosen_path IS NULL`.
3. Update `confirm_triage` RPC: change the `cards UPDATE` clause to set `state='decide'` (not implicit retention of `'diagnosed'`), and accept two new params `p_diy_expansion jsonb` + `p_contractor_expansion jsonb` that write to `cost_estimate_diy` + `cost_estimate_hire`.
4. Create `commit_decide(p_user, p_card, p_path, p_cadence)` SECURITY DEFINER RPC per D5.
5. One-shot backfill UPDATE: `UPDATE public.cards SET state='decide' WHERE state='diagnosed' AND severity_confirmed=true` — lifts existing confirmed rows into the new state. Existing rows lose their previous `confirm_triage`-time `cost_estimate_*` (which were NULL anyway because PR #26 never populated them) — operator note in BUILD-LOG.

**Rationale:** Single migration file keeps the data-state invariant atomic (every row visible to PostgREST after the migration has the new state consistent with its severity_confirmed flag). The backfill UPDATE catches existing confirmed-but-not-yet-decided rows; future confirms write `decide` natively via the updated RPC. The CHECK constraint on `chosen_path` defends against bad enum-like text values without introducing another native enum (avoids ALTER TYPE ADD VALUE overhead for a single-column constraint).

---

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens, Data
     model changes, API contracts, Offline behavior, Metrics, Files to
     create/modify, Tests, Dependencies, Task order, Gotchas, Acceptance /
     rollout / rollback. The Decisions section above stays verbatim. -->
