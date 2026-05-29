## Gate 2f: changed-tests-local

- Result: pass

New/changed test files run green under vitest:

- apps/web/eval/triage/score.test.ts — 15 tests (severity exact/adjacency, path derivation, aggregate math, threshold boundaries)
- apps/web/eval/triage/dataset.test.ts — 9 tests (count===75, unique ids, enum membership, category balance ≥7)
  Both run in CI's existing fast job via the `eval/**/*.test.ts` include glob added to vitest.config.ts (spec correction #2).

## Dismissals

None
