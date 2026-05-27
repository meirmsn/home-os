## Gate 2e: migration-rollback-roundtrip

**Result: findings (1) fixed**

### Scope

Migration: `supabase/migrations/20260526225426_usage_counters_and_byok.sql`
Prior version of `confirm_triage`: `supabase/migrations/20260517031335_011_decide_state.sql` (section 6, lines 179-251).

### Forward operations

| #   | Operation                    | Object                                                                      |
| --- | ---------------------------- | --------------------------------------------------------------------------- |
| 1   | `CREATE OR REPLACE FUNCTION` | `public.mark_byok_used(uuid)`                                               |
| 2   | `DROP FUNCTION IF EXISTS`    | `public.confirm_triage(13 params)` (011 body)                               |
| 3   | `CREATE OR REPLACE FUNCTION` | `public.confirm_triage(13 params)` (014 body, adds usage-counter increment) |

### Rollback coverage check

| Forward op                                | Rollback step                                                                                         | Status                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| CREATE `mark_byok_used`                   | `DROP FUNCTION IF EXISTS public.mark_byok_used(uuid)`                                                 | covered                                        |
| DROP + CREATE `confirm_triage` (014 body) | `DROP FUNCTION IF EXISTS public.confirm_triage(...)` then full `CREATE OR REPLACE` restoring 011 body | **fixed** -- was a stub reference, now inlined |

### Finding

**F1 (fixed in f1bd1f2): ROLLBACK block did not include the full `confirm_triage` 011 body.**
The original rollback block dropped `confirm_triage` and left a prose comment: "Then re-create confirm_triage using the migration 011 body (see 20260517031335_011_decide_state.sql section 6)." This is not self-contained -- a rollback recipe must be executable without cross-referencing other files.

Fix: inlined the complete `confirm_triage` function body from migration 011 (same 13-param signature, same logic, no usage-counter block). Verified the restored body matches migration 011 lines 179-251 exactly (signature, predicate guard, column qualifications, triage_conversations inserts, return query).

No other migrations between 011 and 014 modified `confirm_triage` (verified: neither 012 nor 013 references the function).

### Verification

- Rollback drops exactly what was created (`mark_byok_used`).
- Rollback drops the 014 `confirm_triage` and restores the 011 body verbatim.
- No table/column/type/RLS changes in this migration, so no additional rollback steps needed.
- Committed: `f1bd1f2`.

## Dismissals

None.
