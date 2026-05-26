# CLAUDE.md

> **Orientation**: drill in on demand.
>
> - **Foundational** (what / how): [`OVERVIEW.md`](./OVERVIEW.md) (product) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) (system). Per-area detail: [`apps/web/README.md`](./apps/web/README.md), [`supabase/README.md`](./supabase/README.md), [`packages/core/README.md`](./packages/core/README.md), [`packages/ui/README.md`](./packages/ui/README.md).
> - **Operational** (project state): [`PLAN.md`](./PLAN.md), [`BUILD-LOG.md`](./BUILD-LOG.md), [`TODOS.md`](./TODOS.md), [`KNOWN-ISSUES.md`](./KNOWN-ISSUES.md), [`METRICS.md`](./METRICS.md), [`PRODUCT-ROADMAP.md`](./PRODUCT-ROADMAP.md).
> - **Deploy**: [`DEPLOY.md`](./DEPLOY.md).

## Project: home-os

Intelligent home maintenance companion. Captures a homeowner's issues (photo + description), triages them via a two-phase AI diagnostic conversation, helps the user decide between DIY and contractor paths, and tracks the lifecycle from capture through close. Calm authority, not anxiety amplifier — spiral prevention is an explicit design goal. PWA on the dark warm-charcoal ground.

## Stack

Next.js 16 (App Router, React 19) · Supabase (auth + Postgres + Realtime + edge functions) · Vercel · Tailwind v4 · Anthropic (triage). Full diagram + module map: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Gotchas

Project-specific silent-failure traps. For broader trap classes (`.trim()` on env vars, PostgREST `data:null` swallow, App Router layout-vs-page race, plpgsql OUT-parameter collisions, Supabase Cloud GRANT posture, Vercel env-var 4096-byte cap, LLM trust boundaries, calendar-date traps, etc.), see the devshop guides delivered via SessionStart hook (or `/devshop/kit/docs/guide/` in development environments). For broken-but-known user-facing behavior (Safari Private Browsing, SMTP rate limit), see [`KNOWN-ISSUES.md`](./KNOWN-ISSUES.md).

- **Q&A location dual-write to `users.location`: silent location-cache miss is tolerable, not 500-worthy.** When the prior turn was a location-ask, `POST /api/triage/answer` writes the user's answer in TWO places — first the `triage_conversations` row via `answer_triage_round` (atomic), then a separate UPDATE to `public.users.location` (best-effort, user-context client + RLS). **If the UPDATE fails after the round insert succeeds**: log a Sentry warning (not exception) and STILL return 200 — the round IS saved; the silent location-cache miss is tolerable since the next location-ask round will re-ask. Rolling the round insert back just because the secondary write failed would surface a "Q&A failed" error to the user when the Q&A actually succeeded. Single-direction failure is the right trade-off; the user-visible Q&A loop must not be hostage to the side-channel write. Pattern generalized in `kit/docs/guide/conventions.md § Side-channel write tolerance` (when that lift lands).

- **`users.location` is stored verbatim — no geocode, no normalization, no validation beyond `< 2000 char` truncation.** The user types free text (ZIP, city, neighborhood, "near downtown San Francisco"). Store the answer string verbatim in `users.location`. The Claude Q&A prompt receives `users.location` as-is per eng-review § Location handling — the AI interprets natural-language location like a smart human would. Geocoding is a v1 concern (precise-radius weather + zone-code queries); v0's posture locks the value-shape early so row #5 (`monitor-beta`) reading `users.location` doesn't trip over an unexpected JSON-vs-string split.

- **Photo-first-state-second ordering in `POST /api/card/[id]/close`: do NOT reorder.** The route uploads photo to Storage + INSERTs `card_photos` BEFORE calling `close_card` RPC. If the RPC fails after upload, an orphaned photo row exists but the card stays `planned` (recoverable — retry or manual cleanup). If the order were reversed, the card would close but the finished photo would be lost with no recovery path (`CLOSED` is terminal). The current order is the only safe one.

- **Dollar-to-cents float trap in close flow.** `CloseCardForm` converts dollars to cents via `Math.round(parseFloat(value) * 100)` — `Math.round` absorbs IEEE 754 float dust (e.g. `85.10 * 100 = 8509.999…` rounds to `8510`). `ClosedView` displays cents as `(actual_spend_cents / 100).toFixed(2)` — never `.toString()`, which drops trailing zeros (`"$85.5"` instead of `"$85.50"`).

