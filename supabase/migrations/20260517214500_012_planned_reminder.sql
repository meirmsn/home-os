-- Migration 012 — planned-state reminder column.
-- Additive: adds cards.planned_reminder_date + a partial index for the
-- dashboard's future "reminder due in N days" query (spec § D1, D9).
--
-- Source: specs/planned-state/spec.md § Data model changes — D1, D9.
--
-- Plain additive migration: no enum touched, no rename-recreate dance, no
-- function-dependency dance. Migration 008's
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,
-- authenticated` already covers the new column for `authenticated` SELECTs
-- (we're adding a COLUMN to an existing already-granted TABLE — column
-- grants are inherited, not per-column).
--
-- No CHECK constraint on past/future date: D1 explicitly allows past dates
-- (a user setting "remind me yesterday" intentionally — the never-overdue
-- chip still applies, the input gate is in the route's body parser).
--
-- No `updated_at` trigger change: the existing cards_updated_at BEFORE
-- UPDATE trigger from migration 005 already covers row touches.

-- 1. Additive column. date semantics — calendar, not clock.
alter table public.cards
  add column if not exists planned_reminder_date date;

-- 2. Partial index for PR #4 (dashboard) "reminder-due in next N days"
--    sort. Predicate keyed on state='planned' AND
--    planned_reminder_date IS NOT NULL so the index stays small (capturing
--    / triaging / decide / monitoring / closed / dismissed cards never
--    contribute rows; planned cards with no reminder never contribute
--    either).
create index if not exists cards_planned_reminder_due_idx
  on public.cards (planned_reminder_date)
  where state = 'planned'::public.card_state
    and planned_reminder_date is not null;

-- 3. Force PostgREST to reload its in-memory schema cache. ADD COLUMN
--    alone doesn't trigger Supabase's auto-refresh in the local-stack
--    `supabase start` shape (decide-state PR #27's migration 011 got
--    lucky because rename-recreate of the enum + ALTER COLUMN TYPE
--    caused a deeper refresh). Without this, the new column exists in
--    Postgres but every PostgREST request that names it returns
--    `PGRST204: Could not find the '<col>' column of '<table>' in the
--    schema cache`. The canonical PostgREST mechanism is the NOTIFY
--    below (https://postgrest.org/en/stable/references/schema_cache.html).
notify pgrst, 'reload schema';

-- Rollback (commented in-file per PR #1 / migration 006a convention).
-- Reserved for a true schema crisis. Uncommenting drops user-set reminder
-- dates — forward-fix the route / component bugs instead.
--
-- DROP INDEX IF EXISTS public.cards_planned_reminder_due_idx;
-- ALTER TABLE public.cards DROP COLUMN IF EXISTS planned_reminder_date;
