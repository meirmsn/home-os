# Triage eval harness

An operator-run regression gate for the AI triage **initial read**. It feeds 75
labeled synthetic home-issue descriptions through the _exact_ shipped triage
prompt + tool schema and scores the model's `severity_provisional` and the
derived DIY-vs-hire path against human-reviewed labels. Re-run it before any
prompt change so a regression below the floor surfaces as a non-zero exit.

> Not a CI gate. LLM output is non-deterministic and a full run costs ~75 real
> API calls. CI only runs the deterministic unit tests (scoring math + dataset
> integrity); the accuracy run is operator-invoked.

## How to run

From the repo root:

```bash
ANTHROPIC_API_KEY=sk-ant-... pnpm --filter web eval:triage
```

The runner prints a per-category table, an overall summary, and a `PASS`/`FAIL`
banner, then exits `0` on pass or `1` when a gated metric is below threshold
(scriptable as a pre-prompt-change gate).

### Environment variables

| Var                       | Default             | Purpose                                                            |
| ------------------------- | ------------------- | ------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`       | _(required)_        | Without it the runner prints an error and exits 1 before any call. |
| `ANTHROPIC_MODEL`         | `claude-sonnet-4-6` | Override the model under test.                                     |
| `ANTHROPIC_BASE_URL`      | _(SDK default)_     | Point at a local mock server (used for the acceptance check).      |
| `EVAL_CONCURRENCY`        | `4`                 | Bounded worker-pool size. Set `1` for sequential.                  |
| `EVAL_SEVERITY_THRESHOLD` | `0.70`              | Override the gated severity exact-match floor.                     |
| `EVAL_PATH_THRESHOLD`     | `0.85`              | Override the gated DIY/hire path-accuracy floor.                   |

## What the thresholds mean

Two **gated** metrics decide pass/fail (D2, D7):

- **Severity exact-match ≥ 0.70** — fraction of entries whose
  `severity_provisional` exactly equals the label. Severity is ordinal
  (`cosmetic < monitor < soon < urgent`); an _adjacency_ rate (off-by-one) is
  also reported but is **not** gated — it's a tuning signal.
- **Path accuracy ≥ 0.85** — the model's `contractor_tag_proposed` is folded to
  a path (`diy` → DIY; any other tag → hire) and compared to `label_path`.

`system_tag` accuracy is **reported-only** — useful for prompt tuning, never a
gate. Both thresholds are a starting floor to tighten as the prompt improves;
override per-run via `EVAL_SEVERITY_THRESHOLD` / `EVAL_PATH_THRESHOLD`.

API or parse errors on an entry are counted as **misses** in the denominator
(never silently dropped), logged with a warning, and the run continues — one
bad entry never crashes the harness.

## How to add or correct labels

The dataset is plain JSON at [`dataset.json`](./dataset.json). Each entry:

```jsonc
{
  "id": "hvac-01", // unique, lowercase category-prefix + 2-digit index
  "category": "HVAC", // one of the 9 CATEGORIES in types.ts
  "description": "...", // the homeowner text fed to the model
  "label_severity": "soon", // cosmetic | monitor | soon | urgent
  "label_path": "hire", // diy | hire  (gated)
  "label_system_tag": "hvac", // reported-only; legal SystemTag (deviations allowed)
  "rationale": "...", // one-line human justification (review aid, not scored)
}
```

To add or correct a label, edit `dataset.json` directly and run the integrity
test:

```bash
pnpm --filter web exec vitest run eval/triage/dataset.test.ts
```

It enforces: exactly 75 entries, unique ids matching `^[a-z]+-\d{2}$`, legal
enum values for severity / path / system_tag, a category from the 9, a
non-empty `description` + `rationale`, and a per-category balance floor of ≥ 7.
The `categoryToSystemTag` map in `types.ts` documents the default system tag per
category; per-entry deviations are allowed — note the reason in `rationale`.

## Files

| File              | Purpose                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `types.ts`        | `DatasetEntry`, `CATEGORIES`/`Category`, `Path`, `categoryToSystemTag`. |
| `dataset.json`    | 75 labeled synthetic entries.                                           |
| `score.ts`        | Pure scoring — exact / adjacency / path / `aggregate`.                  |
| `score.test.ts`   | Scoring math + threshold-boundary unit tests (CI, zero network).        |
| `dataset.test.ts` | Dataset-integrity unit tests (CI, zero network).                        |
| `run.ts`          | Operator harness — loads dataset, calls the live seam, scores, exits.   |
