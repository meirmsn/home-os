## Gate 7: cso

- Result: pass

No security issues found (daily-mode 8/10 gate).

Audited the diff `origin/main...HEAD` (UI-only photo-comparison PR) across OWASP
Top 10, secrets, trust boundaries, RLS/authz, and injection. Findings of the
security-relevant surfaces:

- **IDOR / Broken Access Control (A01) — clean.** `cards/[id]/compare/page.tsx`
  uses the user-context RLS client (`createClient()` = anon key + cookie session,
  same factory as the existing detail page). Flow is fail-closed at every layer:
  (1) `auth.getUser()` redirects to login when unauthenticated;
  (2) `cards` SELECT `.eq('id', id)` runs under RLS, so a foreign/missing card
  returns `null` → `notFound()` (404) — a hand-typed `/cards/<foreign-id>/compare`
  cannot read the card; (3) `card_photos` SELECT `.eq('card_id', id)` is gated by
  the `card_photos_select_own` table policy (owner-scoped); (4) `createSignedUrls`
  signs against the private `card-photos` bucket whose storage policy
  (`004_storage.sql`) ties the leading path segment `<user_uuid>/...` to
  `auth.uid()` — signing a foreign path fails per-path and is dropped. Owner
  isolation holds at table AND storage layers (defense in depth).

- **`< 2` photo-touchpoint gate enforced in both places** (CLAUDE.md G6):
  `ComparePhotosLink.tsx:23` returns null below threshold; `compare/page.tsx:90`
  independently `redirect()`s to `cards/[id]`. Defense-in-depth against stale
  links / hand-typed URLs — confirmed present.

- **Per-path signing errors handled without leaking** (`compare/page.tsx:79-83`):
  only entries with `error === null && path && signedUrl` are added to the map; a
  failed entry is silently dropped and `groupTouchpoints` treats it as a missing
  slot. One un-signable photo does not throw or blank the comparison; no error
  detail reaches the client.

- **No new secrets, env vars, schema, or RLS migration.** Reads existing
  `card_photos`. The only `process.env.SUPABASE_*` / `admin-client` /
  `access_token`/`refresh_token` references in the diff are in
  `apps/web/e2e/photo-comparison.spec.ts` (Playwright test seam — local-stack
  credentials, forged test-user session cookie; `e2e/helpers/admin-client.ts` is
  pre-existing and not in this diff). Excluded under FP hard-exclusion #10 (test
  fixtures) + precedent #3 (env vars are trusted input).

- **XSS (A03) — clean.** No `dangerouslySetInnerHTML` / `innerHTML` / `eval` /
  `new Function` in the diff. Rendered values (`issueName`, dates, labels) go
  through React default escaping; `<img src={signedUrl}>` uses server-generated
  Supabase signed URLs, not user-controlled strings (precedent #4).

- **Sentry capture (info disclosure) — clean.** The `cards` SELECT error capture
  logs `card_id`, `user_id`, and PostgREST error fields — operational diagnostics
  only, server-side, never returned to the client. No tokens/secrets/PII in the
  payload (precedents #1, #9).

- **Injection / SSRF — clean.** All queries use parameterized PostgREST builder
  methods (`.eq()`); no raw SQL, no user-controlled URL construction.

Filter stats: ~6 candidates scanned → 1 hard-exclusion filtered (e2e
admin-client/session = test fixture) → 0 confidence-gate filtered → 0 reported.

_This tool is not a substitute for a professional security audit. /cso is an
AI-assisted scan that catches common vulnerability patterns — not comprehensive,
not guaranteed. For production systems handling sensitive data, engage a
qualified security firm._

## Dismissals

None
