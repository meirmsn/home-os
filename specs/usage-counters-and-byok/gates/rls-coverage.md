## Gate 2b: rls-coverage

**Migration**: `supabase/migrations/20260526225426_usage_counters_and_byok.sql`
**Result**: pass

### SECURITY DEFINER functions -- search_path pinning

| Function               | `security definer` | `set search_path`              | Verdict |
| ---------------------- | ------------------ | ------------------------------ | ------- |
| `mark_byok_used(uuid)` | yes (line 23)      | `public, pg_catalog` (line 24) | pass    |
| `confirm_triage(...)`  | yes (line 65)      | `public, pg_catalog` (line 66) | pass    |

Both functions pin `search_path` per project convention (`CLAUDE.md` SQL conventions #1).

### SECURITY DEFINER functions -- caller identity guard

| Function         | Guard                                                                                 | Verdict |
| ---------------- | ------------------------------------------------------------------------------------- | ------- |
| `mark_byok_used` | `if p_user is distinct from auth.uid() then raise exception 'forbidden'` (line 27-29) | pass    |
| `confirm_triage` | `if p_user is distinct from auth.uid() then raise exception 'forbidden'` (line 72-74) | pass    |

Both functions verify `p_user = auth.uid()` before mutating data, preventing privilege escalation through the SECURITY DEFINER bypass of RLS.

### Tables touched -- RLS coverage

| Table                  | Operation in migration                       | RLS enabled | Policies (migration 003)        | Verdict |
| ---------------------- | -------------------------------------------- | ----------- | ------------------------------- | ------- |
| `users`                | UPDATE (mark_byok_used)                      | yes         | select/insert/update/delete own | pass    |
| `cards`                | UPDATE (confirm_triage)                      | yes         | select/insert/update/delete own | pass    |
| `triage_conversations` | INSERT (confirm_triage)                      | yes         | select/insert/update/delete own | pass    |
| `usage_counters`       | INSERT + ON CONFLICT UPDATE (confirm_triage) | yes         | select/insert/update/delete own | pass    |

All four tables have RLS enabled with full CRUD policies scoped to `auth.uid() = user_id` (or `= id` for `users`). The SECURITY DEFINER functions bypass RLS at execution time but enforce ownership via the `p_user = auth.uid()` guard checked before any DML.

### auth.uid() subquery wrapping in RLS policies

This migration creates no new RLS policies. The existing policies in migration 003 use bare `auth.uid()` rather than `(select auth.uid())` -- this is a pre-existing condition across all tables, not introduced by this migration. The two `auth.uid()` calls inside the SECURITY DEFINER function bodies (lines 27, 72) are procedural single-evaluation calls, not per-row RLS predicate evaluations, so the subquery-wrap convention does not apply to them.

### No new tables created

The migration creates/replaces functions only -- no `CREATE TABLE` statements. No new RLS enablement or policy creation required.

## Dismissals

None. All checks passed with no findings to dismiss.
