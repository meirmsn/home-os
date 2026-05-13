<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: supabase-schema-and-rls -->
<!-- date: 2026-05-13 -->

# Spec: supabase-schema-and-rls (PR 1 of v0 Phase 1)

**Sources:**

- `PRODUCT-ROADMAP.md § v0 Phase 1 row 1` — primary scope (`supabase-schema-and-rls`)
- `.gstack/eng-review-home-os-2026-05-01.md § Data Model` — table shapes (users, cards, triage_conversations, card_photos, usage_counters)
- `.gstack/eng-review-home-os-2026-05-01.md § RLS Policies` — canonical policy pattern
- `.gstack/eng-review-home-os-2026-05-01.md § Storage` — `card-photos` private bucket + `{user_id}/cards/{card_id}/touchpoints/{touchpoint_id}/{slot}.jpg` path structure
- `.gstack/eng-review-home-os-2026-05-01.md § Pre-Ship Requirements #3` — multi-user RLS isolation test gate
- `.gstack/eng-review-home-os-2026-05-01.md § Build Order step 1` — foundation step (no UI, no app code beyond types)
- `CLAUDE.md § Where Things Happen` — documents existing surfaces and where the new ones go
- `kit/docs/guide/supabase-ssr-boilerplate.md § Pattern 3` — E2E admin/anon client conventions

Foundation PR: ships all Phase 1 tables, all RLS policies, the private `card-photos` storage bucket with `{user_id}` path enforcement, the auth-signup → `public.users` profile trigger, the `cards.updated_at` maintenance trigger, regenerated `packages/core/src/supabase.types.ts`, and the multi-user isolation E2E test that gates Pre-Ship Requirement #3. No user-facing UI. Blocks every subsequent v0 feature.

---

## Decisions (resolved at spec time)

Twelve `/ak-spec`-time decisions resolved in Phase 0 with the user. Recorded below so Phase 1 preserves them verbatim and a crashed Phase 1 resumes without re-asking.

### D1: `public.users.id` linkage to `auth.users`

**Decision:** `id uuid primary key references auth.users(id) on delete cascade`. No separate `auth_user_id` column.

**Rationale:** Standard Supabase pattern. Joining the IDs simplifies `auth.uid() = users.id` in RLS and avoids an extra column to keep in sync. `ON DELETE CASCADE` matches the spec's "user deletion removes all data" intent.

### D2: Profile row creation on signup

**Decision:** DB trigger `on_auth_user_created AFTER INSERT ON auth.users` calls a SECURITY DEFINER function `create_public_user_profile()` that inserts the matching `public.users` row.

**Rationale:** Eliminates the race window between sign-up and the first app-side read. App code can rely on `public.users` always existing for any `auth.uid()`. Trigger lives in migration 005.

### D3: Migration granularity

**Decision:** Five sequential migrations:

1. `001_enums.sql` — all CREATE TYPE statements
2. `002_tables.sql` — all CREATE TABLE statements with columns, FKs, CHECK constraints
3. `003_rls_tables.sql` — ENABLE RLS + table policies on public schema tables
4. `004_storage.sql` — `card-photos` bucket insert + `storage.objects` RLS policies
5. `005_triggers.sql` — `on_auth_user_created` + `cards_updated_at` triggers and their supporting functions

**Rationale:** Each migration is independently reviewable. Order is explicit. Splitting RLS from tables makes the policy diff readable. Splitting storage from tables matches Supabase's two RLS surfaces (public schema vs `storage.objects`).

### D4: Enum types — Postgres native vs text + check

**Decision:** Postgres native `CREATE TYPE ... AS ENUM` for `card_state`, `system_tag`, `severity`, `contractor_tag`, `touchpoint_type`, `photo_slot`, `triage_role`.

**Rationale:** Type-strict in generated `Database['public']['Enums']` — apps get string-literal types for free. `ALTER TYPE ADD VALUE` covers extension; the values listed in eng-review § Data Model are stable. Matches the spec's documented enums verbatim.

### D5: Optimistic locking on `cards`

**Decision:** `version int not null default 1` column on `cards`. App-side update pattern: `update cards set ..., version = version + 1 where id = ? and version = ?`.

**Rationale:** Edge Case #3 (two devices, simultaneous Q&A) needs a guard. Adding the column at foundation time is one column-add; bolting it on later requires backfilling existing rows and updating every writer in lockstep.

### D6: `updated_at` maintenance

