-- Migration 017 — bring the prod `rls_auto_enable` event trigger into the repo
-- and harden its grant.
-- Source: /ak-go-live canary on migration 016 (PR #40) surfaced this via the
-- prod Supabase Advisor — `public.rls_auto_enable()` is a SECURITY DEFINER
-- function present in PROD but in NO repo migration (schema drift). It was
-- installed directly at project-setup time (the `ensure_rls` event trigger
-- auto-enables RLS on every new `public` table — defense-in-depth so no table
-- is ever created without RLS). Because `PUBLIC` holds the default `EXECUTE`,
-- the advisor flagged it as {anon,authenticated}_security_definer_function_executable.
--
-- This migration:
--   1. CREATE OR REPLACE the function with its EXACT prod body — idempotent
--      replace on prod, fresh create on local (eliminating the local↔prod drift
--      so `db:reset` reproduces prod).
--   2. REVOKE EXECUTE from PUBLIC/anon/authenticated. Event-trigger functions
--      are invoked by the trigger mechanism, NOT via the caller's EXECUTE
--      privilege, so the `ensure_rls` trigger keeps firing. This closes the two
--      advisor findings. (Calling it as an RPC was already inert — its body
--      calls pg_event_trigger_ddl_commands(), which errors outside an event
--      trigger context — but the advisor can't see that.)
--   3. Create the `ensure_rls` event trigger if absent — no-op on prod (already
--      there), fresh create on local for parity. Guarded via a DO block because
--      CREATE EVENT TRIGGER has no IF NOT EXISTS.
--
-- The body below is copied verbatim from prod (`pg_get_functiondef`), so the
-- CREATE OR REPLACE is a true no-op on the production definition.

create or replace function public.rls_auto_enable()
  returns event_trigger
  language plpgsql
  security definer
  set search_path to 'pg_catalog'
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
     if cmd.schema_name is not null and cmd.schema_name in ('public') and cmd.schema_name not in ('pg_catalog','information_schema') and cmd.schema_name not like 'pg_toast%' and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
     else
        raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     end if;
  end loop;
end;
$$;

-- Harden: event triggers fire independent of the EXECUTE grant, so revoking
-- direct callability removes the PostgREST RPC exposure the advisor flagged
-- without affecting the `ensure_rls` trigger.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Track the event trigger too (parity). No-op on prod where it already exists.
do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end
      execute function public.rls_auto_enable();
  end if;
end $$;

notify pgrst, 'reload schema';

-- ROLLBACK:
-- grant execute on function public.rls_auto_enable() to public;
-- -- (the ensure_rls trigger + function pre-date the repo; a true rollback
-- --  would not drop them since prod relies on the trigger. Re-granting EXECUTE
-- --  to PUBLIC restores the pre-migration grant posture.)
-- notify pgrst, 'reload schema';
