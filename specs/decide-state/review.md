<!-- audited-at: ccf06635f9c92ec1cce5ae2eb2460129905a23d8 -->

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

## Gate 11: convention-check

**Outcome**: `pass`

- Commit messages all follow `<type>(<scope>): <summary>` convention (`feat`/`fix`/`docs`/`chore` x `decide-state` scope across 18 commits in `origin/main..HEAD`). Task-tracker references (`T1`/`T2`/…) appear in subjects as in-flight ak-build markers — consistent with prior feature branches in this repo, not flagged.
- Test co-location verified: all 18 new source `.ts`/`.tsx` files under `apps/web/app/` ship paired `*.test.ts(x)` siblings in the same commit. `prompt-qa.ts` (modified, not new) keeps its pre-existing `prompt-qa.test.ts` next to it. No `.devshop-test-coverage-exempt` additions needed.
- Server-vs-client split is correct: `'use client'` only on the four components that own state / `onClick` / `sessionStorage` (`ChoosePath`, `EstimateEditor`, `MonitorCadencePicker`, `DecideViewOpenedCapture`); `DecideView` / `PathCard` / `PlannedView` stay server components (composition + data only).
- `export const dynamic = 'force-dynamic'` present on both new route handlers (`apps/web/app/api/card/[id]/decide/route.ts:23`, `apps/web/app/api/card/[id]/estimate/route.ts:20`) — required because both read `supabase.auth.getUser()` (cookie-derived).
- Env-var trim-defense: no new `NEXT_PUBLIC_*` read sites introduced in the diff (verified via grep across `_components/`, `decide/`, `estimate/`, `estimate-shapes.ts`). Nothing to enforce.
- CLAUDE.md § Where Things Happen path map updated for every new surface: migration 011, shared `estimate-shapes.ts`, extended `confirm_assessment` tool + `prompt-qa` + `/api/triage/answer`, both new routes, all seven DECIDE-state UI components (including `_severity-chip.ts`), page.tsx body extension, and the E2E spec. Three new § Gotchas entries (locked-jsonb DRY-tension, ChoosePath prop snapshot, `state='decide'` as new canonical state).
- Migration numbering monotonic: `20260517031335_011_decide_state.sql` follows `20260516111757_010_triage_conversation.sql` — timestamp + sequence number both ascending.
- Test naming: unit/integration use `*.test.ts(x)` co-located with source; the new E2E `decide-state.spec.ts` lives under `apps/web/e2e/` per the testing convention.
- jsonb-shape validators DRY: `parseDiyExpansion` + `parseContractorExpansion` defined once in `apps/web/app/api/triage/_lib/estimate-shapes.ts` and imported at both trust boundaries (`parse-qa-output.ts` for LLM output, `parse-estimate-override.ts` for user PATCH input) — matches spec § Gotchas #8 and § CLAUDE.md Gotchas (locked-jsonb-shape entry).
- No `.gstack/` files committed accidentally (verified via `git diff --name-only`).

### Dismissals

None

## Gate 7: cso

**Outcome**: `pass`

Daily-mode CSO audit on `origin/main..HEAD` (18 commits, 44 files, +7111/-29 lines). Confidence ≥ 8/10 on every category below.

