-- Migration 010 — triage-conversation Q&A loop schema + RPCs.
-- Source: specs/triage-conversation/spec.md § Data model changes (D5).
--
-- 1. Adds cards.severity_confirmed (boolean, default false) — D2 trade-off.
-- 2. Adds triage_conversations.is_location_ask (boolean, default false) — D6.
-- 3. Adds triage_conversations.tool_name (text, nullable) — discriminates the
--    three tool-use producers (record_initial_read | ask_next_question |
--    confirm_assessment); enables render-by-tool dispatch in <DiagnosedThread />.
-- 4. Back-fills tool_name='record_initial_read' on pre-existing assistant rows
--    from PR #19 (D5 migration-ordering note + spec § Gotchas #6).
-- 5. Widens triage_round_in_range CHECK constraint from 1..3 to 1..5
--    (initial=1; up to 3 Q&A rounds = round 4; +1 location-ask = round 5).
-- 6. answer_triage_round(p_user, p_card, p_user_answer, p_assistant_content,
--      p_tool_name, p_is_location_ask, p_user_round) — atomic INSERT of the
--    paired (user, assistant) rows. SECURITY DEFINER + auth.uid() guard.
-- 7. confirm_triage(p_user, p_card, p_diagnosis, p_severity, p_system_tag,
--      p_contractor_tag, p_monitoring_cadence_days, p_assistant_content,
--      p_user_round, p_skip, p_user_answer) — atomic: optional user row INSERT
--    when !p_skip + assistant row INSERT + cards UPDATE (state stays diagnosed
--    but severity_confirmed flips to true + diagnosis/severity/tags/cadence
--    captured). SECURITY DEFINER + auth.uid() guard.
--
-- Both RPCs column-qualify every reference in WHERE / SET / RETURNING per
-- the PR #24 / migration 009 lesson (spec § Gotchas #1). plpgsql exposes
-- RETURNS TABLE column names as variables inside the function body and the
-- default #variable_conflict mode is `error`, so bare `id`, `state`,
-- `card_id` references would 42702 at runtime.
--
-- Idempotent: column adds use `if not exists`; backfill is WHERE-narrowed
-- to only affect prior assistant rows where tool_name is still null;
-- CHECK swap uses `drop constraint if exists` then re-add; functions use
-- `create or replace`.

alter table public.cards
  add column if not exists severity_confirmed boolean not null default false;

alter table public.triage_conversations
  add column if not exists is_location_ask boolean not null default false;

alter table public.triage_conversations
  add column if not exists tool_name text;

-- Backfill PR #19's initial-read assistant rows so <ConversationRow />'s
-- render-by-tool-name dispatcher renders them correctly (spec § Gotchas #6).
update public.triage_conversations
  set tool_name = 'record_initial_read'
  where role = 'assistant' and tool_name is null and round = 1;

-- Widen the round CHECK. Initial read = round 1; Q&A rounds 2/3/4; +1
-- location-ask round = 5 ceiling (spec § Data model changes).
alter table public.triage_conversations
  drop constraint if exists triage_round_in_range;

alter table public.triage_conversations
  add constraint triage_round_in_range check (round between 1 and 5);

create or replace function public.answer_triage_round(
  p_user uuid,
  p_card uuid,
  p_user_answer text,
  p_assistant_content text,
  p_tool_name text,
  p_is_location_ask boolean,
  p_user_round int
)
returns table (assistant_row_id uuid)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_assistant_id uuid;
begin
  -- Auth-internal guard. SECURITY DEFINER bypasses RLS on the INSERT,
  -- so this is the only thing keeping a malicious authenticated user
  -- from poking another user's thread via direct PostgREST RPC.
  if p_user is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Predicate-guard: only proceed when the card is in diagnosed +
  -- not-yet-confirmed. Concurrent confirms can't trample.
  -- Column-qualified per PR #24 / Gotchas #1.
  if not exists (
    select 1
    from public.cards
    where public.cards.id = p_card
      and public.cards.user_id = p_user
      and public.cards.state = 'diagnosed'
      and public.cards.severity_confirmed = false
  ) then
    raise exception 'qa_invalid_state' using errcode = 'P0001';
  end if;

  -- Insert the user reply row.
  insert into public.triage_conversations (
    card_id, user_id, round, role, content, is_location_ask, tool_name
  )
  values (
    p_card, p_user, p_user_round, 'user',
    p_user_answer, p_is_location_ask, null
  );

  -- Insert the assistant question row. Capture the row id for the
  -- caller (lets future audits correlate the round's pair).
  insert into public.triage_conversations (
    card_id, user_id, round, role, content, is_location_ask, tool_name
  )
  values (
    p_card, p_user, p_user_round, 'assistant',
    p_assistant_content, p_is_location_ask, p_tool_name
  )
  returning public.triage_conversations.id into v_assistant_id;

  return query select v_assistant_id;
end;
$$;

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
  p_user_answer text
)
returns table (card_id uuid)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_card_id uuid;
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
        updated_at = now()
  where public.cards.id = p_card
    and public.cards.user_id = p_user
    and public.cards.state = 'diagnosed'
    and public.cards.severity_confirmed = false
  returning public.cards.id into v_card_id;

  if v_card_id is null then
    raise exception 'qa_invalid_state' using errcode = 'P0001';
  end if;

  -- Optional user reply row when the user provided one (Send path; skip path omits).
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

  return query select v_card_id;
end;
$$;

-- ROLLBACK:
-- drop function if exists public.confirm_triage(uuid, uuid, text, severity, system_tag, contractor_tag, int, text, int, boolean, text);
-- drop function if exists public.answer_triage_round(uuid, uuid, text, text, text, boolean, int);
-- alter table public.triage_conversations drop constraint if exists triage_round_in_range;
-- alter table public.triage_conversations add constraint triage_round_in_range check (round between 1 and 3);
-- alter table public.triage_conversations drop column if exists tool_name;
-- alter table public.triage_conversations drop column if exists is_location_ask;
-- alter table public.cards drop column if exists severity_confirmed;
