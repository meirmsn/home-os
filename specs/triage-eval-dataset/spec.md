<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: triage-eval-dataset -->
<!-- date: 2026-05-28 -->

# Spec: triage-eval-dataset (PR N)

**Sources:**

- `PLAN.md § Planned (v0)` — top-ranked row, primary scope
- `.gstack/eng-review-home-os-2026-05-01.md § Pre-Ship Requirements #2` + `§ Build Order step 15` — the eval-dataset requirement verbatim
- Triage subsystem (style + contract reference):
  - `apps/web/app/api/triage/route.ts` — POST /api/triage initial-read route
  - `apps/web/app/api/triage/_lib/anthropic.ts` — `callInitialRead()` (the eval seam)
  - `apps/web/app/api/triage/_lib/prompt.ts` — `resolveSystemPrompt()` + `DEFAULT_TRIAGE_SYSTEM_PROMPT`
  - `apps/web/app/api/triage/_lib/parse-tool-output.ts` — `RecordInitialRead` shape + `SEVERITY_VALUES` / `SYSTEM_TAG_VALUES` / `CONTRACTOR_TAG_VALUES`
- Prior spec `specs/photo-comparison/spec.md` — style + structure reference

An operator-run eval harness for the AI triage core: 75 labeled synthetic
home-issue descriptions across 9 contractor categories, plus a runner that
scores the live triage prompt's severity + DIY/hire-path proposals against the
labels — so any prompt change can be regression-checked before it ships. Not a
user-facing feature; it is the quality floor for the AI core (eng-review
Pre-Ship Requirement #2).

---

## Product update

Both blurbs as approved at Phase 0.2. Single source-of-truth — `/ak-build`
Phase 4.1 copies them verbatim into the PR body's `## Product update`
section, Phase 5.6 copies Headline into BUILD-LOG `Headline:` and Detail into
`Summary:`, and `/ak-go-live` Step 6 uses Headline as the deployed-to-prod
lede.

### Headline (user-facing)

Infrastructure update — no user-visible change in this PR.

### Detail (team-facing)

Adds a triage eval harness — 75 labeled synthetic home-issue descriptions
across 9 contractor categories plus an operator-run runner that scores the live
triage prompt's severity + DIY/hire-path calls against the labels, so prompt
changes can be regression-checked before they ship. Dataset integrity +
scoring logic are unit-tested in CI; the accuracy run is operator-invoked with
a real API key. This PR is branched off the `chore: sync from devshop v1.35.0
→ v1.36.0` commit, so that sync lands in the same PR.

---

## Decisions (resolved at spec time)

9 `/ak-spec`-time decisions resolved in Phase 0 with the user. Recorded below
so Phase 1 preserves them verbatim and a crashed Phase 1 resumes without
re-asking.

### D1: Eval seam — what the runner calls to get triage output

**Decision:** Reuse the `_lib` primitives directly — `resolveSystemPrompt()`
(`_lib/prompt.ts`) + `callInitialRead()` (`_lib/anthropic.ts`) +
`parseToolOutput()` (`_lib/parse-tool-output.ts`) — with text-only input
(`images: []`), bypassing the HTTP route, DB, and auth.

**Rationale:** Matches the "~30-line script" intent from eng-review; exercises
the exact shipped prompt + tool schema so "re-run before any prompt change"
genuinely gates regressions. Verified at Phase 0: `callInitialRead` runs
text-only — `buildUserContent` emits just the text block when the image array
is empty, and the `record_initial_read` tool schema does not require images.

### D2: Which fields are scored against labels

**Decision:** **Gated** — `severity_provisional` (4-value ordinal) and the
DIY-vs-hire path derived from `contractor_tag_proposed === 'diy'` (diy → DIY
path; any other contractor tag → hire path). **Reported-only** —
`system_tag_proposed` accuracy (diagnostic, not a gate).

**Rationale:** These are exactly the two labels eng-review names ("proposed
severity + DIY/hire path"). System-tag accuracy is useful for prompt tuning
but is not part of the ship gate.

### D3: How ordinal severity is scored

**Decision:** Exact-match accuracy is the gate. Off-by-one on the
`cosmetic < monitor < soon < urgent` scale is reported as a separate
"adjacency" stat that does NOT count toward the gate.

**Rationale:** Severity is ordinal; surfacing near-misses helps tune the
prompt without making the threshold mushy.

### D4: Dataset format + location

**Decision:** `apps/web/eval/triage/dataset.json` — 75 entries, each
`{ id, category, description, label_severity, label_path, label_system_tag,
rationale }`, balanced across the 9 categories (HVAC, Plumbing, Electrical,
Structural, Roof, Pool, Pest, Landscaping, General) at ~8–9 entries each.
`label_severity` ∈ `SEVERITY_VALUES`; `label_path` ∈ `{ diy, hire }`;
`label_system_tag` ∈ `SYSTEM_TAG_VALUES`.

**Rationale:** Colocated with the triage code so it shares tsconfig + vitest.
Plain JSON so the operator can review/correct labels easily.

### D5: How the runner is invoked

**Decision:** `apps/web/eval/triage/run.ts` invoked via a new
`pnpm --filter web eval:triage` script (run with `tsx`), reading
`ANTHROPIC_API_KEY` (and optional `ANTHROPIC_MODEL` / `ANTHROPIC_BASE_URL`)
from env. Prints per-category + overall accuracy; exits non-zero when a gated
metric is below threshold.

**Rationale:** Standard operator-run script; non-zero exit makes it scriptable
as a pre-prompt-change gate.

### D6: CI posture

**Decision:** NOT a CI gate (non-deterministic LLM + real API cost). The
runner's scoring logic and the dataset integrity get vitest unit tests that
run in CI with zero API calls. The accuracy run is operator-invoked.

**Rationale:** LLM output isn't deterministic enough to gate CI; the scoring
logic and dataset shape are deterministic and worth pinning.

### D7: Pass thresholds

**Decision:** severity exact-match ≥ 0.70, path accuracy ≥ 0.85 as the initial
gate (overridable via CLI flag / env). Adjacency reported but not gated.

**Rationale:** A starting floor to tighten as the prompt improves; explicit so
a regression below the floor exits non-zero.

### D8: Who authors the 75 labeled issues

**Decision:** Claude generates all 75 synthetic issues + proposed labels now;
the team reviews/corrects labels later (plain JSON).

**Rationale:** eng-review: "Claude generates 75 synthetic issues across all
contractor categories … team reviews + labels."

### D9: TS script runner dependency

**Decision:** Add `tsx` as a devDependency to `apps/web`.

**Rationale:** Repo has no existing TS script runner (only `.mjs` via `node`);
`tsx` is the standard for a TS entrypoint that imports the app's `_lib` modules.

---

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens, Data
     model changes, API contracts, Offline behavior, Metrics, Files to
     create/modify, Tests, Dependencies, Task order, Gotchas, Acceptance /
     rollout / rollback. The Product update + Decisions sections above
     stay verbatim. -->

## Spec-time code verification (corrections to Phase-0 assumptions)

Every claim below was checked against the actual `_lib` source at spec time.
Two Phase-0 assumptions were corrected; cite these when implementing:

1. **Parse function name.** D1 names the parser `parseToolOutput()`. The actual
   export is **`parseInitialRead(input: unknown): ParseResult`**
   (`apps/web/app/api/triage/_lib/parse-tool-output.ts:90`). `ParseResult`
   (line 69) is `{ ok: true; value: RecordInitialRead } | ParseError`, where
   `ParseError` (line 63) is `{ ok: false; field: string; reason: string }`.
   The runner + tests use `parseInitialRead`; D1's intent (parse the
   `record_initial_read` tool_use block) is unchanged.

2. **Vitest `include` does NOT cover `eval/**`.** `apps/web/vitest.config.ts:34`sets`include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'app/**/*.test.ts',
   'app/**/*.test.tsx', 'middleware.test.ts']`. Tests placed under
`apps/web/eval/triage/`would **silently not run in CI**. Fix: add`'eval/\*_/_.test.ts'`to the`include` array (T3). Without this the
   dataset-integrity + scoring tests are dead — this is the single most
   load-bearing correction in the spec.

Confirmed exactly as Phase 0 stated:

- `callInitialRead(input: CallInitialReadInput)` —
  `apps/web/app/api/triage/_lib/anthropic.ts:163`. `CallInitialReadInput`
  (line 46) = `{ apiKey: string; model?: string; baseURL?: string;
system: string; userText: string; images: Base64Image[]; timeoutMs?: number }`.
  Returns the raw Anthropic SDK Messages response. `buildUserContent`
  (line 143) emits only the text block when `images: []`, so text-only works.
- `DEFAULT_TRIAGE_MODEL = 'claude-sonnet-4-6'` (`anthropic.ts:27`). Model
  resolves as `input.model ?? DEFAULT_TRIAGE_MODEL` (line 171); `baseURL`
  passed through to the SDK constructor (line 166).
- `resolveSystemPrompt(opts?)` —
  `apps/web/app/api/triage/_lib/prompt.ts:54`. Returns the trimmed non-empty
  `TRIAGE_SYSTEM_PROMPT` env override, else `DEFAULT_TRIAGE_SYSTEM_PROMPT`.
- `SEVERITY_VALUES` = `['cosmetic','monitor','soon','urgent']`
  (`parse-tool-output.ts:17`). `SYSTEM_TAG_VALUES` = 9 values
  `['plumbing','electrical','hvac','roof','exterior','interior','appliance',
'safety','other']` (line 25). `CONTRACTOR_TAG_VALUES` = 8 values incl `'diy'`
  `['diy','handyman','plumber','electrician','hvac_tech','roofer',
'general_contractor','specialist']` (line 38). Exported types `Severity`,
  `SystemTag`, `ContractorTag` (lines 49–51). `RecordInitialRead` (line 53)
  carries `severity_provisional: Severity`, `contractor_tag_proposed:
ContractorTag`, `system_tag_proposed: SystemTag`.
- `Base64Image` (`apps/web/app/api/triage/_lib/photos.ts:19`) =
  `{ media_type: 'image/jpeg'; data: string }`.

**Server-only-import audit (Gotcha (a)):** grep for `next/headers`,
`next/server`, `cookies()`, `server-only`, `createServerClient`,
`supabase/server` across `anthropic.ts`, `prompt.ts`, `parse-tool-output.ts`
returned **zero hits** — all three are pure modules safe to import from a
`tsx`-run script. The only cross-module import the runner pulls is
`anthropic.ts → import type { Base64Image } from './photos'` (line 17). That is
a **type-only import** (erased at compile, no runtime side-effect), so
`photos.ts`'s `@sentry/nextjs` + `@supabase/supabase-js` imports are NOT pulled
into the runner's runtime graph. The runner constructs `images: []` literally
and never imports `photos.ts` for value. Net: the runner's runtime import
closure is `anthropic.ts` (+ the `@anthropic-ai/sdk` it already depends on) +
`prompt.ts` + `parse-tool-output.ts` — all Next-server-free.

`resolveJsonModule: true` is set in `tsconfig.base.json:7`, so
`import dataset from './dataset.json'` resolves under both `tsx` and vitest.

---

## In scope

New directory `apps/web/eval/triage/` (4 files) + 2 colocated test files + a
`package.json` change + a doc note:

| File                                   | Purpose                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/eval/triage/types.ts`        | `DatasetEntry`, `Prediction`, `ScoreReport` TS types + the `categoryToSystemTag` map (T1)                                 |
| `apps/web/eval/triage/dataset.json`    | 75 labeled synthetic home-issue entries (T2)                                                                              |
| `apps/web/eval/triage/score.ts`        | Pure scoring functions — exact / adjacency / path / aggregate (T3)                                                        |
| `apps/web/eval/triage/score.test.ts`   | Deterministic unit tests for scoring math + threshold boundaries (T3)                                                     |
| `apps/web/eval/triage/dataset.test.ts` | Dataset-integrity unit tests (count, uniqueness, enum membership, balance) (T4)                                           |
| `apps/web/eval/triage/run.ts`          | Operator-run accuracy harness — loads dataset, calls live triage, scores, prints report, exits non-zero on gate fail (T5) |
| `apps/web/eval/triage/README.md`       | How to run, what the thresholds mean, how to add/correct labels (T6)                                                      |
| `apps/web/package.json`                | Add `"eval:triage": "tsx eval/triage/run.ts"` script + `tsx` devDependency (T5)                                           |
| `apps/web/vitest.config.ts`            | Add `'eval/**/*.test.ts'` to `test.include` (T3)                                                                          |
| Doc note                               | One paragraph in `apps/web/README.md` (triage section) pointing at the eval harness as the pre-prompt-change gate (T6)    |

### Explicitly OUT of scope

- **The triage prompt itself.** This PR does not touch
  `DEFAULT_TRIAGE_SYSTEM_PROMPT`, the tool schema, or any `_lib` logic. The eval
  is a read-only consumer of the shipped prompt.
- **Any UI.** No React, no routes, no PWA surface. There is no
  `## Render conditions` section because the diff adds zero JSX/TSX.
- **Any DB / migration.** No schema change, no RPC, no RLS.
- **Any CI workflow change.** The runner is operator-invoked only (D6). No
  `.github/workflows/*.yml` edit. The _only_ CI-touching change is the vitest
  `include` widening, which makes the two new `*.test.ts` files run in the
  existing fast job — it does **not** add an API-calling step to CI.
- **Geocoding, multi-turn Q&A eval, image-based eval.** Text-only initial-read
  scoring only (`images: []`). Q&A-round and photo-grounded eval are future work.

---

## Data model changes

None. No Postgres schema, enum, RPC, or RLS change. The dataset is a flat JSON
file; the only "schema" is the TS `DatasetEntry` type.

### Dataset entry schema (`types.ts`, T1)

```ts
import type {
  Severity,
  SystemTag,
} from '@/app/api/triage/_lib/parse-tool-output';

/** The 9 contractor categories the dataset is balanced across (D4). */
export const CATEGORIES = [
  'HVAC',
  'Plumbing',
  'Electrical',
  'Structural',
  'Roof',
  'Pool',
  'Pest',
  'Landscaping',
  'General',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** DIY-vs-hire label + predicted path. */
export type Path = 'diy' | 'hire';

export type DatasetEntry = {
  id: string; // e.g. "hvac-01" — unique, lowercase category-prefix + 2-digit index
  category: Category;
  description: string; // synthetic homeowner issue text (the userText fed to the model)
  label_severity: Severity; // ∈ SEVERITY_VALUES
  label_path: Path; // diy | hire — the gated path label
  label_system_tag: SystemTag; // ∈ SYSTEM_TAG_VALUES — reported-only, NOT gated
  rationale: string; // one-line human justification for the labels (review aid, not scored)
};
```

**Category → expected `system_tag` mapping** the dataset author uses to set
`label_system_tag`. `label_system_tag` is **reported-only** (D2) — this map is a
labeling aid, never a gate, so a defensible deviation per-entry is allowed (the
`rationale` should note it). The map intentionally collapses categories that
have no dedicated `system_tag` enum value onto the closest fit:

| Category    | Default `label_system_tag` | Note                                                                         |
| ----------- | -------------------------- | ---------------------------------------------------------------------------- |
| HVAC        | `hvac`                     | direct                                                                       |
| Plumbing    | `plumbing`                 | direct                                                                       |
| Electrical  | `electrical`               | direct                                                                       |
| Roof        | `roof`                     | direct                                                                       |
| Structural  | `exterior`                 | foundation/framing/siding → exterior; interior cracks → `interior` per-entry |
| Pool        | `other`                    | no pool enum value; specialist domain                                        |
| Pest        | `other`                    | no pest enum value                                                           |
| Landscaping | `exterior`                 | grading/drainage/trees → exterior                                            |
| General     | `interior` or `other`      | catch-all; pick the closest per-entry                                        |

The `categoryToSystemTag` constant in `types.ts` encodes the single-value
defaults (`Structural→exterior`, `General→other`) so `dataset.test.ts` can
assert each entry's `label_system_tag` is a _legal_ `SystemTag`, without
asserting it equals the category default (deviations allowed).

### Balance (D4)

75 entries, ~8–9 per category. Concretely: **6 categories × 8 + 3 categories × 9
= 48 + 27 = 75.** `dataset.test.ts` enforces a per-category minimum of **≥ 7**
(headroom below the 8 target so a one-off rebalance doesn't break the test) and
total `=== 75`.

---

## API / function contracts

### `score.ts` (pure, no I/O) — T3

```ts
import type { Severity } from '@/app/api/triage/_lib/parse-tool-output';
import type { DatasetEntry, Path } from './types';

/** Model's prediction for one entry, derived from RecordInitialRead. */
export type Prediction = {
  severity_provisional: Severity;
  path: Path; // 'diy' iff contractor_tag_proposed === 'diy', else 'hire'
};

/** Severity ordinal for adjacency math: cosmetic<monitor<soon<urgent. */
export const SEVERITY_ORDINAL: Record<Severity, number>; // cosmetic=0..urgent=3

/** True iff predicted severity === label severity. */
export function severityExact(pred: Severity, label: Severity): boolean;

/** True iff |ordinal(pred) - ordinal(label)| <= 1 (includes exact). */
export function severityAdjacent(pred: Severity, label: Severity): boolean;

/** True iff predicted path === label path. */
export function pathMatch(pred: Path, label: Path): boolean;

/** Derive the DIY-vs-hire path from the parsed contractor tag (D2). */
export function pathFromContractorTag(tag: string): Path; // 'diy' → 'diy', else 'hire'

/** Per-entry scored result (one row of the report). */
export type EntryResult = {
  id: string;
  category: Category;
  ok: boolean; // false ⇒ this entry was an API/parse error (counts as a miss)
  label_severity: Severity;
  pred_severity: Severity | null; // null on error
  severity_exact: boolean;
  severity_adjacent: boolean;
  label_path: Path;
  pred_path: Path | null; // null on error
  path_correct: boolean;
  label_system_tag: SystemTag;
  pred_system_tag: SystemTag | null; // reported-only
  system_tag_correct: boolean; // reported-only
  error?: string; // present iff ok === false
};

export type Thresholds = { severityExact: number; path: number }; // D7 defaults below

export const DEFAULT_THRESHOLDS: Thresholds; // { severityExact: 0.70, path: 0.85 }

export type CategoryStats = {
  category: Category;
  n: number;
  severityExactRate: number;
  severityAdjacentRate: number;
  pathAccuracy: number;
  systemTagAccuracy: number; // reported-only
};

export type ScoreReport = {
  perCategory: CategoryStats[];
  overall: {
    n: number;
    errors: number; // entries that failed API/parse (counted as misses)
    severityExactRate: number;
    severityAdjacentRate: number;
    pathAccuracy: number;
    systemTagAccuracy: number; // reported-only
  };
  thresholds: Thresholds;
  passed: boolean; // overall.severityExactRate >= t.severityExact
  //   && overall.pathAccuracy >= t.path
};

/** Aggregate EntryResult[] into a ScoreReport given thresholds. Pure;
 *  errors count toward the denominator (a miss), never silently dropped. */
export function aggregate(
  results: EntryResult[],
  thresholds: Thresholds
): ScoreReport;
```

**Gated metrics (D2, D7):** `overall.severityExactRate >= 0.70` AND
`overall.pathAccuracy >= 0.85`. Adjacency + per-category + system-tag accuracy
are reported, never gated. `passed` is computed against `overall` only;
per-category rates are diagnostic.

### `run.ts` (operator harness) — T5

Behavior, in order:

1. Read `process.env.ANTHROPIC_API_KEY`. If unset/empty → print a clear error
   (`ANTHROPIC_API_KEY is required to run the triage eval`) and `process.exit(1)`
   **before any API call**.
2. Resolve optional `process.env.ANTHROPIC_MODEL` (→ `model`),
   `process.env.ANTHROPIC_BASE_URL` (→ `baseURL`, the mock seam), and threshold
   overrides via `process.env.EVAL_SEVERITY_THRESHOLD` /
   `process.env.EVAL_PATH_THRESHOLD` (fall back to `DEFAULT_THRESHOLDS`, D7).
3. `import dataset from './dataset.json'` (typed as `DatasetEntry[]`).
4. Resolve the shipped system prompt once: `const system = resolveSystemPrompt();`.
5. For each entry, with **bounded concurrency** (see Gotchas; default
   `EVAL_CONCURRENCY = 4`, sequential when set to 1):
   - `const res = await callInitialRead({ apiKey, model, baseURL, system,
userText: entry.description, images: [] });`
   - Pull the `record_initial_read` tool_use block from `res.content`, pass its
     `.input` to `parseInitialRead`. On `{ ok: false }` or thrown API error:
     build an `EntryResult` with `ok: false`, `error: <message>`, all
     `*_correct: false` (counts as a miss), `console.warn` the entry id + reason,
     and **continue** — one bad entry never crashes the run.
   - On `{ ok: true }`: derive `Prediction` (`severity_provisional` straight
     through; `path = pathFromContractorTag(value.contractor_tag_proposed)`),
     score against the entry's labels into an `EntryResult`.
6. `const report = aggregate(results, thresholds);`
7. Print a per-category table + an overall row + the threshold line + a
   PASS/FAIL banner (plain `console.log`/`console.table`; no extra dep).
8. `process.exit(report.passed ? 0 : 1)`.

The runner imports app `_lib` modules via the `@/` alias
(`@/app/api/triage/_lib/anthropic`, `.../prompt`, `.../parse-tool-output`) — see
Gotcha (a) for the `tsx` path-resolution note.

---

## Offline behavior

N/A — this is a backend/tooling feature with no client, no remote-data UI, and
no PWA surface. The runner is an operator-run Node script that makes outbound
API calls; "offline" is not a meaningful state. The unit tests make zero
network calls.

---

## Metrics

No METRICS.md change. This feature adds no user action and fires no analytics
event (no PostHog, no new Sentry surface beyond the runner's `console.warn` on a
per-entry miss, which is operator-terminal output, not telemetry). The
metrics-confirmation step is intentionally skipped (instruction: backend/tooling
feature with no new metrics events).

---

## Core user story

N/A — operator tooling; no end-user flow added or modified. The harness is
invoked from a terminal by an engineer before a prompt change, not by a user.

---

## Tests

All tests are deterministic and make **zero** real API calls. They run in the
existing fast vitest job once `eval/**/*.test.ts` is added to the `include`
glob (see correction #2).

### `score.test.ts` (T3) — scoring math

- `severityExact`: equal → true; unequal → false (table over a few pairs).
- `severityAdjacent`: each off-by-one pair on `cosmetic<monitor<soon<urgent` →
  true (incl. exact); off-by-two/three → false. Assert
  `SEVERITY_ORDINAL.urgent - SEVERITY_ORDINAL.cosmetic === 3`.
- `pathFromContractorTag`: `'diy'` → `'diy'`; each of the other 7
  `CONTRACTOR_TAG_VALUES` → `'hire'`.
- `pathMatch`: matrix of `{diy,hire}×{diy,hire}`.
- `aggregate`: feed a hand-built `EntryResult[]` with known counts; assert
  per-category and overall rates equal the computed fractions; assert an
  `ok: false` entry is counted in the denominator as a miss (not dropped).
- **Threshold boundary:** construct results that land exactly on `0.70` severity
  / `0.85` path → `passed === true` (`>=`, inclusive); construct results one
  miss below each threshold → `passed === false`. Both gated metrics must pass
  for `passed`; a result that clears severity but fails path → `passed === false`.

### `dataset.test.ts` (T4) — dataset integrity

`import dataset from './dataset.json'` and assert:

- `dataset.length === 75`.
- every `id` is unique (Set size === length).
- every `id` matches `/^[a-z]+-\d{2}$/` (category-prefix + 2-digit).
- every `label_severity ∈ SEVERITY_VALUES`.
- every `label_path ∈ {'diy','hire'}`.
- every `label_system_tag ∈ SYSTEM_TAG_VALUES`.
- every `category ∈ CATEGORIES` (the 9).
- every `description` and `rationale` is a non-empty string.
- per-category count `>= 7` for all 9 categories (balance floor).

No test imports `run.ts` (it would pull `@anthropic-ai/sdk` and, more
importantly, would invite an accidental network call). Tests import only
`types.ts`, `score.ts`, `dataset.json`, and the enum constants from
`parse-tool-output.ts`.

---

## Dependencies

- **Add** `tsx` as a `devDependency` of `apps/web` (D9) — the only new package.
  Pin to a current major (e.g. `"tsx": "^4.0.0"`); it must not appear in
  production `dependencies`. `tsx` is a dev/runtime TS executor; it does not run
  at `next build` time and does not affect the shipped bundle.
- No runtime dependency added. The runner reuses the existing
  `@anthropic-ai/sdk@^0.96.0` transitively through `callInitialRead`.

---

## Task order

Flat (≤15 tasks). T3 and T4 are written test-first (the scoring math and dataset
shape are the deterministic contracts). Dependency-ordered to match the Phase 2
tracker:

1. **T1 — Schema + types.** Create `apps/web/eval/triage/types.ts`:
   `DatasetEntry`, `Category`/`CATEGORIES`, `Path`, `categoryToSystemTag`. Import
   `Severity`/`SystemTag` from `_lib/parse-tool-output`. Blocks every later task.
2. **T2 — Dataset.** Author `dataset.json` with 75 entries (6×8 + 3×9), balanced
   across the 9 categories, ids `^[a-z]+-\d{2}$`, labels per the
   category→system_tag map (deviations noted in `rationale`). (D8 — Claude
   generates; team reviews labels later.)
3. **T3 — Scoring + tests (test-first).** Write `score.test.ts` asserting the
   exact/adjacency/path/aggregate math + threshold boundaries, then `score.ts`
   to satisfy them. **In the same task, add `'eval/**/\*.test.ts'`to`apps/web/vitest.config.ts` `test.include`\*\* (correction #2) so the new tests
   actually run.
4. **T4 — Dataset integrity test.** Write `dataset.test.ts` (count===75, unique
   ids, enum membership, category balance ≥7). Run it against T2's dataset; fix
   any label/balance drift it catches.
5. **T5 — Runner + package.json.** Write `run.ts` per the runner contract
   (env-key guard, bounded concurrency, per-entry error tolerance, report table,
   non-zero exit on gate fail). Add `"eval:triage": "tsx eval/triage/run.ts"`
   script + `tsx` devDep to `apps/web/package.json`. Verify end-to-end against a
   mock via `ANTHROPIC_BASE_URL`.
6. **T6 — README + doc note.** Write `eval/triage/README.md` (how to run, what
   the thresholds mean, how to add/correct labels) + a one-paragraph note in
   `apps/web/README.md`'s triage section pointing at the harness as the
   pre-prompt-change regression gate.

---

## Gotchas

- **(a) `tsx` must resolve the `@/` alias into app `_lib` — and importing those
  modules must stay Next-server-free.** `run.ts` imports
  `@/app/api/triage/_lib/{anthropic,prompt,parse-tool-output}`. `tsx` reads
  `tsconfig.json` `paths` (`"@/*": ["./*"]`) when run from `apps/web`, so the
  `eval:triage` script must be invoked with `apps/web` as cwd (the
  `pnpm --filter web` script already sets that). If `tsx` does not pick up the
  alias in practice, fall back to a relative import
  (`../../app/api/triage/_lib/anthropic`) — the import graph is the same either
  way. The server-only audit (see § Spec-time code verification) confirms the
  three modules import nothing Next-server-only; `anthropic.ts`'s
  `import type { Base64Image }` from `photos.ts` is type-only and erased, so
  `photos.ts`'s `@sentry/nextjs`/`@supabase` imports never enter the runner's
  runtime graph. Do not add a value import of `photos.ts` to the runner.
- **(b) The accuracy run is non-deterministic and costs ~75 real API calls —
  never run it in CI.** Only the two `*.test.ts` files run in CI (deterministic,
  zero network). `run.ts` is operator-invoked (D6). Do not wire `eval:triage`
  into any workflow, pre-commit hook, or the vitest `include` (it has no
  `.test.ts` suffix, so the glob won't grab it — but don't add it manually
  either).
- **(c) `tsx` devDep must not break build/lint/typecheck.** It's dev-only and
  not imported by any app code path, so `next build` and `tsc --noEmit` ignore
  it. Confirm `pnpm --filter web typecheck` stays green after adding it (the new
  `.ts` files under `eval/` ARE type-checked — tsconfig `include` is
  `**/*.ts` — so they must be strict-clean: `noUncheckedIndexedAccess` is on,
  mind array indexing in `score.ts`/`run.ts`).
- **(d) `dataset.json` is large (~75 entries) but it's plain JSON.** ESLint
  doesn't lint `.json`; Prettier may reformat it (fine). `resolveJsonModule` is
  on, so both vitest and tsx import it without a loader. No lint will choke on
  it.
- **(e) Reading the tool_use block in `run.ts`.** `callInitialRead` returns the
  raw SDK response; find the content block with `type === 'tool_use'` and
  `name === RECORD_INITIAL_READ_TOOL_NAME` (exported from `anthropic.ts`), then
  pass its `.input` to `parseInitialRead`. A response with no such block (model
  refused) is an `ok: false` EntryResult, not a crash — mirror the route
  handler's trust-boundary posture.

---

## Acceptance / rollout / rollback

**Acceptance:**

1. `pnpm --filter web test:unit` is green, including the new `score.test.ts` and
   `dataset.test.ts` (verify they actually execute — the run count rises by the
   number of new tests; this is the proof correction #2 landed).
2. `pnpm --filter web typecheck` is green (the new `eval/**/*.ts` files included).
3. `pnpm --filter web eval:triage` runs end-to-end and prints a per-category +
   overall report with a PASS/FAIL banner — exercised against a mock
   (`ANTHROPIC_BASE_URL` pointing at a local stub) for the acceptance check, or a
   real `ANTHROPIC_API_KEY` for a true accuracy read. Exit code is `0` on pass,
   `1` on a gated-metric miss.
4. `pnpm --filter web lint` is green.

**Rollout:** Pure additive — a new `eval/triage/` directory, two
`package.json` lines (script + devDep), and one `vitest.config.ts` include line.
No migration, no env var required for CI (the unit tests need none), no deploy
step. The `eval:triage` accuracy run is a manual operator action gated on having
`ANTHROPIC_API_KEY` in the local environment; it is documented in the new
README, not automated.

**Rollback:** Revert the commit. No data, schema, or prod-runtime impact — the
shipped app never imports `eval/`. Removing the directory + the two
`package.json` lines + the vitest include line fully reverses the change; CI
returns to its prior test count with no orphaned references.