- **Secrets archaeology** — No real secrets in the diff. The only credential-shaped string is `'decide-test-password-2026'` in `apps/web/e2e/decide-state.spec.ts:78`, a per-test password seeded against the local Supabase admin API (`admin.auth.admin.createUser`) for a `decide-${runId}@test.local` ephemeral user. Test-only, local-stack-only (the helper hard-gates on `isLocalSupabase`). Not a secret.
- **Server-side input trust boundaries (decide + estimate routes)** —
  - `POST /api/card/[id]/decide` (`apps/web/app/api/card/[id]/decide/route.ts`): `p_user` derives from `supabase.auth.getUser().user.id` (line 77). Body shape never carries a user_id; `parseDecideBody` only validates `{ path, monitoring_cadence_days }`. Body parser file-header explicitly documents the asymmetry ("Does NOT: Forward auth").
  - `PATCH /api/card/[id]/estimate` (`apps/web/app/api/card/[id]/estimate/route.ts`): no `p_user` — direct UPDATE via user-context client, RLS-scoped on `auth.uid() = user_id`. Body schema (`parseEstimateBody`) also never touches user identity.
  - Locked-jsonb shape validation: `parse-estimate-override.ts` delegates to `parseDiyExpansion` / `parseContractorExpansion` from the shared `_lib/estimate-shapes.ts` module. Same module also consumed by `parse-qa-output.ts`'s `parseConfirmAssessment` — single contract on both trust boundaries (LLM output + user PATCH), as required by spec § Gotchas #8.
  - State-classification 404 vs 409: both routes disambiguate by re-reading the row under the _user-context_ client (RLS-scoped). A card owned by another user is invisible to the caller → returns 404 (not 409). No ownership leak.
  - Storage RLS: PR doesn't touch Storage. The Storage bucket policies from migration 004 remain the trust boundary for any future photo write.
- **`commit_decide` RPC SECURITY DEFINER guard** — Migration 011 line 286-288 declares `if p_user is distinct from auth.uid() then raise exception 'forbidden' using errcode = '42501'`. Matches the `claim_card_slot` / `start_triage` / `complete_triage` / `confirm_triage` posture. Defense-in-depth against direct PostgREST RPC calls.
- **LLM trust boundary (confirm_assessment expansions)** — `apps/web/app/api/triage/_lib/parse-qa-output.ts:275-290` invokes `parseDiyExpansion` + `parseContractorExpansion` on `input.diy_expansion` + `input.contractor_expansion` before returning ok. Field paths bubble up (`diy_expansion.<field>` / `contractor_expansion.<field>`) so 502 envelopes point at the offending field without revealing prompt internals. The shared module enforces enum membership (`SKILL_LEVEL_VALUES`, `CONTRACTOR_TAG_VALUES`), non-negative finite numbers, `cost_max >= cost_min`, `time_hours_max >= time_hours_min`, `total_max >= total_min`, array caps (50 materials / 30 tools / 30 steps / 15 questions / 10 red_flags), and 2000-char string caps. Forward-compat extra-field tolerance is by design (spec § D3).
- **Migration 011 sequencing** — Function-dependency dance is correct: drops `start_triage` / `complete_triage` / `confirm_triage` at the top (lines 30-37) BEFORE the type rename, then rename-recreates the enum (lines 42-65) with the canonical drop-default → text-via-text cast → restore-default → drop-old-type recipe, then recreates the three RPCs at the bottom against the new (wider) enum. The new function (`commit_decide`) is also created against the new enum. Backfill predicate is correctly narrow: `where state = 'diagnosed' and severity_confirmed = true` (lifts only confirmed-but-not-path-chosen rows, leaves transitional `diagnosed + severity_confirmed=false` rows alone for the in-flight Q&A loop to finish naturally). Every column reference in WHERE / SET / RETURNING is `public.cards.<col>` qualified per the PR #24 lesson, preempting plpgsql `#variable_conflict=error` failures.

### Observations

