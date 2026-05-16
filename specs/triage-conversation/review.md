<!-- generated-by: /ak-pre-ship -->
<!-- audited-at: e941b246ddf28889da2d60217c49e0c2939725da -->

# Pre-ship review — triage-conversation

**Branch**: `feature/triage-conversation`
**Spec**: `specs/triage-conversation/spec.md`
**HEAD at audit start**: `e038e6d76e37cc2e05ef165c9af69269124e4315`
**HEAD at audit end**: `e941b246ddf28889da2d60217c49e0c2939725da`

## Summary

- `passed`: 8
- `findings_pending`: 0
- `n_a`: 2
- `blocked`: 3

Three in-band fixes landed during pre-ship:

1. Gate 2 — added two missing METRICS.md rows (AnswerThread fetch-network throw + ConversationRow fallback) — commit `9a2edbf`.
2. Gate 4 — dropped the unused `threadRows` param from `buildQaMessages` + filled in the orphan empty JSDoc above `safeParse` — commit `e941b24`.
3. `pnpm turbo run test:unit` rerun after each code-changing fix: 401 tests still pass across 45 files.

Two gates are `n/a` (Gate 8 design-review — no `DESIGN.md` in repo; Gate 10 benchmark — no perf-sensitive paths changed, the new route is Anthropic-bound and not meaningful to benchmark). Three gates are `blocked` (Gate 3 responsive + theme for the new surfaces; Gate 9 happy-path walkthrough; Gate 13 hero shots) — the local devcontainer lacks the auth-session + seeded-card combo to render `<AnswerThread />` / `<DiagnosedThread />` end-to-end; visual evidence will come from Vercel preview + the canonical CI slow-job running `apps/web/e2e/triage-conversation.spec.ts`.

---

## Gate 1: Docs check (CLAUDE.md § Where Things Happen)

**Status**: pass

`git diff main...HEAD -- CLAUDE.md` shows 9 new path-map rows + 4 new Gotchas:

- Migration 010 — column adds, CHECK widen, `answer_triage_round`, `confirm_triage`.
- `POST /api/triage/answer` route + four `_lib/*-qa.ts` helpers (round-state, prompt-qa, parse-qa-output, anthropic-qa).
- `<AnswerThread />`, `<DiagnosedThread />`, `<QaThread />`, `<ConversationRow />` components.
- Extended `Card detail page` row to mention the `severity_confirmed`-split body.
- `.env.example` `TRIAGE_QA_SYSTEM_PROMPT` row.
- E2E spec `apps/web/e2e/triage-conversation.spec.ts`.
- 4 new Gotchas: `is_location_ask` flag on both rows; location dual-write silent-miss tolerance; `users.location` verbatim; force-confirm + parse defense; migration 010 tool_name backfill predicate.

Hook validation: `bash /devshop/kit/scripts/commit-hooks/check-docs-coverage-project.sh` exits 0.

## Gate 2: METRICS.md check

**Status**: findings (2) [fixed]

Initial audit found two undocumented call sites:

- **Finding**: `Sentry.captureException` in `AnswerThread.tsx:148` (fetch network throw) — undocumented in METRICS.md.
- **Finding**: `Sentry.captureMessage('ConversationRow fallback', level: 'warning')` in `ConversationRow.tsx:72` — undocumented in METRICS.md.

Both fixed in commit `9a2edbf` (`docs(triage-conversation): add 2 missing METRICS rows ...`). Now METRICS.md carries one row per call site for the four PostHog events + four Sentry surfaces (route-handler aggregate + force-confirm-defied + location-dual-write + AnswerThread fetch + ConversationRow fallback).

Hook validation: clean.

## Gate 3: Responsive + theme

**Status**: blocked

The new primary surfaces (`<AnswerThread />`, `<QaThread />`, `<DiagnosedThread />`) all live on `/cards/[id]` which requires (a) an authenticated session and (b) a seeded `diagnosed`-state card. The local devcontainer's Supabase stack isn't running (`pnpm db:start` not invoked this session) and no auth-session helper is wired into a stand-alone fixture page.

