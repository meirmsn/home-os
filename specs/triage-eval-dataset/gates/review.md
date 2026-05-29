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