- **Locked-jsonb-shape validation lives in TWO places (deliberate DRY-tension).** The same `DiyExpansion` + `ContractorExpansion` shapes from `decide-state` spec § D3 are validated at (a) LLM-output time in `apps/web/app/api/triage/_lib/parse-qa-output.ts` (the `confirm_assessment` tool's expansion fields) and (b) user-PATCH time in `apps/web/app/api/card/[id]/estimate/_lib/parse-estimate-override.ts` (the override jsonb). Both delegate to the shared module `apps/web/app/api/triage/_lib/estimate-shapes.ts` — `parseDiyExpansion` + `parseContractorExpansion`. Do NOT inline either validator at the call site; a shape drift in one path would silently let the other accept rejected shapes. The shared module is the contract; if it tightens, both trust boundaries get the update for free. Pattern: `kit/docs/guide/llm-trust-boundaries.md § Pattern 3`.

## Env Var Naming

| Base name                                          | GitHub Variable / Secret                                       | Vercel (`apps/web`)                                              |
| -------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| `SUPABASE_URL`                                     | `http://127.0.0.1:54321` (CI placeholder)                      | `NEXT_PUBLIC_SUPABASE_URL` = prod                                |
| `SUPABASE_ANON_KEY`                                | published local-stack JWT (CI)                                 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` = prod                           |
| `SUPABASE_PROD_URL`                                | prod URL (deploy workflows; sed-derives project ref)           | _(piped to `NEXT_PUBLIC_SUPABASE_URL` via `.devcontainer/.env`)_ |
| `SENTRY_DSN`                                       | secret                                                         | `NEXT_PUBLIC_SENTRY_DSN`                                         |
| `NEXT_PUBLIC_POSTHOG_KEY`                          | variable                                                       | `NEXT_PUBLIC_POSTHOG_KEY`                                        |
| `ANTHROPIC_API_KEY`                                | server-only secret (NOT `NEXT_PUBLIC_*`)                       | server-side runtime via Vercel env                               |
| `TRIAGE_SYSTEM_PROMPT` / `TRIAGE_QA_SYSTEM_PROMPT` | optional override ≤ 3500 chars (Vercel 4096-byte cap headroom) | optional override                                                |
| `ANTHROPIC_MODEL`                                  | default `claude-sonnet-4-6`                                    | optional override                                                |
| `ANTHROPIC_BASE_URL`                               | E2E test seam                                                  | _(not on Vercel)_                                                |

Per-surface env file: [`apps/web/.env.example`](./apps/web/.env.example). Naming convention rationale (base name in secrets, prefix per surface): `kit/docs/guide/ops.md § Env Var Naming Convention`.

## Migration Workflow

```bash
supabase migration new <name>   # create migration (workspace — fs only, no docker)
pnpm db:reset                   # apply locally (relay → supabase-runner)
pnpm db:gen-types               # regen types from local stack
pnpm db:advisor                 # DB hardening lints (run before shipping a migration)
# Migrations deploy via CI on push-to-main (.github/workflows/deploy-migrations.yml).
```

Migration history + RPC inventory + RLS posture: [`supabase/README.md`](./supabase/README.md). Migration conventions (ROLLBACK markers, plpgsql OUT-param collisions, enum rename-recreate, ON DELETE on `auth.users` FK, Supabase Cloud GRANT posture): `kit/docs/guide/migrations.md`.

**SQL conventions** (every migration enforces these; `pnpm db:advisor` checks mechanically):

1. **`SECURITY DEFINER` functions pin `search_path`**: `create function ... security definer set search_path = public, pg_temp as $$ ... $$;`. Without the pin, an unqualified call inside the body resolves through the caller's search path → schema-injection vector.
2. **RLS policies wrap `auth.uid()` in a subquery**: `using (owner_id = (select auth.uid()))`. Bare `auth.uid()` re-evaluates per row (10× slower at scale); the subquery lets Postgres initplan it once per statement.
3. **Every foreign key has a backing index** (or an `-- ADVISOR-EXEMPT(unindexed_foreign_key): <reason>` comment on the migration). Unindexed FKs scan the child table linearly on parent delete/update.

When a finding is intentional, annotate the migration with `-- ADVISOR-EXEMPT(<lint_name>): <reason>` to scope the exemption to that lint.

## Deploy

Vercel auto-on-push (preview per PR, prod on merge to `main`). Production URL: `https://home-os-nu-two.vercel.app`. Full deploy config, status commands, and dashboard follow-ups: [`DEPLOY.md`](./DEPLOY.md).
