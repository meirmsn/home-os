## Gate 6: /review

**Result:** findings (1) pending

Reviewed `git diff origin/main...HEAD` (42 files, ~4200 lines added).

### Findings

#### F1: `anon` grant on `check_ins` table breaks established privilege pattern (SQL safety)

**File:** `supabase/migrations/20260527064802_015_monitor_beta.sql:237`

```sql
grant all on public.check_ins to anon;
```

Migration 008 established the project's privilege convention: table-level grants go to `authenticated` and `service_role` only. The `ALTER DEFAULT PRIVILEGES` in migration 008 (line 62-63) also only grants to `authenticated` and `service_role`. This is the only `anon` grant in the entire migration history.

The `anon` role (unauthenticated PostgREST callers) should not have table-level access to `check_ins`. While RLS policies mitigate the risk (all four policies require `(select auth.uid()) = user_id`, which evaluates to false for anonymous callers), the defense-in-depth principle requires table-level privilege to also block unauthenticated access. An anon caller currently hits RLS as the sole barrier; removing the anon grant adds a second barrier at the table-privilege layer.

**Fix:** Remove the `anon` grant line entirely. The `ALTER DEFAULT PRIVILEGES` from migration 008 already grants to `authenticated` and `service_role` for future tables, so line 236 (`grant all on public.check_ins to authenticated;`) is the belt-and-suspenders explicit grant, and line 237 is the bug.

**Severity:** Medium. Defense-in-depth violation; not exploitable with current RLS but widens the attack surface unnecessarily.

---

### Dismissals

#### D1: `record_checkin` UPDATE missing `state = 'monitoring'` re-check (TOCTOU)

The `record_checkin` RPC SELECTs `monitoring_cadence_days` with a `state = 'monitoring'` guard (line 82-87), then UPDATEs `cards.next_check_at` without re-checking state (line 99-105). In theory, a concurrent state change between the two statements could allow `next_check_at` to be updated on a non-monitoring card.

**Dismissed:** PostgreSQL RPC bodies execute within a single transaction. Under READ COMMITTED isolation (Supabase default), a concurrent commit between statements in the same transaction IS possible, but the practical risk is near-zero: this is a single-user app (RLS enforces owner-only access), so the only way to hit this race is the same user submitting a check-in and a path-change simultaneously from two browser tabs. The `set_updated_at` trigger would fire regardless, and a stale `next_check_at` on a non-monitoring card is inert (nothing reads it outside monitoring state). Defensive but not blocking.

#### D2: `search_path = public, pg_catalog` vs CLAUDE.md convention `public, pg_temp`

CLAUDE.md documents the convention as `set search_path = public, pg_temp`. The migration uses `pg_catalog` for both `record_checkin` and the recreated `commit_decide`. However, every existing SECURITY DEFINER function in the codebase (migrations 005, 006b, 007, 009, 011, 014) also uses `pg_catalog`. The spec's migration notes section even notes the intended convention is `pg_temp` but the implementation follows the established codebase pattern. Not a regression introduced by this PR. The CLAUDE.md documentation is stale relative to the actual codebase convention. Not blocking for this PR.

#### D3: N+1 query pattern in monitoring photo fetch (performance)

The page.tsx monitoring block (lines 388-413) issues one `card_photos` query per check-in, plus one `createSignedUrl` call per photo. This is O(check_ins \* photos_per_checkin) round trips. With no `.limit()` on the check-ins query (line 379-383), this could grow unbounded.

**Dismissed:** This is a performance concern, not a security or correctness issue. The scope of this review gate is security, auth, state safety, and error handling. The pattern matches the existing close-photo fetch approach. A future performance optimization (batch signed URLs, paginate check-ins) is appropriate but not blocking for landing.

#### D4: Cadence route does not explicitly set `updated_at`

The `PATCH /api/card/[id]/cadence` route updates `monitoring_cadence_days` and `next_check_at` but does not include `updated_at` in the UPDATE payload. This is correct because migration 005 defines a `set_updated_at` trigger on `cards` that fires `BEFORE UPDATE` and sets `updated_at = now()` automatically. No issue.
