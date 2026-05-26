## Gate 6: /review

**Reviewed:** `git diff origin/main...HEAD` (37 files, +2787/-63)
**Focus areas:** BYOK key handling, usage check bypass, confirm_triage atomicity, key-validate sanitization, SQL safety, error handling.

### Findings

#### F1: Week-rollover race between `confirm_triage` and `claim_card_slot` corrupts both counters (HIGH)

**File:** `supabase/migrations/20260526225426_usage_counters_and_byok.sql` lines 119-130

`confirm_triage` sets `week_start = v_monday` on the `ON CONFLICT` path but only resets `triage_session_count` -- it does not reset `card_count`. Symmetrically, `claim_card_slot` (migration 006b) sets `week_start = v_monday` but only resets `card_count` -- it does not reset `triage_session_count`. When the two RPCs fire in different order at a week boundary, whichever fires second sees `week_start = v_monday` (already current) and preserves the stale counter from the prior week.

**Scenario A (confirm_triage fires first in a new week):**

1. Week A: `card_count=15`, `triage_session_count=3`, `week_start='2026-05-19'`.
2. Week B: `confirm_triage` fires. Sets `triage_session_count=1`, `week_start='2026-05-26'`. `card_count` stays `15` (stale).
3. Week B: `claim_card_slot` fires. Sees `week_start='2026-05-26'` (current), so CASE keeps `card_count=15`. User can only create 5 more cards instead of 20.

**Scenario B (claim_card_slot fires first in a new week):**

1. Week A: `triage_session_count=5`, `card_count=18`, `week_start='2026-05-19'`.
2. Week B: `claim_card_slot` fires. Sets `card_count=0`, `week_start='2026-05-26'`. `triage_session_count` stays `5` (stale).
3. Week B: `confirm_triage` fires. Sees `week_start='2026-05-26'` (current), so CASE does `5+1=6`. User appears to be at 6 sessions on a new week.
4. Week B: `/api/triage/answer` route checks count >= 5 and blocks with `TRIAGE_LIMIT_REACHED` for a free-tier user who should have 1 session used, not 6.

**Fix:** Both RPCs' `ON CONFLICT DO UPDATE` clauses must reset _both_ counters on week rollover. In `confirm_triage`, the `ELSE 1` branch should also set `card_count = 0`. In `claim_card_slot`, the `ELSE 0` branch should also set `triage_session_count = 0`. Alternatively, extract the week-rollover-reset into a shared helper that always resets both.

---

#### F2: `key-validate` Anthropic 403/overloaded (529) not handled distinctly (LOW)

**File:** `apps/web/app/api/key-validate/route.ts` lines 84-98

The route only handles 401 and 402 from the Anthropic SDK. A 403 (permission denied) or 529 (overloaded) would fall through to the generic `server_error` branch with Sentry capture. This is acceptable behavior (the endpoint still returns a clear 500), but the user sees "Couldn't validate" for what may be a transient Anthropic overload rather than a bad key. No fix needed for v0 -- the current posture is defensible. Noting for awareness.

---

#### F3: No BYOK key length/format validation on triage routes (LOW)

**File:** `apps/web/app/api/triage/route.ts` line 147, `apps/web/app/api/triage/answer/route.ts` line 281

The `/api/key-validate` endpoint enforces `KEY_MAX_LEN = 200` and trims the key, but the triage routes only check `typeof byokKey === 'string' && byokKey.trim().length > 0`. A malicious client could send an arbitrarily long string as `byok_key` through the triage routes. The Anthropic SDK will reject oversized keys, so this is a denial-of-bandwidth issue rather than a security vulnerability. The SDK constructor receives the full string regardless. Low impact since auth gate + Anthropic's own rejection provide backpressure.

---

### Clean areas (no findings)

**BYOK key never logged/persisted/leaked:**

- `key-validate/route.ts`: Key extracted, trimmed, passed to Anthropic SDK constructor, then garbage-collected. Sentry captures only have `tags` (route/stage) -- no `extra` containing the key. `mark_byok_used` RPC receives `user.id`, not the key.
- `triage/route.ts` and `triage/answer/route.ts`: BYOK key extracted from body, used for `apiKey` variable, passed to `callInitialRead`/`callQaTurn`. Never in Sentry `extra`. BYOK-specific error responses (`byok_invalid`, `byok_out_of_credits`) do not echo the key.
- `ByokKeyProvider.tsx`: React state only. No `localStorage`, `sessionStorage`, `document.cookie`, or `console.log`.
- `ByokKeyInput.tsx`: `type="password"` on the input. Key sent to `/api/key-validate` over HTTPS body. PostHog `byok_key_validated` event has empty properties `{}` -- key is not in the event.

**Usage check cannot be bypassed by request manipulation:**

- The check reads `usage_counters` via the user-context Supabase client (RLS-scoped to `auth.uid()`). A client cannot fake another user's counter.
- `byok_key` presence bypasses the check by design. An attacker would need a valid Anthropic API key to exploit this -- which is the intended behavior.
- NULL `usage_counters` row correctly treated as count=0 (not "at limit").
- Stale `week_start` correctly treated as count=0.

**confirm_triage triage_session_count increment is atomic:**

- The counter increment is inside the same PL/pgSQL function body as the card state transition, within a single implicit transaction. No window for count-vs-state mismatch.
- The `auth.uid()` guard prevents a foreign `p_user` from incrementing another user's counter.

**SQL safety:**

- Both new functions (`mark_byok_used`, updated `confirm_triage`) are `SECURITY DEFINER` with `SET search_path = public, pg_catalog` -- pinned search path per convention.
- `p_user IS DISTINCT FROM auth.uid()` guard on both.
- `usage_counters` query uses `auth.uid()`-scoped RLS via user-context client.

**API contract consistency:**

- `key-validate`: Returns 200 for both valid and invalid keys (body-level error field), per spec Gotcha #7. Clients handle this correctly.
- `triage/answer`: Returns 429 with `{ error: 'TRIAGE_LIMIT_REACHED', resets: '...' }`. Client `AnswerThread.tsx` correctly parses and renders the limit-reached banner.
- BYOK-specific 401/402 responses on triage routes are distinct from the app-auth 401. Client `StartTriage.tsx` and `AnswerThread.tsx` treat these as retryable errors.

**Error handling:**

- All Supabase queries have error checks with Sentry capture.
- `mark_byok_used` RPC failure is non-fatal (key is still valid).
- Anthropic SDK errors are caught and mapped to appropriate HTTP status codes.
- No unhandled promise rejections.

**Test coverage:**

- `key-validate/route.test.ts`: 10 cases covering auth, validation, valid key, invalid key, out of credits, network error, mark_byok_used called/failed.
- `triage/answer/route.test.ts`: 8 new cases covering usage check (limit reached, under limit, NULL row, stale week, query error) and BYOK handling (skip check, use key, 401, 402).
- `triage/route.test.ts`: 4 new cases covering BYOK key pass-through, 401, 402, server key fallback.

### Dismissals

- **F2** (key-validate 403/529): Acceptable for v0. The generic `server_error` path with Sentry capture is sufficient. If Anthropic overload causes false negatives on key validation, users can retry. No fix needed.
- **F3** (no BYOK key length validation on triage routes): The Anthropic SDK rejects invalid keys before any compute happens. Adding a length check would be defense-in-depth but is not security-critical. Acceptable for v0.

### Verdict

F1 is a **high-severity data-consistency bug** that can block free-tier users from triage sessions or card creation in weeks where both features are used. The fix is straightforward (add counter resets to both RPCs' week-rollover branches).

**findings (1) pending** -- F1 must be fixed before merge.
