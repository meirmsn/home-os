-- Migration 013 — close-flow. Extends touchpoint_type enum with 'close' via
-- the canonical rename-recreate dance (006a recipe). Adds actual_spend_cents +
-- spend_notes to cards. Creates close_card SECURITY DEFINER RPC for the
-- PLANNED → CLOSED terminal transition.
--
-- Source: specs/close-flow/spec.md § Data model changes — D1, D2, D3.
--
-- touchpoint_type has NO function-dependency dance needed — unlike card_state
-- in migration 011, no functions reference touchpoint_type in their return-type
-- signatures. The card_photos.touchpoint_type column is the only dependent.

-- 1. Rename-recreate touchpoint_type enum with 'close' added.
alter type public.touchpoint_type rename to touchpoint_type_old;

create type public.touchpoint_type as enum (
  'primary',
  'context',
  'closeup',
  'close'
);

alter table public.card_photos
  alter column touchpoint_type type public.touchpoint_type
  using touchpoint_type::text::public.touchpoint_type;

drop type public.touchpoint_type_old;

-- 2. Additive columns on cards.
alter table public.cards
  add column if not exists actual_spend_cents int,
  add column if not exists spend_notes text;

-- 3. close_card SECURITY DEFINER RPC.
--    Predicate-guard: state = 'planned' ONLY (stricter than commit_decide).
--    Column references fully qualified per PR #24 lesson.
create or replace function public.close_card(
  p_user uuid,
  p_card uuid,
  p_spend_cents int default null,
  p_spend_notes text default null
)
returns table (
  card_id uuid,
  new_state public.card_state,
  closed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_card_id uuid;
  v_state public.card_state;
  v_closed_at timestamptz;
begin
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.cards
    set state = 'closed'::public.card_state,
        closed_at = now(),
        actual_spend_cents = p_spend_cents,
        spend_notes = p_spend_notes,
        updated_at = now()
    where public.cards.id = p_card
      and public.cards.user_id = p_user
      and public.cards.state = 'planned'::public.card_state
    returning public.cards.id, public.cards.state, public.cards.closed_at
      into v_card_id, v_state, v_closed_at;

  if v_card_id is null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  return query select v_card_id, v_state, v_closed_at;
end;
$$;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.close_card(uuid, uuid, int, text);
-- ALTER TABLE public.cards DROP COLUMN IF EXISTS spend_notes;
-- ALTER TABLE public.cards DROP COLUMN IF EXISTS actual_spend_cents;
-- Rename-recreate touchpoint_type back to (primary, context, closeup):
-- ALTER TYPE public.touchpoint_type RENAME TO touchpoint_type_new;
-- CREATE TYPE public.touchpoint_type AS ENUM ('primary', 'context', 'closeup');
-- ALTER TABLE public.card_photos
--   ALTER COLUMN touchpoint_type TYPE public.touchpoint_type
--   USING touchpoint_type::text::public.touchpoint_type;
-- DROP TYPE public.touchpoint_type_new;
