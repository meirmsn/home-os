-- Migration 006a — extend card_state with the 'dismissed' terminal value.
-- Source: specs/capture-flow/spec.md § Data model changes § 006a (D2 #2).
--
-- Why not `ALTER TYPE ... ADD VALUE`:
--   That statement cannot run inside a transaction block (Postgres
--   restriction). The Supabase migration applier wraps each .sql file
--   in an implicit transaction during `supabase start`, so an ADD VALUE
--   statement silently no-ops — even isolated in its own file. The
--   "Applying migration ..." log line is emitted regardless, AND
--   `supabase gen types --local` reflects whatever the apply step
--   *should* have produced (so the type-drift check still passes),
--   so the bug is invisible until an INSERT with the new value fails
--   at runtime with `invalid input value for enum card_state: "dismissed"`.
--
-- Fix: use the canonical Postgres workaround — rename the old type,
-- create the new type with the extra value, cast the column via text,
-- drop the renamed old type. Every statement is transaction-safe and
-- the column data round-trips cleanly because the existing five values
-- are a prefix of the new six.

alter type public.card_state rename to card_state_old;

create type public.card_state as enum (
  -- Original values from migration 001 — order preserved.
  'capturing',
  'triaging',
  'diagnosed',
  'monitoring',
  'closed',
  -- New for capture-flow:
  'dismissed'
);

-- ALTER COLUMN TYPE rejects columns with a DEFAULT that references the
-- old type — drop the default, recast, then restore the default against
-- the new type.
alter table public.cards alter column state drop default;
alter table public.cards
  alter column state type public.card_state
  using state::text::public.card_state;
alter table public.cards
  alter column state set default 'capturing'::public.card_state;

drop type public.card_state_old;

-- ROLLBACK:
-- alter type public.card_state rename to card_state_new;
-- create type public.card_state as enum (
--   'capturing', 'triaging', 'diagnosed', 'monitoring', 'closed'
-- );
-- alter table public.cards alter column state drop default;
-- alter table public.cards
--   alter column state type public.card_state
--   using state::text::public.card_state;
-- alter table public.cards alter column state set default 'capturing'::public.card_state;
-- drop type public.card_state_new;
