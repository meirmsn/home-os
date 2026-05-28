# Tasks: triage-eval-dataset

## Task: T1 — Schema + types

**Hat**: Data
**Depends on**: none
**Blocks**: T2, T3, T4, T5
**Done when**: `apps/web/eval/triage/types.ts` exports `DatasetEntry`, `CATEGORIES`/`Category`, `Path`, `categoryToSystemTag`; imports `Severity`/`SystemTag` from `_lib/parse-tool-output`; typecheck clean.
**Risk**: low
**Status**: done

## Task: T2 — Dataset

**Hat**: Data/PM
**Depends on**: T1
**Blocks**: T4, T5
**Done when**: `apps/web/eval/triage/dataset.json` has 75 entries (6×8 + 3×9), unique ids `^[a-z]+-\d{2}$`, balanced ≥7/category, labels spread across severity + path, defensible rationale per entry.
**Risk**: medium
**Status**: done

## Task: T3 — Scoring + tests (test-first) + vitest include

**Hat**: BE
**Depends on**: T1
**Blocks**: T5
**Done when**: `score.ts` pure functions + `aggregate` per contract; `score.test.ts` green (math + threshold boundaries inclusive); `eval/**/*.test.ts` added to `vitest.config.ts` include.
**Risk**: low
**Status**: todo

## Task: T4 — Dataset integrity test

**Hat**: Data
**Depends on**: T2, T3
**Blocks**: none
**Done when**: `dataset.test.ts` asserts length===75, unique ids/regex, enum membership, category ∈ 9, per-category ≥7, non-empty description+rationale. Green. Does NOT import run.ts.
**Risk**: low
**Status**: todo

## Task: T5 — Runner + package.json

**Hat**: BE
**Depends on**: T1, T2, T3
**Blocks**: none
**Done when**: `run.ts` per runner contract (env-key guard, bounded concurrency, per-entry error tolerance, report, non-zero exit); `eval:triage` script + `tsx` devDep added; lockfile updated; runner prints key-required error and exits 1 when ANTHROPIC_API_KEY unset (proves tsx loads module graph).
**Risk**: medium
**Status**: todo

## Task: T6 — README + doc note

**Hat**: PM
**Depends on**: T5
**Blocks**: none
**Done when**: `eval/triage/README.md` (how to run, thresholds, add/correct labels) + one-paragraph note in `apps/web/README.md` triage section.
**Risk**: low
**Status**: todo

## Decisions

(empty — appended as judgment calls are made)
