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

<!-- expanded by /ak-build Phase 1 (in-line, after subagent socket-close at 17min) -->

## In scope

- **Migration 011** — extends `card_state` enum with `'decide'` + `'planned'` via the canonical rename-recreate dance (006a template, transaction-safe). Adds `cards.chosen_path text NULL` (CHECK constrained to `'diy' | 'contractor' | 'monitor' | NULL`), `cards.cost_estimate_diy_override jsonb NULL`, `cards.cost_estimate_hire_override jsonb NULL`. Updates `confirm_triage` RPC to land cards at `state='decide'` (not `'diagnosed'`) and accept two new jsonb params (`p_diy_expansion`, `p_contractor_expansion`) that write to existing `cost_estimate_diy` + `cost_estimate_hire` columns. New SECURITY DEFINER RPC `commit_decide(p_user, p_card, p_path, p_cadence)` for path commitment. One-shot backfill UPDATE sweeps existing `diagnosed + severity_confirmed=true` rows to `state='decide'`.
- **`POST /api/cards/[id]/decide`** — auth-gated path-commitment route. Body `{ path: 'diy' | 'contractor' | 'monitor' | 'dismiss', monitoring_cadence_days?: number }`. Calls `commit_decide` RPC. Returns 200 / 400 / 401 / 404 / 409.
- **`PATCH /api/cards/[id]/estimate`** — auth-gated estimate-edit route. Body `{ path: 'diy' | 'contractor', estimate: <jsonb-shape> | null }` (null = reset). RLS-enforced direct UPDATE on the override column. Body validation via `_lib/parse-estimate-override.ts`.
- **Extended `confirm_assessment` tool** (PR #26's surface) — adds `diy_expansion` + `contractor_expansion` substructures per D3. `_lib/parse-qa-output.ts` validates the new fields; `_lib/anthropic-qa.ts` exposes them in the tool schema; `_lib/prompt-qa.ts` instructs the model to fill them. `/api/triage/answer/route.ts` forwards them to `confirm_triage` RPC.
- **`<DecideView />` server component** — replaces `<DiagnosedThread />` when `state='decide'`. Renders confirmed severity chip + final diagnosis + dual `<PathCard />` (DIY / Contractor) + `<ChoosePath />` + "How we diagnosed this" collapsible (re-uses PR #26's `<ConversationRow />`).
- **`<PathCard />` server component** — DIY-or-Contractor breakdown card. Collapsed view = skill_level/contractor_type + total/range + time/contractor_type chip. Expanded view = full breakdown (materials, tools, steps, gotchas, abort_condition for DIY; questions, red_flags, good_completion for contractor). Renders override-or-app data; "edited" badge when override is non-null. Mounts `<EstimateEditor />` on expand.
- **`<EstimateEditor />` `'use client'` component** — inline edit form per-field with "Reset to app estimate" link. POSTs to `PATCH /api/cards/[id]/estimate`; fires `decide_estimate_edited` / `decide_estimate_reset`.
- **`<ChoosePath />` `'use client'` component** — four-button commit row ("Choose DIY" / "Choose Contractor" / "Set to Monitor" / "Dismiss"). On click, POSTs to `/api/cards/[id]/decide`. Post-selection greyed state when card re-enters via `state='planned'` (per design D5).
- **`<MonitorCadencePicker />` `'use client'` component** — appears inline below "Set to Monitor" when tapped. Reads AI-proposed `monitoring_cadence_days`, lets user adjust ±, then commits. Hidden if path-commit is a non-Monitor choice.
- **`<PlannedView />` server component (stub)** — minimal: chosen-path summary + "Change decision" link that POSTs `commit_decide` with `path='decide'` semantics (predicate-guards on `state IN ('decide', 'planned')`). PR #2 (`planned-state`) expands this.
- **`apps/web/app/(app)/cards/[id]/page.tsx`** — state-switched body extended for `decide` + `planned`. Updates `CardState` type + `CardRow` type to include the new enum values + `chosen_path` + `cost_estimate_*` jsonb columns + override columns.
- **6 new PostHog events** in METRICS.md per D9 — `decide_view_opened`, `decide_path_expanded`, `decide_estimate_edited`, `decide_estimate_reset`, `decide_path_chosen`, `decide_path_changed`.
- **CLAUDE.md § Where Things Happen** rows for: migration 011, the two new routes, the five new components, the extended `_lib/*-qa.ts` helpers.
- **E2E spec** `apps/web/e2e/decide-state.spec.ts` per D-tests below.
- **Regenerated `packages/core/src/supabase.types.ts`** after migration 011 — adds `decide` + `planned` to `card_state`, `chosen_path` + `cost_estimate_*_override` to `Tables['cards']`, `commit_decide` to `Functions`, and updates `confirm_triage` arg shape.

## Out of scope

- **Manual-path DECIDE UI** (limit reached, no AI estimates). PR #8 (`usage-counters-and-byok`) wires the weekly Q&A cap; PR #8 owns the manual-path rendering. Until then, every confirmed card carries AI estimates because Q&A is always available.
- **Contractor question retrieval view** (grouped by contractor type + 30-day nudge). PR #7 (`contractor-question-retrieval`) owns. This PR only **generates** `questions_for_contractor[]` in the contractor expansion.
- **Full PLANNED state surface** — reminder dates, never-overdue treatment, reminder-due chip lift to Tier 1, "what's needed before CLOSE" detail. PR #2 (`planned-state`) owns. Today's `<PlannedView />` is a deliberate stub.
- **MONITOR check-in loop** — ad-hoc check-ins, walkthrough mode, multi-photo sets, capture-with-reference, return-to-DECIDE flow. PR #4 (`monitor-beta`) owns. This PR transitions `state → monitoring` but the surface beyond that is minimal.
- **CLOSE flow** — spend log, finished photo, before/after pair. PR #3 (`close-flow`) owns.
- **Photo comparison UI**. PR #6 owns.
- **Photo additions at DECIDE** — user cannot add a new photo at the decide screen. Photo capture stays a CAPTURE-time concern (PR #4 will reintroduce it as part of MONITOR check-in).
- **Live AI re-generation at DECIDE** ("regenerate estimates" button). The cost estimates are generated once at confirm_triage time; no AI call from `/decide` or `/estimate` routes. Re-generation happens implicitly via PR #4's MONITOR re-triage.
- **PostHog feature flag for path-commit gating**. Server-side validates `path` enum at the route handler; no flag.

## Screens

### `/cards/[id]` — state-switched body extension

Header (room_tag · system_tag chip · created_at) + Photo block + Description block from PR #19 stay identical across all states. The body below splits on `card.state`:

| State                                                         | Body below the static blocks                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `capturing` / `triaging` / `diagnosed`                        | Unchanged from PR #19 / PR #26.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **`decide`** (new — confirmed assessment, no path chosen yet) | `<DecideView />`: (a) Confirmed severity chip + final diagnosis (re-uses PR #26's confirmed-state header). (b) Dual `<PathCard />`s side by side: DIY (left) / Contractor (right). Each card collapsed by default — summary line + "Tap to expand". (c) `<ChoosePath />` row: "Choose DIY" / "Choose Contractor" / "Set to Monitor" / "Dismiss" — no button greyed (no commitment yet). (d) Collapsed "How we diagnosed this" link (re-uses PR #26's `<ConversationRow />` for each turn). |
| **`planned`** (new — path chosen, awaiting action)            | `<PlannedView />`: (a) Confirmed severity chip + chosen-path summary banner ("You chose: DIY" or "You chose: Contractor (HVAC tech)"). (b) Chosen-path detail (DIY: materials/tools/steps; Contractor: contractor_type + questions_for_contractor list). (c) "Change decision" link — POSTs `commit_decide` with `path='decide'` to re-open. (d) Collapsed "How we diagnosed this" carries forward.                                                                                        |
| `monitoring` / `closed` / `dismissed`                         | Row #4 / #3 / capture-flow restore — unchanged from PR #26's deferred stubs.                                                                                                                                                                                                                                                                                                                                                                                                               |

### `<PathCard />` — collapsed vs expanded

**DIY card — collapsed:**

```
DIY
[skill_level chip] · time_hours_min-max h · $total_min–$total_max
[expand]
```

**DIY card — expanded:**

```
DIY
[skill_level chip] · time_hours_min-max h · $total_min–$total_max [edited badge if override]

▸ Materials
  - <name> · $cost_min–$cost_max  (each row)
  …
▸ Tools
  - <name> · $cost_min–$cost_max [optional tag if applicable]
  …
▸ Steps
  1. <step text>
  2. …
▸ Watch out for
  <gotchas paragraph>
▸ When to stop and call a pro
  <abort_condition paragraph>

[Edit estimate] [Reset to app estimate (if override is non-null)]
```

**Contractor card — collapsed:**

```
Contractor
[contractor_type chip] · $cost_range_min–$cost_range_max
[expand]
```

**Contractor card — expanded:**

```
Contractor
[contractor_type chip] · $cost_range_min–$cost_range_max [edited badge if override]

▸ Questions to ask
  - <question 1>
  - …
▸ Red flags
  - <red_flag 1>
  - …
▸ What good completion looks like
  <good_completion paragraph>

[Edit estimate] [Reset to app estimate (if override is non-null)]
```

### `<ChoosePath />` — render states

| Card state                            | Buttons rendered                                                              | "Change decision" link |
| ------------------------------------- | ----------------------------------------------------------------------------- | ---------------------- |
| `decide`                              | All four active.                                                              | hidden                 |
| `planned`                             | All four greyed (visual + `aria-disabled`); chosen path has a "✓ Chosen" tag. | shown below            |
| `monitoring` / `dismissed` / `closed` | `<ChoosePath />` not rendered (different `<*View />` owns the state).         | —                      |

### `<MonitorCadencePicker />` — render

Appears inline below `<ChoosePath />` only when the user has tapped "Set to Monitor" but not yet confirmed. Reads `card.monitoring_cadence_days` (AI-proposed). UI: "Check back in" + numeric stepper (min 7, max 365, step 1) + "Confirm" / "Cancel". On Confirm → POSTs `commit_decide` with `path='monitor', monitoring_cadence_days=<picked>`. On Cancel → hides itself; user can re-tap any choice.

### Edit estimate flow

On "Edit estimate" tap in a `<PathCard />` (DIY or contractor):

1. `<EstimateEditor />` mounts inside the expanded card body.
2. Form renders one editable field per locked-jsonb-shape field (D3). Numeric fields use `<input type="number" step="1" min="0">`; string fields use `<textarea>` or `<input>` per length.
3. Initial values are the override (if present) or the app estimate.
4. On Save → `PATCH /api/cards/[id]/estimate` with the body.
5. On 200 → `router.refresh()` so the server re-reads the override column.
6. "Reset to app estimate" link visible only when override is non-null; on click → `PATCH` with `estimate: null` body.

### Error states

| Surface                    | Error                                           | UI                                                                                           |
| -------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `<ChoosePath />` POST      | 409 `invalid_state` (card moved by another tab) | Inline banner: "Card state changed — refreshing…" + delayed `router.refresh()`.              |
| `<ChoosePath />` POST      | 400 `monitoring_cadence_days required`          | Inline error on the cadence picker; user can re-input.                                       |
| `<ChoosePath />` POST      | 500 / network                                   | Retryable banner with retry button; selection preserved in UI.                               |
| `<EstimateEditor />` PATCH | 400 `invalid_estimate_shape`                    | Inline error citing which field failed validation; user can re-edit. Save button re-enabled. |
| `<EstimateEditor />` PATCH | 409 `invalid_state` (card moved past planned)   | Inline banner: "Card state changed — refreshing…"                                            |
| `<EstimateEditor />` PATCH | 500 / network                                   | Retryable banner; form state preserved.                                                      |

## Data model changes

### Migration 011 — `20260516_<HHMMSS>_011_decide_state.sql`

**Statement order** (single .sql file, every statement transaction-safe per the 006a template):

1. **Rename old enum + create new** (rename-recreate dance from migration 006a):

   ```sql
   alter type public.card_state rename to card_state_old;
   create type public.card_state as enum (
     'capturing', 'triaging', 'diagnosed', 'decide', 'planned',
     'monitoring', 'closed', 'dismissed'
   );
   alter table public.cards alter column state drop default;
   alter table public.cards
     alter column state type public.card_state
     using state::text::public.card_state;
   alter table public.cards alter column state set default 'capturing'::public.card_state;
   drop type public.card_state_old;
   ```

2. **Add new `cards` columns**:

   ```sql
   alter table public.cards
     add column if not exists chosen_path text,
     add column if not exists cost_estimate_diy_override jsonb,
     add column if not exists cost_estimate_hire_override jsonb,
     add constraint cards_chosen_path_check
       check (chosen_path is null or chosen_path in ('diy', 'contractor', 'monitor'));
   ```

3. **Backfill existing confirmed rows** (lifts PR #26's `diagnosed + severity_confirmed=true` cards to the new state):

   ```sql
   update public.cards
   set state = 'decide'::public.card_state
   where state = 'diagnosed'::public.card_state
     and severity_confirmed = true;
   ```

4. **Update `confirm_triage` RPC** — drop the old signature, create the new one with two extra params (`p_diy_expansion jsonb`, `p_contractor_expansion jsonb`) and write `state='decide'`. Body keeps the PR #24 column-qualification posture (every `public.cards.*` qualified in WHERE/SET/RETURNING). Drop the old function explicitly before create-or-replace fails on signature mismatch.

5. **Create `commit_decide(p_user uuid, p_card uuid, p_path text, p_cadence int)` RPC** — SECURITY DEFINER, `set search_path = public, pg_catalog`, internal `p_user = auth.uid()` guard. Body:
   - Guard `p_path IN ('diy', 'contractor', 'monitor', 'dismiss', 'decide')` (`'decide'` is the re-open-from-planned path).
   - Guard `p_path = 'monitor'` requires `p_cadence IS NOT NULL AND p_cadence > 0`; raise `cadence_required` (P0001) otherwise.
   - Atomic UPDATE on `public.cards`:
     - `p_path = 'diy'`: `chosen_path='diy', state='planned'`.
     - `p_path = 'contractor'`: `chosen_path='contractor', state='planned'`.
     - `p_path = 'monitor'`: `chosen_path='monitor', state='monitoring', monitoring_cadence_days=p_cadence`.
     - `p_path = 'dismiss'`: `chosen_path=null, state='dismissed'`.
     - `p_path = 'decide'`: `chosen_path=null, state='decide'` (re-open).
   - Predicate-guard: `WHERE public.cards.id = p_card AND public.cards.user_id = p_user AND public.cards.state IN ('decide'::public.card_state, 'planned'::public.card_state)`. If `ROW_COUNT = 0` after the UPDATE, raise `invalid_state` (P0001).
   - Returns the updated `(card_id, state, chosen_path)` tuple. Qualify every column reference (PR #24 Gotcha).

**Rollback** (for `scripts/ci-rollback-explain.sh`):

```sql
-- DROP FUNCTION IF EXISTS public.commit_decide(uuid, uuid, text, int);
-- DROP the new confirm_triage signature and restore the migration-010 version.
-- UPDATE public.cards SET state='diagnosed'::public.card_state
--   WHERE state IN ('decide'::public.card_state, 'planned'::public.card_state);
-- ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_chosen_path_check;
-- ALTER TABLE public.cards
--   DROP COLUMN IF EXISTS chosen_path,
--   DROP COLUMN IF EXISTS cost_estimate_diy_override,
--   DROP COLUMN IF EXISTS cost_estimate_hire_override;
-- rename-recreate the enum back to migration-006a shape (no decide/planned).
```

The rollback UPDATE folds `decide` + `planned` back into `diagnosed` — non-destructive (state reduces; chosen_path drops). Future re-apply restores the wider enum + the columns.

### Locked jsonb shapes (D3)

`cost_estimate_diy` and `cost_estimate_diy_override` both follow:

```ts
{
  skill_level: 'beginner' | 'intermediate' | 'advanced',
  time_hours_min: number,    // >= 0
  time_hours_max: number,    // >= time_hours_min
  materials: { name: string, cost_min: number, cost_max: number }[],  // 0..50 entries
  tools: { name: string, cost_min: number, cost_max: number, optional?: boolean }[],  // 0..30 entries
  total_min: number,
  total_max: number,
  gotchas: string,           // 1..2000 chars
  abort_condition: string,   // 1..2000 chars
  steps: string[]            // 1..30 entries, 1..500 chars each
}
```

`cost_estimate_hire` and `cost_estimate_hire_override`:

```ts
{
  contractor_type: contractor_tag_enum,  // 'diy' is rejected here — only true contractor types
  cost_range_min: number,
  cost_range_max: number,
  questions_for_contractor: string[],   // 1..15 entries, 1..500 chars each
  red_flags: string[],                  // 0..10 entries, 1..500 chars each
  good_completion: string               // 1..2000 chars
}
```

## API contracts

### `POST /api/cards/[id]/decide`

**Request body**:

```ts
{
  path: 'diy' | 'contractor' | 'monitor' | 'dismiss' | 'decide',
  monitoring_cadence_days?: number  // required when path='monitor', positive integer
}
```

`'decide'` is the re-open path used by `<PlannedView />`'s "Change decision" link. The server treats it like any other commit (RPC call); the predicate-guard on `state IN ('decide', 'planned')` allows it.

**Response shapes**:

- **200** — `{ card_id: string, state: 'planned' | 'monitoring' | 'dismissed' | 'decide', chosen_path: 'diy' | 'contractor' | 'monitor' | null }`.
- **400** — `{ error: 'invalid_path' | 'cadence_required' | 'cadence_invalid' }`.
- **401** — `{ error: 'unauthenticated' }`.
- **404** — `{ error: 'not_found' }` — card doesn't exist or RLS hides it.
- **409** — `{ error: 'invalid_state' }` — card not in `('decide', 'planned')`.
- **500** — `{ error: 'server_error' }`.

**Side effects**: `cards` row updated atomically via `commit_decide` RPC. No PostHog event server-side; `<ChoosePath />` fires `decide_path_chosen` from the client.

**`export const dynamic = 'force-dynamic'`**.

### `PATCH /api/cards/[id]/estimate`

**Request body**:

```ts
{
  path: 'diy' | 'contractor',
  estimate: <override-jsonb-shape> | null  // null = reset
}
```

**Response shapes**:

- **200** — `{ card_id: string, path: 'diy' | 'contractor', override_present: boolean }`.
- **400** — `{ error: 'invalid_path' | 'invalid_estimate_shape', field?: string, reason?: string }`.
- **401** — `{ error: 'unauthenticated' }`.
- **404** — `{ error: 'not_found' }`.
- **409** — `{ error: 'invalid_state' }` — card not in `('decide', 'planned', 'monitoring')`. (We allow override edits past commitment so the user can revise a contractor estimate after getting a real quote.)
- **500** — `{ error: 'server_error' }`.

**Side effects**: Direct UPDATE on `cards.cost_estimate_<path>_override` under the user's RLS context — no SECURITY DEFINER RPC. Body shape validated via `_lib/parse-estimate-override.ts` before write.

**`export const dynamic = 'force-dynamic'`**.

### Extended `confirm_assessment` tool (PR #26 surface)

Tool fields added to the existing schema (per D2):

```ts
{
  // ...existing fields from PR #26 (final_diagnosis, severity_confirmed,
  // system_tag, contractor_tag, monitoring_cadence_days_proposal,
  // confidence_note, sources)...

  diy_expansion: {
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
  },

  contractor_expansion: {
    contractor_type: contractor_tag_enum,
    cost_range_min: number,
    cost_range_max: number,
    questions_for_contractor: string[],
    red_flags: string[],
    good_completion: string
  }
}
```

`_lib/parse-qa-output.ts`'s `parseQaTurn` extended: the `confirm_assessment` branch now validates both new substructures via two new helpers `parseDiyExpansion()` + `parseContractorExpansion()`. Validation failure → ParseError → route returns 502 `triage_invalid_output` (same posture as PR #26).

`/api/triage/answer/route.ts` updated: when `parsed.tool = 'confirm_assessment'`, passes the two new fields to `confirm_triage` RPC as `p_diy_expansion` + `p_contractor_expansion` jsonb params.

## Offline behavior

This PR is online-only. No service-worker caching of estimates. The capture-flow spike-era offline contract (CAPTURE staying usable offline) does NOT extend to DECIDE — the user always has a recent network round-trip when they reach this state (it's right after the AI confirmation that requires a working API).

## Metrics

6 new PostHog events added to METRICS.md per D9:

| Event                    | Where fired                                                                 | Props                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `decide_view_opened`     | `<DecideView />` first render on the client (mount, guarded once-per-card)  | `{ card_id: string }`                                                                                                                       |
| `decide_path_expanded`   | `<PathCard />` expand click                                                 | `{ card_id: string, path: 'diy' \| 'contractor' }`                                                                                          |
| `decide_estimate_edited` | `<EstimateEditor />` on 200 from PATCH (non-null estimate)                  | `{ card_id: string, path: 'diy' \| 'contractor' }`                                                                                          |
| `decide_estimate_reset`  | `<EstimateEditor />` on 200 from PATCH with `estimate: null`                | `{ card_id: string, path: 'diy' \| 'contractor' }`                                                                                          |
| `decide_path_chosen`     | `<ChoosePath />` on 200 from POST                                           | `{ card_id: string, chosen_path: 'diy' \| 'contractor' \| 'monitor' \| 'dismiss', monitoring_cadence_days: number \| null }`                |
| `decide_path_changed`    | `<ChoosePath />` (or `<PlannedView />`'s Change link) on 200 from re-decide | `{ card_id: string, from_path: 'diy' \| 'contractor' \| 'monitor' \| 'dismiss', to_path: 'diy' \| 'contractor' \| 'monitor' \| 'dismiss' }` |

`decide_path_chosen` fires on every successful commit (including the first decide → planned hop). `decide_path_changed` fires only when the user re-opens via "Change decision" and commits a DIFFERENT path than the previous chosen_path. Client tracks the previous `chosen_path` via a hidden prop seeded by `<PlannedView />` on render. Both events safe to fire (same telemetry hop; downstream funnels distinguish).

No new Sentry call sites in this PR (route handlers reuse PR #19's posture — Sentry capture on 500-class server errors only; 4xx are user error not Sentry-worthy).

## Files to create/modify

**Create**:

- `supabase/migrations/<ts>_011_decide_state.sql` — D1, D11.
- `apps/web/app/api/cards/[id]/decide/route.ts` + paired test.
- `apps/web/app/api/cards/[id]/decide/_lib/parse-decide-body.ts` + paired test (`_lib/` is App Router excluded from routing).
- `apps/web/app/api/cards/[id]/estimate/route.ts` + paired test.
- `apps/web/app/api/cards/[id]/estimate/_lib/parse-estimate-override.ts` + paired test — shared shape validator for both override columns.
- `apps/web/app/(app)/cards/[id]/_components/DecideView.tsx` + test.
- `apps/web/app/(app)/cards/[id]/_components/PathCard.tsx` + test.
- `apps/web/app/(app)/cards/[id]/_components/EstimateEditor.tsx` + test.
- `apps/web/app/(app)/cards/[id]/_components/ChoosePath.tsx` + test.
- `apps/web/app/(app)/cards/[id]/_components/MonitorCadencePicker.tsx` + test.
- `apps/web/app/(app)/cards/[id]/_components/PlannedView.tsx` + test.
- `apps/web/e2e/decide-state.spec.ts`.

**Modify**:

- `apps/web/app/api/triage/_lib/parse-qa-output.ts` — extend `ConfirmAssessment` validator with `diy_expansion` + `contractor_expansion` parsers. Add 2 new helper fns + ~25 new test cases in `parse-qa-output.test.ts`.
- `apps/web/app/api/triage/_lib/anthropic-qa.ts` — extend `confirm_assessment` tool schema with the new fields. Update tests.
- `apps/web/app/api/triage/_lib/prompt-qa.ts` — extend `DEFAULT_QA_SYSTEM_PROMPT` to instruct the model on the expansion fields. Keep ≤ 3500 chars (Vercel env-var cap, `PROMPT_MAX_CHARS` constant). Update tests.
- `apps/web/app/api/triage/answer/route.ts` — when `parsed.tool='confirm_assessment'`, pass `parsed.value.diy_expansion` + `parsed.value.contractor_expansion` to `confirm_triage` RPC. Update tests.
- `apps/web/app/(app)/cards/[id]/page.tsx` — body extension for `decide` + `planned` states; extend `CardState` type, `CardRow` type. Update test.
- `packages/core/src/supabase.types.ts` — regen via `pnpm db:gen-types` after migration apply.
- `CLAUDE.md § Where Things Happen` — new rows for migration 011, the two new routes, the five new components, the extended `_lib/*-qa.ts` helpers. § Gotchas — new entry for the rename-recreate ordering trap that catches anyone modifying card_state in this codebase a third time, and the override-NULL-semantics entry.
- `METRICS.md` — 6 new event rows.
- `apps/web/.env.example` — no new env vars added; document section unchanged. (Confirmed via re-read of D-list — `TRIAGE_QA_SYSTEM_PROMPT` already documented from PR #26.)
- `PLAN.md` — flip row #1 (`decide-state`) from Planned → Active.

## Tests

| Task | Unit tests                                                                                                                                                                                                                                                                                                                            | Integration / route tests                                                                                                                                                                                                                | E2E coverage                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| T1   | n/a (migration)                                                                                                                                                                                                                                                                                                                       | n/a                                                                                                                                                                                                                                      | Verified via E2E + rollback round-trip CI                                                                |
| T2   | `parse-qa-output.test.ts` — 25+ new cases covering valid diy/contractor expansions, each field's enum/range/length violation, missing-field paths                                                                                                                                                                                     | n/a                                                                                                                                                                                                                                      | Indirect via T5 + E2E                                                                                    |
| T3   | `anthropic-qa.test.ts` — confirm_assessment tool schema includes new fields; mock-server fixture round-trip                                                                                                                                                                                                                           | n/a                                                                                                                                                                                                                                      | Indirect via E2E                                                                                         |
| T4   | `prompt-qa.test.ts` — DEFAULT_QA_SYSTEM_PROMPT references expansion fields; PROMPT_MAX_CHARS still passes ≤ 3500                                                                                                                                                                                                                      | n/a                                                                                                                                                                                                                                      | Indirect via E2E                                                                                         |
| T5   | n/a (route extension)                                                                                                                                                                                                                                                                                                                 | `apps/web/app/api/triage/answer/route.test.ts` — extend confirm_assessment path: new mock returns expansion fields → assert RPC called with `p_diy_expansion` + `p_contractor_expansion`. ~6 new cases.                                  | E2E asserts cost_estimate_diy + cost_estimate_hire columns populated after confirm                       |
| T6   | `parse-decide-body.test.ts` — 12+ cases (valid each path, missing path, invalid path, monitor-without-cadence, negative cadence, extra fields tolerated)                                                                                                                                                                              | `decide/route.test.ts` — 12+ cases: 200 each path; 400 invalid path; 400 monitor-no-cadence; 401 anon; 404 not-found; 409 wrong-state (capturing/triaging/diagnosed/monitoring/closed/dismissed); 200 planned→decide re-open             | E2E exercises the full happy path                                                                        |
| T7   | `parse-estimate-override.test.ts` — 30+ cases: valid full DIY shape, valid full contractor shape, each field's violation, null-reset shape, extra fields tolerated forward-compat                                                                                                                                                     | `estimate/route.test.ts` — 10+ cases: 200 DIY override; 200 contractor override; 200 reset (null); 400 invalid shape; 401 anon; 404; 409 wrong-state (capturing/triaging/diagnosed); 200 override at monitoring (allowed); RLS isolation | E2E covers edit + reset                                                                                  |
| T8   | `PathCard.test.tsx` — 8+ cases: collapsed render DIY/contractor; expanded render DIY (all sections present); expanded render contractor; "edited" badge when override present; empty materials list; long names ellipsize; no estimate (null jsonb) → "Estimate unavailable" placeholder                                              | n/a                                                                                                                                                                                                                                      | E2E exercises expand + collapse                                                                          |
| T9   | `EstimateEditor.test.tsx` — 10+ cases: initial values from override; initial values from app estimate when override null; field-by-field edit; save fires PATCH; reset fires PATCH null; 400 surfaces inline error; 500 retryable banner; cancel reverts to view mode                                                                 | n/a                                                                                                                                                                                                                                      | E2E covers edit DIY estimate                                                                             |
| T10  | `ChoosePath.test.tsx` — 9+ cases: all four buttons render at state=decide; greyed at state=planned with "✓ Chosen" tag on chosen path; click DIY → POST; click contractor → POST; click monitor → mounts cadence picker (not POST yet); click dismiss → POST; 409 retry banner; PostHog event fires; from_path → to_path on re-decide | n/a                                                                                                                                                                                                                                      | E2E covers Choose DIY, Choose Contractor, Set to Monitor (with cadence picker), Dismiss, Change decision |
| T11  | `MonitorCadencePicker.test.tsx` — 6+ cases: initial value from AI-proposed cadence; min/max bounds clamp; confirm fires POST with cadence; cancel hides; 400 cadence_invalid surfaces inline                                                                                                                                          | n/a                                                                                                                                                                                                                                      | Indirect via T10 E2E                                                                                     |
| T12  | `DecideView.test.tsx` — 6+ cases: renders severity chip; renders both PathCards; renders ChoosePath; renders "How we diagnosed this" collapsible (closed by default); empty diagnosis → graceful "Diagnosis pending" string; missing diy_expansion → PathCard shows "Estimate unavailable"                                            | n/a                                                                                                                                                                                                                                      | E2E covers full DecideView render                                                                        |
| T13  | `PlannedView.test.tsx` — 5+ cases: DIY chosen renders materials/tools/steps; Contractor chosen renders contractor_type + questions; "Change decision" link present; greyed ChoosePath rendered below with ✓ Chosen tag; null chosen_path → invariant violation Sentry breadcrumb + fallback "Decision pending"                        | n/a                                                                                                                                                                                                                                      | E2E covers the post-commit PlannedView                                                                   |
| T14  | `cards/[id]/page.test.tsx` — extend with 4 new cases: state='decide' renders DecideView; state='planned' renders PlannedView; CardRow type widened to include chosen_path + override columns; layout race defense from PR #22 still applies                                                                                           | n/a                                                                                                                                                                                                                                      | Indirect via E2E                                                                                         |
| T15  | n/a (E2E)                                                                                                                                                                                                                                                                                                                             | n/a                                                                                                                                                                                                                                      | `apps/web/e2e/decide-state.spec.ts` — 5 cases per § E2E below                                            |
| T16  | n/a (docs)                                                                                                                                                                                                                                                                                                                            | n/a                                                                                                                                                                                                                                      | n/a                                                                                                      |

### E2E spec (`apps/web/e2e/decide-state.spec.ts`) — 5 cases

All cases skip gracefully on non-local Supabase via `test.skip(!isLocalSupabase, …)` (matches PR #15 / #18 / #19 / #26 posture; CI slow-job is the canonical enforcement surface).

1. **Happy path (DIY)**: Seed a confirmed card via admin client (state='decide', cost_estimate_diy + cost_estimate_hire populated). Sign in as the owner, navigate to `/cards/<id>`. Assert DecideView renders, both PathCards collapsed. Expand DIY → assert materials/tools/steps visible. Click "Choose DIY". Assert POST 200, page refreshes to PlannedView, "You chose: DIY" banner visible, materials/steps visible. Click "Change decision" → assert back to DecideView. **Assert PostHog events** (via posthog-js mock instrumented in the spec): `decide_view_opened`, `decide_path_expanded`, `decide_path_chosen`, `decide_path_changed`.
2. **Edit + reset estimate**: Seed a decide-state card. Expand DIY, click "Edit estimate", change `total_max` to a different number, save. Assert "edited" badge appears, override column non-null. Click "Reset to app estimate" → assert badge disappears, override column null. **Assert events**: `decide_estimate_edited`, `decide_estimate_reset`.
3. **Set to Monitor + cadence picker**: Seed a decide-state card with `monitoring_cadence_days=30` (AI-proposed). Click "Set to Monitor" → assert cadence picker appears at value=30. Adjust to 60, confirm. Assert POST 200 with cadence=60. Assert card.state='monitoring', card.monitoring_cadence_days=60. **Assert event**: `decide_path_chosen` with `chosen_path='monitor'`.
4. **Dismiss**: Seed a decide-state card. Click "Dismiss" → assert POST 200. Assert card.state='dismissed', chosen_path=null. The user lands on PlannedView's planned-row equivalent? — actually `state='dismissed'` falls through to the existing dismissed render in cards/[id]/page.tsx. Assert that surface is shown.
5. **Concurrent commit (409)**: Seed a decide-state card. Open in two contexts (admin manipulates state directly to mimic). Click "Choose DIY" in one; before the response lands, mutate state to 'closed' via admin client. Assert response is 409 `invalid_state`, banner appears, eventual `router.refresh()` reflects the closed state.

## Dependencies

- **Hard depends on PR #26 merged** — extends its `confirm_assessment` tool, builds on `severity_confirmed` column, re-uses `<ConversationRow />`. PR #26 is merged into main as commit `d5dc2e3`.
- **Soft-precedes PR #2 (`planned-state`)** — adds the minimal stub; PR #2 expands.
- **Soft-precedes PR #4 (`monitor-beta`)** — adds `state='monitoring'` transition; PR #4 builds the check-in loop.
- **Soft-precedes PR #7 (`contractor-question-retrieval`)** — populates `questions_for_contractor[]` on each card; PR #7 reads across cards for the retrieval surface.
- **Soft-precedes PR #8 (`usage-counters-and-byok`)** — defines the manual-path UI gap; PR #8 fills it.
- **No conflict with the dependabot PRs** open against main (npm minor bumps + Vercel CLI v54).
- **Anthropic SDK** stays at `@anthropic-ai/sdk@^0.96.0` (PR #19 pin). No SDK version bump in this PR.

## Task order

(/ak-implement reads this list verbatim. Each task is dependency-ordered; ⟶ marks the critical chain.)

1. **T1: Migration 011 + types regen.** ⟶ Foundation for everything. Write the migration per § Data model changes, apply locally via `pnpm db:reset`, regenerate types via `pnpm db:gen-types`. Verify rollback round-trips via `scripts/ci-rollback-explain.sh` if available locally. Commit: `feat(decide-state): migration 011 — card_state{decide,planned} + commit_decide RPC + confirm_triage expansion fields`.
2. **T2: Extend `_lib/parse-qa-output.ts`.** ⟶ Adds the validators. Two new helpers (`parseDiyExpansion`, `parseContractorExpansion`); extends `parseConfirmAssessment` to call them. ~25 new test cases mirror the locked-shape envelope.
3. **T3: Extend `_lib/anthropic-qa.ts`.** ⟶ Adds the tool fields. Re-uses existing `confirm_assessment` shape; appends `diy_expansion` + `contractor_expansion` substructures with their `input_schema` declarations. Test update verifies the tool schema includes the new fields.
4. **T4: Extend `_lib/prompt-qa.ts`.** ⟶ Instructs the model. Append a paragraph to `DEFAULT_QA_SYSTEM_PROMPT` describing the expansion fields. PROMPT_MAX_CHARS stays ≤ 3500. Length-assertion test still passes.
5. **T5: Wire `/api/triage/answer` to confirm_triage's new params.** ⟶ Forward the new fields from the parsed tool call. Route test extended for the new path.
6. **T6: `POST /api/cards/[id]/decide` route + helpers + tests.** Depends on T1 (RPC exists). `_lib/parse-decide-body.ts` validates the body shape. Route test covers all 6 envelopes.
7. **T7: `PATCH /api/cards/[id]/estimate` route + helpers + tests.** Depends on T1 (override columns exist) and re-uses the locked-shape validators from T2 (via a shared `_lib/parse-estimate-override.ts` that re-exports the helpers from `_lib/parse-qa-output.ts`).
8. **T8: `<PathCard />` server component + test.** Depends on T1 (override columns exist). Pure data-rendering; reads override-or-app per the spec convention.
9. **T9: `<EstimateEditor />` client component + test.** Depends on T7 (PATCH route) + T8 (mounts inside PathCard). Inline edit form with per-field controls.
10. **T10: `<ChoosePath />` client component + test.** Depends on T6 (POST route). Four-button row + greyed-state handling for planned.
11. **T11: `<MonitorCadencePicker />` client component + test.** Depends on T6 (POST route). Inline cadence stepper.
12. **T12: `<DecideView />` server component + test.** Depends on T8, T9, T10, T11. Composes the decide-state body.
13. **T13: `<PlannedView />` server component + test.** Depends on T8 (re-uses PathCard for chosen-path detail) + T6 (Change-decision link calls POST).
14. **T14: `cards/[id]/page.tsx` body extension.** Depends on T12, T13. Adds the two new state cases; widens CardState + CardRow types.
15. **T15: `apps/web/e2e/decide-state.spec.ts`.** Depends on T6, T7, T10, T12, T13, T14. The 5-case Playwright spec per § Tests.
16. **T16: Docs.** CLAUDE.md path-map + Gotchas, METRICS.md events, tasks.md bookkeeping. Final commit.

## Gotchas

These are the load-bearing traps for this PR. They get folded into CLAUDE.md § Gotchas as part of T16 (the ones not already documented).

1. **Rename-recreate of `card_state` for the third time — the recipe is in 006a, follow it byte-for-byte.** Three enum changes have hit this column now (006a `dismissed`, 010 backfill via 006a recipe, 011 `decide`+`planned`). Every `ALTER COLUMN state TYPE` step needs the explicit `using state::text::public.card_state` cast OR Postgres errors with "cannot cast type card_state to card_state" because the rename moved the source type to a new name but the target name now points at a fresh empty enum. The 006a migration is the canonical reference; copy its statement order verbatim and only swap the enum values list.

2. **`scripts/ci-rollback-explain.sh` cascade trap** (PR #26 § Gotcha — codified the hard way). After rollback runs, dependent functions get cascaded away. Migration 011's rollback must DROP FUNCTION commit_decide AND the new confirm_triage signature first, BEFORE the rename-recreate-back-down step. Drop-then-cast-back order is non-optional. Verify locally before pushing.

3. **PR #24 column-qualification lesson** — every column reference in WHERE/SET/RETURNING inside the new `commit_decide` RPC must be `public.cards.<col>`. plpgsql's default `#variable_conflict` is `error` and an unqualified `state` collides with the OUT-parameter shape. Migration 010 applied this preemptively; 011 follows.

4. **The `confirm_triage` RPC SIGNATURE CHANGES in this PR.** Adding two jsonb params changes the function signature, so Postgres needs an explicit DROP before the CREATE OR REPLACE — otherwise re-apply on a non-fresh database errors with "function ... already exists with different argument names". Pattern: `DROP FUNCTION IF EXISTS public.confirm_triage(uuid, uuid, text, public.severity, public.system_tag, public.contractor_tag, int, jsonb, int, boolean, text);` matching the old PR #26 signature, then create the new one with the two extra params. The application route's call shape MUST update in the same PR commit as the migration — otherwise local apply succeeds, deploy succeeds (migration migrates first per the CI workflow), and the live `/api/triage/answer` 500s on the next confirm because it's still calling the old shape.

5. **`commit_decide`'s `p_path='decide'` re-open semantics.** When the user taps "Change decision" from PlannedView, the route calls `commit_decide(..., p_path='decide')` which flips state back to `'decide'` AND nulls `chosen_path`. The predicate-guard allows the planned→decide transition because `state IN ('decide', 'planned')` covers it. Do NOT add a separate `re_open_decide` RPC — one path, one function. The handler at `/decide/route.ts` doesn't need a special branch for `path='decide'` either; just forward to the RPC.

6. **Override columns vs app-estimate columns — never merge.** `cost_estimate_diy` (app) is replaced wholesale by `confirm_triage`. `cost_estimate_diy_override` (user) is only written by `/estimate` PATCH. They never get blended client-side or server-side; the UI picks one or the other (`override ?? app_estimate`). Future MONITOR re-triages overwrite the app estimate; the override survives. Test invariant in `EstimateEditor.test.tsx`: editing the override does NOT touch `cost_estimate_diy`.

7. **`cost_estimate_hire.contractor_type` vs `cards.contractor_tag`** — they're related but distinct. `cards.contractor_tag` is the high-level routing tag set by `confirm_triage`; `cost_estimate_hire.contractor_type` is the granular type the AI recommends for THIS specific job. They CAN differ (e.g., a hot-water-tank issue might tag `plumber` at the card level but recommend `plumber-specialist` in the hire expansion). Validator accepts any `contractor_tag` enum value in `contractor_type`. Don't enforce equality.

8. **Locked-jsonb-shape validation lives in TWO places (DRY-tension by design).** The same shape validates (a) at LLM-output time in `_lib/parse-qa-output.ts` (confirm_assessment branch) AND (b) at user-input time in `_lib/parse-estimate-override.ts` (PATCH /estimate). The DRY solution is to factor the per-field validators into a shared module (`_lib/estimate-shapes.ts`) that both call. Don't duplicate the validation logic — a shape drift in one place silently allows the other to accept rejected shapes. T2 + T7 both wire to this shared module.

9. **`<MonitorCadencePicker />` shows the AI cadence even when the override column has its own cadence — there isn't one.** Cadence is only stored on `cards.monitoring_cadence_days` (the AI's value, optionally overridden by the user via the picker at commit time). There is no `monitoring_cadence_days_override` column. The picker reads `cards.monitoring_cadence_days` (AI-proposed initially) and writes back the same column on commit. Future MONITOR PR #4 may revisit, but until then a single column suffices.

10. **`<ChoosePath />` re-render trap on planned state.** When the user is on PlannedView and clicks "Change decision", the route returns `state='decide', chosen_path=null`, then `router.refresh()` re-renders cards/[id]. ChoosePath now sees `state='decide'` and shows the four ungreyed buttons. The "previous chosen_path" needed for `decide_path_changed` event firing must be captured BEFORE the refresh — pass it down from PlannedView as a `prevChosenPath` prop, store in client state, and reference at commit time. Otherwise the event fires with `from_path === to_path` because the refreshed state already cleared the previous path. PostHog event firing in ChoosePath has a one-render-cycle window.

11. **Sourcing path-map updates.** CLAUDE.md § Where Things Happen has a freshness hook (`check-docs-freshness-project.sh`) that blocks PRs which add a triggering surface without updating the section. The two new routes and the five new components all trigger it. T16 must update CLAUDE.md in the same PR. The hook checks per-commit, so as long as T16's commit touches CLAUDE.md, the hook is satisfied.

## Acceptance criteria

- Local `pnpm db:reset` applies migration 011 cleanly on a fresh database (no errors, no warnings).
- `scripts/ci-rollback-explain.sh` (or the CI rollback round-trip job, whichever fires) round-trips migration 011 without leaving stray functions/types.
- A new capture → triage → confirm flow lands cards at `state='decide'` with both `cost_estimate_diy` + `cost_estimate_hire` jsonb populated (verified via DB inspection in E2E).
- `/cards/<id>` for a `decide`-state card renders DecideView with two PathCards + ChoosePath. Both cards expand. DIY edit + reset round-trips. Contractor edit + reset round-trips.
- "Choose DIY" commits transitions card to `planned, chosen_path='diy'`. PlannedView renders with the chosen-path detail. "Change decision" link re-opens DecideView (state back to `decide`, chosen_path null).
- "Set to Monitor" mounts cadence picker, confirms transition to `monitoring` with the picked cadence.
- "Dismiss" transitions card to `dismissed`.
- All 6 PostHog events fire with the documented prop shapes (verified via E2E `posthog-js` instrumentation).
- Existing `/api/triage/answer` E2E still passes (confirm path now writes expanded estimates + transitions to `decide`).
- `pnpm turbo run lint typecheck test:unit build` passes locally.
- CI fast-job + slow-job green; Vercel preview deploys and the decide screen is reachable end-to-end on the preview.

## Rollout / rollback

**Rollout** (post-merge to main):

1. `.github/workflows/deploy-migrations.yml` auto-applies migration 011 on push to main.
2. Vercel auto-deploys the web app with the new routes + components.
3. Any in-flight `diagnosed + severity_confirmed=true` rows (none expected in production but defended via § Data model changes step 3 backfill UPDATE) are lifted to `state='decide'`.
4. Production smoke: navigate to an existing confirmed-state card, verify DecideView renders. Walk through a happy-path Choose DIY commit.

**Rollback** (if the new routes/components fail in production):

1. Revert the merge commit on main. Vercel re-deploys the previous bundle.
2. Migration 011 stays applied (rolling back the SCHEMA would lose data: `chosen_path`, override columns, lifted-to-decide rows). Forward-fix the route / component bugs; do not roll back the schema. Migration rollback is recoverable in the explicit recipe within the .sql file, but is reserved for a true schema crisis.
3. The old code path (PR #26) reads `state='decide'` as "unknown card_state" — TypeScript inference will see it as a widened string; runtime renderer falls to the `default` branch which displays the dismissed-like stub. Not ideal but recoverable; the rollback window should be minutes.

**Forward-only follow-ups deferred to PR #2/#4/#7/#8** as noted in § Dependencies.
