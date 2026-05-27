## Gate 7: /cso

**Result:** findings (1) pending

### Audit scope

Diff: `git diff origin/main...HEAD` (42 files, +4169/-33).
Surfaces reviewed:

- Migration 015 (`20260527064802_015_monitor_beta.sql`): enum extension, `check_ins` table, RLS policies, `record_checkin` RPC, `commit_decide` rewrite, grants.
- `POST /api/card/[id]/checkin` route (multipart, photo upload, RPC call).
- `PATCH /api/card/[id]/cadence` route (JSON body, RLS-enforced UPDATE).
- `MonitorView`, `CheckInForm`, `CheckInTimeline`, `CadenceEditor`, `ChangePathButton` UI components.
- `page.tsx` monitoring-state data fetching + signed URL generation.

---

### 1. Secrets archaeology

**Clean.** No API keys, tokens, credentials, or secrets in the diff. No new env vars introduced. No hardcoded values that resemble secrets.

### 2. SQL injection vectors

**Clean.** Both `record_checkin` and `commit_decide` RPCs use parameterized queries (plpgsql variables, not string interpolation). The cadence route uses Supabase client `.update()` / `.eq()` which are parameterized. Notes field is text with a CHECK constraint (`length(notes) <= 500`). No raw SQL construction anywhere.

### 3. OWASP Top 10

- **Injection (A03):** All user inputs validated before use. UUID regex on path params. `parseCadenceBody` validates integer range [1, 365]. Notes trimmed + length-capped (500 chars). Photo MIME type checked (`image/*` prefix). No `dangerouslySetInnerHTML` in any UI component -- all user content rendered via React JSX (auto-escaped).
- **Broken Auth (A07):** Both routes gate on `supabase.auth.getUser()` returning a user. RPCs double-check `auth.uid()` match. RLS policies enforce `user_id = auth.uid()`.
- **Broken Access Control (A01):** RLS on `check_ins` covers all four operations (SELECT, INSERT, UPDATE, DELETE) with owner predicate. RPCs include ownership + state guards.
- **SSRF:** Storage paths constructed from server-side values only (auth user ID, validated UUID, RPC-returned checkin ID, server-side slot constants). No user-controlled path components.

### 4. File upload security

- **Content-type validation:** Yes -- `entry.type.startsWith('image/')` rejects non-image MIME types with 400.
- **File size limit:** **Not enforced at the route level.** Neither the checkin route nor the existing close route enforce a server-side file size limit. This matches the existing codebase pattern (the close route also has no size check). Supabase Storage has its own upload size limits (default 50MB for free tier). The HTML `<input accept="image/*">` provides client-side filtering only. This is a pre-existing pattern, not a regression introduced by this PR.
- **File extension / magic bytes:** Not validated (matches existing close-flow pattern). The `contentType` passed to Storage is the client-declared MIME type. A malicious user could upload a non-image file with a spoofed `image/*` MIME type. Low risk: files are served via Supabase Storage signed URLs with the declared content type, not executed.

### 5. Signed URL TTL

**Correct.** All `createSignedUrl` calls use `60 * 10` (10 minutes), matching the existing pattern for primary photos and close photos. Consistent across all three photo-fetch paths (check-in photos, reference photos from previous check-ins, capture-photo fallback).

### 6. RLS policy completeness

**Complete.** `check_ins` table has RLS enabled with four policies covering all operations:

- `check_ins_select_own`: SELECT where `auth.uid() = user_id`
- `check_ins_insert_own`: INSERT with check `auth.uid() = user_id`
- `check_ins_update_own`: UPDATE with both using + with check on `auth.uid() = user_id`
- `check_ins_delete_own`: DELETE where `auth.uid() = user_id`

All policies use the subquery form `(select auth.uid())` per project convention (initplan optimization).

### 7. SECURITY DEFINER function safety

**Both functions pin `search_path`.** `record_checkin` and `commit_decide` both declare `set search_path = public, pg_catalog`. This matches the actual codebase convention (all existing SECURITY DEFINER functions use `pg_catalog`). Note: CLAUDE.md documents the convention as `public, pg_temp` but every migration in the repo uses `public, pg_catalog` -- the migration follows the de facto standard.

Both functions include the `auth.uid()` identity check (`if p_user is distinct from auth.uid() then raise exception 'forbidden'`).

---

### Findings

#### F1 (low): `grant all on public.check_ins to anon` -- unnecessary anon grant

**File:** `supabase/migrations/20260527064802_015_monitor_beta.sql:237`

**What:** The migration grants `ALL` privileges on `check_ins` to the `anon` role. No other table in the project (migration 008) grants to `anon` -- only `authenticated` and `service_role` receive grants. The `alter default privileges` in migration 008 also only covers `authenticated, service_role`.

**Risk:** Low. RLS policies require `auth.uid() = user_id`, and `anon` sessions have `auth.uid() = NULL`, so no rows would match. However, the unnecessary grant widens the attack surface: if a future RLS misconfiguration or policy-bypass bug were introduced, the `anon` role could reach the table directly. Defense-in-depth says: don't grant table privileges to roles that should never touch the table.

**Recommendation:** Remove the `grant all on public.check_ins to anon;` line. The `authenticated` grant is sufficient.

---

### Dismissals

1. **No server-side file size limit on photo uploads (checkin route).** Dismissed: matches existing close-flow pattern exactly. Supabase Storage enforces its own upload size limits at the infrastructure layer. Not a regression. If this should change, it should be addressed as a cross-cutting concern affecting all upload routes (close, capture, checkin), not just this PR.

2. **`search_path = public, pg_catalog` vs CLAUDE.md `public, pg_temp` convention.** Dismissed: every SECURITY DEFINER function in the project uses `pg_catalog`. The migration follows the de facto codebase convention. The CLAUDE.md documentation is out of sync with the actual codebase pattern. Both `pg_catalog` and `pg_temp` are valid safe pinning choices (`pg_catalog` prevents catalog-function hijacking; `pg_temp` prevents temp-table shadowing -- different attack vectors, both acceptable).

3. **Client-declared MIME type passed to Storage without magic-byte validation.** Dismissed: matches existing close-flow and capture-flow patterns. Files are served via signed URLs, not executed. Low risk.
