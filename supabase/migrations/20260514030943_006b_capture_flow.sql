-- Migration 006b — capture-flow schema extensions.
-- Source: specs/capture-flow/spec.md § Data model changes § 006b.
--
-- Adds:
--   1. cards.room_tag column (D2 #1).
--   2. usage_counters.week_start column with default Monday-UTC anchor (D2 #3).
--   3. cards_description_max_length CHECK constraint (D2 #4 + D12).
--   4. public.claim_card_slot SECURITY DEFINER function (D2 #5 + D3).
-- Splits the 'dismissed' enum value into 006a per Postgres ALTER TYPE
-- transaction limitation (see § Gotchas in spec.md).

-- 1. cards.room_tag — free-text room name per D6. Optional in the DB;
-- the route handler validates non-empty + length <= 80 (defense in depth).
alter table public.cards
  add column room_tag text;

-- 2. usage_counters.week_start — Monday-UTC anchor used by claim_card_slot
-- (D3) to detect week rollover atomically. Default value is the current
-- Monday-UTC date so existing rows backfill cleanly on first read.
alter table public.usage_counters
  add column week_start date not null
    default (date_trunc('week', (now() at time zone 'utc'))::date);

-- 3. cards_description_max_length — D12. The route handler also validates
-- pre-RPC; this is the floor.
alter table public.cards
  add constraint cards_description_max_length
  check (
    initial_description is null
    or char_length(initial_description) <= 2000
  );

-- 4. claim_card_slot — atomic week-rollover + counter increment + INSERT,
-- per D3. Returns the new card id + post-increment count so the route
-- handler can render the right "X of 20" surface to the user.
--
-- SECURITY DEFINER + pinned search_path matches the migration 005
-- create_public_user_profile convention. The route handler (spec
-- § API contracts § POST /api/card) enforces auth.uid() = p_user
-- BEFORE calling this function — defense in depth, since the
-- function itself trusts p_user (D3 + § Gotchas).
create or replace function public.claim_card_slot(
  p_user uuid,
  p_title text,
  p_description text,
  p_system_tag public.system_tag,
  p_room_tag text
)
returns table (card_id uuid, card_count_after int)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_monday date := (date_trunc('week', (now() at time zone 'utc'))::date);
  v_count int;
  v_card_id uuid;
begin
  -- upsert + week-rollover in one statement. The CASE expression resets
  -- card_count to 0 when week_start has rolled past Monday.
  insert into usage_counters (user_id, card_count, week_start, updated_at)
  values (p_user, 0, v_monday, now())
  on conflict (user_id) do update
    set card_count = case
          when usage_counters.week_start = v_monday
          then usage_counters.card_count
          else 0
        end,
        week_start = v_monday,
        updated_at = now()
  returning card_count into v_count;

  if v_count >= 20 then
    raise exception 'card_cap_reached' using errcode = 'P0001';
  end if;

  update usage_counters
    set card_count = card_count + 1,
        updated_at = now()
    where user_id = p_user
  returning card_count into v_count;

  insert into cards (
    user_id, title, initial_description, system_tag, room_tag, state
  )
  values (
    p_user, p_title, p_description, p_system_tag, p_room_tag, 'capturing'
  )
  returning id into v_card_id;

  return query select v_card_id, v_count;
end;
$$;

-- ROLLBACK:
-- drop function if exists public.claim_card_slot(uuid, text, text, system_tag, text);
-- alter table public.cards drop constraint if exists cards_description_max_length;
-- alter table public.usage_counters drop column if exists week_start;
-- alter table public.cards drop column if exists room_tag;
-- (Note: ALTER TYPE ADD VALUE in 006a is not reversible — see 006a.)
