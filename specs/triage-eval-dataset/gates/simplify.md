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
