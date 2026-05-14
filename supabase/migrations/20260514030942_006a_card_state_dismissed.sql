-- Migration 006a — extend card_state with the 'dismissed' terminal value.
-- Source: specs/capture-flow/spec.md § Data model changes § 006a (D2 #2).
--
-- Lives alone in its own file because ALTER TYPE ADD VALUE cannot run
-- inside a transaction; the Supabase migration runner wraps each .sql
-- file in a transaction. Splitting keeps 006b transactional-and-atomic
-- for everything else. See specs/capture-flow/spec.md § Gotchas.

-- Rollback notes (kept above the ROLLBACK marker so the round-trip
-- script in scripts/ci-rollback-explain.sh sees an empty block and
-- SKIPs this migration cleanly):
--   ALTER TYPE ... ADD VALUE is not reversible in standard Postgres.
--   Recreating the enum without the new value would orphan any
--   dependent column. Acceptable for v0 pre-launch.
--   See spec § Rollback for the destructive recreate-the-type recipe
--   if a hard re-roll is ever mandated.

alter type public.card_state add value if not exists 'dismissed';

-- ROLLBACK:
