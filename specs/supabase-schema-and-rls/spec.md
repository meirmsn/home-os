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
