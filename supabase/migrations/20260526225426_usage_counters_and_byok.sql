-- Migration 014 — usage-counters-and-byok.
-- Source: specs/usage-counters-and-byok/spec.md § Data model changes.
--
-- Adds:
--   1. mark_byok_used SECURITY DEFINER RPC — sets users.byok_used = true
--      on first successful BYOK key validation.
--   2. Drops + recreates confirm_triage to add atomic triage_session_count
--      increment with week-rollover (same claim_card_slot upsert pattern
--      from migration 006b).
--
-- Signature of confirm_triage is unchanged (13 params); the body gains
-- the final INSERT ... ON CONFLICT block that atomically bumps the
-- triage_session_count counter.

-- 1. mark_byok_used — sets users.byok_used = true for the calling user.
--    Predicate-guard: byok_used = false so repeated calls are no-ops.
--    SECURITY DEFINER + pinned search_path per convention.
create or replace function public.mark_byok_used(
  p_user uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.users
    set byok_used = true
    where id = p_user
      and byok_used = false;
end;
$$;

-- 2. Drop existing confirm_triage (migration 011 shape) so we can
--    recreate it with the counter-increment block.
drop function if exists public.confirm_triage(
  uuid, uuid, text, public.severity, public.system_tag, public.contractor_tag,
  int, text, int, boolean, text, jsonb, jsonb
);

-- 3. Recreate confirm_triage with atomic triage_session_count increment.
--    Key difference from migration 011: the final INSERT ... ON CONFLICT
--    block that bumps triage_session_count with week-rollover.
create or replace function public.confirm_triage(
  p_user uuid,
  p_card uuid,
  p_diagnosis text,
  p_severity public.severity,
  p_system_tag public.system_tag,
  p_contractor_tag public.contractor_tag,
  p_monitoring_cadence_days int,
  p_assistant_content text,
  p_user_round int,
  p_skip boolean,
  p_user_answer text,
  p_diy_expansion jsonb,
  p_contractor_expansion jsonb
)
returns table (card_id uuid)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_card_id uuid;
  v_monday date := (date_trunc('week', (now() at time zone 'utc'))::date);
begin
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Atomic predicate-guard: only confirm when still unconfirmed.
  -- Column-qualified per PR #24 / Gotchas #1.
  update public.cards
    set diagnosis = p_diagnosis,
        severity = p_severity,
        system_tag = p_system_tag,
        contractor_tag = p_contractor_tag,
        monitoring_cadence_days = p_monitoring_cadence_days,
        severity_confirmed = true,
        state = 'decide'::public.card_state,
        cost_estimate_diy = p_diy_expansion,
        cost_estimate_hire = p_contractor_expansion,
        updated_at = now()
    where public.cards.id = p_card
      and public.cards.user_id = p_user
      and public.cards.state = 'diagnosed'
      and public.cards.severity_confirmed = false
    returning public.cards.id into v_card_id;

  if v_card_id is null then
    raise exception 'qa_invalid_state' using errcode = 'P0001';
  end if;

  -- Optional user reply row when the user provided one (Send path;
  -- skip path omits).
  if p_skip = false and p_user_answer is not null then
    insert into public.triage_conversations (
      card_id, user_id, round, role, content, is_location_ask, tool_name
    )
    values (
      p_card, p_user, p_user_round, 'user', p_user_answer, false, null
    );
  end if;

  -- Always insert the assistant confirm_assessment row.
  insert into public.triage_conversations (
    card_id, user_id, round, role, content, is_location_ask, tool_name
  )
  values (
    p_card, p_user, p_user_round, 'assistant',
    p_assistant_content, false, 'confirm_assessment'
  );

  -- Atomic triage_session_count increment with week-rollover
  -- (same claim_card_slot upsert pattern from migration 006b).
  insert into usage_counters (user_id, triage_session_count, card_count, week_start, updated_at)
  values (p_user, 1, 0, v_monday, now())
  on conflict (user_id) do update
    set triage_session_count = case
          when usage_counters.week_start = v_monday
          then usage_counters.triage_session_count + 1
          else 1
        end,
        card_count = case
          when usage_counters.week_start = v_monday
          then usage_counters.card_count
          else 0
        end,
        week_start = v_monday,
        updated_at = now();

  return query select v_card_id;
end;
$$;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.mark_byok_used(uuid);
-- DROP FUNCTION IF EXISTS public.confirm_triage(
--   uuid, uuid, text, public.severity, public.system_tag, public.contractor_tag,
--   int, text, int, boolean, text, jsonb, jsonb
-- );
-- -- Restore confirm_triage to its migration 011 body (decide-state shape).
-- CREATE OR REPLACE FUNCTION public.confirm_triage(
--   p_user uuid,
--   p_card uuid,
--   p_diagnosis text,
--   p_severity public.severity,
--   p_system_tag public.system_tag,
--   p_contractor_tag public.contractor_tag,
--   p_monitoring_cadence_days int,
--   p_assistant_content text,
--   p_user_round int,
--   p_skip boolean,
--   p_user_answer text,
--   p_diy_expansion jsonb,
--   p_contractor_expansion jsonb
-- )
-- RETURNS TABLE (card_id uuid)
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_catalog
-- AS $$
-- DECLARE
--   v_card_id uuid;
-- BEGIN
--   IF p_user IS DISTINCT FROM auth.uid() THEN
--     RAISE EXCEPTION 'forbidden' USING errcode = '42501';
--   END IF;
--
--   UPDATE public.cards
--     SET diagnosis = p_diagnosis,
--         severity = p_severity,
--         system_tag = p_system_tag,
--         contractor_tag = p_contractor_tag,
--         monitoring_cadence_days = p_monitoring_cadence_days,
--         severity_confirmed = true,
--         state = 'decide'::public.card_state,
--         cost_estimate_diy = p_diy_expansion,
--         cost_estimate_hire = p_contractor_expansion,
--         updated_at = now()
--   WHERE public.cards.id = p_card
--     AND public.cards.user_id = p_user
--     AND public.cards.state = 'diagnosed'
--     AND public.cards.severity_confirmed = false
--   RETURNING public.cards.id INTO v_card_id;
--
--   IF v_card_id IS NULL THEN
--     RAISE EXCEPTION 'qa_invalid_state' USING errcode = 'P0001';
--   END IF;
--
--   IF p_skip = false AND p_user_answer IS NOT NULL THEN
--     INSERT INTO public.triage_conversations (
--       card_id, user_id, round, role, content, is_location_ask, tool_name
--     )
--     VALUES (
--       p_card, p_user, p_user_round, 'user', p_user_answer, false, null
--     );
--   END IF;
--
--   INSERT INTO public.triage_conversations (
--     card_id, user_id, round, role, content, is_location_ask, tool_name
--   )
--   VALUES (
--     p_card, p_user, p_user_round, 'assistant',
--     p_assistant_content, false, 'confirm_assessment'
--   );
--
--   RETURN QUERY SELECT v_card_id;
-- END;
-- $$;
