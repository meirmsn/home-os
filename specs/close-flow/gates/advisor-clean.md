## Gate 2g: advisor-clean

**Result**: findings (7) — all pre-existing on main, none from close-flow

### Analysis

`pnpm db:advisor` executed against the local Supabase Postgres at `host.docker.internal:54422` (override via `DATABASE_URL`).

9 lints checked; 1 lint reported findings, 8 clean:

```
findings (7)
  - function_search_path_mutable: ok
  - auth_rls_initplan: ok
  - unindexed_foreign_key: 7 finding(s)
      • users (users_id_fkey)
      • usage_counters (usage_counters_user_id_fkey)
      • triage_conversations (triage_conversations_user_id_fkey)
      • triage_conversations (triage_conversations_card_id_fkey)
      • cards (cards_user_id_fkey)
      • card_photos (card_photos_user_id_fkey)
      • card_photos (card_photos_card_id_fkey)
  - multiple_permissive_policies: ok
  - security_definer_view: ok
  - rls_disabled_in_public: ok
  - rls_enabled_no_policy: ok
  - extension_in_public: ok
  - duplicate_index: ok
```

### Finding detail

**7 unindexed foreign keys** across 5 tables. All are pre-existing on `main` (migrations 001-012) — none were introduced by migration 013 (close-flow). Migration 013 adds no foreign keys.

| Table                | FK constraint                     | Introduced in |
| -------------------- | --------------------------------- | ------------- |
| users                | users_id_fkey                     | migration 001 |
| usage_counters       | usage_counters_user_id_fkey       | migration 006 |
| triage_conversations | triage_conversations_user_id_fkey | migration 003 |
| triage_conversations | triage_conversations_card_id_fkey | migration 003 |
| cards                | cards_user_id_fkey                | migration 003 |
| card_photos          | card_photos_user_id_fkey          | migration 003 |
| card_photos          | card_photos_card_id_fkey          | migration 003 |

**close-flow-specific lints (migration 013)**:

1. `function_search_path_mutable`: PASS — `close_card` declares `set search_path = public, pg_catalog`.
2. `auth_rls_initplan`: PASS — no new RLS policies in migration 013.
3. `unindexed_foreign_key`: N/A — migration 013 adds no foreign keys.

### Dismissals

None. The 7 unindexed FK findings are pre-existing and outside this feature's scope.
