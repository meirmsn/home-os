## Gate 7: /cso

**Scope**: Security review of `feat/dashboard` diff (`origin/main...HEAD`).
**Commit**: `f0b2c47` (HEAD at review time).
**Verdict**: `pass`

### 1. Secrets / API keys

No new secrets, API keys, or credentials introduced. No `.env` files added or modified. The BYOK key handling (established in prior PRs) is untouched. Sentry `extra:` fields in new routes contain only `card_id`, `user_id`, and structural metadata (error codes) -- no tokens, keys, or PII.

### 2. RLS policies

- **`check_ins` table**: RLS enabled with four owner-predicate policies (`select_own`, `insert_own`, `update_own`, `delete_own`), all using the subquery `(select auth.uid()) = user_id` pattern per project convention (initplan optimization).
- **`record_checkin` RPC**: `SECURITY DEFINER` with `search_path = public, pg_catalog` (pinned). Explicit `auth.uid()` identity check (`p_user is distinct from auth.uid()`). Ownership + state guard on the `cards` SELECT (`user_id = p_user AND state = 'monitoring'`).
- **Dashboard queries** (`home/page.tsx`): Use `createClient()` (server-side, cookie-based user context). The `from('cards').select(...)` and `from('card_photos').select(...)` calls go through PostgREST with RLS -- only the authenticated user's rows are returned. No service-role client used.
- **Cadence route** (`PATCH /api/card/[id]/cadence`): Direct `.update()` with `.eq('state', 'monitoring')` -- RLS enforces ownership on the UPDATE.
- **Check-in route** (`POST /api/card/[id]/checkin`): Delegates to `record_checkin` RPC which enforces ownership in the function body.

### 3. Signed URL generation

- Photo signed URLs use `createSignedUrl(storage_path, 60 * 10)` -- 10-minute expiry. Acceptable for page-load use.
- `storage_path` values come from the database (trusted, written by server-side routes) -- no user-controlled path segments pass through to `createSignedUrl`.
- Upload paths in the checkin route are constructed as `${user.id}/cards/${id}/touchpoints/${checkinId}/${slot}.jpg` where all segments are UUID-validated (regex check on `id`, `user.id` from auth, `checkinId` from RPC, `slot` from a fixed allowlist). No path traversal vector.

### 4. PostHog events -- PII audit

All new PostHog events reviewed:

| Event                       | Properties                                                                                                  | PII? |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- | ---- |
| `dashboard_viewed`          | `total_cards`, `tier1_count`, `tier2_count`, `planned_count`, `triage_pending_count`, `has_overdue_monitor` | No   |
| `dashboard_filter_changed`  | `from_tab`, `to_tab`                                                                                        | No   |
| `monitor_view_opened`       | `card_id`, `days_since_last_checkin`, `is_overdue`                                                          | No   |
| `monitor_cadence_changed`   | `card_id`, `old_cadence`, `new_cadence`                                                                     | No   |
| `monitor_checkin_submitted` | `card_id`, `photo_count`, `has_notes`, `is_overdue`                                                         | No   |
| `walkthrough_started`       | `overdue_count`                                                                                             | No   |
| `walkthrough_completed`     | `cards_checked`, `cards_skipped`                                                                            | No   |

No email addresses, names, locations, descriptions, notes content, or photo URLs appear in any event properties. `card_id` is an internal UUID -- not PII.

### 5. XSS vectors

- No `dangerouslySetInnerHTML` anywhere in the diff.
- User-controlled text (`card.title`, `card.initial_description`, `card.diagnosis`, check-in `notes`) is rendered via JSX text interpolation (`{value}`) which React auto-escapes.
- `img src` attributes receive signed URLs generated server-side from Supabase Storage -- not user-supplied strings.
- `severity` values pass through a typed switch statement (`_severity-chip.ts`) that returns only hardcoded class strings -- no arbitrary class injection.

### 6. CSRF protection

- All new API routes (`PATCH /api/card/[id]/cadence`, `POST /api/card/[id]/checkin`) are authenticated server-side via `supabase.auth.getUser()` (cookie-based session). Next.js App Router API routes inherit the framework's same-origin enforcement.
- The check-in form uses `FormData` (not URL-encoded), the cadence form uses `JSON.stringify` with `content-type: application/json` -- both require JavaScript to construct, providing implicit CSRF mitigation.
- No new HTML `<form>` elements use `action` attributes (all use `onSubmit` handlers with `e.preventDefault()`).

### 7. Auth bypass

- Middleware (`middleware.ts`) gates `/home` and `/cards` prefixes -- unauthenticated users are redirected to `/login`.
- Both the home page (`page.tsx`) and card detail page perform defense-in-depth `getUser()` checks and redirect to `/login` if no user.
- Both new API routes (`cadence`, `checkin`) return 401 when `getUser()` returns null.
- The `record_checkin` RPC has an additional `auth.uid()` identity check at the database level.

### Summary

No findings. All seven focus areas pass cleanly. The diff follows established project security patterns (RLS subquery, SECURITY DEFINER with pinned search_path, signed URLs with short expiry, no PII in analytics events, React JSX auto-escaping, cookie-based auth with defense-in-depth).

## Dismissals

None. No findings were generated that required dismissal.
