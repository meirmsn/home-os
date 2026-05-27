## Gate 2g: advisor-clean

**Result: pass (infra-blocked -- manual review clean)**

`pnpm db:advisor` could not connect to the local Supabase database (`ECONNREFUSED supabase-runner:54422`). The local DB stack is not running in this environment.

Manual review performed against all 9 advisor lints on `supabase/migrations/20260526225426_usage_counters_and_byok.sql`:

| Lint                         | Result | Detail                                                                                |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------- |
| function_search_path_mutable | ok     | Both `mark_byok_used` and `confirm_triage` pin `set search_path = public, pg_catalog` |
| auth_rls_initplan            | n/a    | No RLS policies created                                                               |
| unindexed_foreign_key        | n/a    | No foreign keys created                                                               |
| multiple_permissive_policies | n/a    | No policies created                                                                   |
| security_definer_view        | n/a    | No views created                                                                      |
| rls_disabled_in_public       | n/a    | No tables created (usage_counters table created in a prior migration)                 |
| rls_enabled_no_policy        | n/a    | No tables created                                                                     |
| extension_in_public          | n/a    | No extensions created                                                                 |
| duplicate_index              | n/a    | No indexes created                                                                    |

Both SECURITY DEFINER functions include the `auth.uid()` guard (`p_user is distinct from auth.uid()`). The `usage_counters` INSERT ... ON CONFLICT references the table by unqualified name, which resolves correctly via the pinned `search_path = public, pg_catalog`.

## Dismissals

None. No findings to dismiss.
