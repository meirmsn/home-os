## Gate 2g: advisor-clean

**Result: BLOCKED (DB not running)**

### Analysis

`pnpm db:advisor` could not connect to the local Supabase stack:

```
blocked: cannot connect to postgresql://postgres:postgres@supabase-runner:54422/postgres: connect ECONNREFUSED 172.20.0.2:54422
If the local Supabase stack isn't up, run `pnpm db:start` first.
```

The advisor script (`scripts/advisor-probe.mjs`) requires a running local Supabase database to introspect the schema and run lint checks. The database container (`supabase-runner`) is not currently running.

**Manual verification of migration 013 against CLAUDE.md SQL conventions:**

1. **SECURITY DEFINER pins search_path**: `close_card` declares `set search_path = public, pg_catalog` (line 49). PASS.
2. **RLS policies wrap auth.uid() in subquery**: No new RLS policies are added in migration 013 (the RPC is SECURITY DEFINER, which bypasses RLS by design). Existing RLS policies in migration 003 use bare `auth.uid()` (not subquery-wrapped), but that is a pre-existing condition outside migration 013's scope. N/A for this migration.
3. **Every foreign key has a backing index**: Migration 013 adds no foreign keys. N/A.

The advisor would also check for unindexed foreign keys and other schema-level issues across all migrations. Without the DB running, the full automated check cannot be completed.

### Dismissals

None. Gate is blocked on infrastructure (DB down), not on a code issue. Re-run after `pnpm db:start`.