**Decision:** `BEFORE UPDATE` trigger on `cards` calls `set_updated_at()` which sets `NEW.updated_at = now()`. Function defined once; trigger applied per-table.

**Rationale:** App code can't be trusted to set `updated_at` on every code path. Trigger enforces the invariant. `users` and other tables don't need it now — they're append-only or have no business need for the column.

### D7: Realtime publication membership

**Decision:** Do NOT add tables to `supabase_realtime` publication in this PR. Defer to the feature that consumes it (likely `triage-conversation`, row #6).

**Rationale:** Neither `auth-magic-link` (#2) nor `pwa-spike` (#3) needs realtime. Adding tables to the publication now adds noise to local development logs without any consumer. The consuming feature owns its publication membership migration.

### D8: Storage RLS predicate shape

**Decision:** On the `card-photos` bucket, four `storage.objects` policies (SELECT / INSERT / UPDATE / DELETE), each gated by `bucket_id = 'card-photos' AND (storage.foldername(name))[1] = auth.uid()::text`.

**Rationale:** Standard Supabase pattern. The path structure `{user_id}/cards/{card_id}/...` puts the user_id as path segment 1; `storage.foldername(name)` is the canonical extractor. Matches the bucket-path convention in eng-review § Storage.

### D9: jsonb shape validation

**Decision:** No DB-side check constraints on `cards.cost_estimate_diy`, `cards.cost_estimate_hire`. Validation happens at the app boundary via Zod when the values are written.

**Rationale:** Lets the jsonb shape evolve without a migration. Schemas live under `packages/core/src/schemas/` per project convention. DB only guarantees jsonb-validity.

### D10: Multi-user RLS isolation test

**Decision:** Single Playwright spec at `apps/web/e2e/rls-isolation.spec.ts` using Pattern 3 helpers (`adminClient`, `anonClient`, `userIdFromSignIn` from `apps/web/e2e/helpers/admin-client.ts`). Two test users (user A, user B) seeded via `adminClient().auth.admin.createUser()`. Spec asserts: as user A's anon session, every `select` and `update` and `delete` against user B's rows in `cards` / `triage_conversations` / `card_photos` / `usage_counters` / Storage returns empty or 403; the symmetric assertions in reverse.

**Rationale:** Pre-Ship Requirement #3 in eng-review explicitly demands a multi-user check before any user data is written. Pattern 3 helpers are the canonical shape per the boilerplate guide. Single spec keeps the test surface scannable; it's a foundation check, not a continuous-feature surface.

### D11: Generated types regeneration

**Decision:** After Tasks 1–5 apply locally via `pnpm db:reset`, run `pnpm db:gen-types`; the output overwrites the placeholder at `packages/core/src/supabase.types.ts`. Commit the file as Task 6.

**Rationale:** Live local schema is the source of truth per the `db:gen-types` convention. CI's `ci-type-drift.sh` slow-job gate (per `db:gen-types` placeholder comment) catches future drift.

### D12: Constraint hygiene

**Decision:** Add the following CHECK constraints on table columns:

- `cards`: `CHECK (monitoring_cadence_days IS NULL OR monitoring_cadence_days > 0)`
- `cards`: `CHECK (version >= 1)`
- `triage_conversations`: `CHECK (round BETWEEN 1 AND 3)`
- `usage_counters`: `CHECK (triage_session_count >= 0 AND card_count >= 0)`

**Rationale:** Cheap invariants the data model guarantees; failing fast at the DB boundary beats discovering inconsistent state in app logs. `round BETWEEN 1 AND 3` enforces the spec's 3-round limit at the data layer.

---

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens (n/a),
     Data model changes (full SQL DDL), API contracts (n/a), Offline behavior
     (n/a), Metrics (n/a), Files to create/modify, Tests, Dependencies, Task
     order, Gotchas, Acceptance / rollout / rollback. The Decisions section
     above stays verbatim. -->

## Core user story

N/A — foundation database migration PR. No user-facing flow added or modified. Subsequent v0 features (auth-magic-link, pwa-spike, capture-flow, etc.) will introduce user-observable behavior on top of the schema this PR establishes. Gate 9 (qa-walk) will skip artifact assertion because this PR has no verbs to verify.

## In scope

This PR ships, atomically:

1. **Migration 001** — all 7 enum types (`card_state`, `system_tag`, `severity`, `contractor_tag`, `touchpoint_type`, `photo_slot`, `triage_role`).
2. **Migration 002** — all 5 public-schema tables (`users`, `cards`, `triage_conversations`, `card_photos`, `usage_counters`) with columns, FKs, CHECK constraints, defaults.
3. **Migration 003** — `ENABLE ROW LEVEL SECURITY` on every public table + four `FOR ALL` policies per table (one each for SELECT, INSERT, UPDATE, DELETE actions implicit under `FOR ALL`) scoped to `auth.uid()`.
4. **Migration 004** — `card-photos` private bucket row inserted into `storage.buckets`; four `storage.objects` RLS policies (SELECT/INSERT/UPDATE/DELETE) gated by `bucket_id = 'card-photos' AND (storage.foldername(name))[1] = auth.uid()::text`.
5. **Migration 005** — `set_updated_at()` function + `cards_updated_at` BEFORE UPDATE trigger; `create_public_user_profile()` SECURITY DEFINER function + `on_auth_user_created` AFTER INSERT trigger on `auth.users`.
6. **Regenerated types file** — `packages/core/src/supabase.types.ts` overwritten with the output of `pnpm db:gen-types` against the post-migration local stack.
7. **E2E isolation spec** — `apps/web/e2e/rls-isolation.spec.ts` covering all five tables + storage, in both directions (A→B, B→A).
8. **CLAUDE.md § Where Things Happen** — append entries for each of the new migration files, the regenerated types file, and the new E2E spec.

### Not in scope (explicit)

- No UI / no `apps/web/app/**` route changes beyond what already exists.
- No app code beyond regenerating `supabase.types.ts` (no API wrappers, no hooks, no components, no server actions).
- No auth flow / magic-link / OAuth wiring — that ships in PR #2 (`auth-magic-link`).
- No `supabase_realtime` publication membership (D7 — deferred to the consuming feature).
- No additions to `packages/core/src/schemas/` — Zod jsonb validation lives in the feature PR that writes the jsonb (D9).
- No edge functions / no `supabase/functions/` additions.
- No seed data / fixtures.
- No reads or writes from app code against any of the new tables (PR #2 onward).

## Data model changes

Full DDL, organized by migration filename. Column shapes are taken verbatim from `.gstack/eng-review-home-os-2026-05-01.md § Data Model`; each column is annotated with its source line.

### `supabase/migrations/<ts>_001_enums.sql`

```sql
-- All enums per eng-review § Data Model § Enums.
create type card_state as enum (
  'capturing',         -- eng-review § Data Model § cards.state values
  'triaging',
  'diagnosed',
  'monitoring',
  'closed'
);

create type system_tag as enum (
  'plumbing',          -- eng-review § Data Model § Enums § system_tag
  'electrical',
  'hvac',
  'roof',
  'exterior',
  'interior',
  'appliance',
  'safety',
  'other'
);

create type severity as enum (
  'cosmetic',          -- eng-review § Data Model § Enums § severity
  'monitor',
  'soon',
  'urgent'
);

create type contractor_tag as enum (
  'diy',               -- eng-review § Data Model § Enums § contractor_tag
  'handyman',
  'plumber',
  'electrician',
  'hvac_tech',
  'roofer',
  'general_contractor',
  'specialist'
);

create type touchpoint_type as enum (
  'primary',           -- eng-review § Data Model § Enums § touchpoint_type
  'context',
  'closeup'
);

create type photo_slot as enum (
  'wide',              -- eng-review § Data Model § Enums § photo_slot
  'medium',
  'closeup'
);

create type triage_role as enum (
  'system',            -- eng-review § Data Model § Enums § triage_role
  'user',
  'assistant'
);
```

### `supabase/migrations/<ts>_002_tables.sql`

```sql
-- public.users — eng-review § Data Model § users
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,  -- D1 + eng-review § users.id
  created_at timestamptz not null default now(),                    -- eng-review § users.created_at
  location text,                                                     -- eng-review § users.location
  byok_used boolean not null default false                           -- eng-review § users.byok_used
);

-- public.cards — eng-review § Data Model § cards
create table public.cards (
  id uuid primary key default gen_random_uuid(),                     -- eng-review § cards.id
  user_id uuid not null references public.users(id) on delete cascade, -- eng-review § cards.user_id
  created_at timestamptz not null default now(),                     -- eng-review § cards.created_at
  updated_at timestamptz not null default now(),                     -- D6 maintenance trigger writes
  state card_state not null default 'capturing',                     -- eng-review § cards.state
  title text,                                                         -- eng-review § cards.title
  initial_description text,                                          -- eng-review § cards.initial_description
  system_tag system_tag,                                              -- eng-review § cards.system_tag
  severity severity,                                                  -- eng-review § cards.severity
  contractor_tag contractor_tag,                                      -- eng-review § cards.contractor_tag
  diagnosis text,                                                     -- eng-review § cards.diagnosis
  fix_steps_diy jsonb,                                                -- eng-review § cards.fix_steps_diy
  cost_estimate_diy jsonb,                                            -- eng-review § cards.cost_estimate_diy (D9 — no DB check)
  fix_steps_hire jsonb,                                               -- eng-review § cards.fix_steps_hire
  cost_estimate_hire jsonb,                                           -- eng-review § cards.cost_estimate_hire (D9 — no DB check)
  monitoring_cadence_days int,                                        -- eng-review § cards.monitoring_cadence_days
  next_check_at timestamptz,                                          -- eng-review § cards.next_check_at
  closed_at timestamptz,                                              -- eng-review § cards.closed_at
  version int not null default 1,                                     -- D5 optimistic lock
  constraint cards_monitoring_cadence_positive
    check (monitoring_cadence_days is null or monitoring_cadence_days > 0),  -- D12
  constraint cards_version_positive
    check (version >= 1)                                              -- D12
);

create index cards_user_id_idx on public.cards(user_id);
create index cards_state_idx on public.cards(state);

-- public.triage_conversations — eng-review § Data Model § triage_conversations
create table public.triage_conversations (
  id uuid primary key default gen_random_uuid(),                     -- eng-review § triage_conversations.id
  card_id uuid not null references public.cards(id) on delete cascade, -- eng-review § triage_conversations.card_id
  user_id uuid not null references public.users(id) on delete cascade, -- eng-review § triage_conversations.user_id
  created_at timestamptz not null default now(),                     -- eng-review § triage_conversations.created_at
  round int not null,                                                 -- eng-review § triage_conversations.round
  role triage_role not null,                                          -- eng-review § triage_conversations.role
  content text not null,                                              -- eng-review § triage_conversations.content
  constraint triage_round_in_range check (round between 1 and 3)     -- D12 enforces the 3-round limit
);

create index triage_conversations_card_id_idx on public.triage_conversations(card_id);
create index triage_conversations_user_id_idx on public.triage_conversations(user_id);

-- public.card_photos — eng-review § Data Model § card_photos
create table public.card_photos (
  id uuid primary key default gen_random_uuid(),                     -- eng-review § card_photos.id
  card_id uuid not null references public.cards(id) on delete cascade, -- eng-review § card_photos.card_id
  user_id uuid not null references public.users(id) on delete cascade, -- eng-review § card_photos.user_id
  touchpoint_id uuid not null,                                        -- eng-review § card_photos.touchpoint_id (grouping column)
  touchpoint_type touchpoint_type not null,                           -- eng-review § card_photos.touchpoint_type
  slot photo_slot not null,                                           -- eng-review § card_photos.slot
  storage_path text not null,                                         -- eng-review § card_photos.storage_path
  created_at timestamptz not null default now()                       -- eng-review § card_photos.created_at
);

create index card_photos_card_id_idx on public.card_photos(card_id);
create index card_photos_user_id_idx on public.card_photos(user_id);
create index card_photos_touchpoint_id_idx on public.card_photos(touchpoint_id);

-- public.usage_counters — eng-review § Data Model § usage_counters
create table public.usage_counters (
  user_id uuid primary key references public.users(id) on delete cascade, -- eng-review § usage_counters.user_id
  triage_session_count int not null default 0,                        -- eng-review § usage_counters.triage_session_count
  card_count int not null default 0,                                  -- eng-review § usage_counters.card_count
  updated_at timestamptz not null default now(),                      -- eng-review § usage_counters.updated_at
  constraint usage_counters_non_negative
    check (triage_session_count >= 0 and card_count >= 0)            -- D12
);
```

## RLS policies

### `supabase/migrations/<ts>_003_rls_tables.sql`

`ENABLE ROW LEVEL SECURITY` on all five tables, plus four ALL-action policies per table (`FOR ALL` covers SELECT/INSERT/UPDATE/DELETE in a single statement; both `USING` and `WITH CHECK` are required so the policy gates reads AND writes).

```sql
-- public.users — owner-only (self) access. `auth.uid() = id` because of D1.
alter table public.users enable row level security;

create policy users_select_own on public.users
  for select using (auth.uid() = id);
create policy users_insert_own on public.users
  for insert with check (auth.uid() = id);
create policy users_update_own on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy users_delete_own on public.users
  for delete using (auth.uid() = id);

-- public.cards — owner-only via user_id.
alter table public.cards enable row level security;

create policy cards_select_own on public.cards
  for select using (auth.uid() = user_id);
create policy cards_insert_own on public.cards
  for insert with check (auth.uid() = user_id);
create policy cards_update_own on public.cards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy cards_delete_own on public.cards
  for delete using (auth.uid() = user_id);

-- public.triage_conversations — owner-only via user_id.
alter table public.triage_conversations enable row level security;

create policy triage_conversations_select_own on public.triage_conversations
  for select using (auth.uid() = user_id);
create policy triage_conversations_insert_own on public.triage_conversations
  for insert with check (auth.uid() = user_id);
create policy triage_conversations_update_own on public.triage_conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy triage_conversations_delete_own on public.triage_conversations
  for delete using (auth.uid() = user_id);

-- public.card_photos — owner-only via user_id.
alter table public.card_photos enable row level security;

create policy card_photos_select_own on public.card_photos
  for select using (auth.uid() = user_id);
create policy card_photos_insert_own on public.card_photos
  for insert with check (auth.uid() = user_id);
create policy card_photos_update_own on public.card_photos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy card_photos_delete_own on public.card_photos
  for delete using (auth.uid() = user_id);

-- public.usage_counters — owner-only (self) access. PK is user_id.
alter table public.usage_counters enable row level security;

create policy usage_counters_select_own on public.usage_counters
  for select using (auth.uid() = user_id);
create policy usage_counters_insert_own on public.usage_counters
  for insert with check (auth.uid() = user_id);
create policy usage_counters_update_own on public.usage_counters
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy usage_counters_delete_own on public.usage_counters
  for delete using (auth.uid() = user_id);
```

### `supabase/migrations/<ts>_004_storage.sql`

Private bucket + storage.objects RLS per D8.

```sql
-- Create the private bucket. `public = false` means no anonymous URL works;
-- every read goes through a signed URL or an authenticated client + RLS.
insert into storage.buckets (id, name, public)
values ('card-photos', 'card-photos', false)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by Supabase. Add bucket-scoped
-- policies whose predicate ties bucket_id and first path segment to the
-- caller's auth.uid(). storage.foldername(name) returns text[] with 1-based
-- indexing (Postgres convention) — segment [1] is the leading directory.
create policy card_photos_select_own on storage.objects
  for select
  using (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy card_photos_insert_own on storage.objects
  for insert
  with check (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy card_photos_update_own on storage.objects
  for update
  using (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy card_photos_delete_own on storage.objects
  for delete
  using (
    bucket_id = 'card-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

### `supabase/migrations/<ts>_005_triggers.sql` (signup trigger half)

```sql
-- D2 — create public.users on auth signup. SECURITY DEFINER because the
-- INSERT runs inside the auth schema's transaction; the public.users
-- INSERT needs to bypass that caller's RLS context. Function owner is the
-- migration runner (a privileged role), so SECURITY DEFINER + a fixed
-- search_path is safe.
create or replace function public.create_public_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, created_at)
  values (new.id, now())
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.create_public_user_profile();
```

## Triggers + functions

### `supabase/migrations/<ts>_005_triggers.sql` (updated_at half)

```sql
-- D6 — generic updated_at maintenance. One function, applied per-table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cards_updated_at
  before update on public.cards
  for each row
  execute function public.set_updated_at();
```

`users`, `triage_conversations`, `card_photos`, `usage_counters` do NOT get the trigger in this PR per D6 (`users` is append-only for the foundation; `usage_counters` does carry `updated_at` but is updated through explicit upserts whose writers will set it; `triage_conversations` and `card_photos` are append-only). Future features that mutate rows in any of those tables should add the trigger in their own migration.

## Files to create/modify

| File                                          | Action             | Purpose                                                                                                                                                                |
| --------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/<ts>_001_enums.sql`      | new                | All 7 enum types.                                                                                                                                                      |
| `supabase/migrations/<ts>_002_tables.sql`     | new                | All 5 tables, columns, FKs, CHECK constraints, indexes.                                                                                                                |
| `supabase/migrations/<ts>_003_rls_tables.sql` | new                | ENABLE RLS + 20 policies on public tables.                                                                                                                             |
| `supabase/migrations/<ts>_004_storage.sql`    | new                | `card-photos` bucket + 4 storage.objects policies.                                                                                                                     |
| `supabase/migrations/<ts>_005_triggers.sql`   | new                | `set_updated_at()` + `cards_updated_at` trigger; `create_public_user_profile()` + `on_auth_user_created` trigger.                                                      |
| `packages/core/src/supabase.types.ts`         | overwrite          | Regenerated by `pnpm db:gen-types` against the post-migration local stack (D11).                                                                                       |
| `apps/web/e2e/rls-isolation.spec.ts`          | new                | Multi-user RLS isolation E2E (D10).                                                                                                                                    |
| `CLAUDE.md` § Where Things Happen             | append             | One entry per new migration file + the regenerated types file + the new E2E spec. Update enforced by `kit/scripts/commit-hooks/check-docs-freshness-project.sh`.       |
| `BUILD-LOG.md`                                | append (Phase 5.6) | `/ak-build` Phase 5.6 records the build entry on the feature branch; not authored by `/ak-implement`. Mentioned here so the spec covers the full file scope of the PR. |
| `PLAN.md`                                     | edit               | Move the `supabase-schema-and-rls` row from `## Planned` → `## Active`. Already done by `/ak-spec` Step 4 when this spec is finalized.                                 |

Migration timestamps (`<ts>`) are produced by `supabase migration new <name>` at Task time; the five timestamps will be monotonically ordered.

## Tests

### 1. `apps/web/e2e/rls-isolation.spec.ts` (new — D10)

Multi-user RLS isolation. Skips gracefully in CI fast-job via `test.skip(!isLocalSupabase, localSupabaseSkipReason)` so the slow-job lane is the enforcement surface; locally it runs against the supabase-runner stack.

Setup (`beforeAll`):

- `adminClient().auth.admin.createUser({ email: 'a@test.local', password: '…', email_confirm: true })` → user A uuid.
- Same for user B.
- After each `createUser`, assert via `adminClient().from('users').select('id').eq('id', <uuid>)` that the trigger-created `public.users` row exists (Decision D2 verification).
- Seed user A's data via `adminClient()` (bypasses RLS): one `cards` row, one `triage_conversations` row, one `card_photos` row with `storage_path = '<A-uuid>/cards/<card-id>/touchpoints/<tp-id>/wide.jpg'`, one `usage_counters` row.
- Same for user B.
- Upload a real test image to `card-photos/<A-uuid>/cards/<card-id>/touchpoints/<tp-id>/wide.jpg` via `adminClient().storage`. Same for user B.

Tests (parameterized over both directions A→B and B→A for symmetry):

1. **SELECT isolation** — sign in as user A via `anonClient().auth.signInWithPassword`; for each of `cards`, `triage_conversations`, `card_photos`, `usage_counters`, run `.from(t).select('*').eq('user_id', userB)` and assert `data.length === 0` AND `error === null`.
2. **INSERT denial** — as user A, `.from(t).insert({ user_id: userB, … })` and assert `error` is non-null with a code in the 42501 / RLS-violation family.
3. **UPDATE invisibility** — as user A, `.from(t).update({ … }).eq('id', <user-B-row-id>)` and assert `data` is empty / `count === 0`. RLS silently filters; this is the expected behavior.
4. **DELETE invisibility** — as user A, `.from(t).delete().eq('id', <user-B-row-id>)` and assert `data` is empty / no row affected.
5. **Storage SELECT isolation** — as user A, `.storage.from('card-photos').download('<B-uuid>/cards/<card-id>/touchpoints/<tp-id>/wide.jpg')` and assert `error` is non-null (object not found from user A's perspective — RLS hides it).
6. **Storage UPLOAD denial** — as user A, attempt `.storage.from('card-photos').upload('<B-uuid>/cards/.../foo.jpg', …)` and assert `error` is non-null with an RLS-violation shape.
7. Repeat 1–6 with roles reversed (sign in as user B, target user A's data).

Teardown (`afterAll`): `adminClient().auth.admin.deleteUser(userA)`; same for user B. The `on delete cascade` chain wipes their `cards` / `triage_conversations` / `card_photos` / `usage_counters` rows; the storage files are deleted via `adminClient().storage.from('card-photos').remove([...])` for completeness.

### 2. No unit tests for migration SQL

DB integration is verified by the E2E spec above. Migration SQL has no behavioral surface separable from "did Postgres apply it" — `pnpm db:reset` is the verifier. No new `*.test.ts` files for `supabase/migrations/*.sql`.

### 3. Test-presence hook exemption

The new `.sql` files don't fall under `kit/scripts/commit-hooks/check-test-presence.sh`'s globs (which target `.ts`/`.tsx` under `apps/*/{src,app,components,lib,hooks}/` and `packages/*/src/`). `supabase.types.ts` is generated — the existing project convention treats it as exempt; if the hook flags it, add to `.devshop-test-coverage-exempt`. The E2E spec is its own test artifact, so no paired `.test.ts` is required for it.

## Task order

Canonical 8-task list, dependency-ordered. Each task is a single atomic commit; verification step listed per task.

1. **Task 1 — Migration 001 (enums)**
   Command: `supabase migration new 001_enums` → fill the file with the DDL from § Data Model § 001_enums.sql.
   Commit: `feat(supabase-schema-and-rls): add enum types (card_state, system_tag, severity, contractor_tag, touchpoint_type, photo_slot, triage_role)`
   Verify: `pnpm db:reset` runs to completion without error.

2. **Task 2 — Migration 002 (tables)**
   Command: `supabase migration new 002_tables` → fill with DDL from § 002_tables.sql.
   Commit: `feat(supabase-schema-and-rls): add tables (users, cards, triage_conversations, card_photos, usage_counters)`
   Verify: `pnpm db:reset`; `psql … -c '\dt public.*'` lists all 5 tables; CHECK constraints visible via `\d+ public.cards`.

3. **Task 3 — Migration 003 (table RLS)**
   Command: `supabase migration new 003_rls_tables` → fill with DDL from § RLS policies § 003_rls_tables.sql.
   Commit: `feat(supabase-schema-and-rls): enable RLS + owner policies on all public tables`
   Verify: `pnpm db:reset`; `psql … -c "select tablename, policyname from pg_policies where schemaname='public'"` lists 20 policies (4 per table × 5 tables).

4. **Task 4 — Migration 004 (storage bucket + RLS)**
   Command: `supabase migration new 004_storage` → fill with DDL from § 004_storage.sql.
   Commit: `feat(supabase-schema-and-rls): add card-photos private bucket + RLS policies`
   Verify: `pnpm db:reset`; bucket visible at `http://localhost:54423` (Studio → Storage); `select * from storage.buckets where id='card-photos'` returns one row with `public = false`; 4 policies on `storage.objects` filtered to bucket_id = 'card-photos'.

5. **Task 5 — Migration 005 (triggers)**
   Command: `supabase migration new 005_triggers` → fill with DDL from § Triggers + functions.
   Commit: `feat(supabase-schema-and-rls): add updated_at and auth-signup triggers`
   Verify: `pnpm db:reset`; create an `auth.users` row via SQL and assert a `public.users` row appears with matching id; `update public.cards set state='triaging' where id=…` and assert `updated_at` advanced.

6. **Task 6 — Regenerated types**
   Command: `pnpm db:gen-types` → overwrite `packages/core/src/supabase.types.ts`.
   Commit: `chore(supabase-schema-and-rls): regenerate Database types from local schema`
   Verify: `pnpm -w typecheck` clean; the new file contains a `Database['public']['Tables']` shape with all 5 tables and a `Database['public']['Enums']` shape with all 7 enums.

7. **Task 7 — E2E isolation spec**
   File: `apps/web/e2e/rls-isolation.spec.ts` per § Tests.
   Commit: `test(supabase-schema-and-rls): multi-user RLS isolation E2E`
   Verify: `pnpm --filter web exec playwright test e2e/rls-isolation.spec.ts` passes against local stack (all assertions in both directions).

8. **Task 8 — CLAUDE.md docs update**
   File: `CLAUDE.md` § Where Things Happen — append entries for the five migration files, the regenerated types file, and the new E2E spec.
   Commit: `docs(supabase-schema-and-rls): document new migrations, types, and isolation E2E`
   Verify: `bash kit/scripts/commit-hooks/check-docs-freshness-project.sh` passes; pre-commit hook clean.

## Dependencies

None upstream — this is the foundation PR.

**Downstream blockers** (informational, not gating this PR):

- `auth-magic-link` (PR #2) needs `public.users` + RLS to exist before its signup flow can write.
- Every v0 feature from #3 onward reads/writes against tables defined here.

## Gotchas

- **supabase-runner relay is required for `pnpm db:reset` / `pnpm db:gen-types`.** The workspace container has no docker daemon — `pnpm db:reset` is a thin wrapper that POSTs to the `supabase-runner` sidecar at port 9000, which owns the Supabase stack. If the relay isn't responding, `pnpm db:reset` will hang or error with a network message. Restart via `docker compose -f .devcontainer/compose.yml restart supabase-runner` from the host.
- **`auth.users` trigger needs SECURITY DEFINER** (D2). The `AFTER INSERT ON auth.users` trigger fires inside the auth schema's transaction; without SECURITY DEFINER, the `INSERT INTO public.users` would run as the caller's role and be blocked by RLS the moment we enable it. Setting `search_path = public` inside the function is a Postgres security best-practice for SECURITY DEFINER functions (prevents schema-shadowing attacks).
- **`storage.foldername(name)` returns `text[]` with 1-based indexing.** Postgres arrays are 1-indexed; `(storage.foldername('a/b/c.jpg'))[1] = 'a'`, not `'b'`. Confirmed against the Supabase storage docs. The `wide.jpg` example in the path `<uuid>/cards/<card-id>/touchpoints/<tp-id>/wide.jpg` makes segment [1] the user uuid — the policy intent.
- **Regenerated `supabase.types.ts` ripples downstream.** As soon as `auth-magic-link` (PR #2) starts importing `Database['public']['Tables']['users']`, the shape this PR commits is locked. If Phase 1 has to amend the schema after PR #2 lands, every consumer that picked up the type must also bump. Fine for foundation-PR-ships-first; flagged for future-spec awareness.
- **CSP `connect-src` already covers the local Supabase URL** via `apps/web/next.config.ts`'s derivation from `NEXT_PUBLIC_SUPABASE_URL` (per CLAUDE.md § Where Things Happen). No CSP edit needed in this PR.
- **`storage.buckets` insert uses `ON CONFLICT DO NOTHING`** so re-running migrations against a stack that already has the bucket (e.g., partial rollback) is idempotent.

## Acceptance / rollout / rollback

### Acceptance

A PR can land when ALL of:

- [ ] `pnpm db:reset` applies all 5 migrations cleanly against the local stack (no errors, no manual intervention).
- [ ] `pnpm db:gen-types` produces a `Database` shape with: 5 entries under `Tables` (`users`, `cards`, `triage_conversations`, `card_photos`, `usage_counters`); 7 entries under `Enums` (all enum names from D4); the `public.users` row visible in the generated relations (the auth trigger fired during the test fixture).
- [ ] `apps/web/e2e/rls-isolation.spec.ts` passes against the local stack: all assertions in both directions (A→B, B→A) for SELECT / INSERT / UPDATE / DELETE on each of the 5 tables + storage SELECT / UPLOAD.
- [ ] `pnpm -w typecheck` clean.
- [ ] `kit/scripts/commit-hooks/check-docs-freshness-project.sh` clean (CLAUDE.md updated).
- [ ] Branch protection's required checks all green.

### Rollout

- On merge to `main`, `.github/workflows/deploy-migrations.yml` runs `supabase db push` against the production project (ref derived from `SUPABASE_PROD_URL` Variable). All 5 migrations apply in order.
- `.github/workflows/deploy-functions.yml` is a no-op for this PR (no `supabase/functions/` content).
- Vercel auto-deploys the app on push to `main`, but since this PR ships no app code beyond the regenerated types file, the deployed app's user-facing surface is unchanged.

### Rollback

Acceptable to revert because the project is pre-launch — no real user data exists.

1. Revert the PR via `gh pr revert` or `git revert <merge-sha>` + new PR.
2. Per Supabase docs, mark each migration as reverted on the prod project: `supabase migration repair --status reverted <ts_001> <ts_002> <ts_003> <ts_004> <ts_005>`. Run from a shell with `SUPABASE_ACCESS_TOKEN` set and the project linked.
3. In Studio (Storage tab), delete the `card-photos` bucket.
4. The revert PR's deploy-migrations run will not re-apply the reverted timestamps because `migration repair --status reverted` marks them as already-applied-then-rolled-back in the `supabase_migrations.schema_migrations` table.

If real user data has begun to land before a rollback decision is made, treat this as a destructive operation and design a forward-fix migration instead — there is no clean way to drop these tables without destroying user-owned `cards` / `triage_conversations` / `card_photos`.
