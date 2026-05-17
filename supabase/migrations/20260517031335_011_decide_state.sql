-- Migration 011 — decide-state. Extends card_state with 'decide' + 'planned'
-- via the canonical rename-recreate dance (006a template, transaction-safe).
-- Adds chosen_path + override jsonb columns. Updates confirm_triage RPC to
-- land cards at state='decide' (not 'diagnosed') and accept two new jsonb
-- params (p_diy_expansion, p_contractor_expansion) that write to existing
-- cost_estimate_diy + cost_estimate_hire columns. Creates commit_decide RPC
-- for path commitment. One-shot backfill UPDATE lifts existing confirmed
-- rows to state='decide'.
--
-- Source: specs/decide-state/spec.md § Data model changes — D1, D2, D3, D5, D11.
--
-- All statements transaction-safe per the 006a template. Every column
-- reference in WHERE/SET/RETURNING is qualified with public.cards.* per
-- the PR #24 / migration 009 lesson (plpgsql default #variable_conflict=error
-- collides bare names with RETURNS TABLE out-params).
--
-- Function-dependency dance (NOT in 006a — surfaced here because 007 +
-- 009 + 010 introduced functions whose RETURN signatures reference the
-- card_state type):
--   start_triage / complete_triage / confirm_triage all declare
--   `returns table (... public.card_state)`. The old type can't be
--   dropped while those signatures depend on it — so we DROP the
--   functions first, rename-recreate the type, then re-create the
--   functions against the new type. CREATE OR REPLACE doesn't work
--   here because we're physically dropping the old return-type signature.

-- 0. Drop functions that depend on public.card_state in their return-table
--    signatures. We recreate them at the bottom of this migration against
--    the new (wider) enum.
drop function if exists public.start_triage(uuid, uuid);
drop function if exists public.complete_triage(
  uuid, uuid, text, public.severity, public.system_tag, public.contractor_tag, text
);
drop function if exists public.confirm_triage(
  uuid, uuid, text, public.severity, public.system_tag, public.contractor_tag,
  int, text, int, boolean, text
);

-- 1. Rename-recreate the card_state enum, widening to 8 values.
--    Same recipe as 006a — drop default, alter column with text-via-text
--    cast, restore default, drop the old type. Transaction-safe.
alter type public.card_state rename to card_state_old;

create type public.card_state as enum (
  -- Original values from migration 001 + 006a — order preserved.
  'capturing',
  'triaging',
  'diagnosed',
  -- New for decide-state (PR N):
  'decide',
  'planned',
  -- Preserved from 001 + 006a:
  'monitoring',
  'closed',
  'dismissed'
);

alter table public.cards alter column state drop default;
alter table public.cards
  alter column state type public.card_state
  using state::text::public.card_state;
alter table public.cards
  alter column state set default 'capturing'::public.card_state;

drop type public.card_state_old;

-- 2. Add new cards columns.
--    chosen_path is text + CHECK rather than a native enum to avoid an
--    ALTER TYPE ADD VALUE migration for a single-column constraint.
alter table public.cards
  add column if not exists chosen_path text,
  add column if not exists cost_estimate_diy_override jsonb,
  add column if not exists cost_estimate_hire_override jsonb;

alter table public.cards
  drop constraint if exists cards_chosen_path_check;

alter table public.cards
  add constraint cards_chosen_path_check
    check (chosen_path is null or chosen_path in ('diy', 'contractor', 'monitor'));

-- 3. Backfill: existing diagnosed + severity_confirmed=true rows are lifted
--    to state='decide' (spec D11 step 5).
update public.cards
  set state = 'decide'::public.card_state
  where state = 'diagnosed'::public.card_state
    and severity_confirmed = true;

-- 4. Recreate start_triage (migration 009 body, unchanged except it now
--    references the new (wider) card_state enum via the same return-table
--    signature).
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

-- 5. Recreate complete_triage (migration 009 body, unchanged).
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

-- 6. Recreate confirm_triage with two extra params (p_diy_expansion,
--    p_contractor_expansion). Lands cards at state='decide' (NOT
--    'diagnosed') and writes the AI-generated expansions into the
--    existing cost_estimate_diy + cost_estimate_hire jsonb columns.
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

  -- Optional user reply row when the user provided one (Send path; skip
  -- path omits).
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

