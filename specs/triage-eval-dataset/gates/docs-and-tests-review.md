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
