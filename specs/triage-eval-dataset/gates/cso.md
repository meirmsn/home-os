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
