## Gate 7: /cso

**Result: findings (2) pending**
**Commit:** 141c0fe (HEAD)
**Date:** 2026-05-26

Full security audit of the usage-counters-and-byok feature. Covers secrets archaeology, API key handling, trust boundaries, RLS/auth, input validation, and OWASP Top 10 surface.

---

### 1. Secrets archaeology -- BYOK key lifecycle

Traced the BYOK key through every code path it touches:

| Hop | Location                                     | What happens                                                                      | Key leaked?                                                                                                                |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ByokKeyInput.tsx` (client)                  | User types key into `<input type="password">`                                     | No -- password field, not rendered to DOM                                                                                  |
| 2   | `ByokKeyInput.tsx` line 49                   | Sent via `fetch('/api/key-validate', { body: JSON.stringify({ key: trimmed }) })` | No -- HTTPS body only                                                                                                      |
| 3   | `key-validate/route.ts` line 61              | Extracted as `trimmedKey`, passed to `new Anthropic({ apiKey: trimmedKey })`      | No -- local variable, never logged                                                                                         |
| 4   | `key-validate/route.ts` line 94              | On Anthropic error: `Sentry.captureException(err, ...)`                           | No -- Anthropic `APIError` does not include the API key in its properties (`status`, `headers`, `error`, `requestID` only) |
| 5   | `ByokKeyProvider.tsx` line 38                | Stored in React state via `setByokKeyState(key)`                                  | No -- memory only, cleared on refresh/navigation                                                                           |
| 6   | `AnswerThread.tsx` / `StartTriage.tsx`       | Added to fetch body as `byok_key` field                                           | No -- HTTPS body only                                                                                                      |
| 7   | `triage/route.ts` / `triage/answer/route.ts` | Extracted from body, passed to `callInitialRead` / `callQaTurn` as `apiKey`       | No -- local variable, never logged                                                                                         |
| 8   | `anthropic.ts` / `anthropic-qa.ts`           | Used in `new Anthropic({ apiKey: input.apiKey })`                                 | No -- SDK constructor only                                                                                                 |
| 9   | Sign-out / tab close / refresh               | React tree torn down, `ByokKeyProvider` state garbage-collected                   | Cleared correctly                                                                                                          |

**Verdict: PASS.** The key never touches: localStorage, sessionStorage, cookies, database, Sentry extra payloads, console logs, or HTTP response bodies. The `type="password"` input prevents visual display. The Anthropic SDK `APIError` class (verified at `@anthropic-ai/sdk@0.96.0 src/core/error.ts`) stores `status`, `headers`, `error` (response JSON body), and `requestID` -- no API key.

---

### 2. API key handling -- `/api/key-validate` endpoint

| Check                          | Result | Detail                                                                                                                                                                           |
| ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth gate                      | pass   | `supabase.auth.getUser()` check at line 27; 401 if null                                                                                                                          |
| Input validation               | pass   | Non-empty string check, `.trim()`, max 200 chars (`KEY_MAX_LEN`)                                                                                                                 |
| Timing attack on valid/invalid | see F1 | Discussed below                                                                                                                                                                  |
| Rate limiting                  | see F2 | Discussed below                                                                                                                                                                  |
| Key enumeration                | pass   | Endpoint returns `{ valid: true }` vs `{ error: 'invalid_key' }` -- both HTTP 200. No enumeration vector beyond what Anthropic's own API provides (the probe call is the oracle) |
| Response body clean            | pass   | No key data in any response path. Responses are `{ valid: true }`, `{ error: 'invalid_key' }`, `{ error: 'out_of_credits' }`, or `{ error: 'server_error' }`                     |

---

### 3. Trust boundaries

| Boundary                                        | Result | Detail                                                                                                                                                                                     |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User-supplied key used only for Anthropic calls | pass   | `byokKey` flows only to `new Anthropic({ apiKey })` -- never to Supabase, never to any other external service, never to `baseURL` (which is server-side `ANTHROPIC_BASE_URL` env var only) |
| User cannot control `baseURL`                   | pass   | `baseURL` derived from `process.env.ANTHROPIC_BASE_URL` in triage routes; the key-validate route uses no `baseURL` at all (SDK default = `api.anthropic.com`)                              |
| User cannot control `model`                     | pass   | `model` derived from `process.env.ANTHROPIC_MODEL`; key-validate hardcodes `claude-haiku-4-5`                                                                                              |
| BYOK key cannot bypass card ownership RLS       | pass   | Card loads use user-context Supabase client with RLS; BYOK key only affects which Anthropic API key is used, not which cards are visible                                                   |

---

### 4. RLS/auth -- new RPCs

| RPC                             | Auth guard                                                      | Predicate guard                                                                                   | Verdict |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------- |
| `mark_byok_used(p_user uuid)`   | `p_user IS DISTINCT FROM auth.uid()` raises `forbidden` (42501) | `WHERE byok_used = false` (idempotent)                                                            | pass    |
| `confirm_triage(...)` (updated) | `p_user IS DISTINCT FROM auth.uid()` raises `forbidden` (42501) | `WHERE cards.user_id = p_user AND cards.state = 'diagnosed' AND cards.severity_confirmed = false` | pass    |

Both functions are `SECURITY DEFINER` with `SET search_path = public, pg_catalog` per convention. The `auth.uid()` guard ensures the calling user matches the `p_user` parameter -- no privilege escalation possible.

The `usage_counters` SELECT in the answer route uses the user-context Supabase client (RLS-scoped to `auth.uid() = user_id`), so a user cannot read another user's usage data.

---

### 5. Input validation

| Surface                                  | Validation                                       | Missing?                           |
| ---------------------------------------- | ------------------------------------------------ | ---------------------------------- |
| `key-validate` body `key`                | type string, non-empty after trim, max 200 chars | No                                 |
| `triage/route.ts` body `byok_key`        | type string, non-empty after trim                | **F1: No max-length check**        |
| `triage/answer/route.ts` body `byok_key` | type string, non-empty after trim                | **F1: No max-length check**        |
| Client `ByokKeyInput.tsx`                | trims before sending                             | No (client-side, defense-in-depth) |

---

### 6. OWASP Top 10 assessment

| OWASP category                | Risk | Detail                                                                                                                                                                                                                     |
| ----------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Broken Access Control     | none | Auth gate on all 3 endpoints. RPCs guard `p_user = auth.uid()`. RLS on all table reads.                                                                                                                                    |
| A02 Cryptographic Failures    | none | Key transits via HTTPS only. No key-at-rest. No custom crypto.                                                                                                                                                             |
| A03 Injection                 | none | No SQL injection (parameterized RPCs). No XSS (React auto-escapes; no `dangerouslySetInnerHTML`). The BYOK key is only passed to the Anthropic SDK constructor -- not interpolated into any query, HTML, or shell command. |
| A04 Insecure Design           | low  | See F2 (rate limiting). The design is sound -- auth gate + ephemeral key transit + no persistence.                                                                                                                         |
| A05 Security Misconfiguration | none | `SECURITY DEFINER` functions pin `search_path`. `export const dynamic = 'force-dynamic'` on all routes.                                                                                                                    |
| A06 Vulnerable Components     | none | No new dependencies added. Existing `@anthropic-ai/sdk@0.96.0` is current.                                                                                                                                                 |
| A07 Auth Failures             | none | No new auth flows. Existing Supabase auth used consistently.                                                                                                                                                               |
| A08 Data Integrity Failures   | none | No deserialization of untrusted data beyond JSON.parse (standard). The BYOK key is treated as an opaque string.                                                                                                            |
| A09 Logging Failures          | none | No `console.log` in any production code (verified). Sentry captures exclude key data. The `byok_key_validated` PostHog event carries no key data (`{}`).                                                                   |
| A10 SSRF                      | none | The BYOK key is passed to the Anthropic SDK constructor, which sends it as an `Authorization` header to `api.anthropic.com` (or the server-controlled `ANTHROPIC_BASE_URL`). The user cannot control the destination URL.  |

---

### Findings

#### F1: No max-length check on `byok_key` in triage routes (low severity)

**Location:** `apps/web/app/api/triage/route.ts` lines 143-147, `apps/web/app/api/triage/answer/route.ts` lines 277-281.

**Detail:** The `key-validate` endpoint enforces a 200-character max length on the key (`KEY_MAX_LEN = 200`). However, the `byok_key` field extracted from the triage route bodies has no max-length check. A malicious authenticated user could send an arbitrarily long string as `byok_key`. The string is passed to the Anthropic SDK constructor as `apiKey`, which sends it as an `Authorization: Bearer <key>` header. An extremely long key (e.g., 10MB) would:

- Consume server memory holding the string in the route handler.
- Be sent to Anthropic's API, which would reject it (HTTP 400 or connection reset), but only after the server has buffered and transmitted the oversized header.

**Risk:** Low. The auth gate limits this to authenticated users only. The Anthropic SDK will fail fast on an invalid key. Next.js has a default body size limit (~1MB for API routes). However, the asymmetry between key-validate (200 char limit) and triage routes (no limit) is a defense-in-depth gap.

**Recommendation:** Add `byokKey.trim().length > 200` early-return check in both triage routes, matching the `KEY_MAX_LEN` from key-validate. Alternatively, extract the constant to a shared module.

---

#### F2: No rate limiting on `/api/key-validate` (low severity)

**Location:** `apps/web/app/api/key-validate/route.ts`.

**Detail:** The endpoint is explicitly out of scope per the spec (`Out of scope: Key-validate rate limiting -- no server-side rate limit on /api/key-validate in v0`). However, from a security perspective:

- Each validation call makes a real `claude-haiku-4-5` API call using the _user-supplied_ key, so the cost is borne by the user, not the app.
- The auth gate prevents unauthenticated abuse.
- However, a compromised or malicious authenticated user could use this endpoint as a key-testing oracle -- rapidly validating stolen Anthropic API keys against the Anthropic API. The app acts as a proxy for key validation.

**Risk:** Low. The auth gate significantly limits the attack surface (attacker needs a valid app account). The Anthropic API itself has rate limits that provide backpressure. This is explicitly deferred per spec.

**Recommendation:** Accept for v0 per spec. Monitor `byok_key_validated` PostHog event volume. If a single user validates >10 keys in a short window, that is anomalous. Consider adding per-user rate limiting (e.g., 5 validations per hour) in a follow-up if abuse appears.

---

### STRIDE threat model summary

| Threat                     | Applicable? | Mitigation                                                                                                   |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| **S**poofing               | No          | Auth gate on all endpoints; RPCs verify `auth.uid()`                                                         |
| **T**ampering              | No          | BYOK key used as opaque credential, not as data input to business logic; RLS prevents cross-user data access |
| **R**epudiation            | No          | `users.byok_used` flag + `byok_key_validated` PostHog event provide audit trail; no key data stored          |
| **I**nformation disclosure | No          | Key never logged, persisted, or included in responses/errors                                                 |
| **D**enial of service      | Low         | F2 -- no rate limiting on validate endpoint; mitigated by auth gate + Anthropic's own rate limits            |
| **E**levation of privilege | No          | BYOK bypasses the usage cap (by design) but cannot bypass card ownership RLS or access other users' data     |

---

## Dismissals

- **Anthropic SDK `APIError` may contain request headers in Sentry:** The `APIError.headers` property contains _response_ headers from Anthropic, not request headers. The `Authorization` request header (which contains the API key) is not captured by the SDK error object. Verified by reading the SDK source at `@anthropic-ai/sdk@0.96.0/src/core/error.ts` lines 14-16. No finding.

- **Key visible in browser DevTools Network tab:** The BYOK key is sent in the request body of `POST /api/key-validate`, `POST /api/triage`, and `POST /api/triage/answer`. This is visible in the browser's Network tab to the user who owns the key. This is expected behavior -- the user is sending their own key. It is not visible to other users or to the server logs (Next.js does not log request bodies by default). No finding.

- **React DevTools can inspect `ByokKeyProvider` state:** React DevTools in the user's browser can inspect the context value and see the key. This is the same trust level as the user's own browser -- they already know the key because they entered it. No finding.

- **PostHog `byok_key_validated` event:** The event carries `{}` (empty properties). No key data is included. Verified at `ByokKeyInput.tsx` line 65. No finding.

- **`triage_session_count` increment on BYOK sessions:** The counter increments on ALL `confirm_triage` calls including BYOK sessions (spec Gotcha #9). This is by design -- the counter is a neutral metric. BYOK users are not exempt from counting, only from the usage check. No security implication.
