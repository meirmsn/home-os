## Gate 2b: rls-coverage

- Result: pass (n/a — no new migrations on this branch)
- Migration changes in the diff are inherited from the monitor-beta base branch, which already passed its own rls-coverage gate
- Dashboard queries use existing RLS policies on `cards` and `card_photos` tables (owner-only access via `user_id = (select auth.uid())`)

## Dismissals

None