-- 7. commit_decide RPC — path commitment for the four buttons + the
--    "Change decision" re-open. SECURITY DEFINER + auth.uid() guard.
--    Every column reference qualified per PR #24 / Gotchas #1.
--
--    p_path values:
--      'diy'        → chosen_path='diy', state='planned'
--      'contractor' → chosen_path='contractor', state='planned'
--      'monitor'    → chosen_path='monitor', state='monitoring' + cadence
--      'dismiss'    → chosen_path=null, state='dismissed'
--      'decide'     → chosen_path=null, state='decide' (re-open from planned)
--
--    Predicate-guard: state IN ('decide', 'planned') only. Other states
--    raise invalid_state (P0001).
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

  if p_path is null or p_path not in ('diy', 'contractor', 'monitor', 'dismiss', 'decide') then
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
        and public.cards.state in ('decide'::public.card_state, 'planned'::public.card_state)
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  elsif p_path = 'contractor' then
    update public.cards
      set chosen_path = 'contractor',
          state = 'planned'::public.card_state,
          updated_at = now()
      where public.cards.id = p_card
        and public.cards.user_id = p_user
        and public.cards.state in ('decide'::public.card_state, 'planned'::public.card_state)
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  elsif p_path = 'monitor' then
    update public.cards
      set chosen_path = 'monitor',
          state = 'monitoring'::public.card_state,
          monitoring_cadence_days = p_cadence,
          updated_at = now()
      where public.cards.id = p_card
        and public.cards.user_id = p_user
        and public.cards.state in ('decide'::public.card_state, 'planned'::public.card_state)
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  elsif p_path = 'dismiss' then
    update public.cards
      set chosen_path = null,
          state = 'dismissed'::public.card_state,
          updated_at = now()
      where public.cards.id = p_card
        and public.cards.user_id = p_user
        and public.cards.state in ('decide'::public.card_state, 'planned'::public.card_state)
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  else
    -- p_path = 'decide' — re-open from planned (spec § Gotchas #5).
    update public.cards
      set chosen_path = null,
          state = 'decide'::public.card_state,
          updated_at = now()
      where public.cards.id = p_card
        and public.cards.user_id = p_user
        and public.cards.state in ('decide'::public.card_state, 'planned'::public.card_state)
      returning public.cards.id, public.cards.state, public.cards.chosen_path
        into v_card_id, v_state, v_chosen;
  end if;

  if v_card_id is null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  return query select v_card_id, v_state, v_chosen;
end;
$$;

-- ROLLBACK:
-- -- Drop the functions FIRST (cascade trap, spec § Gotchas #2): the
-- -- old type cannot be dropped while these functions reference it in
-- -- their return-table signatures.
-- drop function if exists public.commit_decide(uuid, uuid, text, int);
-- drop function if exists public.confirm_triage(uuid, uuid, text, public.severity, public.system_tag, public.contractor_tag, int, text, int, boolean, text, jsonb, jsonb);
-- drop function if exists public.complete_triage(uuid, uuid, text, public.severity, public.system_tag, public.contractor_tag, text);
-- drop function if exists public.start_triage(uuid, uuid);
-- -- Fold the new states back down before the rename-recreate.
-- -- Cast to text on the WHERE side so the comparison doesn't validate
-- -- 'decide'/'planned' against the current enum membership — ci-rollback-
-- -- explain.sh iterates 001→011 doing rollback+reapply on each, and prior
-- -- iterations leave card_state in the 6-value form (no 'decide'/'planned').
-- -- The state::text comparison is a no-op there; in the post-011 scenario
-- -- where rows DO have 'decide'/'planned', text comparison still matches.
-- update public.cards set state = 'diagnosed'::public.card_state
--   where state::text in ('decide', 'planned');
-- alter table public.cards drop constraint if exists cards_chosen_path_check;
-- alter table public.cards
--   drop column if exists cost_estimate_hire_override,
--   drop column if exists cost_estimate_diy_override,
--   drop column if exists chosen_path;
-- -- Rename-recreate the enum back to the 006a six-value shape.
-- alter type public.card_state rename to card_state_new;
-- create type public.card_state as enum (
--   'capturing', 'triaging', 'diagnosed', 'monitoring', 'closed', 'dismissed'
-- );
-- alter table public.cards alter column state drop default;
-- alter table public.cards
--   alter column state type public.card_state
--   using state::text::public.card_state;
-- alter table public.cards
--   alter column state set default 'capturing'::public.card_state;
-- drop type public.card_state_new;
-- -- Recreate start_triage / complete_triage / confirm_triage at their
-- -- migration-009/010 shapes (see migrations 009 + 010 for bodies).
