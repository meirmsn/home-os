## Gate 2b: rls-coverage

**Migration:** `supabase/migrations/20260527064802_015_monitor_beta.sql`

### New tables

| Table       | RLS enabled | SELECT    | INSERT    | UPDATE       | DELETE    | Subquery form             |
| ----------- | ----------- | --------- | --------- | ------------ | --------- | ------------------------- |
| `check_ins` | Yes (L42)   | Yes (L44) | Yes (L46) | Yes (L48-50) | Yes (L51) | All `(select auth.uid())` |

### SECURITY DEFINER functions

| Function         | `security definer` | `set search_path`           | Status                                                                          |
| ---------------- | ------------------ | --------------------------- | ------------------------------------------------------------------------------- |
| `record_checkin` | Yes (L68)          | `public, pg_temp` (L69)     | Pass                                                                            |
| `commit_decide`  | Yes (L128)         | `public, pg_catalog` (L129) | Diverges from convention (`pg_temp`), but not a security issue (see Dismissals) |

### Foreign key indexes

| FK column                          | Index                         | Status |
| ---------------------------------- | ----------------------------- | ------ |
| `check_ins.card_id` -> `cards(id)` | `check_ins_card_id_idx` (L38) | Pass   |
| `check_ins.user_id` -> `users(id)` | `check_ins_user_id_idx` (L39) | Pass   |

### Result: PASS

All new tables have RLS enabled with full CRUD policies using the subquery form. All SECURITY DEFINER functions pin search_path. All foreign keys have backing indexes.

## Dismissals

1. **`commit_decide` uses `pg_catalog` instead of `pg_temp` in search_path (L129).** The CLAUDE.md convention specifies `set search_path = public, pg_temp`. The recreated `commit_decide` uses `public, pg_catalog`. This is a **convention divergence, not a security defect**: `pg_catalog` is always implicitly first on the search path regardless (Postgres auto-prepends it), and `pg_catalog` is arguably more secure than `pg_temp` since temp-schema shadowing is not possible. Dismissed as informational; harmonizing to `public, pg_temp` is optional cleanup.
