# supabase

> Postgres schema (migrations, RLS policies, RPCs, triggers, storage), Supabase config, edge functions. Backs `apps/web` via `@supabase/ssr` (browser + SSR clients) and route-handler-side SECURITY DEFINER RPCs.
>
> For system-level context (data flow, deployment): [`../ARCHITECTURE.md`](../ARCHITECTURE.md). For migration / RLS conventions: `kit/docs/guide/migrations.md` (delivered by the SessionStart hook for project sessions).

## Structure

```
supabase/
├── migrations/                # numbered .sql migrations, applied in lexical order
├── functions/                 # edge functions (currently none — populated when added)
├── snippets/                  # ad-hoc query scratchpad (gitignored content)
├── config.toml                # local Supabase stack config (auth, storage, etc.)
└── seed.sql                   # not used today — local stack starts empty
```

## Migrations

Applied via `pnpm db:reset` locally, deploy-migrations workflow in prod. Each migration is wrapped in a transaction by the runner — exceptions documented per-file where they matter.

| #    | File                                                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 001  | `20260513184100_001_enums.sql`                       | 7 native Postgres enums: `card_state`, `system_tag`, `severity`, `contractor_tag`, `touchpoint_type`, `photo_slot`, `triage_role`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 002  | `20260513184101_002_tables.sql`                      | 5 public-schema tables (`users`, `cards`, `triage_conversations`, `card_photos`, `usage_counters`) with FKs (`on delete cascade`), CHECK constraints (cards monitoring cadence + version; triage round 1-3; usage counters non-negative), indexes on every FK column + `cards.state`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 003  | `20260513184102_003_rls_tables.sql`                  | `ENABLE ROW LEVEL SECURITY` + 4 per-action policies on each of the 5 public tables (20 total). Predicate: `auth.uid() = id` for `users`; `auth.uid() = user_id` everywhere else.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 004  | `20260513184103_004_storage.sql`                     | Private `card-photos` bucket (idempotent `ON CONFLICT DO NOTHING`) + 4 `storage.objects` policies gated by `bucket_id = 'card-photos' AND (storage.foldername(name))[1] = auth.uid()::text`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 005  | `20260513184104_005_triggers.sql`                    | `create_public_user_profile()` SECURITY DEFINER (pinned `search_path`) + `on_auth_user_created` AFTER INSERT trigger on `auth.users`. `set_updated_at()` (generic) + `cards_updated_at` BEFORE UPDATE trigger on `public.cards`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 006a | `20260514030942_006a_card_state_dismissed.sql`       | Adds `'dismissed'` to `card_state` enum (idempotent `if not exists`). Lives alone in its own file because `ALTER TYPE ... ADD VALUE` cannot run inside a transaction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 006b | `20260514030943_006b_capture_flow.sql`               | Adds `cards.room_tag text`, `usage_counters.week_start date NOT NULL DEFAULT date_trunc('week', (now() at time zone 'utc'))::date`, `cards_description_max_length` CHECK (2000 chars), and the `claim_card_slot(p_user, p_title, p_description, p_system_tag, p_room_tag)` SECURITY DEFINER function. Function enforces `p_user = auth.uid()` internally (raises `42501` on mismatch — PostgREST maps to HTTP 403), atomically week-rolls the usage counter, raises `card_cap_reached` (P0001) at 20/wk, otherwise increments and inserts a card row in `state='capturing'`.                                                                                                                                                                                                                                                                                 |
| 007  | `20260515181530_007_triage_route_handler.sql`        | Adds `start_triage` + `complete_triage` SECURITY DEFINER RPCs (pinned `search_path`). Both internally guard `p_user = auth.uid()`. **NOTE**: original migration had OUT-parameter `state` colliding with `cards.state` in WHERE/RETURNING; superseded by 009.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 008  | `20260516090059_008_grant_table_privileges.sql`      | `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated` (Supabase Cloud doesn't ship this by default). Also explicit GRANT on existing tables. Fixes the prod-only 42501 trap (see § Gotchas in `kit/docs/guide/migrations.md`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 009  | `20260516093505_009_triage_rpc_column_ambiguity.sql` | Re-creates `start_triage` + `complete_triage` from 007 with explicit `cards.state` qualification in WHERE / RETURNING clauses (resolves `42702` ambiguous column reference). Verified empirically on Supabase Cloud — local stack appears to resolve ambiguity differently, masking the bug in slow-job.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 010  | `20260516111757_010_triage_conversation.sql`         | Adds `cards.severity_confirmed boolean not null default false`, `triage_conversations.is_location_ask boolean not null default false` + `tool_name text`, back-fills `tool_name='record_initial_read'` on pre-existing assistant rows (round=1 only). Widens `triage_round_in_range` CHECK from 1..3 to 1..5. Adds `answer_triage_round` + `confirm_triage` SECURITY DEFINER RPCs (pinned `search_path`). Every column ref in WHERE / SET / RETURNING uses `public.<table>.<col>` qualification.                                                                                                                                                                                                                                                                                                                                                             |
| 011  | `20260517031335_011_decide_state.sql`                | Extends `card_state` enum with `'decide'` + `'planned'` via the canonical rename-recreate dance (006a template). Adds `cards.chosen_path text` (CHECK `'diy' \| 'contractor' \| 'monitor' \| NULL`), `cards.cost_estimate_diy_override jsonb`, `cards.cost_estimate_hire_override jsonb`. Updates `confirm_triage` to land at `state='decide'` (not `'diagnosed'`) and accept `p_diy_expansion` + `p_contractor_expansion` jsonb. New `commit_decide(p_user, p_card, p_path, p_cadence)` SECURITY DEFINER RPC. One-shot backfill lifts existing `diagnosed + severity_confirmed=true` rows to `state='decide'`. **Function-dependency dance**: drops `start_triage` / `complete_triage` / `confirm_triage` BEFORE the type rename (their `returns table(... public.card_state)` would block the drop) and recreates them at the bottom against the new enum. |
| 012  | `20260517214500_012_planned_reminder.sql`            | Additive `ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS planned_reminder_date date` + partial index `cards_planned_reminder_due_idx ON public.cards (planned_reminder_date) WHERE state = 'planned'::public.card_state AND planned_reminder_date IS NOT NULL` + trailing `notify pgrst, 'reload schema'` for PostgREST cache refresh + active `-- ROLLBACK:` block. No enum touched, no rename-recreate, no function-dependency dance. Migration 008's ALTER DEFAULT PRIVILEGES already covers the new column for `authenticated` SELECTs (column grants inherit from the table).                                                                                                                                                                                                                                                                        |
| 013  | `20260526142342_013_close_flow.sql`                  | Rename-recreate `touchpoint_type` enum adding `'close'` (006a recipe; NO function-dependency dance — no functions reference touchpoint_type). Additive `ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS actual_spend_cents int` + `spend_notes text`. New `close_card(p_user, p_card, p_spend_cents, p_spend_notes)` SECURITY DEFINER RPC — guards `state='planned'` ONLY (stricter than `commit_decide`), sets `state='closed', closed_at=now()`, writes spend columns. Commented rollback recipe in-file.                                                                                                                                                                                                                                                                                                                                                |

## RPCs (SECURITY DEFINER functions)

All `SECURITY DEFINER`, all with pinned `search_path = public, pg_catalog`, all internally guard `p_user = auth.uid()` (raising `42501` on mismatch — PostgREST maps to HTTP 403). This defense-in-depth posture exists because SECURITY DEFINER bypasses RLS on writes — without the internal check, an authenticated user could grief another user's data via direct PostgREST RPC call.

| RPC                                                                                                                           | Defined in      | Purpose                                                                                                                                                            | Errors                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `create_public_user_profile()`                                                                                                | 005             | Trigger function — creates `public.users` row on `auth.users` insert.                                                                                              | Trigger context only; no RPC call.                                     |
| `set_updated_at()`                                                                                                            | 005             | Generic BEFORE UPDATE trigger that bumps `updated_at`.                                                                                                             | Trigger context only.                                                  |
| `claim_card_slot(p_user, p_title, p_description, p_system_tag, p_room_tag)`                                                   | 006b            | Atomic week-roll + cap check + card insert.                                                                                                                        | `42501` on `p_user != auth.uid()`; `P0001 card_cap_reached` at 20/wk.  |
| `start_triage(p_user, p_card)`                                                                                                | 007 / 009       | Atomic transition `capturing → triaging`.                                                                                                                          | `42501` on auth mismatch; `42702` if column ambiguity (009 fixes 007). |
| `complete_triage(p_user, p_card, p_diagnosis, p_severity, p_system_tag, p_contractor_tag, p_assistant_payload)`               | 007 / 009 / 011 | Atomic `cards` UPDATE + `triage_conversations` INSERT + state → `diagnosed` (007/009) → `decide` after PR #11 lands.                                               | `42501`.                                                               |
| `answer_triage_round(p_user, p_card, p_round, p_user_answer, p_assistant_payload, p_is_location_ask)`                         | 010             | Atomic Q&A round insert (user reply + assistant question) — `is_location_ask` set on BOTH rows.                                                                    | `42501`.                                                               |
| `confirm_triage(p_user, p_card, p_diagnosis, p_severity, p_monitoring_cadence_days, p_diy_expansion, p_contractor_expansion)` | 010 / 011       | Atomic Q&A confirmation. Post-011: lands at `state='decide'`, persists `p_diy_expansion` / `p_contractor_expansion` to `cost_estimate_diy` / `cost_estimate_hire`. | `42501`.                                                               |
| `commit_decide(p_user, p_card, p_path, p_cadence)`                                                                            | 011             | Path commitment. Handles all five values: `diy` / `contractor` / `monitor` / `dismiss` / `decide`-reopen.                                                          | `42501`.                                                               |
| `close_card(p_user, p_card, p_spend_cents, p_spend_notes)`                                                                    | 013             | Terminal close. Guards `state='planned'` only (stricter than `commit_decide`). Atomically sets `state='closed', closed_at=now()`, writes spend columns.            | `42501`, `P0001 invalid_state`.                                        |

## RLS policies

20 per-action policies across 5 tables (`users`, `cards`, `triage_conversations`, `card_photos`, `usage_counters`) — migration 003. Each table has `select`, `insert`, `update`, `delete` policies with the canonical predicate:

- `users` — `auth.uid() = id`
- `cards`, `triage_conversations`, `card_photos`, `usage_counters` — `auth.uid() = user_id`

Storage RLS (migration 004) on `storage.objects` gates the private `card-photos` bucket: `bucket_id = 'card-photos' AND (storage.foldername(name))[1] = auth.uid()::text`. Path convention is `{user_id}/cards/{card_id}/touchpoints/{touchpoint_id}/{slot}.jpg`.

Test surface: `apps/web/e2e/rls-isolation.spec.ts` — two-user Playwright spec asserting SELECT/INSERT/UPDATE/DELETE + Storage download/upload isolation in both directions on all 5 tables.

## Triggers

| Trigger                | Function                       | Table          | When          | Purpose                                                                                                                   |
| ---------------------- | ------------------------------ | -------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `on_auth_user_created` | `create_public_user_profile()` | `auth.users`   | AFTER INSERT  | Creates `public.users` row matching the newly-signed-up user. Eliminates the race between signup and first app-side read. |
| `cards_updated_at`     | `set_updated_at()`             | `public.cards` | BEFORE UPDATE | Bumps `cards.updated_at` to `now()`. Other tables add the trigger in their own migrations when they grow update flows.    |

## Enums (defined in migration 001)

| Enum              | Values                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `card_state`      | `capturing`, `triaging`, `diagnosed`, `dismissed` (006a), `decide` (011), `planned` (011), `monitoring`, `closed` |
| `system_tag`      | (per home-os taxonomy — see migration 001)                                                                        |
| `severity`        | `note`, `watch`, `act_soon`                                                                                       |
| `contractor_tag`  | (per home-os taxonomy)                                                                                            |
| `touchpoint_type` | `primary`, `context`, `closeup`, `close`                                                                          |
| `photo_slot`      | `wide`, `zoom`, `detail`                                                                                          |
| `triage_role`     | `user`, `assistant`                                                                                               |

## Storage

Single private bucket: `card-photos`.

- Path: `{user_id}/cards/{card_id}/touchpoints/{touchpoint_id}/{slot}.jpg`
- RLS: leading path segment must match `auth.uid()::text`.
- Access: signed URLs (10-minute TTL) for read; direct upload via `supabase.storage.from('card-photos').upload(...)` for write.

## Edge functions (`functions/`)

Currently none. Triage routes are Next.js App Router route handlers (`apps/web/app/api/triage/...`) running on Vercel's edge runtime, calling Anthropic directly. Future edge functions land here and get a paired `supabase/functions/README.md`.

## Local stack

Local Supabase rebound to +100 ports (avoiding lalista's default-port collision):

- api/kong: `54421`
- db: `54422`
- studio: `54423`
- inbucket: `54424`
- realtime/analytics: `54427`

Configured in `.devcontainer/compose.yml` (socat forwards), `.devcontainer/supabase-runner/Dockerfile` (`EXPOSE`), `.devcontainer/init-firewall.sh` (allowlist).

Commands:

```bash
pnpm db:reset           # apply migrations to local stack (relay → supabase-runner)
pnpm db:gen-types       # regen packages/core/src/supabase.types.ts from local
pnpm db:status          # check local stack health
pnpm db:start / db:stop # lifecycle
```

For full local-stack architecture: `kit/docs/guide/local-supabase-compose-isolation.md` (delivered by the SessionStart hook).

## Cross-references

- [`../ARCHITECTURE.md § Data flow`](../ARCHITECTURE.md#data-flow) — SSR request lifecycle, Triage flow.
- [`../apps/web/README.md`](../apps/web/README.md) — route handlers (`api/`) that consume these RPCs.
- [`../packages/core/README.md`](../packages/core/README.md) — generated `Database` types from `pnpm db:gen-types`.
- [`../CLAUDE.md § Gotchas`](../CLAUDE.md#gotchas) — silent-failure traps when writing migrations / RPCs.
- `kit/docs/guide/migrations.md` (delivered via SessionStart hook) — devshop-wide migration conventions (ON DELETE on `auth.users` FK, Realtime publication setup, gotrue seed compatibility, load-bearing SQL invariants, DB constraint as loud structural backstop).
- `kit/docs/guide/database-queries.md` (delivered via SessionStart hook) — PostgREST behavior (error-first pattern, no joins through `auth.*`).
