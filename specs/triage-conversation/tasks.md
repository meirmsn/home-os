# Tasks: triage-conversation

Tracker for /ak-implement. One row per T-task from `spec.md § Task order`.

## T1 — Migration 010 (column adds + CHECK widen + backfill + 2 RPCs)

**Hat**: Data
**Depends on**: —
**Done when**: Migration file landed at `supabase/migrations/20260516HHMMSS_010_triage_conversation.sql`. Adds `cards.severity_confirmed`, `triage_conversations.{is_location_ask, tool_name}`, backfills `tool_name='record_initial_read'` on prior assistant rows, widens `triage_round_in_range` CHECK to 1..5, defines `answer_triage_round` + `confirm_triage` SECURITY DEFINER RPCs with column-qualified plpgsql bodies (PR #24 lesson applied preemptively).
**Risk**: medium
**Status**: done

## T2 — Regenerate `packages/core/src/supabase.types.ts`

**Hat**: Data
**Depends on**: T1
**Done when**: Generated types include `severity_confirmed`, `is_location_ask`, `tool_name`, `answer_triage_round`, `confirm_triage`. TS compile passes; route handler + components can import them.
**Risk**: low
**Status**: done

## T3 — `_lib/round-state.ts` + paired test

**Hat**: BE
**Depends on**: T2
**Done when**: `computeQaRoundState(rows)` exported as a pure-fn over thread rows. Six table-driven test cases.
**Risk**: low
**Status**: done

## T4 — `_lib/prompt-qa.ts` + paired test

**Hat**: BE
**Depends on**: —
**Done when**: `DEFAULT_QA_SYSTEM_PROMPT` + `resolveQaSystemPrompt()` exported; default ≤ 3500 chars. 4-ish prompt tests.
**Risk**: low
**Status**: done

## T5 — `_lib/parse-qa-output.ts` + paired test

**Hat**: BE
**Depends on**: —
**Done when**: Discriminated union returned per tool name; ParseError on every shape violation. ~25 cases.
**Risk**: low
**Status**: done

## T6 — `_lib/anthropic-qa.ts` + paired test

**Hat**: BE
**Depends on**: T5
**Done when**: `callQaTurn()` wraps SDK; `tool_choice` branches on `forceConfirm`. ~8 cases.
**Risk**: low
**Status**: done

## T7 — `POST /api/triage/answer/route.ts` + paired test

**Hat**: BE
**Depends on**: T2, T3, T4, T5, T6
**Done when**: Wires helpers; D10 envelope; dual-write on location turn; force-confirm on round-3 + skip. ~25 cases.
**Risk**: medium
**Status**: done

## T8 — `<ConversationRow />` server component + paired test

**Hat**: FE
**Depends on**: T2
**Done when**: Renders by `(role, tool_name)` discriminator; malformed JSON falls back gracefully. 7 cases.
**Risk**: low
**Status**: done

## T9 — `<QaThread />` server component + paired test

**Hat**: FE
**Depends on**: T8
**Done when**: Renders compact prior thread; nothing-to-show case handled. 3 cases.
**Risk**: low
**Status**: done

## T10 — `<DiagnosedThread />` server component + paired test

**Hat**: FE
**Depends on**: T8
**Done when**: Renders confirmed-state body; `<details>` collapsible closed by default. 5 cases.
**Risk**: low
**Status**: done

## T11 — `<AnswerThread />` client component + paired test

**Hat**: FE
**Depends on**: T7
**Done when**: Send + Skip wired; PostHog events fire on each response class; controlled-input survives 502/503/network. ~12 cases.
**Risk**: medium
**Status**: done

## T12 — `/(app)/cards/[id]/page.tsx` extension + test extension

**Hat**: FE
**Depends on**: T9, T10, T11
**Done when**: `severity_confirmed`-split body mounts the right sub-component; thread fetched once on the server. 3 new sub-state cases.
**Risk**: medium
**Status**: done

## T13 — METRICS.md append (4 events)

**Hat**: PM
**Depends on**: T11
**Done when**: Four new rows appended under `## Events`. Docs-freshness hook passes.
**Risk**: low
**Status**: done

## T14 — CLAUDE.md updates (Where Things Happen rows + Gotchas)

**Hat**: PM
**Depends on**: T1–T12
**Done when**: New rows for every new path; new Gotchas reflect spec § Gotchas.
**Risk**: low
**Status**: done

## T15 — `.env.example` (`TRIAGE_QA_SYSTEM_PROMPT`)

**Hat**: PM
**Depends on**: —
**Done when**: Commented entry present in `apps/web/.env.example`.
**Risk**: low
**Status**: done

## T16 — E2E `apps/web/e2e/triage-conversation.spec.ts`

**Hat**: BE
**Depends on**: T7, T11, T12
**Done when**: Five flows pass against local Supabase; skipped on non-local.
**Risk**: medium
**Status**: done

## Decisions

Judgment calls made during implementation (one-liner each).

- T1: Used `if not exists` guards on column adds, `drop constraint if exists` on the CHECK swap, `update ... where role='assistant' and tool_name is null and round = 1` on the backfill — all idempotent per spec § Rollout. Functions are `create or replace`. Column-qualified every reference in plpgsql bodies via `public.<table>.<col>` per PR #24 lesson + spec § Gotchas #1. `pnpm db:reset` applied cleanly via the supabase-runner relay.
- T2: `pnpm db:gen-types` against the working local stack regenerated `packages/core/src/supabase.types.ts` with the new columns + RPC signatures. Prettier-normalized after regeneration to match the repo's formatting convention (the supabase CLI generator emits no-semicolon style; prettier writes semicolons).
- T7: When the prior round was a location-ask AND `body.skip === true`, route still treats the priorWasLocationAsk path as not-applicable (no answer text to write to users.location); only the Send path with a body.answer dual-writes.
- T11: Used `triage_qa_failed.error_class = 'already_confirmed'` for the 409 already_confirmed branch (spec § Metrics table lists it as a valid error_class). The Skip button is hidden when `qaUserCount === 0` (round 0 — initial read just landed, no AI question answered yet) and shown from round ≥ 1.
- T12: When `severity_confirmed=true`, the page hides the existing PR #19 initial-read preview entirely and renders only `<DiagnosedThread />` per spec § Render conditions. When provisional + `qaUserCount > 0`, hides the PR #19 "what I need to know" preview list (the AI is mid-conversation; that list is stale) but keeps the severity chip + summary + sources preview.
- T16: E2E spec mirrors `triage-route-handler.spec.ts` shape (local-mock Anthropic via ANTHROPIC_BASE_URL, isLocalSupabase skip-guard). Cap test seeds 3 prior Q&A pairs (rounds 2/3/4); location test mocks the prior assistant row's `is_location_ask=true`; skip test asserts no user row inserted for the skip turn.