**Captured pipeline evidence** under `specs/triage-conversation/qa-walk/`:

- `login-mobile-375-dark.png` — proves Playwright + Chromium headless_shell are wired.
- `login-mobile-375-light.png`
- `login-desktop-1440-dark.png`
- `login-desktop-1440-light.png`

**Preflight recipe to unblock locally**:

```bash
# 1. Bring up local Supabase + apply migrations.
pnpm db:start && pnpm db:reset

# 2. Start dev server (already running on :3001 if you followed Gate 3).
cd apps/web && pnpm dev --port 3001 &

# 3. Use the password sign-in helper from e2e/helpers + admin-seed a
#    diagnosed-provisional card via adminClient(), then point Playwright
#    at the resulting /cards/<uuid> URL at 375 + 1440 in dark + light.
#    See apps/web/e2e/triage-conversation.spec.ts for the seed pattern.

# 4. Capture per Gate 13 hero-shots recipe (below).
```

**Canonical evidence surface**: Vercel preview deploy on the PR + the slow-job E2E spec at `apps/web/e2e/triage-conversation.spec.ts` which runs the full surface against local Supabase + the `ANTHROPIC_BASE_URL` mock.

## Gate 4: /simplify

**Status**: findings (2) [fixed]

Audited the 6 largest new files (`route.ts`, `parse-qa-output.ts`, `anthropic-qa.ts`, `round-state.ts`, `AnswerThread.tsx`, `ConversationRow.tsx`):

- **Finding**: `route.ts buildQaMessages` accepted both `threadRows` (unused — swept under `void threadRows;` with a "keep parameter live for future use" comment) and `threadContents` (the aggregated map it actually read from). The unused parameter was a code smell promising work that wasn't planned.
- **Finding**: `ConversationRow.tsx safeParse` had an empty `/** \n * \n */` JSDoc above it.

Both fixed in commit `e941b24` (`refactor(triage-conversation): drop unused threadRows param + flesh out safeParse jsdoc`). Tests still pass (401 across 45 files).

Other audit observations (intentional, not flagged):

- `<DiagnosedThread />` reimplements `severityChipClass` rather than importing from `page.tsx`. Acceptable — `page.tsx`'s helper isn't exported, and a shared module would be over-extraction for two call sites.
- `data-testid="location-tag"` appears in both UserRow and AssistantRow (`ConversationRow.tsx`). Tests depend on the selector in both surfaces; deduping would require a wrapper component. Acceptable as-is.

## Gate 5: /ak-check-docs-and-tests

**Status**: pass (see `## Audit 1` below)

Both `check-docs-coverage-project.sh` and `check-tests-coverage-project.sh` exit 0 on the diff. Detailed audit findings appended below.

## Gate 6: /review (pre-landing diff review)

**Status**: pass

Audited migration 010 SQL + the route handler + the page integration + the E2E spec.

**SQL safety** (migration 010):

