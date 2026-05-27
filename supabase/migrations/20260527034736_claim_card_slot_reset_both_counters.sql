-- Migration 015 — fix symmetric week-rollover bug in claim_card_slot.
-- Source: /review Gate 6 finding (PR #35) — confirm_triage was fixed in
-- migration 014 to reset both counters; this patches the other side.
--
-- Bug: claim_card_slot's ON CONFLICT block resets card_count on week
-- rollover but leaves triage_session_count at the stale prior-week
-- value. If claim_card_slot fires first in a new week, it sets
-- week_start = current Monday and resets card_count to 0, but
-- triage_session_count stays at (e.g.) 5 from last week. The next
-- confirm_triage call sees week_start already current and increments
-- from the stale 5 instead of resetting to 1.

-- Drop the existing function (same signature — CREATE OR REPLACE would
-- work, but explicit DROP makes the diff self-documenting).
drop function if exists public.claim_card_slot(uuid, text, text, public.system_tag, text);

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
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- upsert + week-rollover. Resets BOTH counters when week_start has
  -- rolled past Monday — symmetric with confirm_triage (migration 014).
  insert into usage_counters (user_id, card_count, triage_session_count, week_start, updated_at)
  values (p_user, 0, 0, v_monday, now())
  on conflict (user_id) do update
    set card_count = case
          when usage_counters.week_start = v_monday
          then usage_counters.card_count
          else 0
        end,
        triage_session_count = case
          when usage_counters.week_start = v_monday
          then usage_counters.triage_session_count
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
-- drop function if exists public.claim_card_slot(uuid, text, text, public.system_tag, text);
-- create or replace function public.claim_card_slot(
--   p_user uuid, p_title text, p_description text,
--   p_system_tag public.system_tag, p_room_tag text
-- ) returns table (card_id uuid, card_count_after int)
-- language plpgsql security definer set search_path = public, pg_catalog
-- as $$ declare
--   v_monday date := (date_trunc('week', (now() at time zone 'utc'))::date);
--   v_count int; v_card_id uuid;
-- begin
--   if p_user is distinct from auth.uid() then
--     raise exception 'forbidden' using errcode = '42501';
--   end if;
--   insert into usage_counters (user_id, card_count, week_start, updated_at)
--   values (p_user, 0, v_monday, now())
--   on conflict (user_id) do update
--     set card_count = case
--           when usage_counters.week_start = v_monday
--           then usage_counters.card_count else 0 end,
--         week_start = v_monday, updated_at = now()
--   returning card_count into v_count;
--   if v_count >= 20 then
--     raise exception 'card_cap_reached' using errcode = 'P0001';
--   end if;
--   update usage_counters set card_count = card_count + 1, updated_at = now()
--     where user_id = p_user returning card_count into v_count;
--   insert into cards (user_id, title, initial_description, system_tag, room_tag, state)
--   values (p_user, p_title, p_description, p_system_tag, p_room_tag, 'capturing')
--   returning id into v_card_id;
--   return query select v_card_id, v_count;
-- end; $$;
