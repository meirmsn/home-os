-- Migration 005 — triggers.
-- Source: specs/supabase-schema-and-rls/spec.md § Triggers + functions.
--
-- Two function/trigger pairs:
--   1. `create_public_user_profile()` + `on_auth_user_created`
--      Creates a matching `public.users` row on every `auth.users` insert.
--      SECURITY DEFINER + `search_path = public` per D2 / Postgres security
--      best practice — the function bypasses the caller's RLS context to
--      insert into public.users; pinning search_path prevents schema-
--      shadowing attacks.
--   2. `set_updated_at()` + `cards_updated_at`
--      Generic BEFORE UPDATE maintenance per D6. Per spec, only `cards`
--      gets the trigger in this PR; other tables that grow updated_at
--      semantics later add it in their own migration.

-- D2 — public.users profile mirror on signup.
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

-- ROLLBACK:
-- drop trigger if exists cards_updated_at on public.cards;
-- drop function if exists public.set_updated_at();
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists public.create_public_user_profile();
