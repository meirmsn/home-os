-- Migration 015 — monitor-beta. Extends touchpoint_type enum with 'checkin',
-- creates check_ins table, adds record_checkin SECURITY DEFINER RPC,
-- updates commit_decide to accept 'monitoring' as source state.
--
-- Source: specs/monitor-beta/spec.md § Data model changes.
--
-- touchpoint_type rename-recreate dance (same recipe as migration 013 'close').
-- commit_decide function-dependency: must drop + recreate because we widen
-- the state predicate.

-- 1. Rename-recreate touchpoint_type enum with 'checkin' added.
alter type public.touchpoint_type rename to touchpoint_type_old;

create type public.touchpoint_type as enum (
  'primary',
  'context',
  'closeup',
  'close',
  'checkin'
);

alter table public.card_photos
  alter column touchpoint_type type public.touchpoint_type
  using touchpoint_type::text::public.touchpoint_type;

drop type public.touchpoint_type_old;

-- 2. check_ins table — one row per check-in event.
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  constraint check_ins_notes_max_length check (notes is null or length(notes) <= 500)
);

create index check_ins_card_id_idx on public.check_ins(card_id);
create index check_ins_user_id_idx on public.check_ins(user_id);

-- 3. RLS on check_ins (same owner-predicate pattern as card_photos).
alter table public.check_ins enable row level security;

create policy check_ins_select_own on public.check_ins
  for select using ((select auth.uid()) = user_id);
create policy check_ins_insert_own on public.check_ins
  for insert with check ((select auth.uid()) = user_id);
create policy check_ins_update_own on public.check_ins
  for update using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
create policy check_ins_delete_own on public.check_ins
  for delete using ((select auth.uid()) = user_id);

-- 4. record_checkin SECURITY DEFINER RPC.
--    Atomically: INSERT check_ins row + UPDATE cards.next_check_at.
--    Predicate-guard: state = 'monitoring' ONLY.
create or replace function public.record_checkin(
  p_user uuid,
  p_card uuid,
  p_notes text default null
)
returns table (
  checkin_id uuid,
  card_id uuid,
  next_check_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_checkin_id uuid;
  v_card_id uuid;
  v_next_check_at timestamptz;
  v_cadence int;
begin
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Read cadence from the card (state-guard + ownership guard).
  select public.cards.monitoring_cadence_days
    into v_cadence
    from public.cards
    where public.cards.id = p_card
      and public.cards.user_id = p_user
      and public.cards.state = 'monitoring'::public.card_state;

  if v_cadence is null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  -- Insert check-in row.
  insert into public.check_ins (card_id, user_id, notes)
    values (p_card, p_user, p_notes)
    returning public.check_ins.id into v_checkin_id;

  -- Reset cadence clock.
  update public.cards
    set next_check_at = now() + interval '1 day' * v_cadence,
        updated_at = now()
    where public.cards.id = p_card
      and public.cards.user_id = p_user
    returning public.cards.id, public.cards.next_check_at
      into v_card_id, v_next_check_at;

  return query select v_checkin_id, v_card_id, v_next_check_at;
end;
$$;

-- 5. Update commit_decide to also accept 'monitoring' as a source state.
--    Drop + recreate because we are widening the state predicate in every
--    branch. The function signature is unchanged.
drop function if exists public.commit_decide(uuid, uuid, text, int);

create or replace function public.commit_decide(
  p_user uuid,
  p_card uuid,
  p_path text,
  p_cadence int
)
returns table (
  card_id uuid,
  new_state public.card_state,
  new_chosen_path text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_card_id uuid;
  v_state public.card_state;
  v_chosen text;
begin
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_path is null or p_path not in (
    'diy', 'contractor', 'monitor', 'dismiss', 'decide'
  ) then
    raise exception 'invalid_path' using errcode = '22023';
  end if;

  if p_path = 'monitor' and (p_cadence is null or p_cadence <= 0) then
    raise exception 'cadence_required' using errcode = 'P0001';
  end if;

  if p_path = 'diy' then
    update public.cards
      set chosen_path = 'diy',
          state = 'planned'::public.card_state,
          updated_at = now()
      where public.cards.id = p_card
        and public.cards.user_id = p_user
        and public.cards.state in (
          'decide'::public.card_state,
          'planned'::public.card_state,
          'monitoring'::public.card_state
        )
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  elsif p_path = 'contractor' then
    update public.cards
      set chosen_path = 'contractor',
          state = 'planned'::public.card_state,
          updated_at = now()
      where public.cards.id = p_card
        and public.cards.user_id = p_user
        and public.cards.state in (
          'decide'::public.card_state,
          'planned'::public.card_state,
          'monitoring'::public.card_state
        )
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  elsif p_path = 'monitor' then
    update public.cards
      set chosen_path = 'monitor',
          state = 'monitoring'::public.card_state,
          monitoring_cadence_days = p_cadence,
          next_check_at = now() + interval '1 day' * p_cadence,
          updated_at = now()
      where public.cards.id = p_card
        and public.cards.user_id = p_user
        and public.cards.state in (
          'decide'::public.card_state,
          'planned'::public.card_state,
          'monitoring'::public.card_state
        )
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  elsif p_path = 'dismiss' then
    update public.cards
      set chosen_path = null,
          state = 'dismissed'::public.card_state,
          updated_at = now()
      where public.cards.id = p_card
        and public.cards.user_id = p_user
        and public.cards.state in (
          'decide'::public.card_state,
          'planned'::public.card_state,
          'monitoring'::public.card_state
        )
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  else
    -- p_path = 'decide' — re-open from planned or monitoring.
    update public.cards
      set chosen_path = null,
          state = 'decide'::public.card_state,
          updated_at = now()
      where public.cards.id = p_card
        and public.cards.user_id = p_user
        and public.cards.state in (
          'decide'::public.card_state,
          'planned'::public.card_state,
          'monitoring'::public.card_state
        )
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  end if;

  if v_card_id is null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  return query select v_card_id, v_state, v_chosen;
end;
$$;

-- 6. Grant privileges on check_ins (migration 008 ALTER DEFAULT PRIVILEGES
--    covers future tables, but the grant may not apply retroactively in
--    Supabase Cloud if the table is created by the migration runner user).
grant all on public.check_ins to authenticated;

-- 7. Notify PostgREST to reload schema cache (new table + enum change).
notify pgrst, 'reload schema';

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.commit_decide(uuid, uuid, text, int);
-- DROP FUNCTION IF EXISTS public.record_checkin(uuid, uuid, text);
-- DROP TABLE IF EXISTS public.check_ins CASCADE;
-- DO $$ BEGIN
--   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'card_photos') THEN
--     ALTER TYPE public.touchpoint_type RENAME TO touchpoint_type_015;
--     CREATE TYPE public.touchpoint_type AS ENUM ('primary', 'context', 'closeup', 'close');
--     ALTER TABLE public.card_photos
--       ALTER COLUMN touchpoint_type TYPE public.touchpoint_type
--       USING touchpoint_type::text::public.touchpoint_type;
--     DROP TYPE public.touchpoint_type_015;
--   ELSE
--     DROP TYPE IF EXISTS public.touchpoint_type;
--     CREATE TYPE public.touchpoint_type AS ENUM ('primary', 'context', 'closeup', 'close');
--   END IF;
-- END $$;