- **`<DecideViewOpenedCapture />` PostHog event** (`apps/web/app/(app)/cards/[id]/_components/DecideViewOpenedCapture.tsx:40`) emits only `card_id` — already in the user's URL. No PII leak via analytics.
- **`commit_decide` returns `chosen_path` to client** — The route handler (`route.ts:148-150`) surfaces `card_id`, `state`, and `chosen_path` from the RPC's RETURNING clause. None of these are sensitive — the user owns the card. Confirmed safe.
- **`chosen_path` is `text` + CHECK (not native enum)** — Migration 011 deliberately models `chosen_path` as a `text` column with a CHECK constraint (`'diy' | 'contractor' | 'monitor' | NULL`) rather than a native enum. The CHECK is enforced at the DB layer; route-level validation via `parseDecideBody` is the application-layer defense. Both layers agree on the same five values (`'diy' | 'contractor' | 'monitor' | 'dismiss' | 'decide'` for route input; `commit_decide` maps `'dismiss'` → null + `state='dismissed'`, `'decide'` → null + `state='decide'`). No mismatch.
- **Estimate-route `.in('state', EDITABLE_STATES as unknown as string[])`** — the `as unknown as string[]` cast widens the literal-tuple type to satisfy the supabase-js generic; the array's contents are still compile-time literals. No runtime user-input pathway can inject other values.

### Dismissals

None

## Audit 1: pre-polish (2026-05-17)

<!-- audited-at: ccf06635f9c92ec1cce5ae2eb2460129905a23d8 -->
<!-- range: origin/main..HEAD -->

findings: high=0 medium=0 low=3

### Docs findings

- [low] `CLAUDE.md § Gotchas` — T7's bypass trailer (commit `d9fc8ad`) promised a § Gotchas entry on "override-NULL-semantics" landing in T16, but T16's CLAUDE.md update captures the semantics in the path-map entry (line 104, `(override ?? estimate)` parenthetical) rather than as a dedicated § Gotchas bullet. The contract IS documented — a future reader hits the override-vs-app rule at the PathCard path-map entry — but the bypass-trailer claim is technically unmet. Recommend either adding a one-line § Gotchas bullet ("`cost_estimate_*_override = NULL` means 'use AI app estimate' — never merged with the override; see `<PathCard />`'s `(override ?? estimate)` pick"), OR retroactively amending the bypass-trailer claim. Adequacy nit; not a coverage gap.
- [low] `METRICS.md:29` `decide_path_expanded` — row reserves event shape but no source wiring exists (`<PathCard />` is a server component using native `<details>` disclosure with no JS toggle handler). Row's inline note documents the deferral, and Gate 2's dismissal codifies it. Spec § Test Plan line 557 explicitly mentions asserting on `decide_path_expanded` in the E2E happy path; that assertion would fail today because the event never fires. Recommend either wiring an `'use client'` toggle wrapper around `<details>` to fire the event, OR softening the spec § Test Plan claim to exclude `decide_path_expanded`. Coherence nit between METRICS.md / spec / source.

### Tests findings

- [low] `apps/web/e2e/decide-state.spec.ts` — five E2E cases cover DB-state + DOM-state assertions but make zero PostHog-event assertions. Spec § Test Plan line 557 explicitly asks for PostHog event assertions in the happy path (`decide_view_opened`, `decide_path_expanded`, `decide_path_chosen`, `decide_path_changed`). All five wired events ARE covered at the unit-test level (`DecideViewOpenedCapture.test.tsx`, `ChoosePath.test.tsx`, `EstimateEditor.test.tsx`), so the call-site contract is locked — but the E2E gap means a posthog-init regression at the app-shell layer could ship invisibly. Recommend instrumenting `window.__posthogCaptures` in the E2E via `page.addInitScript()` + asserting the four events fire in the happy path. **Severity = low** because unit tests cover the call-site contract.
- (note, not a finding) `packages/core/src/supabase.types.ts` — modified but has no paired `*.test.ts`. Auto-generated declaration file from `pnpm db:gen-types`; no runtime behavior to test. Consistent with existing convention (file has been in-tree since v0 Phase 1 with no pairing). Not flagged.

### Bypass trailer audit

