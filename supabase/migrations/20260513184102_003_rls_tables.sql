-- Migration 003 — Row Level Security on all 5 public-schema tables.
-- Source: specs/supabase-schema-and-rls/spec.md § RLS policies § 003_rls_tables.sql.
--
-- One policy per action (SELECT / INSERT / UPDATE / DELETE) per table. We
-- intentionally do NOT use `FOR ALL` because explicit per-action policies
-- make the policy matrix readable in pg_policies, and the WITH CHECK shape
-- differs between INSERT (check-only) and UPDATE (using + check).
--
-- Predicate shape:
--   - public.users    — owner self via `auth.uid() = id` (PK is the auth id, D1).
--   - all other tables — owner via `auth.uid() = user_id`.

-- public.users
alter table public.users enable row level security;

create policy users_select_own on public.users
  for select using (auth.uid() = id);
create policy users_insert_own on public.users
  for insert with check (auth.uid() = id);
create policy users_update_own on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy users_delete_own on public.users
  for delete using (auth.uid() = id);

-- public.cards
alter table public.cards enable row level security;

create policy cards_select_own on public.cards
  for select using (auth.uid() = user_id);
create policy cards_insert_own on public.cards
  for insert with check (auth.uid() = user_id);
create policy cards_update_own on public.cards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy cards_delete_own on public.cards
  for delete using (auth.uid() = user_id);

-- public.triage_conversations
alter table public.triage_conversations enable row level security;

create policy triage_conversations_select_own on public.triage_conversations
  for select using (auth.uid() = user_id);
create policy triage_conversations_insert_own on public.triage_conversations
  for insert with check (auth.uid() = user_id);
create policy triage_conversations_update_own on public.triage_conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy triage_conversations_delete_own on public.triage_conversations
  for delete using (auth.uid() = user_id);

-- public.card_photos
alter table public.card_photos enable row level security;

create policy card_photos_select_own on public.card_photos
  for select using (auth.uid() = user_id);
create policy card_photos_insert_own on public.card_photos
  for insert with check (auth.uid() = user_id);
create policy card_photos_update_own on public.card_photos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy card_photos_delete_own on public.card_photos
  for delete using (auth.uid() = user_id);

-- public.usage_counters
alter table public.usage_counters enable row level security;

create policy usage_counters_select_own on public.usage_counters
  for select using (auth.uid() = user_id);
create policy usage_counters_insert_own on public.usage_counters
  for insert with check (auth.uid() = user_id);
create policy usage_counters_update_own on public.usage_counters
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy usage_counters_delete_own on public.usage_counters
  for delete using (auth.uid() = user_id);

-- ROLLBACK:
-- drop policy if exists usage_counters_delete_own on public.usage_counters;
-- drop policy if exists usage_counters_update_own on public.usage_counters;
-- drop policy if exists usage_counters_insert_own on public.usage_counters;
-- drop policy if exists usage_counters_select_own on public.usage_counters;
-- alter table public.usage_counters disable row level security;
-- drop policy if exists card_photos_delete_own on public.card_photos;
-- drop policy if exists card_photos_update_own on public.card_photos;
-- drop policy if exists card_photos_insert_own on public.card_photos;
-- drop policy if exists card_photos_select_own on public.card_photos;
-- alter table public.card_photos disable row level security;
-- drop policy if exists triage_conversations_delete_own on public.triage_conversations;
-- drop policy if exists triage_conversations_update_own on public.triage_conversations;
-- drop policy if exists triage_conversations_insert_own on public.triage_conversations;
-- drop policy if exists triage_conversations_select_own on public.triage_conversations;
-- alter table public.triage_conversations disable row level security;
-- drop policy if exists cards_delete_own on public.cards;
-- drop policy if exists cards_update_own on public.cards;
-- drop policy if exists cards_insert_own on public.cards;
-- drop policy if exists cards_select_own on public.cards;
-- alter table public.cards disable row level security;
-- drop policy if exists users_delete_own on public.users;
-- drop policy if exists users_update_own on public.users;
-- drop policy if exists users_insert_own on public.users;
-- drop policy if exists users_select_own on public.users;
-- alter table public.users disable row level security;
