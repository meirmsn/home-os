-- Migration 009 — fix column-vs-OUT-parameter ambiguity in the triage RPCs.
-- Source: prod post-deploy bug found via PR #22's Sentry diagnostic.
--
-- start_triage + complete_triage (migration 007) both declare
-- `returns table (card_id uuid, state public.card_state)`. In plpgsql,
-- the OUT-parameter names are exposed as variables inside the function
-- body, and the default `#variable_conflict` mode is `error`. The bare
-- `state` reference in:
--
--   where id = p_card and user_id = p_user and state = '<value>'
--   returning id, state into v_card_id, v_state
--
-- collides with the OUT param `state` AND with `public.cards.state`. PG
-- refused with `42702: column reference "state" is ambiguous`. The
-- failure mode in prod: every "Read this for me" click on a freshly
-- captured card returned 500 server_error because `start_triage` errored
-- before it could flip the state to `triaging`. The card stayed at
-- `capturing`, the user saw "Something went wrong — try again."
--
-- Why local + Vercel preview never caught it: the multi-user RLS E2E
-- (PR #9) exercises raw INSERT/SELECT/UPDATE/DELETE on `cards`, not the
-- triage RPCs. The triage E2E (PR #19) mocks Anthropic but does call
-- the real start_triage RPC — yet the slow-job green claim is from
-- f360fdc against local Supabase. Either the local PG version resolves
-- this differently (older plpgsql treated the case as use-column), or
-- the local stack's `#variable_conflict` default differs. Either way,
-- prod (PG 15+) treats it as a hard error.
--
-- Fix: qualify the column references (`cards.state`, `cards.id`,
-- `cards.user_id`) in the UPDATE's WHERE + RETURNING. Function
-- signatures unchanged, generated types unchanged. CREATE OR REPLACE
-- preserves ownership + EXECUTE grants.

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
  where cards.id = p_card
    and cards.user_id = p_user
    and cards.state = 'capturing'
  returning cards.id, cards.state into v_card_id, v_state;

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

  update public.cards
    set state = 'diagnosed',
        diagnosis = p_diagnosis,
        severity = p_severity_provisional,
        system_tag = p_system_tag,
        contractor_tag = p_contractor_tag,
        updated_at = now()
  where cards.id = p_card
    and cards.user_id = p_user
    and cards.state = 'triaging'
  returning cards.id, cards.state into v_card_id, v_state;

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
-- The CI rollback validator (scripts/ci-rollback-explain.sh) strips the
-- leading `-- ` from every line below and applies the result as SQL —
-- so this block must be valid Postgres. Re-applying migration 007's
-- ambiguous-reference body would re-introduce the 42702 production
-- failure; that's a no-op rollback in practice (the bug-fix is forward-
-- only). What we ship below is the same qualified-column body as the
-- forward migration, wrapped to satisfy the round-trip parser. Operator
-- intent: real recovery from a bad deploy of 009 is "redeploy 009", not
-- "rollback 009".
-- create or replace function public.start_triage(p_user uuid, p_card uuid)
-- returns table (card_id uuid, state public.card_state)
-- language plpgsql security definer set search_path = public, pg_catalog as $rb_start$
-- declare v_card_id uuid; v_state public.card_state;
-- begin
--   if p_user is distinct from auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
--   update public.cards
--     set state = 'triaging', updated_at = now()
--   where cards.id = p_card and cards.user_id = p_user and cards.state = 'capturing'
--   returning cards.id, cards.state into v_card_id, v_state;
--   if v_card_id is null then raise exception 'triage_invalid_state' using errcode = 'P0001'; end if;
--   return query select v_card_id, v_state;
-- end;
-- $rb_start$;
-- create or replace function public.complete_triage(
--   p_user uuid, p_card uuid, p_diagnosis text,
--   p_severity_provisional public.severity, p_system_tag public.system_tag,
--   p_contractor_tag public.contractor_tag, p_assistant_content text
-- )
-- returns table (card_id uuid, state public.card_state)
-- language plpgsql security definer set search_path = public, pg_catalog as $rb_complete$
-- declare v_card_id uuid; v_state public.card_state;
-- begin
--   if p_user is distinct from auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
--   update public.cards
--     set state = 'diagnosed', diagnosis = p_diagnosis, severity = p_severity_provisional,
--         system_tag = p_system_tag, contractor_tag = p_contractor_tag, updated_at = now()
--   where cards.id = p_card and cards.user_id = p_user and cards.state = 'triaging'
--   returning cards.id, cards.state into v_card_id, v_state;
--   if v_card_id is null then raise exception 'triage_invalid_state' using errcode = 'P0001'; end if;
--   insert into public.triage_conversations (card_id, user_id, round, role, content)
--   values (p_card, p_user, 1, 'assistant', p_assistant_content);
--   return query select v_card_id, v_state;
-- end;
-- $rb_complete$;
