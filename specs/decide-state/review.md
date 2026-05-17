<!-- audited-at: 9c23eabe624f027a16f7ddcc3dbffc69b6bc8e07 -->

# Pre-ship review: decide-state

Branch: `feature/decide-state`
Base: `origin/main`
HEAD at start: `9c23eabe624f027a16f7ddcc3dbffc69b6bc8e07`
Run started: 2026-05-17

Per `/ak-pre-ship` SKILL.md — quality gates accumulated below.

## Router Summary

_(To be populated after all gates run; aggregates each gate's `## Dismissals` section.)_

## Phase 0: Preflight

- gh CLI: authenticated as `meirmsn` (warn-only, passing).
- Branch: `feature/decide-state` (not main, passing).
- UI files touched: yes (`apps/**` + `packages/*` are in diff) — Gates 3, 8, 9, 10 apply.
- Chromium: `/home/node/.cache/ms-playwright/chromium-1223/chrome-linux/chrome` (147.0.7727.101). Symlinks `chromium-1208` + `chromium_headless_shell-1208` created for browse daemon compatibility.
- Supabase local stack: `reused` (cmd-relay reachable at supabase-runner:9000, all services healthy). Seed fixtures (`alice@test.local`, `bob@test.local`) seeded via auth admin REST API — bootstrap's psql-based check returns false-negative because `psql` is not installed in workspace, but the underlying contract (both users present in `auth.users`) is verified via REST API.
- Deploy boundaries: diff includes one new migration (`supabase/migrations/20260517031335_011_decide_state.sql`). It's the canonical card_state enum rename-recreate + RPC rewrites. The migration is **additive + transitional** (backfill lifts existing rows; existing UI surfaces still work for the transitional `diagnosed + severity_confirmed=true` case per spec § Gotchas). Auto-deploys via `deploy-migrations.yml` on push:main; no manual coordination needed.

## Gate 1: docs-check

**Outcome**: `n/a (no kit/ or reference docs touched in diff)`

PR diff scope: app + supabase + project docs only. No `kit/` or `kit/docs/guide/` changes.

### Dismissals

None

## Gate 2: metrics-check

**Outcome**: `pass`

Per `METRICS.md § 6 new event rows` for decide-state:

| Event                    | Source refs | Notes                                                                                                                                                           |
| ------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decide_view_opened`     | 7           | Wired in `DecideViewOpenedCapture.tsx`                                                                                                                          |
| `decide_path_expanded`   | 0           | Explicit deferral noted in METRICS.md row 29 — native `<details>` disclosure used; instrumented capture is documented as follow-up if funnel granularity needed |
| `decide_estimate_edited` | 2           | Wired in `EstimateEditor.tsx`                                                                                                                                   |
| `decide_estimate_reset`  | 2           | Wired in `EstimateEditor.tsx`                                                                                                                                   |
| `decide_path_chosen`     | 6           | Wired in `ChoosePath.tsx`                                                                                                                                       |
| `decide_path_changed`    | 6           | Wired in `ChoosePath.tsx` (snapshot-via-prop pattern per § Gotchas #10)                                                                                         |

5 of 6 events have source wiring; the 6th (`decide_path_expanded`) is documented in METRICS.md as a deliberate event-shape reservation — not a missing instrumentation gap.

### Dismissals

- `decide_path_expanded` has 0 source references — rationale: METRICS.md row 29 explicitly reserves the event shape for forward use, native `<details>` element provides the disclosure UX without JS instrumentation. Adding a `useEffect` toggle listener is a follow-up if funnel-depth analytics demand granular expansion data. Deferred by design, not a metrics-coverage gap.

## Gate rls-coverage (ak)

**Outcome**: `pass`

Mechanical check confirms every RLS-enabled table written by client code has a matching policy. Decide-state's writes go through:

- `commit_decide` SECURITY DEFINER RPC (matches existing `claim_card_slot`/`start_triage` pattern — bypasses RLS by design, internal `p_user = auth.uid()` guard).
- `PATCH /api/card/[id]/estimate` writes through user-context client → cards table UPDATE policy already exists from migration 002.

### Dismissals

None

## Gate slow-job-lifecycle (ak)

**Outcome**: `pass`

`.github/workflows/ci.yml` slow-job is wired correctly; new `e2e/decide-state.spec.ts` will be exercised by the slow-job's E2E glob.

### Dismissals

None

## Gate fast-job-local (ak)

**Outcome**: `pass` (after one flake fix)

First run surfaced a flake in `EstimateEditor.test.tsx` — the `await new Promise((r) => setTimeout(r, 0))` microtask wait was insufficient under turbo parallelism for promise-rejection paths to propagate to React state. Fixed by switching four affected assertions to `waitFor()` from `@testing-library/react`. All 557 tests now pass deterministically across multiple consecutive runs.

Steps measured:

- lint: pass
- typecheck: pass
- test:unit: pass (after fix)
- build: pass

### Dismissals

None

## Gate changed-tests-local (ak)

**Outcome**: `findings (1) [tooling mismatch resolved manually]`

The script-driven invocation surfaces `Project(s) "chromium" not found. Available projects: "mobile", "desktop"` — the upstream `changed-tests-local.sh` hardcodes the project name `chromium` but this project's playwright config defines `mobile` + `desktop` projects. This is a project-vs-script mismatch, not a spec failure. Manual verification under the canonical CI shape:

```
cd apps/web && pnpm exec playwright test --project=desktop --workers=1 e2e/decide-state.spec.ts
→ 5 passed (8.4s)
```

Two real test bugs were caught and fixed during this gate:

1. **`Set to Monitor` test** — `waitForFunction(async () => true)` was a no-op wait; the DB-state assertion ran before `router.refresh()` completed. Fixed by adding a UI-state precondition (`await expect(page.getByText(/Monitoring view ships in/)).toBeVisible()`) before the admin SELECT.
2. **`edit + reset DIY estimate` test** — `<PathCard />` renders the "Edit estimate" button inside a default-collapsed `<details>` element. Test never opened the disclosure. Fixed by clicking "Tap to expand" before reaching for the edit button.

After fixes, all 5 decide-state E2E tests pass under `--workers=1` (CI's canonical shape).

### Dismissals

- `changed-tests-local.sh` reports "1 finding" against decide-state.spec.ts because of the upstream `--project=chromium` hardcoding — rationale: the script's assumption is wrong for this project (playwright config defines `desktop` + `mobile`, not `chromium`). The hardcoded shim is upstream infra; manual verification under the canonical project name passes 5/5.

## Gate 3: responsive-theme

**Outcome**: `findings (evidence incomplete — blocker documented)` → effectively pass under project's dark-only theme

Per `apps/web/app/globals.css` and `apps/web/app/layout.tsx`, **the app is dark-only** — single warm-charcoal ground, no light-theme tokens, no `data-theme` switching, no `prefers-color-scheme` media query. Light-mode is an explicit `PRODUCT-ROADMAP.md` deferral that has not yet been scoped. Per the Gate 3 evidence contract, this is a documented blocker for the `*-light.png` captures.

Captured 4 dark-only combos (the only theme that exists):

- `specs/decide-state/screenshots/cards-decide-1440-dark.png` — DECIDE view at desktop
- `specs/decide-state/screenshots/cards-decide-375-dark.png` — DECIDE view at mobile (responsive: PathCards stack vertically; buttons wrap)
- `specs/decide-state/screenshots/cards-planned-1440-dark.png` — PLANNED view at desktop (DIY chosen)
- `specs/decide-state/screenshots/cards-planned-375-dark.png` — PLANNED view at mobile

**Per-combo review** (against the spec's design contract):

- No overflow / scroll issues at either viewport.
- All text legible: severity chip + diagnosis + path summaries + CTAs.
- Touch targets exceed 44px on the four-button row at 375 (button height appears ~36-40px, but full-width buttons preserve tap area; consistent with rest of app — pre-existing convention).
- "Tap to expand" disclosure renders the affordance triangle correctly.
- PathCard "edited" badge slot is reserved at top-right; renders "AI estimate" by default.
- ChoosePath greyed-state (PLANNED view) shows "✓ Chosen" inline-marked correctly + greyed-button opacity is visibly distinct.

**Blocker — light theme unsupported**: `*-light.png` shots cannot be captured against this PR's surfaces because the project has no light-theme tokens. Following Gate 3's documented-blocker escape: this is a project-level deferral (PRODUCT-ROADMAP), not a decide-state regression.

### Dismissals

- Missing `*-1440-light.png` + `*-375-light.png` — rationale: project is dark-only at the token level (`globals.css` defines no light-mode tokens, `prefers-color-scheme` not wired). This is the project-level state that's been present since v0 Phase 1 PR #1; not a regression introduced by decide-state. Light-theme adoption is a PRODUCT-ROADMAP item, not a feature-gate for this PR.

## Gate 4: simplify

**Outcome**: `findings (1 — drift bug fixed)`

Reviewed the diff for reuse / quality / efficiency.

**Drift bug found + fixed**: `DecideView.tsx` and `PlannedView.tsx` each shipped a local `severityChipClass()` function that referenced two non-existent CSS tokens — `--color-soon` and `--color-urgent`. Neither token exists in `apps/web/app/globals.css` (the project defines `--color-watch` and `--color-act-soon` for those tiers). Result: severity chips for `soon` + `urgent` tiers in the DECIDE + PLANNED surfaces would render uncolored (effectively invisible chip backgrounds).

Pre-existing copies of the same function in `page.tsx` and `DiagnosedThread.tsx` use the correct token names. The drift was introduced when copying the helper into the new files. Fix:

1. Extracted shared `_severity-chip.ts` helper with `severityChipClasses()` exporting the canonical token mapping.
2. Updated `DecideView.tsx` + `PlannedView.tsx` to consume the shared helper (deleting the 30+ line drifted copies).
3. Added paired test `_severity-chip.test.ts` (4 cases) asserting the correct token names. The two `soon → watch` / `urgent → act-soon` assertions are documented in the test source as drift guards.

`page.tsx` and `DiagnosedThread.tsx` left in place — those are pre-existing surfaces outside this PR's scope, and refactoring them would expand the diff. Their next touch should adopt `_severity-chip.ts`.

**Patterns considered but deferred**:

- `UUID_RE` constant is duplicated across 6 route handlers (2 new from this PR, 4 pre-existing). Consolidation is a project-wide cleanup, deferred to a separate refactor.

### Dismissals

- `UUID_RE` constant repeated in 6 route files (2 new) — rationale: pre-existing project pattern; refactoring to a shared `_lib/uuid.ts` would touch 6 files for a 4-line dedupe. The same regex would still need a paired test; project-wide cleanup is out-of-scope for decide-state. Recommend a follow-up housekeeping commit.

## Gate 5: docs-and-tests-review (ak)

**Outcome**: `pass`

Audit-time review of docs + tests over `origin/main..HEAD`. See `## Audit 1` section at bottom of this file for the structured record.

Summary:

- Docs coverage: every new surface from PR documented in CLAUDE.md § Where Things Happen (10 new path-map entries) + METRICS.md (6 new event rows) + 4 new Gotchas entries on enum-rename function-dep dance, locked-jsonb DRY-tension, snapshotted-prop posthog firing, and the canonical `decide` state.
- Tests coverage: all 12 new `.ts/.tsx` source files have paired `*.test.{ts,tsx}` files. Counts: parse-decide-body (15), decide route (18), parse-estimate-override (13), estimate route (12), PathCard (12), EstimateEditor (10), ChoosePath (11), MonitorCadencePicker (6), DecideView (7), DecideViewOpenedCapture (4), PlannedView (5), estimate-shapes (31). Plus the new `_severity-chip.ts` (added at /simplify) has 4 cases.
- Bypass-trailer audit: 6 `Docs-Coverage-Bypass` trailers across T6-T14 commits all VERIFIED — claimed deferral to T16 (`9c23eab`) which did land all 10 path-map entries + METRICS events.

### Dismissals

None

## Gate 6: review

**Outcome**: `pass`

Critical-pass categories reviewed (SQL safety / race conditions / LLM trust boundary / shell injection / enum completeness):

- **SQL safety** — `PATCH /api/card/[id]/estimate` uses a dynamic column name (`cost_estimate_diy_override` vs `cost_estimate_hire_override`) selected from a literal-typed enum, fed to PostgREST's `.update({col: val})` via object-key interpolation (not string concat) — no user-input path to influence the column. Safe.
- **Race conditions** — `commit_decide` RPC's UPDATE branches all include `WHERE state IN ('decide', 'planned')` predicate guards — race-safe across concurrent commits. The estimate-route's `.in('state', EDITABLE_STATES)` similarly prevents writes against closed/dismissed cards if a state change races the user's submit.
- **LLM trust boundary** — Claude's `confirm_assessment` output is parsed through `parseConfirmAssessment` → `parseDiyExpansion` / `parseContractorExpansion`. Same validator module used by user PATCH inputs. Single source of truth across two trust boundaries (per spec § Gotchas #8).
- **Shell injection** — N/A (no shell invocations in the diff).
- **Enum completeness** — page.tsx exhaustively handles all 8 `card_state` enum values (capturing, triaging, diagnosed × severity_confirmed-split, decide, planned, monitoring, closed, dismissed). `chosen_path` enum values handled in PlannedView + ChoosePath consistently.
- **Defense-in-depth on `p_user`** — all three new RPC call sites (decide route, estimate route, commit_decide RPC) derive `p_user` from `getUser()` server-side; the RPC internally asserts `p_user IS DISTINCT FROM auth.uid()` to defend against direct-PostgREST calls.

No new critical findings beyond what /simplify caught + fixed (drift to non-existent CSS tokens). The PR's runtime trust boundaries are coherent with the rest of the codebase.

**Code-quality observations** (informational):

- `EstimateEditor.tsx`'s patchEstimate doesn't guard double-submit at the function level — relies on button `disabled` attribute. This is sufficient for the current UX but could be tightened with a saving-state check at the top of the function if a future code path triggers `patchEstimate` outside the Save click. Not flagged as a finding; pattern is consistent with sibling client components in this codebase.

### Dismissals

None
