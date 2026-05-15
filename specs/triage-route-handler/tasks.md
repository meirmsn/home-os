# Tasks — triage-route-handler

Decomposed from `spec.md § Task order`. Hard dependencies between rows; implement and commit atomically per row. Stop-and-ask items are all signed off in spec § Decisions (Phase 0), so no STOP AND ASK pauses expected during implementation.

---

## Task: Migration 007 — start_triage + complete_triage RPCs

**Hat**: Data
**Depends on**: none
**Blocks**: Regenerate types, all `_lib/*` tasks, route handler
**Done when**: `supabase/migrations/20260515HHMMSS_007_triage_route_handler.sql` applies cleanly via `pnpm db:reset`; both functions are visible in `public` schema.
**Risk**: medium (SECURITY DEFINER + state-transition)
**Status**: todo

## Task: Regenerate Supabase types

**Hat**: Data
**Depends on**: Migration 007
**Blocks**: all `_lib/*` tasks that use `Database` types
**Done when**: `packages/core/src/supabase.types.ts` has `start_triage` + `complete_triage` under `Database['public']['Functions']`.
**Risk**: low
**Status**: todo

## Task: Add @anthropic-ai/sdk dependency

**Hat**: BE
**Depends on**: none
**Blocks**: `_lib/anthropic.ts`
**Done when**: `apps/web/package.json` has `@anthropic-ai/sdk` in `dependencies`; pnpm-lock.yaml updated; `pnpm install` clean.
**Risk**: low
**Status**: todo

## Task: `_lib/prompt.ts` + test

**Hat**: BE
**Depends on**: none
**Blocks**: `_lib/anthropic.ts`, route handler
**Done when**: `DEFAULT_TRIAGE_SYSTEM_PROMPT` + `resolveSystemPrompt()` exist; unit tests cover trim-defense, fallback, default content keywords, length < 4096.
**Risk**: low
**Status**: todo

## Task: `_lib/photos.ts` + test

**Hat**: BE
**Depends on**: Regenerate types
**Blocks**: route handler
**Done when**: `fetchCardPhotosAsBase64()` returns `{media_type, data}[]` capped at 3, oldest-first; tests cover zero / one / four / partial-failure cases.
**Risk**: low
**Status**: todo

## Task: `_lib/parse-tool-output.ts` + test

**Hat**: BE
**Depends on**: Regenerate types
**Blocks**: route handler
**Done when**: `parseInitialRead()` runtime-validates the tool-use input against D3 schema and returns `RecordInitialRead | ParseError`. Tests cover happy path + every missing-field / bad-enum / malformed-sources / wrong-length-question case.
**Risk**: low
**Status**: todo

## Task: `_lib/anthropic.ts` + test (web_search verified)

**Hat**: BE
**Depends on**: Add SDK, `_lib/prompt.ts`
**Blocks**: route handler
**Done when**: `callInitialRead()` wraps the SDK Messages call with the verified `web_search` server-tool name (recorded in tasks.md § Decisions); tests assert call shape (model, system, messages, tools, tool_choice, max_tokens, timeout).
**Risk**: medium (SDK shape verification — see spec § Gotchas #1)
**Status**: todo

## Task: `POST /api/triage/route.ts` + test

**Hat**: BE
**Depends on**: All four `_lib/*` tasks + types regen
**Blocks**: StartTriage component, E2E
**Done when**: Route compiles + lint-clean + tests pass for all branches in spec § Tests #5 (401, 400, 404, 202, 409 already_triaged, 409 invalid_state on enum states, 409 invalid_state on race, 500 on RPC error, happy path, 502 invalid_output with revert, 429, 503 with revert, revert-failure double Sentry, p_user always === user.id).
**Risk**: high (the core trust boundary; depends on Phase 2 Decision about test seam)
**Status**: todo

## Task: `/(app)/cards/[id]/page.tsx` + test

**Hat**: FE
**Depends on**: Regenerate types
**Blocks**: StartTriage component (button mount surface), CaptureForm redirect
**Done when**: Server-rendered page reads `params.id` (awaited per Next 16); branches body per state; calls `notFound()` for missing/unowned card; tests cover 6-state matrix + ownership 404 + photo-or-placeholder.
**Risk**: medium (state-machine UI)
**Status**: todo

## Task: `<StartTriage />` client component + test

**Hat**: FE
**Depends on**: route handler, `/(app)/cards/[id]/page.tsx`
**Blocks**: none
**Done when**: Component POSTs to `/api/triage`, fires the three PostHog events per D10 with the right payloads, renders the right notice for each error class, refreshes on 202/409, retry-eligible banner on 5xx/429/network.
**Risk**: medium (event wiring)
**Status**: todo

## Task: CaptureForm redirect change

**Hat**: FE
**Depends on**: `/(app)/cards/[id]/page.tsx` (target exists)
**Blocks**: E2E
**Done when**: On 201, `router.push('/cards/<id>')` instead of `/home`; test updated.
**Risk**: low
**Status**: todo

## Task: Middleware GATED_PREFIXES extension + test

**Hat**: BE
**Depends on**: none
**Blocks**: E2E (anon-bounce assertion)
**Done when**: `/cards` + `/cards/<uuid>` anon → `/login?next=<path>`; authed → pass-through; tests added.
**Risk**: low
**Status**: todo

## Task: METRICS.md updates

**Hat**: PM
**Depends on**: none (rows already pre-registered per orchestrator instructions)
**Blocks**: pre-commit (filename match check)
**Done when**: METRICS.md rows 14–16 reference the canonical `StartTriage.tsx` path that the implementation creates (verify post-implementation).
**Risk**: low
**Status**: todo

## Task: .env.example wiring + BUILD-LOG note

**Hat**: BE
**Depends on**: none
**Blocks**: deploy
**Done when**: `apps/web/.env.example` contains `ANTHROPIC_API_KEY=`, commented `TRIAGE_SYSTEM_PROMPT=`, commented `ANTHROPIC_MODEL=`. BUILD-LOG mentions the new env vars + the CSP read-and-verify outcome from `next.config.ts`.
**Risk**: low
**Status**: todo

## Task: E2E spec — triage-route-handler.spec.ts

**Hat**: BE
**Depends on**: everything else
**Blocks**: none
**Done when**: Playwright spec covers happy path (Anthropic mocked via `page.route()` or test-seam), error revert, and the refresh-race 202.
**Risk**: medium (test seam strategy — Phase 2 Decision)
**Status**: todo

## Task: CLAUDE.md updates (§ Where Things Happen + § Gotchas)

**Hat**: PM
**Depends on**: all implementation tasks done
**Blocks**: pre-commit (docs-freshness check)
**Done when**: One entry per new path; three Gotchas entries per spec § Gotchas.
**Risk**: low
**Status**: todo

---

## Decisions

(Populated as judgment calls land during implementation.)
