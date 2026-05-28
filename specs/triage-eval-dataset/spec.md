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
