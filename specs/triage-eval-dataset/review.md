<!-- audited-at: 539096edf6a4a1a25b71c85f2119eaabda3b3133 -->

# Pre-ship review — triage-eval-dataset

## Router Summary

Gate-shape: **applicable gates only** (operator decision at Phase 3 gate-shape). Zero-UI
offline-tooling PR; UI/app gates not dispatched against app surface — see per-gate sinks.

| Gate                              | Result                                         |
| --------------------------------- | ---------------------------------------------- |
| 2 metrics-check                   | n/a (no analytics events)                      |
| 2c slow-job-lifecycle             | n/a (no E2E/slow-job surface)                  |
| 2d fast-job-local                 | pass (lint/typecheck/test:unit/build 10/10)    |
| 2f changed-tests-local            | pass (24 new eval tests green)                 |
| 4 /simplify                       | findings (2) fixed                             |
| 5 docs-and-tests-review (Audit 1) | findings (2) low — noted                       |
| 6 /review                         | findings (2) low — 1 fixed, 1 documented-no-op |
| 7 /cso                            | pass (clean — key-leak path traced)            |
| 8b design-conformance             | n/a (zero UI)                                  |
| 9 /qa                             | blocked (n/a per scope — Rung 2 override)      |
| 10b preflight-final               | pass                                           |
| 11 convention                     | pass                                           |

**Aggregate:** passed=6, findings fixed=3, low-noted=3, n/a=3, blocked=1 (qa, scope).
No high/medium findings. The single blocked gate (/qa) is out-of-scope for a zero-UI
PR and is handled via the Phase 3 → 4 advance log below.

---

## Gate 2: metrics-check

- Result: n/a (no analytics events added — offline operator tooling fires no PostHog/Sentry telemetry; per spec § Metrics)

## Dismissals

None

---

## Gate 2c: slow-job-lifecycle

- Result: n/a (no E2E / slow-CI-job surface touched — this PR adds offline operator tooling + unit tests only; no Playwright spec, no workflow change. The eval runner is explicitly NOT a CI job per spec D6.)

## Dismissals

None

---

## Gate 2d: fast-job-local

- Result: pass

`pnpm turbo run lint typecheck test:unit build` → 10/10 tasks successful.

- lint: green (pre-existing warnings only, no errors)
- typecheck: green (3 packages)
- test:unit: 971/971 passing (97 files), incl. 24 new eval tests (15 score + 9 dataset)
- build: green (Next.js production build, all routes compiled)

## Dismissals

None

---

## Gate 2f: changed-tests-local

- Result: pass

New/changed test files run green under vitest:

- apps/web/eval/triage/score.test.ts — 15 tests (severity exact/adjacency, path derivation, aggregate math, threshold boundaries)
- apps/web/eval/triage/dataset.test.ts — 9 tests (count===75, unique ids, enum membership, category balance ≥7)
  Both run in CI's existing fast job via the `eval/**/*.test.ts` include glob added to vitest.config.ts (spec correction #2).

## Dismissals

None

---

## Gate 4: /simplify

Scope: PR-added eval-harness files only (`apps/web/eval/triage/*`, `apps/web/README.md`,
`apps/web/vitest.config.ts`, `apps/web/package.json`). Quality only — no bug-hunting.
Dataset entries, `app/api/triage/_lib` (read-only consumer), and the runner's
intentional relative `_lib` imports were left untouched per scope.

Result: **findings (2) fixed**. `pnpm --filter web test:unit` green (971/971) and
`tsc --noEmit` clean after both fixes.

### Fixes applied

1. **Dead `Prediction` type in `score.ts`** (`refactor(eval): drop unused Prediction
type from score.ts` — `70c5d7c`). The exported `Prediction = { severity_provisional;
path }` type was never imported or referenced anywhere — `run.ts` builds `EntryResult`
   fields directly and derives path via `pathFromContractorTag`. Removed the type
   (and its doc comment); the `Severity`/`Path` imports it used remain in use elsewhere
   in the module, so the import lines were untouched.

