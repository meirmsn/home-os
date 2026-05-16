-- Migration 007 — triage-route-handler RPCs.
-- Source: specs/triage-route-handler/spec.md § Data model changes.
--
-- Adds two SECURITY DEFINER functions:
--   1. public.start_triage(p_user, p_card) — atomic capturing → triaging
--   2. public.complete_triage(p_user, p_card, p_diagnosis, p_severity,
--        p_system_tag, p_contractor_tag, p_assistant_content) — atomic
--        triaging → diagnosed + cards UPDATE + triage_conversations INSERT
--
-- Both pin search_path to `public, pg_catalog` and internally guard
-- `p_user = auth.uid()`. Matches the claim_card_slot convention from
-- migration 006b — same auth-internal-guard defense (SECURITY DEFINER
-- bypasses RLS on the writes, so this guard is the only thing that
-- prevents an authenticated user from poking another user's cards via
-- a direct PostgREST RPC call).
--
-- No schema diffs to existing tables — cards.diagnosis / severity /
-- system_tag / contractor_tag already exist (migration 002),
-- triage_conversations already exists (migration 002), card_state enum
-- already includes 'triaging' and 'diagnosed' (migration 001).

create or replace function public.start_triage(
  p_user uuid,
  p_card uuid
)
returns table (card_id uuid, state public.card_state)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_card_id uuid;
  v_state public.card_state;
begin
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.cards
    set state = 'triaging',
        updated_at = now()
  where id = p_card
    and user_id = p_user
    and state = 'capturing'
  returning id, state into v_card_id, v_state;

  if v_card_id is null then
    raise exception 'triage_invalid_state' using errcode = 'P0001';
  end if;

  return query select v_card_id, v_state;
end;
$$;

create or replace function public.complete_triage(
  p_user uuid,
  p_card uuid,
  p_diagnosis text,
  p_severity_provisional public.severity,
  p_system_tag public.system_tag,
  p_contractor_tag public.contractor_tag,
  p_assistant_content text
)
returns table (card_id uuid, state public.card_state)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_card_id uuid;
  v_state public.card_state;
begin
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Predicate-guard on state='triaging' so concurrent completes don't
  -- both succeed. Second caller falls through to v_card_id is null.
  update public.cards
    set state = 'diagnosed',
        diagnosis = p_diagnosis,
        severity = p_severity_provisional,
        system_tag = p_system_tag,
        contractor_tag = p_contractor_tag,
        updated_at = now()
  where id = p_card
    and user_id = p_user
    and state = 'triaging'
  returning id, state into v_card_id, v_state;

  if v_card_id is null then
    raise exception 'triage_invalid_state' using errcode = 'P0001';
  end if;

  insert into public.triage_conversations (
    card_id, user_id, round, role, content
  )
  values (
    p_card, p_user, 1, 'assistant', p_assistant_content
  );

  return query select v_card_id, v_state;
end;
$$;

-- ROLLBACK:
-- drop function if exists public.complete_triage(uuid, uuid, text, severity, system_tag, contractor_tag, text);
-- drop function if exists public.start_triage(uuid, uuid);
