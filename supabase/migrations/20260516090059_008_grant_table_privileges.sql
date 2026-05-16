-- Migration 008 — grant table privileges to the authenticated role.
-- Source: post-deploy fix for the card-detail-404 production bug
-- (fix/cards-detail-404-diagnostics → PR #22 added the Sentry diagnostic
-- that surfaced the underlying error; this migration is the actual fix).
--
-- Production manifested as: every `/cards/[id]` navigation 404'd
-- immediately after a successful capture. PR #22's Sentry captureException
-- on the cards SELECT path fired with `code: 42501` /
-- `message: permission denied for table cards` — a SQL-level table
-- privilege error, NOT an RLS denial. The `authenticated` Postgres role
-- lacked SELECT on public.cards (and the other 4 public tables).
--
-- Why the route-handler writes worked: every write surface goes through
-- a SECURITY DEFINER RPC (claim_card_slot in migration 006b,
-- start_triage + complete_triage in migration 007). SECURITY DEFINER
-- functions run as the function owner (postgres on Supabase), which
-- bypasses table-level privileges of the calling role. The cap claim +
-- card insert succeeded; the redirect target then died on the first
-- direct PostgREST SELECT.
--
-- Why local + Vercel-preview passed: standard `supabase init` scaffolding
-- ships a default-privileges block (`alter default privileges in schema
-- public grant all on tables to anon, authenticated`) in
-- `supabase/seed.sql` / Supabase project bootstrap. The home-os prod
-- project (kxhxbbljgunpjfhivccb) was created without that block at
-- /ak-new-project time, so each table from migration 002 inherited only
-- the default Postgres privileges (postgres-only). E2E + the preview deploy
-- both target local Supabase, which had the standard defaults.
--
-- Trust boundary unchanged: RLS policies in migration 003 (auth.uid() =
-- user_id) remain the row-level guard. This migration only opens the
-- table-level door so the per-row predicate gets a chance to run.

-- 1. Schema USAGE — required before any role can touch tables in the schema.
-- Idempotent. Default for new Supabase projects, but explicit here so
-- a re-applied migration on a stripped DB doesn't regress.
grant usage on schema public to authenticated, service_role;

-- 2. Per-table privileges on the 5 public tables. Per-table form (not
-- `grant ... on all tables in schema public`) so the migration's intent
-- is self-documenting + the rollback block can match shape-for-shape.
grant select, insert, update, delete on table
  public.users,
  public.cards,
  public.triage_conversations,
  public.card_photos,
  public.usage_counters
to authenticated;

grant all on table
  public.users,
  public.cards,
  public.triage_conversations,
  public.card_photos,
  public.usage_counters
to service_role;

-- 3. Default privileges for future tables. Any table added by a later
-- migration in this schema picks these up automatically. Without this,
-- every new-table migration would need to remember the GRANTs (the trap
-- that produced this bug in the first place).
alter default privileges in schema public
  grant all on tables to authenticated, service_role;

-- 4. Reload PostgREST's in-memory schema cache so the new privileges
-- take effect on the next request without waiting for the periodic
-- refresh interval.
notify pgrst, 'reload schema';

-- ROLLBACK:
-- alter default privileges in schema public revoke all on tables from authenticated, service_role;
-- revoke all on table
--   public.users,
--   public.cards,
--   public.triage_conversations,
--   public.card_photos,
--   public.usage_counters
-- from service_role;
-- revoke select, insert, update, delete on table
--   public.users,
--   public.cards,
--   public.triage_conversations,
--   public.card_photos,
--   public.usage_counters
-- from authenticated;
-- notify pgrst, 'reload schema';