2. **Broken paragraph in `apps/web/README.md` eval blurb** (`refactor(eval): fix broken
paragraph break in eval-harness README blurb` — `d56d3f2`). A stray blank line +
   leading `- ` had split one sentence ("prints a per-category … overall report") into a
   dangling paragraph plus a spurious list item, which would render as a broken bullet.
   Rejoined into a single flowing paragraph ("per-category + overall report, …"). Prose
   only; no semantic change.

## Dismissals

- **`categoryToSystemTag` map (`types.ts`) is exported but only referenced in prose**
  (README + its own doc comment), not imported by code: kept. It is a deliberate
  dataset-authoring aid documented in `eval/triage/README.md` ("documents the default
  system tag per category") and listed as part of the `types.ts` public surface.
  Removing it would strip a documented authoring scaffold, not accidental dead code —
  out of altitude for a /simplify pass.
- **`statsFor` recomputed per-category then again overall (`score.ts` `aggregate`)**:
  kept. It re-filters `results` per category and once more for the overall row — O(C·N)
  over ≤75 entries run ~75× total at operator invocation, never on a hot path. Folding
  into a single pass would add bucketing complexity for no measurable gain; the
  filter-per-category form is the more readable contract.
- **`runPool` bespoke worker-pool (`run.ts`)**: kept. No existing shared concurrency
  helper in the repo to reuse; the order-preserving bounded pool is the right primitive
  for ~75 real API calls and is correctly self-contained.

---

<!-- audited-at: d56d3f28dcb7d97ebd3d56c02eda581d590fa3ed -->

## Gate 5: docs-and-tests-review (Audit 1)

Audited the diff `origin/main...HEAD` for the offline triage eval harness
(`apps/web/eval/triage/*`, `apps/web/README.md` note, `vitest.config.ts` include
glob, `apps/web/package.json` script + `tsx` devDep). Devshop-sync files
(`.devshop-version`, `.gitignore`) ignored per instructions. Ran the new unit
tests: 24 passed (15 `score.test.ts` + 9 `dataset.test.ts`).

### Tests

- **[low] `path_correct` in `run.ts` is computed inline (`predPath === entry.label_path`) instead of via the tested `pathMatch()`.** `run.ts:141`
  hand-rolls the path equality while severity uses the tested `severityExact` /
  `severityAdjacent` from `score.ts`. The gated _derivation_ (`pathFromContractorTag`)
  is correctly in `score.ts` and IS called by the runner — only the trivial
  final `===` is duplicated, and `pathMatch` covers the identical logic with a
  tested matrix. No behavior gap; cosmetic consistency nit. `system_tag_correct`
  is similarly inline but is reported-only (not gated), so it's outside the
  tested contract by design.

All spec-required assertions are present and pass:

- `severityExact` (equal/unequal), `severityAdjacent` (off-by-one true incl.
  exact; off-by-two/three false; span-3 ordinal assert), `pathFromContractorTag`
  (`diy`→diy + all 7 other `CONTRACTOR_TAG_VALUES`→hire + unknown→hire),
  `pathMatch` (full diy/hire matrix), `aggregate` (per-category + overall
  fractions; empty-set no-divide-by-zero) — all covered (`score.test.ts`).
- Threshold boundary: 14/20=0.70 sev + 17/20=0.85 path → `passed===true`
  (inclusive `>=` confirmed); one-miss-below each → `false`; both-must-pass
  (perfect severity + zero path → `false`); custom thresholds honored
  (`score.test.ts:188-253`). Pins D7 exactly.
- "Error entry counts as a miss in the denominator" asserted explicitly
  (`score.test.ts:143-177` — `ok:false`, `n===2`, `errors===1`, rate `0.5`).
- Dataset integrity (`dataset.test.ts`): `length===75`, unique ids, id regex
  `^[a-z]+-\d{2}$`, severity/path/system_tag enum membership, category ∈ 9,
  non-empty `description`+`rationale`, per-category floor `≥7`. Verified the
  actual dataset is 9/9/9 + 8×6 = 75 (matches spec "6×8 + 3×9"), all ids
  unique and regex-conformant.
- `run.ts` is intentionally not unit-tested (D6, operator script). This is
  documented in its file header ("Does NOT: Run in CI"), the README ("Not a CI
  gate"), and both test files' "Does NOT: Import run.ts" headers — an
  intentional choice, not an accidental gap. No _gated_ derivation lives only
  in `run.ts`: the severity scorers and `pathFromContractorTag` are all in the
  tested `score.ts`.

### Docs

- **[low] `apps/web/eval/triage/README.md` "How to run" says "From the repo root" but the `pnpm --filter web eval:triage` script's `tsx` invocation relies on `apps/web` as cwd for relative-import resolution.** `run.ts` uses relative
  imports (`../../app/api/triage/_lib/...`) which resolve fine regardless of
  cwd, and `pnpm --filter web` sets the package cwd, so the command works from
  repo root as written. The instruction is accurate — flagging only that the
  spec Gotcha (a) discusses cwd sensitivity, which the relative-import choice
  (correctly used here) renders moot. No correction needed; documenting that the
  README claim is verified-correct.
- `eval/triage/README.md` accurately describes how to run, the D7 thresholds
  (sev ≥0.70 gated, path ≥0.85 gated, adjacency + system_tag reported-only), the
  error-counts-as-miss behavior, and how to add/correct labels (edit JSON +
  run `vitest run eval/triage/dataset.test.ts`). All env vars
  (`ANTHROPIC_MODEL` default `claude-sonnet-4-6`, `EVAL_CONCURRENCY` 4,
  threshold overrides) match `run.ts` exactly. No code-contradicting claim found.
- `apps/web/README.md` note correctly points at the harness as the
  pre-prompt-change gate ("Run it before any triage-prompt change"), names the
  reused seam (`resolveSystemPrompt`/`callInitialRead`/`parseInitialRead`),
  states both gate thresholds, and links to the detailed README. Accurate.
- CLAUDE.md § Gotchas pointer: the spec scopes the doc note to
  `apps/web/README.md` only (In scope line 232, T6 line 554-557) — no CLAUDE.md
  edit was specced. The README note carries the "re-run before any
  triage-prompt change" guidance, satisfying the spec's single doc-note
  requirement. Not a finding; a CLAUDE.md gotcha would be a nice-to-have
  enhancement but is out of this PR's specced scope.

findings: high=0 medium=0 low=2

## Dismissals

- **D7 prose says thresholds are "overridable via CLI flag / env" but only env
  overrides are implemented.** Dismissed: the spec's authoritative `run.ts`
  contract (§ API/function contracts, step 2, line 419-422) narrows this to env
  vars only (`EVAL_SEVERITY_THRESHOLD` / `EVAL_PATH_THRESHOLD`); the README and
  `run.ts` both match the contract. The "CLI flag" wording is a spec-internal
  loosening, not a docs-vs-code contradiction in the shipped PR.
- **`score.test.ts` `entry()` helper derives `severity_exact`/`path_correct`
  using the same functions under test.** Dismissed: `aggregate` reads the stored
  booleans directly, and the boundary/error tests construct those booleans
  explicitly (not via the helper), so the helper's reuse doesn't mask an
  `aggregate` bug.

---

## Gate 6: /review

Pre-landing review of the triage-eval-dataset diff vs `origin/main`, scoped to the PR's own code:
`apps/web/eval/triage/{types.ts,score.ts,run.ts,dataset.json,*.test.ts}`, `apps/web/vitest.config.ts`,
`apps/web/package.json`. Devshop-sync + spec artifacts (`.devshop-version`, `.gitignore`,
`pnpm-lock.yaml`, `specs/**`) ignored per scope.

Verification run alongside the read: `npx vitest run eval/` → 24 passed (score 15, dataset 9);
`tsc --noEmit` → no errors in `eval/triage`; dataset integrity confirmed independently
(75 entries, balanced 9/9/9/8/8/8/8/8/8 across the 9 categories ≥ 7 floor, unique ids, all
matching `/^[a-z]+-\d{2}$/`).

### Findings

All HIGH/MEDIUM focus concerns checked clean. Two LOW observations only.

- **[LOW] (confidence: 7/10) apps/web/eval/triage/run.ts:259 — `void main()` has no `.catch`; a throw inside `main` before `runPool` would surface as an unhandled-rejection (no controlled exit code) rather than a clean non-zero exit.**
  In practice `main`'s pre-pool body is all synchronous (env reads, `resolveSystemPrompt()`) and `scoreEntry` swallows every API/parse error, so `runPool`/`Promise.all` cannot reject — the realistic blast radius is near-zero today. But the harness is a regression _gate_; an unhandled rejection could exit 0 on some Node configs, masking a real failure. `Fix:` wrap as `main().catch((e) => { console.error('[eval] fatal:', e instanceof Error ? e.message : String(e)); process.exit(1); });` so any unexpected throw still yields a deterministic non-zero exit (and never prints the API key — log `e.message`, not the key).

- **[LOW] (confidence: 8/10) apps/web/eval/triage/run.ts:34 (also dataset.test.ts:19, dataset.test.ts in scope) — `datasetJson as DatasetEntry[]` is an unchecked cast; TS does not validate the JSON against `DatasetEntry`.**
  This is acceptable as-is because `dataset.test.ts` runtime-validates the same JSON in CI (enum membership, id format, category membership, balance floor, non-empty text) — the cast is test-backed, so a malformed entry fails the suite before it can reach the runner. Noting it only so the coupling is explicit: the safety of this cast depends on `dataset.test.ts` staying in the CI include glob. `Fix:` none required; keep `eval/**/*.test.ts` in `vitest.config.ts` include (it is) so the runtime guard never silently stops running.

### Focus-concern verification (all clear)

- **Worker pool (run.ts:154-175):** `const i = next++` is atomic between `await` points in single-threaded JS — each lane claims a unique index, no dropped/duplicated entries. Order preserved via `results[i] = await worker(entry)`. Lane count `Math.min(concurrency, entries.length)`; empty dataset → 0 lanes → `Promise.all([])` resolves → `aggregate([])` handles it. `worker` (`scoreEntry`) never throws, so `Promise.all` never rejects mid-run. Correct.
- **Per-entry error tolerance (run.ts:97-151):** try/catch wraps the whole body. Catches BOTH thrown API errors (catch → `errorResult`) AND parse `{ok:false}` (line 119-123 → `errorResult`) AND missing/blocked tool block (line 111-116 → `errorResult`). All three become `ok:false` misses, never silently dropped.
- **API key guard (run.ts:225-229):** checked at the top of `main`, before `resolveSystemPrompt`, `runPool`, and any `callInitialRead`. Truly precedes every network call. Exits 1. Correct.
- **`aggregate()` (score.ts:142-167):** `rate()` guards `n===0` → returns 0, no NaN. Empty category slices skipped via `continue`. Error entries kept in denominator (`statsFor` counts `results.length`; `ok:false` rows have all `*_correct:false`). `passed` uses inclusive `>=` against overall only. Boundary tests (14/20=0.70, 17/20=0.85) confirm inclusive pass. Correct.
- **`pathFromContractorTag` (score.ts:44-46):** `'diy' → 'diy'`, everything else (incl. empty/unknown) → `'hire'`. Test covers full `CONTRACTOR_TAG_VALUES` set + `'something_else'`. Correct safe-default.
- **`extractToolInput` (run.ts:52-73):** handles non-object, null, missing `content`, non-array `content`, missing block, and missing `.input` (`?? null`). Never throws; treats refusal/blocked as parse miss. Correct.
- **Secret leakage:** No `console.log`/Sentry/error-body emits `apiKey`. Guard logs the var _name_ only. `scoreEntry` catch logs `err.message` (Anthropic SDK messages do not embed the key). `printReport` logs `model`/concurrency, not the key. Clean.
- **TS types:** zero `any` / `as any` in `eval/triage/*.ts`. `EntryResult`/`RecordInitialRead` field accesses (`severity_provisional`, `contractor_tag_proposed`, `system_tag_proposed`) match the shipped `RecordInitialRead` shape exactly. `unknown`-narrowing in `extractToolInput` is properly guarded.
- **Exit code:** `process.exit(report.passed ? 0 : 1)` (run.ts:256) wired correctly to the gate result.

## Dismissals

- Greptile triage — no open PR for this branch at review time; integration is additive, skipped.
- Codex / specialist-army / adversarial subagent passes — this is a single non-interactive pre-ship gate (HALT-ON-FIND, surface only). Findings surfaced directly; no auto-fix, no PR mutation.
- `tools: [...] as never` and `as DatasetEntry[]` casts in shipped `_lib/anthropic.ts` — outside this PR's scope (pre-existing on `main`); not introduced by this diff.

---

## Gate 7: /cso

**Mode:** daily (8/10 confidence gate). **Scope:** PR diff vs `origin/main` on `feat/triage-eval-dataset`.
**Files in scope:** `apps/web/eval/triage/{run.ts,score.ts,types.ts,dataset.json}`, `apps/web/package.json`, `apps/web/vitest.config.ts`, devshop-sync `.gitignore`/`.devshop-version`/`pnpm-lock.yaml`.

**No findings — clean.** No CRITICAL / HIGH / MEDIUM at the 8/10 daily gate.

### Verification performed (the load-bearing checks)

1. **Secret handling — `run.ts` ANTHROPIC_API_KEY flow (the single most important check): PASS.**
   - Key read once at `run.ts:225` (`process.env.ANTHROPIC_API_KEY`), passed by value through `scoreEntry` opts → `callInitialRead({ apiKey })` → `new Anthropic({ apiKey })` (`anthropic.ts:164-166`). GC'd at process exit.
   - **Never printed:** the only key-related log is `run.ts:227` `console.error('ANTHROPIC_API_KEY is required ...')` — a presence check that prints a literal string, NOT the value.
   - **Never in error payloads:** the catch block (`run.ts:146-150`) logs `err.message`. Traced the Anthropic SDK error class (`@anthropic-ai/sdk@0.96.0` `core/error.mjs`): `APIError.makeMessage(status, error, message)` builds the message from HTTP status + response body + message — it does NOT read request headers, where `x-api-key` lives. The key cannot transit into `err.message`. Parse-error logs (`run.ts:120`) only echo `parsed.field`/`parsed.reason`, no key.
   - **Never written to disk:** grep for `writeFile*`/`fs.`/`createWriteStream`/`appendFile` across the eval dir → none. Report goes to `console.log`/`console.table` only.
   - **Never persisted in the report object:** `EntryResult`/`ScoreReport` (`score.ts`) carry no key field. Matches CLAUDE.md BYOK posture (key never logged/persisted/in error payloads).

2. **tsx supply-chain: PASS.** `tsx ^4.0.0` → resolved `4.21.0` in `pnpm-lock.yaml`. Well-known package (esbuild-based TS runner, author Hiroki Osame / privatenumber, MIT, `homepage: tsx.is`, millions of weekly downloads). Correctly in `devDependencies`, not `dependencies` — never ships in the production bundle, never runs at `next build`. tsx's own `package.json` has **no `scripts` block** (no pre/post/install hooks). Transitive deps are standard build tooling: `esbuild`, `get-tsconfig`, optional `fsevents` — all already in the existing toolchain. Lockfile delta is 3 lines (just the tsx entry); no surprise transitive additions.

3. **`eval:triage` is operator-only: PASS.** Script `tsx eval/triage/run.ts` is referenced ONLY in `apps/web/package.json:14`. No `.github/` workflow references it or tsx. No `preinstall`/`postinstall`/`install` hook anywhere. (Root `package.json` has `prepare: husky` — pre-existing, not in this diff, only sets up git hooks.) Runner is invoked manually; doc header confirms "Not a CI step (D6) — non-deterministic + costs ~75 real API calls."

4. **No dangerous primitives: PASS.** No `eval()` / `new Function` / `child_process` / `exec`/`spawn`, no network listener, no fs writes outside expected (none). Only network egress is the intended Anthropic SDK call via `callInitialRead`.

5. **dataset.json injection surface: noted, not weighted.** 75 synthetic homeowner strings are fed as `userText` (the user-message position) to the operator's own model call (`run.ts:107`). Per FP precedent #13, user content in the user-message position is not prompt injection. The blast radius is purely the operator's own eval run on their own key. No finding.

6. **devshop-sync files: PASS.** `.devshop-version` 1.35.0→1.36.0, `.gitignore` (removes `.gstack/` ignore + husky comment), `pnpm-lock.yaml` tsx addition. Lockfile present + git-tracked. Quick sanity pass only (deep sync audit out of scope — shipped separately).

### Filter stats

Candidates considered: 6 (key-log, key-in-error, fs-write, tsx-supply-chain, CI-wiring, dataset-injection). Filtered by verification/FP rules: 6. Reported: 0.

## Dismissals

- **`console.warn(err.message)` in the error path (`run.ts:148`):** dismissed — verified via SDK source trace that `APIError` message construction never includes request headers / the API key. Logging the API _error_ string is safe (CLAUDE.md precedent: logging URLs/error strings is fine; only logging the secret value is a vuln). Not a finding.
- **dataset.json strings as model input:** dismissed per FP precedent #13 (user-message-position content is not prompt injection); operator-only blast radius. Not a finding.
- **`prepare: husky` install hook:** dismissed — pre-existing in root `package.json` (outside this PR's diff), standard git-hook setup, not introduced by the tsx addition.

---

_This tool is not a substitute for a professional security audit. /cso is an AI-assisted scan that catches common vulnerability patterns — not comprehensive, not guaranteed. For production systems handling sensitive data, payments, or PII, engage a professional penetration testing firm._

---

## Gate 8b: design-conformance

- Result: n/a (zero UI surface — diff adds no JSX/TSX, no styles, no components; nothing to check for design-system conformance.)

## Dismissals

None

---

## Gate 9: /qa

- Result: blocked (n/a per scope: zero-UI offline-tooling PR — no app route, no user flow, and no UI change for /qa to exercise; no running app/Supabase in scope. Operator selected "applicable gates only" at the Phase 3 gate-shape decision, explicitly dropping UI/app gates for this diff.)

Routed to the Phase 3 → 4 Rung 2 override flow (adversarially reviewed) rather than treated as a silent n/a.

## Dismissals

None

---

## Gate 10b: preflight-final

- Result: pass

Final deterministic re-verification at HEAD (539096edf6a4a1a25b71c85f2119eaabda3b3133):

- lint / typecheck / test:unit / build re-run green after the post-audit run.ts fix.
- 971/971 unit tests pass (incl. 24 eval tests).
- Runner module graph loads under tsx; ANTHROPIC_API_KEY guard exits 1 when unset.

## Dismissals

None

---

## Gate 11: convention

pass — conventions followed

Checked the `origin/main..HEAD` diff for `feat/triage-eval-dataset` against `/workspace/CLAUDE.md` and `/devshop/kit/docs/guide/conventions.md`. In-scope: `apps/web/eval/triage/{types,score,run,dataset,score.test,dataset.test,README}` + `apps/web/{README.md,vitest.config.ts,package.json}`. No findings; no fixes applied.

Evidence per check:

- **Commit messages** — all 8 feature commits follow conventional-commit style with a scope:
  - `feat(eval): add triage dataset schema + types`
  - `feat(eval): author 75 labeled synthetic triage issues across 9 categories`
  - `feat(eval): add triage scoring module + tests; wire eval tests into vitest`
  - `test(eval): add dataset integrity tests (count, ids, enums, balance)`
  - `feat(eval): add triage eval runner + eval:triage script + tsx devDep`
  - `docs(eval): add triage eval README + apps/web README note`
  - `refactor(eval): drop unused Prediction type from score.ts`
  - `refactor(eval): fix broken paragraph break in eval-harness README blurb`
  - `chore(triage-eval-dataset): Phase 0 spec skeleton (decisions)`
    Types (feat/test/docs/refactor/chore) + scope are all valid; subjects are imperative-mood, lowercase, no trailing period. Consistent with the project history (e.g. `feat(db)`, `fix(db)`, `docs(build-log)`).

- **File naming + directory placement** — colocated unit tests as `*.test.ts` (`score.test.ts`, `dataset.test.ts`) sitting next to the modules they test, matching the repo norm (`tier-cards.test.ts`, `parse-tool-output.test.ts`, `sync-zoom-transform.test.ts`, etc.). Module files use kebab-/short-case (`types.ts`, `score.ts`, `run.ts`) consistent with `_lib` siblings. New `eval/triage/` directory is a deliberate placement decision (outside `app/`/`lib/`) and the new `eval/**/*.test.ts` include glob in `vitest.config.ts` correctly wires it; tests confirmed running (24 passed).

- **TS style** — file headers use the repo's `// What: / // Why: / // Does NOT:` convention (matches `_lib/prompt.ts`, `parse-qa-output.ts`, `estimate-shapes.ts`, etc.). Imports are `import type` for type-only, named exports throughout (zero `export default` in the eval files), and import ordering (external → alias/relative `_lib` → local) matches surrounding code. The mixed alias usage is intentional and documented: `score.ts`/`*.test.ts` use the `@/` alias (resolved by vitest's `resolve.alias`), while `run.ts` uses relative `../../app/...` imports because tsx runs without vitest's alias config — called out in `run.ts`'s own header and the apps/web README. Not an inconsistency.

- **`eval:triage` script + tsx devDep** — script declared in `apps/web/package.json` alongside the existing `test*`/`typecheck` scripts; `tsx` added under `devDependencies` in correct alphabetical position (`tailwindcss`, `tsx`, `typescript`). Consistent with how other dev tooling is declared. tsx scoped to `apps/web` only (no root duplication), appropriate since the runner lives there.

- **README / doc prose** — `eval/triage/README.md` uses the same table-driven, sectioned style as the other apps/web READMEs (env-var table, files table). The `apps/web/README.md` insertion is a `####`-level subsection slotted into the existing `_lib` documentation block with matching voice/density. No tone or formatting drift.

- **Debug code** — no `console.log`/`debugger`/stray `TODO`/`FIXME` in non-script files. `run.ts` console output (`console.log`/`console.warn`/`console.error`/`console.table`) is the intended operator-CLI reporting surface, expected and in-scope-excluded.

## Dismissals

- **`run.ts` uses relative `_lib` imports while `score.ts`/tests use the `@/` alias** — not a finding. Documented divergence: tsx (the eval runner) does not consume vitest's `resolve.alias` or tsconfig paths, so relative imports are required for the runner to resolve `_lib` at runtime; the alias is fine in the test files because vitest resolves it. Rationale is stated verbatim in `run.ts`'s header comment and the apps/web README blurb.
- **`run.ts` contains `console.*` calls** — not a finding. Explicitly carved out by the gate scope ("run.ts console output is intentional/expected for an operator CLI"); the output is the harness's report surface.

---

## Phase 3 → 4 advance log

### 2026-05-29T00:01:22Z — Gate 9: /qa

**Gate:** Gate 9: /qa
**Reason:** This PR adds offline triage-eval tooling only (apps/web/eval/triage/\*: a 75-entry JSON dataset, pure scoring functions, an operator-run runner) plus docs and the devshop v1.36.0 sync. It changes zero JSX/TSX, adds no route, and modifies no user flow, so /qa has no app surface to exercise — running it would test unrelated existing screens, producing no signal about this change. The runner is explicitly not a CI job (spec D6). Operator selected 'applicable gates only' at the Phase 3 gate-shape decision, dropping UI/app gates for this specific diff.
**Follow-up tracker:** specs/triage-eval-dataset/spec.md § In scope > 'Explicitly OUT of scope' (Any UI / Any CI workflow change) + PLAN.md § Planned (v0) row 'triage-eval-dataset'

<!-- adversarial-review-stamp: blockedGateOverride PASS @ 2026-05-29T00:01:22Z -->