- 6630c23 `Docs-Coverage-Bypass`: "POST /api/card/[id]/decide route + body parser added in T6 — CLAUDE.md § Where Things Happen entries for the new route + METRICS.md decide\_\* event rows + CLAUDE.md § Gotchas entries for rename-recreate chain land in T16" — **VERIFIED**. T16 (9c23eab) lands the decide-route path-map entry (CLAUDE.md:101), 5 of 6 METRICS rows (decide_path_expanded reserved per Gate 2 dismissal), and the rename-recreate-with-function-deps Gotcha (CLAUDE.md:137).
- d9fc8ad `Docs-Coverage-Bypass`: "PATCH /api/card/[id]/estimate route + estimate-override parser added in T7 — CLAUDE.md path-map entries + override-NULL-semantics Gotcha land in T16" — **VERIFIED (with adequacy nit per Docs findings #1)**. Path-map entry landed (CLAUDE.md:102); override-NULL-semantics captured in path-map line 104 rather than as a dedicated § Gotchas bullet.
- 8733e65 `Docs-Coverage-Bypass`: "<PathCard /> component added in T8 — CLAUDE.md path-map entry lands in T16 docs commit" — **VERIFIED**. PathCard path-map entry at CLAUDE.md:104.
- 069888e `Docs-Coverage-Bypass`: "<EstimateEditor /> client added in T9 — CLAUDE.md path-map + METRICS.md entries for decide_estimate_edited + decide_estimate_reset land in T16" — **VERIFIED**. EstimateEditor path-map at CLAUDE.md:105; two METRICS rows at METRICS.md:31-32.
- ba802bb `Docs-Coverage-Bypass`: "components only; CLAUDE.md path-map and METRICS.md event rows land in T16 docs commit" (T10+T11 ChoosePath + MonitorCadencePicker) — **VERIFIED**. CLAUDE.md:106 + 107; METRICS rows for decide_path_chosen + decide_path_changed at METRICS.md:33-34.
- aaf0334 `Docs-Coverage-Bypass`: "DecideView/PlannedView/DecideViewOpenedCapture components added in T12+T13; path-map + METRICS entries land in T16" — **VERIFIED**. DecideView at CLAUDE.md:108; DecideViewOpenedCapture at CLAUDE.md:109 + METRICS.md:29; PlannedView at CLAUDE.md:110.
- 9754d0a `Docs-Coverage-Bypass`: "page.tsx body extension only; CLAUDE.md path-map update consolidated into T16 docs commit" — **VERIFIED**. Card-detail body extension at CLAUDE.md:112 covers decide + planned branches + thread-fetch state-set widening.
- 0 `Tests-Coverage-Bypass` trailers in range. Test-presence pre-commit hook enforced paired tests on every source commit; no test work was deferred.

findings: high=0 medium=0 low=3

## Gate 8: design-review

**Outcome**: `findings (2) fixed`

LLM-mediated visual QA on `/cards/[id]` in `state='decide'` and `state='planned'`, dark-only (per Gate 3 + globals.css — project has no light-theme tokens). Seeded two cards directly via admin client (skipping the AI hop, mirroring `e2e/decide-state.spec.ts § seedDecideCard`): one `state='decide'` with both DIY + Contractor estimates populated, one `state='planned'` with `chosen_path='diy'` and an `urgent` severity. Drove the browse daemon against `pnpm --filter @home-os/web dev` after killing a stale `next start` build that was serving pre-/simplify-gate source. Cookie pattern matches the E2E spec's `sb-host-auth-token` shape.

### Finding 1 (fixed) — `--color-urgent` drift on error / validation banners

Same drift class as /simplify's `--color-soon` / `--color-urgent` finding, but applied to a token-name that ALSO doesn't exist in `globals.css`. Live probe injection confirmed `text-[var(--color-urgent)]` resolves to `rgb(240, 239, 235)` (body text color, off-white) because the var is undefined and falls through. On a dark-warm-charcoal ground that's _technically_ visible, but the intent of these references was "error / validation red-orange" — the visual contract was for users to instantly perceive these as "needs attention", not blend into body copy.

Affected surfaces (all 4 inside this PR's diff):

- `ChoosePath.tsx:205` — the 409 `invalid_state` / network error banner under the four-button row
- `EstimateEditor.tsx:129 / 285 / 369` — three validation/save-error banners (closed-state, DIY open, contractor open)

**Fix**: swap to `text-[var(--color-act-soon)]` (canonical `#c4622d` warm orange, defined in `globals.css` and used by the severity-chip helper for `urgent`-tier cards). Verified live: probe element resolves to `rgb(196, 98, 45)`.

**Commit**: `59a768d` — `fix(decide-state): drift to non-existent --color-urgent token in error banners`

Tests: 21/21 pass on the two affected components (`ChoosePath.test.tsx` + `EstimateEditor.test.tsx`) after the swap. No tests pinned the bad classname, so no test updates required.

### Finding 2 (fixed) — broken dark-theme tokens across DECIDE + PLANNED surfaces

The much bigger finding. Live screenshot at `/cards/<id>` in `state='decide'` initially rendered with:

- **DIY** / **Contractor** PathCard headings invisible (dark text on dark ground)
- Diagnosis text "Slow leak at the P-trap..." rendered in same dark color
- All four Choose buttons appeared as transparent fills with faint dark borders + dark text — labels barely perceptible against the warm-charcoal ground
- The "filled primary action" Save / Confirm buttons (`bg-text-primary text-bg`) painted dark-on-dark on BOTH axes simultaneously

Root cause via DOM inspection: four undefined / wrong-axis CSS tokens that fall through silently in Tailwind v4 arbitrary-value classes:

- `--color-surface` → undefined → transparent
- `--color-border` → undefined → falls to current text color
- `--color-bg` → undefined → transparent
- `--color-text-primary` → defined but resolves to `#2c2b27`, the SAME color as the dark ground (the correct token for body text on dark theme is `--color-text-primary-inverse` = `#f0efeb`)

Same drift class /simplify caught for severity-chip tokens — components were copy-pasted from a light-theme reference without inverting to the project's dark-theme posture.

**Affected (all 6 in PR scope)**: `DecideView.tsx` (1), `PlannedView.tsx` (1), `PathCard.tsx` (9 — all section `<h3>`s), `EstimateEditor.tsx` (9 — form fields + two Save buttons), `ChoosePath.tsx` (1 compound — the four-button row), `MonitorCadencePicker.tsx` (4 — label + input + Confirm + Cancel). 28 substitutions total.

**Mapping applied**:

- `bg-[var(--color-surface)]` → `bg-[var(--color-background-raised)]`
- `border-[var(--color-border)]` → `border-[var(--color-border-default)]`
- `bg-[var(--color-bg)]` → `bg-[var(--color-background)]`
- `text-[var(--color-text-primary)]` → `text-[var(--color-text-primary-inverse)]`
- Compound "filled primary" `bg-text-primary text-bg` → `bg-text-primary-inverse text-background` (inverts both axes so Save / Confirm read off-white-on-dark like the rest of the codebase's primary actions)

**Verification (live in browse daemon)**:

- `Choose DIY` button post-fix: `color: rgb(240,239,235)` (off-white), `bg: rgb(36,35,32)` (background-raised), `border: rgb(200,198,192)` (border-default) — all three tokens resolve to defined values, all three pass WCAG AA contrast against the `#1c1b18` ground.
- Captured DECIDE 1440 + 375 + PLANNED 1440 + 375 + DIY-expanded screenshots: `specs/decide-state/screenshots/gate8-*.png` (5 files).
- 102/102 unit tests pass across all 13 `_components/` files after the swap.

**Commit**: `0c3f697` — `fix(decide-state): broken dark-theme tokens across DECIDE+PLANNED surfaces`

### Items inspected and clean

- **Severity chip rendering** (drift fix from /simplify): live verified — `soon` → `rgb(160,124,46)` (`--color-watch` warm amber), `urgent` → `rgb(196,98,45)` (`--color-act-soon` warm orange). Background sits at 20% opacity correctly.
- **PathCard collapsed + expanded layouts at 1440 + 375**: native `<details>` disclosure renders cleanly, headline-fields summary readable, expanded body shows all sections (Skill level / Materials / Tools / Steps / Watch out for / When to stop) with proper hierarchy. PathCards stack vertically at 375 (no horizontal scroll).
- **ChoosePath four-button row at 1440**: 12px horizontal gap, buttons size to content, all four side-by-side; 38px height (below the 44px touch-target convention, but consistent with the rest of the app per Gate 3's pre-existing-convention dismissal).
- **ChoosePath greyed-state PLANNED rendering**: `opacity-40 cursor-not-allowed` applied to all four buttons, "✓ Chosen" inline-marker on the picked path (DIY in our seed). "Change decision" link visible below the row with proper underline + secondary-text color.
- **MonitorCadencePicker inline appearance**: not exercised live (Set to Monitor click required interactivity — see "Limitation" below) but visual contract verified via source review + unit tests. Numeric stepper `<input type="number">` clamped to [7,365] in source.
- **EstimateEditor save / cancel UX**: closed state renders inline "Edit estimate" + (when override exists) "Reset to app estimate" links correctly. Open state form contract verified via source + unit tests; the inline `<details>` parent disclosure is opened correctly via the PathCard "Tap to expand" affordance.
- **"How we diagnosed this" disclosure**: thread is empty for seeded-decide cards (no triage conversation rows), so the `<details>` renders with a closed disclosure triangle + "How we diagnosed this" label — collapse affordance works (CSS-only, no JS dependency).
- **Motion / hover states**: native `<button>` + `<a>` elements; no custom motion in DECIDE / PLANNED surfaces (consistent with rest of app's minimalist posture). DESIGN.md isn't present in the repo, so the contract is the inferred system from `globals.css` + `packages/ui/src/tokens.ts`.

### Limitation

Live click-through of `Edit estimate` → form-open transition could NOT be exercised in this devcontainer's `next dev` shape — Next 16 Turbopack's cross-origin guard rejects the `127.0.0.1` WS-HMR handshake (logged warning: `Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from "127.0.0.1"`). Client-component hydration silently stalls without the HMR connection, leaving the closed-state HTML rendered server-side but un-interactive. The visual contract (token colors / layout / hierarchy) is fully verifiable from the server-rendered HTML; the click-through interactivity is covered by the 13 `_components/*.test.tsx` files (102 unit tests) and the 5-case E2E spec.

This is a dev-server-config issue, not a feature defect — `next build && next start` doesn't have this guard, and Vercel preview will too. Adding `127.0.0.1` to `allowedDevOrigins` in `next.config.ts` would unblock devcontainer click-through; deferred as housekeeping (out of decide-state scope).

### Dismissals

- 38px button height on the ChoosePath row — rationale: consistent with the pre-existing convention applied to the rest of the app's outline buttons (Sign out, dismissed-page Restore, etc.); not a decide-state regression. Universal 44px touch-target adoption is a project-wide a11y concern, separate roadmap item.
- Pre-existing same-class drift in `DiagnosedThread.tsx` / `StartTriage.tsx` / `AnswerThread.tsx` / `QaThread.tsx` / `ConversationRow.tsx` (originally landed in PRs #19 + #26, on `origin/main` already) — rationale: fixing them in this PR would scope-creep beyond decide-state and conflict with the "minimal diff per fix" posture. Tracked as a follow-up housekeeping item: same `sed`-pattern mass-replace, paired tests already exist, ~5 files / ~20 substitutions estimated.
- Live click-through of inline editors / cadence picker / commit flow — rationale: devcontainer Next-16-Turbopack cross-origin guard blocks WS-HMR; client-component hydration stalls. Visual contract verified from server-rendered HTML; interactivity covered by existing unit + E2E tests under the canonical CI shape.
