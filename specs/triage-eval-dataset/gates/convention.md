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