- All schema mutations + RPC creates are idempotent (`add column if not exists`, `drop constraint if exists`, `create or replace function`).
- Column-qualified references in WHERE / SET / RETURNING (applied preemptively per PR #24's lesson; spec § Gotchas #1).
- Both new RPCs are `SECURITY DEFINER` with `set search_path = public, pg_catalog` AND internally guard `p_user is distinct from auth.uid()` (matches the `start_triage`/`complete_triage`/`claim_card_slot` posture).
- Predicate-guards on `state='diagnosed' AND severity_confirmed=false` prevent concurrent-confirm races.
- Rollback block documented at the bottom of the file.
- GRANT inheritance: column adds inherit existing table GRANTs (set by migration 008); new RPCs inherit PUBLIC EXECUTE (Postgres default). Same pattern as 006b + 007 which work in prod.

**LLM trust boundary** (`POST /api/triage/answer`):

- `p_user` always derives from `getUser().id` — body never trusted (spec § Gotchas #10 applied).
- `parseQaTurn` is the only seam between the SDK response and the DB; on ParseError → 502 + Sentry + NO DB write (clean retries per D10).
- Force-confirm contract is double-enforced server-side: `tool_choice` forces, AND the route still validates `parsed.tool === 'confirm_assessment'` after parse — defying-the-force returns 502 + Sentry warning (spec § Gotchas #3).
- 429 path: read `retry-after` header, no Sentry (expected backpressure). 5xx / network / timeout: Sentry capture, 503 envelope.

**Conditional side-effects**:

- Dual-write to `users.location` is gated on `roundState.priorWasLocationAsk && 'answer' in parsedBody && parsedBody.answer` — the `answer.length >= 1` is already enforced upstream by `validateBody`, so the truthy check is defensive belt-and-suspenders. Failure of the secondary write captures a Sentry warning but does NOT roll back the round insert — single-direction failure tolerated per spec § Gotchas #5.

**Structural issues**: none.

## Gate 7: /cso (security audit)

**Status**: pass

Focus areas per the orchestrator brief, each verified:

- **(a) Dual-write to `users.location` under user RLS** — the route uses the user-context `createClient()` for the UPDATE; RLS policy from migration 003 (`auth.uid() = id`) gates the row. A malicious user can't update another user's row. ✓
- **(b) Both SECURITY DEFINER RPCs internally guard `p_user = auth.uid()`** — verified in migration 010 lines 77–79 (`answer_triage_round`) and 140–142 (`confirm_triage`). Matches the `start_triage`/`complete_triage` posture from migration 007. ✓
- **(c) Privilege grant gaps** — column adds inherit existing table GRANTs from migration 008. New RPCs inherit Postgres's default PUBLIC EXECUTE (same as 006b / 007 / 009 — all confirmed working in prod post-008). No explicit GRANT required. ✓
- **(d) Server-forced `tool_choice` path** — `tool_choice: { type: 'tool', name: 'confirm_assessment' }` is server-side cap. After the SDK call the route validates `parsed.tool === 'confirm_assessment'`; on mismatch returns 502 + Sentry warning + no DB write. ✓
- **(e) Two-tool `tool_choice: 'auto'` failure modes** — `parseQaTurn` handles all three: no `tool_use` block; unknown tool name; malformed input. All → ParseError → 502 + Sentry + no DB write. ✓
- **(f) Sentry diagnostic PII** — audited every `extra:` field. Only carries `card_id` / `user_id` (UUIDs), `raw_response_id` (Anthropic msg id), `force_confirm` (bool), `tool_returned` (enum). No user-text content, no email, no API keys. ✓

**Additional checks**:

- SQL injection — both RPCs take typed parameters (`uuid`, `text`, enums). plpgsql parameterized inputs preclude injection. ✓
- API-key scoping — `ANTHROPIC_API_KEY` is server-only (NOT `NEXT_PUBLIC_*`); `TRIAGE_QA_SYSTEM_PROMPT` likewise. ✓
- Route handler `dynamic = 'force-dynamic'` — prevents accidental static caching of authenticated paths. ✓

## Gate 8: /design-review

**Status**: n/a

No `DESIGN.md` in repo (`find /workspace -maxdepth 3 -name "DESIGN.md"` → no result). Per the skill's "n/a if no DESIGN.md" clause.

## Gate 9: /qa (happy-path walkthrough)

**Status**: blocked

Reasons:

- The local Supabase stack isn't running in this session.
- The new screens (`<AnswerThread />`, `<DiagnosedThread />`) require a seeded `diagnosed`-state card + an authenticated session.
- The Anthropic mock (`ANTHROPIC_BASE_URL` test seam) is set up only inside the Playwright E2E (`apps/web/e2e/triage-conversation.spec.ts`).

**Preflight recipe to unblock locally**:

```bash
pnpm db:start && pnpm db:reset
SUPABASE_URL=http://127.0.0.1:54421 \
SUPABASE_SERVICE_ROLE_KEY=<local-service-role> \
SUPABASE_ANON_KEY=<local-anon> \
  pnpm --filter @home-os/web exec playwright test e2e/triage-conversation.spec.ts
```

**Canonical evidence surface**: CI slow-job. The E2E spec covers all five Acceptance flows (single-round confirm, 3-round force-confirm, location-ask + dual-write, skip path, 503 retry). Skip-on-non-local via `test.skip(!isLocalSupabase, …)`.

## Gate 10: /benchmark

**Status**: n/a

The new code paths are either:

- Anthropic-bound (route handler — latency dominated by 5–12s p50 Anthropic call; benchmarking the wrapper doesn't move the needle).
- Pure-function helpers sub-millisecond on representative inputs (round-state, parse-qa-output).
- Additive server-rendered components (DiagnosedThread, QaThread, ConversationRow — incremental to existing /cards/[id] SSR cost).

No perf-sensitive bottleneck introduced. Bundle-size impact is the only meaningful axis and is dominated by the existing `@anthropic-ai/sdk` import (already counted by PR #19's bundle).

## Gate 11: Convention check

**Status**: pass

Spot-checks against `kit/docs/guide/conventions.md`:

- **File headers** — every new `.ts`/`.tsx` file carries `// What: / Why: / Does NOT:` header (grep confirms 9/9 new sources + 9/9 new tests).
- **Migration header** — migration 010 has a 30-line `--` comment block describing each schema change + rationale + idempotency contract (matches the 007 / 008 / 009 pattern).
- **Test presence** — every new source file under `apps/web/app/` has a paired `*.test.{ts,tsx}` (route + 4 \_lib helpers + 4 components). No `.devshop-test-coverage-exempt` additions needed.
- **LLM runtime validation** — `parse-qa-output.parseQaTurn` is the trust boundary; returns a discriminated `{ok:true,tool,value} | ParseError` so callers can dispatch without try/catch (matches the `parseInitialRead` posture from PR #19).
- **PostHog event naming** — four new events follow the `<feature>_<verb>_<state>` shape (`triage_qa_round_started` / `_completed` / `_failed` + `triage_qa_confirmed`), mirroring the initial-read triad.
- **Sentry tags** — every `Sentry.captureException` / `captureMessage` carries a `route` or `surface` tag + a `stage` discriminator, enabling per-stage dashboard slicing.
- **`.trim()` on every `process.env` read** — verified in the route (3 reads) + the wrapper.
- **Server-only env** — `ANTHROPIC_API_KEY` + `TRIAGE_QA_SYSTEM_PROMPT` + `ANTHROPIC_MODEL` + `ANTHROPIC_BASE_URL` all server-side (no `NEXT_PUBLIC_*` prefix).

## Gate 12: Preflight final

**Status**: pass

Final tooling sanity after all in-band fixes:

```
pnpm turbo run typecheck   → 3 successful, 3 cached (>>> FULL TURBO)
pnpm turbo run test:unit   → 401 tests passed across 45 test files
```

Pre-commit hooks (gitleaks + lint-staged + docs/tests coverage checks) all green on both in-band commits.

## Gate 13: Hero shots

**Status**: blocked

Hero shots intended for the PR body would be:

1. `/cards/[id]` in `severity_confirmed=false + qaUserCount=1` state — shows the compact `<QaThread />` + the active `<AnswerThread />` together.
2. `/cards/[id]` in `severity_confirmed=true` state — shows the `<DiagnosedThread />` confirmed-severity chip + monitoring cadence + the `<details>` collapsible expanded.

Both require auth + seed identical to Gate 9. Same preflight recipe applies.

**Alternative path used during Gate 3**: pipeline shots of `/login` at 375 + 1440 in dark + light proving Playwright + Chromium are wired locally. See `specs/triage-conversation/qa-walk/login-*.png`. The PR body's hero shots will pull from Vercel preview once the PR opens.

---

## Audit 1

<!-- audited-at: e941b246ddf28889da2d60217c49e0c2939725da -->

findings: high=0 medium=0 low=2

Commit range audited: `129a9d1..e941b24` (17 commits — full feature branch).

### Docs review

**Coverage**:

- CLAUDE.md § Where Things Happen has rows for every new surface (route, 4 helpers, 4 components, migration 010, env var, E2E). ✓
- CLAUDE.md § Gotchas has 4 new entries covering the spec's surfaced gotchas (`is_location_ask` flag on both rows, location dual-write silent-miss, `users.location` verbatim, force-confirm + parse defense, migration 010 backfill predicate). ✓
- METRICS.md has rows for the 4 PostHog events + 4 Sentry surfaces (post-Gate-2 fix). ✓
- ARCHITECTURE.md module map mentions `/api/triage/answer` + the new components. ✓
- PLAN.md row #1 promoted from Planned to Active. ✓

**Adequacy**:

- The route's force-confirm contract is described in CLAUDE.md § Gotchas. ✓
- The dual-write trust posture is documented (silent-miss tolerable, Sentry warning). ✓
- The PR #19 cross-references are explicit (Gotchas #1 PR #24 lesson, Gotchas #2 `parseInitialRead` mirror, anthropic-qa reuses `WEB_SEARCH_TOOL_TYPE`). ✓

**Coherence**:

- The 9 path-map rows follow the established naming pattern (`<feature>:` `<file>` — `<one-line summary> (D<N>)`). ✓
- The 4 Gotchas all open with a one-sentence headline + paragraph rationale. ✓

**Low findings** (post-merge optional):

- (L1) The CLAUDE.md row for the card-detail-page extension cross-references `<AnswerThread />` + `<DiagnosedThread />` + `<QaThread />` but doesn't itemize which `severity_confirmed × qaUserCount` combinations render which sub-tree. The render-conditions table from `spec.md § Screens` would be useful inline in CLAUDE.md. Defer until row #2 (`decide-state`) re-rewrites the body anyway.
- (L2) The `_lib/anthropic-qa.ts` doc-comment in CLAUDE.md mentions `DEFAULT_TRIAGE_MODEL` + `WEB_SEARCH_TOOL_TYPE` reuse but doesn't call out that `ASK_NEXT_QUESTION_TOOL_NAME` + `CONFIRM_ASSESSMENT_TOOL_NAME` are NEW constants. Minor.

### Tests review

**Coverage** (matched to spec § Tests):

- `round-state.test.ts` — 8 cases (spec specified ~6; actuals exceed). ✓
- `prompt-qa.test.ts` — 13 cases (spec specified 4; actuals exceed — env override resolver, length bound, keyword smoke). ✓
- `parse-qa-output.test.ts` — 34 cases (spec specified ~25; covers both happy paths + every field violation × 2 tools). ✓
- `anthropic-qa.test.ts` — 15 cases (spec specified ~8). ✓
- `route.test.ts` — 33 cases (spec specified ~25; covers all branches including force-defied, dual-write fail, P0001 races). ✓
- `ConversationRow.test.tsx` — 9 cases (spec specified 7). ✓
- `QaThread.test.tsx` — 4 cases (spec specified 3). ✓
- `DiagnosedThread.test.tsx` — 7 cases (spec specified 5). ✓
- `AnswerThread.test.tsx` — 14 cases (spec specified ~12). ✓
- `page.test.tsx` — 19 cases (3 net new for severity_confirmed-split body; matches spec). ✓
- `triage-conversation.spec.ts` E2E — 5 flows × ~6 assertions each (matches D11 + spec § E2E). ✓

**Quality**:

- Mock isolation — `route.test.ts` mocks `@anthropic-ai/sdk`, `createClient`, and the four `_lib/*-qa.ts` helpers. Boundaries are crisp.
- `AnswerThread.test.tsx` asserts the four PostHog events × the right response classes × the right `error_class` mapping.
- The E2E spec uses the same `ANTHROPIC_BASE_URL` local-mock pattern from `triage-route-handler.spec.ts` + `adminClient()` for seeding — Pattern 3 honored.

**No findings.**
