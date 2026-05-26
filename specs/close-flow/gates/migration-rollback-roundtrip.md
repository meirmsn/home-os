## Gate 2e: migration-rollback-roundtrip

**Result: PASS**

### Analysis

Migration 013 (`supabase/migrations/20260526142342_013_close_flow.sql`) has a `-- ROLLBACK:` section at lines 80-89. The rollback SQL is commented out (standard convention for this project).

**Forward migration (3 operations):**

1. Rename-recreate `touchpoint_type` enum: adds `'close'` variant (lines 13-26)
2. Add columns `actual_spend_cents int` and `spend_notes text` to `cards` (lines 29-31)
3. Create `close_card` SECURITY DEFINER RPC (lines 36-78)

**Rollback SQL (reverse order, undoes all 3):**

1. `DROP FUNCTION IF EXISTS public.close_card(uuid, uuid, int, text);` -- drops the RPC (matches forward step 3)
2. `ALTER TABLE public.cards DROP COLUMN IF EXISTS spend_notes;` -- drops spend_notes (matches forward step 2)
3. `ALTER TABLE public.cards DROP COLUMN IF EXISTS actual_spend_cents;` -- drops actual_spend_cents (matches forward step 2)
4. Rename-recreate enum back to original shape:
   - `ALTER TYPE public.touchpoint_type RENAME TO touchpoint_type_new;` -- temp rename current
   - `CREATE TYPE public.touchpoint_type AS ENUM ('primary', 'context', 'closeup');` -- recreate without 'close'
   - `ALTER TABLE public.card_photos ALTER COLUMN touchpoint_type TYPE public.touchpoint_type USING touchpoint_type::text::public.touchpoint_type;` -- recast column
   - `DROP TYPE public.touchpoint_type_new;` -- drop temp
     (matches forward step 1)

**Verification:**

- The rollback drops the RPC with the exact 4-parameter signature `(uuid, uuid, int, text)`.
- Both additive columns are dropped with `IF EXISTS` guards.
- The enum rename-recreate dance correctly reverses the forward operation: renames current to `_new`, creates original 3-variant enum, recasts the column, drops `_new`. This follows the same rename-recreate pattern used in the forward migration.
- Order is correct: RPC dropped first (it depends on `card_state` enum, not `touchpoint_type`, but dropping it before the enum recreate avoids any potential dependency issues), columns second, enum last.

**Note:** The rollback will fail if any `card_photos` row has `touchpoint_type = 'close'` at rollback time (the `USING` cast would fail). This is expected -- rollback assumes no data in the new variant exists, which is the standard posture for development-phase rollbacks.

### Dismissals

None.
