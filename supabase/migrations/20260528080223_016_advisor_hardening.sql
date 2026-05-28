-- Migration 016 — Supabase Advisor hardening (21 security + 20 performance).
-- Source: Studio Advisor (splinter lints) — 21 SECURITY WARN + 20 PERFORMANCE
-- WARN findings surfaced at http://127.0.0.1:54423/project/default.
--
-- Three classes of finding, all closed here with surgical ALTERs (no
-- function-body rewrites — bodies are unchanged, only attributes flip):
--
-- 1. PERFORMANCE / auth_rls_initplan (20 findings)
--    5 tables × 4 policies reference bare `auth.uid()`, which Postgres
--    re-evaluates per row. Wrapping as `(select auth.uid())` makes the
--    planner initplan it once per statement. `check_ins` (migration 015)
--    already uses the wrapped form — this brings the other 5 tables in line.
--    Convention: CLAUDE.md § SQL conventions #2.
--
-- 2. SECURITY / {anon,authenticated}_security_definer_function_executable
--    (20 findings = 10 RPCs × 2 roles, lints 0028/0029)
--    The 10 SECURITY DEFINER functions in `public` are EXECUTE-able by
--    anon + authenticated via PostgREST. DEFINER bypasses RLS, so the
--    advisor flags the exposure. Two sub-cases:
--      a. The 9 user-facing RPCs were DEFINER only to work around the
--         missing table grants that migration 008 later fixed. They touch
--         exclusively owner-scoped rows in tables the `authenticated` role
--         now has full DML on, with own-row RLS policies. Flipping them to
--         SECURITY INVOKER moves the trust boundary onto RLS (the idiomatic,
--         stronger pattern) and clears the lints. The internal
--         `p_user = auth.uid()` guard is retained as defense-in-depth (and
--         preserves the 42501→401 error contract the route handlers depend
--         on). Verified: PK defaults use gen_random_uuid() (EXECUTE-able by
--         authenticated) and authenticated holds USAGE on `extensions`, so
--         INVOKER execution has no privilege gap.
--      b. create_public_user_profile() is a signup-only trigger on
--         auth.users — it must stay SECURITY DEFINER (it inserts the new
--         public.users row before any RLS context exists). It is never an
--         RPC, so we revoke direct EXECUTE from anon/authenticated/public.
--         Trigger invocation is unaffected by EXECUTE grants.
--
-- 3. SECURITY / function_search_path_mutable (1 finding)
--    set_updated_at() (SECURITY INVOKER trigger fn) had no pinned
--    search_path. It only calls now() (pg_catalog), so an empty search_path
--    is both sufficient and the most hardened value.
--
-- NOT addressed (intentional): 2 PERFORMANCE/INFO unused_index findings
-- (triage_conversations_user_id_idx, cards_planned_reminder_due_idx) — these
-- back the user_id FK and the partial planned-reminder query respectively;
-- zero scans is a fresh-dev-DB artifact, not a real signal. INFO-level, not
-- part of the 20-WARN headline.

-- ---------------------------------------------------------------------------
-- 1. PERFORMANCE — wrap auth.uid() in a subquery for the 20 bare policies.
-- ---------------------------------------------------------------------------

-- users (owner self via auth.uid() = id)
alter policy users_select_own on public.users using ((select auth.uid()) = id);
alter policy users_insert_own on public.users with check ((select auth.uid()) = id);
alter policy users_update_own on public.users using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
alter policy users_delete_own on public.users using ((select auth.uid()) = id);

-- cards
alter policy cards_select_own on public.cards using ((select auth.uid()) = user_id);
alter policy cards_insert_own on public.cards with check ((select auth.uid()) = user_id);
alter policy cards_update_own on public.cards using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy cards_delete_own on public.cards using ((select auth.uid()) = user_id);

-- card_photos
alter policy card_photos_select_own on public.card_photos using ((select auth.uid()) = user_id);
alter policy card_photos_insert_own on public.card_photos with check ((select auth.uid()) = user_id);
alter policy card_photos_update_own on public.card_photos using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy card_photos_delete_own on public.card_photos using ((select auth.uid()) = user_id);

-- triage_conversations
alter policy triage_conversations_select_own on public.triage_conversations using ((select auth.uid()) = user_id);
alter policy triage_conversations_insert_own on public.triage_conversations with check ((select auth.uid()) = user_id);
alter policy triage_conversations_update_own on public.triage_conversations using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy triage_conversations_delete_own on public.triage_conversations using ((select auth.uid()) = user_id);

