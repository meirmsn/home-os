## Gate 2e: migration-rollback-roundtrip

**Migration**: `supabase/migrations/20260527064802_015_monitor_beta.sql`
**Status**: findings (2) pending

### Checklist

| Forward change                                            | Rollback covers it? | Notes                                                                                                                    |
| --------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Rename-recreate `touchpoint_type` enum (add `'checkin'`)  | Yes                 | Correct rename-recreate pattern (not `ALTER TYPE ... DROP VALUE`). Reverts to `('primary','context','closeup','close')`. |
| Create `check_ins` table                                  | Yes                 | `DROP TABLE IF EXISTS public.check_ins` -- indexes dropped implicitly.                                                   |
| RLS enable + 4 policies on `check_ins`                    | Yes                 | All four policies dropped, RLS disabled before table drop.                                                               |
| Create `record_checkin` function                          | Yes                 | `DROP FUNCTION IF EXISTS public.record_checkin(uuid, uuid, text)` -- signature matches.                                  |
| Drop + recreate `commit_decide` (widened state predicate) | Partial             | Function is dropped but **not recreated** at migration-011 shape. See Finding 1.                                         |
| `GRANT ALL` on `check_ins` to `authenticated`/`anon`      | Yes                 | Implicitly revoked by `DROP TABLE`.                                                                                      |
| `NOTIFY pgrst, 'reload schema'`                           | No                  | See Finding 2.                                                                                                           |

### Findings

**Finding 1 (medium): Rollback drops `commit_decide` but does not restore the migration-011 body.**

Lines 243 + 257-258 drop `commit_decide` and leave a comment: "Restore commit_decide to migration 011 body (state predicate without 'monitoring'). (See migration 011 for full function body.)" A comment-reference is not executable SQL. After running the rollback, `commit_decide` would be **missing entirely** -- the decide screen would 500 on every path commitment. The rollback must include the full `CREATE OR REPLACE FUNCTION public.commit_decide(...)` body from migration 011 (state predicate `IN ('decide', 'planned')` without `'monitoring'`).

**Finding 2 (low): Rollback omits `NOTIFY pgrst, 'reload schema'`.**

The forward migration notifies PostgREST to reload the schema cache after adding the new table and enum value. The rollback removes the table and reverts the enum but does not fire the same notification. PostgREST would serve stale schema metadata (referencing the dropped `check_ins` table and the removed `'checkin'` enum value) until the next automatic reload cycle. Add `-- NOTIFY pgrst, 'reload schema';` as the final rollback line.

### Dismissals

None.