-- usage_counters
alter policy usage_counters_select_own on public.usage_counters using ((select auth.uid()) = user_id);
alter policy usage_counters_insert_own on public.usage_counters with check ((select auth.uid()) = user_id);
alter policy usage_counters_update_own on public.usage_counters using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy usage_counters_delete_own on public.usage_counters using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2a. SECURITY — flip the 9 user-facing RPCs to SECURITY INVOKER.
--     Bodies unchanged; the p_user = auth.uid() guard + RLS now jointly
--     enforce ownership.
-- ---------------------------------------------------------------------------

alter function public.answer_triage_round(uuid, uuid, text, text, text, boolean, integer) security invoker;
alter function public.claim_card_slot(uuid, text, text, public.system_tag, text) security invoker;
alter function public.close_card(uuid, uuid, integer, text) security invoker;
alter function public.commit_decide(uuid, uuid, text, integer) security invoker;
alter function public.complete_triage(uuid, uuid, text, public.severity, public.system_tag, public.contractor_tag, text) security invoker;
alter function public.confirm_triage(uuid, uuid, text, public.severity, public.system_tag, public.contractor_tag, integer, text, integer, boolean, text, jsonb, jsonb) security invoker;
alter function public.mark_byok_used(uuid) security invoker;
alter function public.record_checkin(uuid, uuid, text) security invoker;
alter function public.start_triage(uuid, uuid) security invoker;

-- ---------------------------------------------------------------------------
-- 2b. SECURITY — create_public_user_profile stays DEFINER (signup trigger),
--     but is not an RPC: revoke direct EXECUTE. Triggers fire regardless of
--     the invoking role's EXECUTE grant.
-- ---------------------------------------------------------------------------

revoke execute on function public.create_public_user_profile() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 3. SECURITY — pin set_updated_at's search_path. It only calls now()
--    (pg_catalog), so an empty search_path is sufficient and most hardened.
-- ---------------------------------------------------------------------------

alter function public.set_updated_at() set search_path = '';

-- Reload PostgREST's schema cache so the privilege + volatility changes take
-- effect on the next request.
notify pgrst, 'reload schema';

-- ROLLBACK:
-- alter policy users_select_own on public.users using (auth.uid() = id);
-- alter policy users_insert_own on public.users with check (auth.uid() = id);
-- alter policy users_update_own on public.users using (auth.uid() = id) with check (auth.uid() = id);
-- alter policy users_delete_own on public.users using (auth.uid() = id);
-- alter policy cards_select_own on public.cards using (auth.uid() = user_id);
-- alter policy cards_insert_own on public.cards with check (auth.uid() = user_id);
-- alter policy cards_update_own on public.cards using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- alter policy cards_delete_own on public.cards using (auth.uid() = user_id);
-- alter policy card_photos_select_own on public.card_photos using (auth.uid() = user_id);
-- alter policy card_photos_insert_own on public.card_photos with check (auth.uid() = user_id);
-- alter policy card_photos_update_own on public.card_photos using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- alter policy card_photos_delete_own on public.card_photos using (auth.uid() = user_id);
-- alter policy triage_conversations_select_own on public.triage_conversations using (auth.uid() = user_id);
-- alter policy triage_conversations_insert_own on public.triage_conversations with check (auth.uid() = user_id);
-- alter policy triage_conversations_update_own on public.triage_conversations using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- alter policy triage_conversations_delete_own on public.triage_conversations using (auth.uid() = user_id);
-- alter policy usage_counters_select_own on public.usage_counters using (auth.uid() = user_id);
-- alter policy usage_counters_insert_own on public.usage_counters with check (auth.uid() = user_id);
-- alter policy usage_counters_update_own on public.usage_counters using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- alter policy usage_counters_delete_own on public.usage_counters using (auth.uid() = user_id);
-- alter function public.answer_triage_round(uuid, uuid, text, text, text, boolean, integer) security definer;
-- alter function public.claim_card_slot(uuid, text, text, public.system_tag, text) security definer;
-- alter function public.close_card(uuid, uuid, integer, text) security definer;
-- alter function public.commit_decide(uuid, uuid, text, integer) security definer;
-- alter function public.complete_triage(uuid, uuid, text, public.severity, public.system_tag, public.contractor_tag, text) security definer;
-- alter function public.confirm_triage(uuid, uuid, text, public.severity, public.system_tag, public.contractor_tag, integer, text, integer, boolean, text, jsonb, jsonb) security definer;
-- alter function public.mark_byok_used(uuid) security definer;
-- alter function public.record_checkin(uuid, uuid, text) security definer;
-- alter function public.start_triage(uuid, uuid) security definer;
-- grant execute on function public.create_public_user_profile() to anon, authenticated;
-- alter function public.set_updated_at() reset search_path;
-- notify pgrst, 'reload schema';
