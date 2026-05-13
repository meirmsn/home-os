<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: auth-magic-link -->
<!-- date: 2026-05-13 -->

# Spec: auth-magic-link (PR 2)

**Sources:**

- `.gstack/eng-review-home-os-2026-05-01.md § Architecture (Auth)` — primary scope: "Supabase magic link. User profile created on signup."
- `.gstack/eng-review-home-os-2026-05-01.md § Build Order step 2` — sequencing dependency
- `OVERVIEW.md` — product voice ("calm authority, spiral prevention")
- Existing surfaces on main: `apps/web/middleware.ts` (session-refresh middleware), `apps/web/lib/supabase/{client,server}.ts` (SSR client factories), `apps/web/app/{layout,page}.tsx` (root + landing placeholder)
- Prior spec `specs/supabase-schema-and-rls/spec.md` — structure + style reference (lives on PR #9 branch; this PR's merge gate per D2)
- `BUILD-LOG.md` head TODOs (CAPTCHA + preview-deploy email-auth deferred — preserved as-is)

Magic-link sign-in/up: `/login` page sends a magic link via Supabase OTP, `/auth/callback` exchanges the PKCE code for a session, `/(app)` route group renders the authenticated shell, and `/auth/signout` clears the session. Extends the existing session-refresh middleware with redirect-based route protection.

---

## Decisions (resolved at spec time)

13 `/ak-spec`-time decisions resolved in Phase 0 with the user. Recorded below so Phase 1 preserves them verbatim and a crashed Phase 1 resumes without re-asking.

### D1: Auth method — magic-link only

**Decision:** Email-only passwordless via Supabase `signInWithOtp`. No password path, no other providers.

**Rationale:** Eng review § Architecture (Auth) is unambiguous ("Supabase magic link"). Roadmap doesn't add a password fallback. Single method = smallest surface to validate end-to-end.

### D2: PR #9 dependency — hard merge prerequisite

**Decision:** This PR develops in parallel off main but cannot merge until `feature/supabase-schema-and-rls` (PR #9) is on main. PR description carries the gate explicitly. If #9 hasn't landed when this PR is otherwise green, hold the merge; do not duplicate the schema migration here.

**Rationale:** Auth flow reads `public.users` and relies on PR #9's `create_public_user_profile` AFTER-INSERT trigger to close the signup → profile race. Shipping without the trigger 500s every authenticated route on first sign-in. PR #9 is being deployed concurrently — gate is being closed in real time.

### D3: Post-auth route shape — `(app)` route group

**Decision:** Authenticated UI lives under `apps/web/app/(app)/` (Next route-group syntax — parens make it a layout boundary with no URL segment). `(app)/layout.tsx` is the shell; `(app)/page.tsx` is the minimal authenticated landing for this PR.

**Rationale:** Convention from Next App Router + PLAN.md row ("post-auth `/(app)` shell"). Route group keeps the URL clean (`/`) while letting later features add segments like `/(app)/capture` without a refactor.

### D4: Magic-link flow shape — PKCE with `/auth/callback`

**Decision:** Use Supabase SSR's PKCE flow. `/auth/callback` is a route handler (server) that reads `?code=...&next=...` from the magic-link redirect, calls `supabase.auth.exchangeCodeForSession(code)`, then redirects to `next` (default `/`).

**Rationale:** PKCE is the @supabase/ssr default and cookie-safe across browsers; legacy implicit-hash flow is incompatible with SSR cookie writes. The `next` param supports deep-linking back to the page the user was redirected from (D6).

### D5: Routes added

**Decision:** Four route additions:

1. `apps/web/app/login/page.tsx` — server component renders a small client form (`'use client'` child) that calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: <origin>/auth/callback } })`.
2. `apps/web/app/auth/callback/route.ts` — route handler per D4.
3. `apps/web/app/auth/signout/route.ts` — route handler accepting POST only, calls `supabase.auth.signOut()`, redirects to `/login`.
4. `apps/web/app/(app)/layout.tsx` + `apps/web/app/(app)/page.tsx` — authenticated shell + a minimal placeholder ("Signed in as `<email>`. [Sign out]").

**Rationale:** Minimum surface to validate the full round-trip. Future features add screens under `(app)/`; this PR proves the shell works.

### D6: Route protection — extend `apps/web/middleware.ts`

**Decision:** Middleware adds redirect logic alongside the existing session refresh:

- If `getUser()` returns null AND path is gated (see below), redirect to `/login?next=<original-path>`.
- If `getUser()` returns a user AND path is `/login`, redirect to `/(app)`'s root URL (`/`).
- Root `/` stays public — it's the marketing placeholder until a real authenticated home exists.

**Gated paths:** anything inside the `(app)` route group. Since route groups don't appear in URLs, the middleware uses an explicit prefix list (`/dashboard`, future segments) rather than a regex. For this PR, the only gated URL is `/` IF the user lands inside the `(app)` shell — but `/` is the public landing. Resolution: this PR adds an explicit authenticated landing at `/home` (mounted as `(app)/home/page.tsx`), and `/home` is the gated path. Public `/` stays the marketing placeholder.

**Rationale:** One enforcement surface, declarative redirects, no per-route guards. The `/home` path resolves the "route group has no segment" / "public landing exists" tension cleanly. Per PR #9 D2-style discipline: prefer middleware (declarative) over per-component checks (imperative).

### D7: METRICS events — two new posthog.capture sites

**Decision:** Two events added to METRICS.md and fired at the call sites below:

1. `sign_in_requested` — fired from the `/login` form's submit handler (client component) on successful `signInWithOtp` resolve. Properties: `{ method: 'magic_link' }`.
2. `sign_in_completed` — fired from `/auth/callback` after a successful code-for-session exchange. Properties: `{ method: 'magic_link' }`. (Server-side capture via `posthog-node` is out of scope for this PR — fire client-side from `(app)/layout.tsx`'s mount when transitioning from anonymous to identified.)

No event for sign-out (low signal pre-product-launch).

**Rationale:** Conversion funnel for the highest-leverage entry point. METRICS.md authoring rules require one row per capture site — these are the only two.

### D8: hCaptcha — deferred

**Decision:** Do not pre-wire hCaptcha. Leave the BUILD-LOG.md head TODO in place verbatim. No client widget, no commented-out scaffold.

**Rationale:** Roadmap defers; un-configured CAPTCHA breaks signup; the BUILD-LOG TODO is the audit trail until the secret exists. Premature scaffolding adds dead code to review.

### D9: First-time profile bootstrap — lean on PR #9's trigger

**Decision:** No app-side upsert into `public.users`. Rely entirely on PR #9's `create_public_user_profile` AFTER INSERT trigger on `auth.users`, which fires inside the same transaction as the signup.

**Rationale:** PR #9 D2 chose the trigger explicitly to close the signup → profile race. Duplicating the bootstrap in app code would either race the trigger (double-insert collision) or mask its absence (silent fallthrough when the trigger is missing). The merge gate (D2) ensures the trigger exists when this PR ships.

### D10: Tests — unit + Playwright E2E via Inbucket

**Decision:**

- **Unit (Vitest)**: `auth/callback/route.test.ts` (mocked Supabase — exchange success + failure paths), `middleware.test.ts` extension (redirect rules), `login/page.test.tsx` (form renders, calls `signInWithOtp`, shows confirmation state).
- **E2E (Playwright)**: `apps/web/e2e/magic-link.spec.ts` — full round-trip against local Supabase. Spec submits `/login` form with a fresh email, polls Inbucket REST API (`http://127.0.0.1:54424/api/v1/mailbox/<email>`) for the magic link, visits the callback URL, asserts `(app)/home` renders the signed-in shell. Skips on non-local (`isLocalSupabase`) per existing helper convention.
- New helper: `apps/web/e2e/helpers/inbucket.ts` — `latestMagicLink(email: string)` fetches the most recent message body and extracts the `?code=...&next=...` URL.

**Rationale:** Inbucket on `:54424` is in the local stack already (CLAUDE.md § Local Supabase ports); we use the same skip-on-non-local pattern as `rls-isolation.spec.ts`. The unit tests cover branches without bringing up the stack; the E2E proves the wire-format is right.

### D11: Sign-out UX — minimal form button in `(app)` header

**Decision:** `(app)/layout.tsx` renders a small `<header>` with the signed-in email and a `<form action="/auth/signout" method="post"><button type="submit">Sign out</button></form>`. No avatar, no dropdown, no styled menu. Dark-ground design tokens but minimal visual treatment.

**Rationale:** First-feature scope. Visual polish ships when Settings/Profile lands (PRODUCT-ROADMAP.md). Form action is CSRF-safe (POST + same-origin), works without JS, no client component needed for the button itself.

### D12: `/login` UI

**Decision:** Single email input + "Send magic link" button. Post-submit confirmation state shows "Check your email at `<addr>` for a sign-in link" with a "Use a different email" link to reset. Inline error states for invalid email format (HTML5 `type="email"` + custom message) and Supabase API errors (rate limit, network). Dark ground, mobile-first, design tokens from `packages/ui/src/tokens.ts`.

**Rationale:** Calm-authority voice (OVERVIEW.md); minimum lovable; visually consistent with the existing landing page placeholder.

### D13: Email-redirect allow-list

**Decision:** `emailRedirectTo` is built from `window.location.origin` on the client (the only place `signInWithOtp` runs). No `NEXT_PUBLIC_SITE_URL` env var added. The Supabase project's `uri_allow_list` already contains `https://home-os-nu-two.vercel.app/**` + `http://localhost:3000/**` (per BUILD-LOG.md head TODO). Preview-deploy email-auth remains broken until the wildcard is added — leave the BUILD-LOG TODO untouched.

**Rationale:** `window.location.origin` is the canonical source on the browser; adding an env var duplicates state. Preview-deploy is already documented as a known limitation; this PR does not change that.

---

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens, Data
     model changes, API contracts, Offline behavior, Metrics, Files to
     create/modify, Tests, Dependencies, Task order, Gotchas, Acceptance /
     rollout / rollback. The Decisions section above stays verbatim. -->

## Core user story

A homeowner lands on `/` (public marketing placeholder), follows the "Sign in" affordance to `/login`, enters their email, and submits. The browser-side Supabase client (D1, D4) calls `signInWithOtp({ email, options: { emailRedirectTo: <origin>/auth/callback } })` (D13). PostHog fires `sign_in_requested` (D7). The `/login` page swaps to a confirmation state ("Check your email at `<addr>`…", D12). The homeowner opens the email, clicks the magic link, and the browser is redirected to `/auth/callback?code=…&next=/home`. The callback route handler (D4) exchanges the PKCE `code` for a session, sets the session cookies via `@supabase/ssr`'s `setAll`, and 303-redirects to `next` (default `/home`). `(app)/layout.tsx` mounts, fires `sign_in_completed` (D7) once per session via its client-component capture child, renders a minimal header with the signed-in email + sign-out form (D11), and shows `/home`. Submitting the sign-out form POSTs to `/auth/signout`, which calls `supabase.auth.signOut()` and 303-redirects to `/login`.

Middleware (D6) refreshes the session on every navigation and now also enforces: an unauthenticated request to `/home` is bounced to `/login?next=/home`; an authenticated request to `/login` is bounced to `/home`. The first time a homeowner signs in, PR #9's `on_auth_user_created` trigger (D9, D2) inserts their `public.users` row in the same transaction as the `auth.users` row — by the time the callback redirects to `/home`, the profile already exists. No app-side bootstrap.

## In scope

This PR ships, atomically:

1. **`/login` page** — `apps/web/app/login/page.tsx` (server component shell) + a `'use client'` form child that calls `supabase.auth.signInWithOtp` and renders the post-submit confirmation state (D5, D12). Fires `sign_in_requested` on a successful resolve (D7).
2. **`/auth/callback` route handler** — `apps/web/app/auth/callback/route.ts`. GET reads `?code` + `?next`, calls `supabase.auth.exchangeCodeForSession(code)`, 303-redirects to `next` (default `/home`). Error path 303-redirects to `/login?error=callback_failed`. (D4, D5)
3. **`/auth/signout` route handler** — `apps/web/app/auth/signout/route.ts`. POST-only; calls `supabase.auth.signOut()`; 303-redirects to `/login`. Non-POST methods return 405 (D5, D11).
4. **`(app)` route group** — `apps/web/app/(app)/layout.tsx` (server-rendered header + sign-out form) and `apps/web/app/(app)/home/page.tsx` (minimal authenticated landing: "Signed in as `<email>`.") (D3, D5, D11). Layout mounts a client-component child that fires `sign_in_completed` once per session (D7).
5. **Middleware redirect rules** — extend `apps/web/middleware.ts` so the existing session-refresh pass also redirects per D6: anonymous + path startsWith `/home` → `/login?next=<path>`; authenticated + path === `/login` → `/home`.
6. **METRICS.md updates** — add the two rows from D7 (`sign_in_requested`, `sign_in_completed`).
7. **E2E test (Playwright)** — `apps/web/e2e/magic-link.spec.ts` performs a full round-trip against the local stack using a fresh email, polling Inbucket (`http://127.0.0.1:54424`) for the magic link (D10).
8. **Inbucket helper** — `apps/web/e2e/helpers/inbucket.ts` exporting `latestMagicLink(email)` that returns the parsed `?code=…&next=…` URL (D10).
9. **Unit tests (Vitest)** — `app/auth/callback/route.test.ts`, `app/auth/signout/route.test.ts`, `middleware.test.ts` (new/extended), `app/login/page.test.tsx`, `app/(app)/layout.test.tsx`, `app/(app)/home/page.test.tsx` (D10).
10. **CLAUDE.md § Where Things Happen** — append entries for `/login`, `/auth/callback`, `/auth/signout`, `(app)/layout.tsx`, `(app)/home/page.tsx`, the middleware redirect-rules behavior, and the new E2E helper + spec.

## Out of scope

Explicit non-goals — surfaced now so a reviewer doesn't ask "where's X?":

- **No password / OAuth / phone OTP** — magic-link only (D1).
- **No hCaptcha widget, no scaffolded `data-sitekey` attribute, no commented-out turnstile** — deferred per D8. The BUILD-LOG.md head TODO stays verbatim.
- **No app-side `users` bootstrap** — relies entirely on PR #9's trigger (D9). No `upsert`, no "create profile if missing" branch in the callback handler.
- **No `NEXT_PUBLIC_SITE_URL` env var** — origin is read from `window.location.origin` on the client (D13). No new env var added to `.devcontainer/.env`, GitHub Secrets, or Vercel.
- **No visual polish / avatar / settings page / styled menu** — sign-out is a bare `<form><button>Sign out</button></form>` in the `(app)` header (D11). Settings/Profile ships later per PRODUCT-ROADMAP.md.
- **No `(app)/settings` or any `(app)/<feature>` route** — only `(app)/home` exists in this PR (D5).
- **No marketing-page redesign** — `/` stays the existing placeholder (D6).
- **No preview-deploy email-auth fix** — Supabase project's `uri_allow_list` wildcard for `*.vercel.app` is a separate operator task tracked in BUILD-LOG.md head TODO; leave that TODO untouched (D13).
- **No `posthog-node` / server-side capture** — both events fire client-side (D7).
- **No new `packages/core` exports** — auth flow uses existing `apps/web/lib/supabase/{client,server}.ts` factories.
- **No service worker / offline cache fallback for `/login` or `/(app)/home`** — see § Offline behavior.

## Screens

### `/login` (public)

**Purpose:** Single entry-point for sign-in/sign-up. Same flow regardless of whether the email has signed in before; Supabase magic link handles both implicitly (D1).

**Key elements:**

- App logo / wordmark (small, dark-on-dark, design tokens from `packages/ui/src/tokens.ts`).
- Heading: "Sign in to home-os".
- Subhead: "Enter your email — we'll send you a sign-in link." Calm-authority voice (OVERVIEW.md, D12).
- `<form>` with one `<input type="email" required>` + one `<button type="submit">Send magic link</button>`.
- Below the form, a small `<p>` placeholder for inline error states.

**Copy hints (D12):**

- Submit button (idle): "Send magic link"
- Submit button (in-flight): "Sending…" (`aria-disabled` during the await)
- Confirmation state heading: "Check your email"
- Confirmation state body: "We sent a sign-in link to **`{email}`**. Open it on this device to continue."
- "Use a different email" link below the confirmation, which resets state back to the form.
- Generic error: "Something went wrong. Try again in a moment."
- Rate-limit error (Supabase returns `status: 429`): "You're sending links too fast. Wait a minute and try again."
- Invalid email format: leans on HTML5 native validation (`type="email"` + `required`); browser surfaces the message — no custom JS validation in this PR.

**Error states (D12):**

- Network error mid-`signInWithOtp` → generic error copy, form stays in "idle" state with the email pre-filled.
- Supabase API error → map by `error.status`: 429 → rate-limit copy; everything else → generic copy with the error reference logged to Sentry (no PII — Supabase error messages don't include the email).
- `?error=callback_failed` query param (when the callback route bounces back here) → red banner above the form: "That sign-in link expired or was already used. Send a new one."

### `/(app)/home` (authenticated)

**Purpose:** Minimal authenticated landing. Proves the round-trip works (D5). Will be replaced by the real Home in a later PR.

**Key elements (D11):**

- `(app)/layout.tsx` header strip: app logo on the left, signed-in email on the right, sign-out form (`<form action="/auth/signout" method="post"><button type="submit">Sign out</button></form>`) flush right after the email.
- Page body: a single `<h1>` ("home-os") + `<p>` ("Signed in as `<email>`. More coming soon.").
- Dark ground; tokens from `packages/ui/src/tokens.ts`; no card / chip / interactive primitives.

**Copy hints:**

- Header email label: just the email string, no "Signed in as" prefix (saves horizontal space).
- Sign-out button: "Sign out" (no icon).

**Error states:**

- None — if middleware (D6) lets the user through, the layout assumes a session. The layout's `supabase.auth.getUser()` call in the server component double-checks (defense in depth); if `null`, layout `redirect('/login')`.

## Data model changes

**None.** This PR adds no migrations. The schema this PR depends on (`public.users` row, `on_auth_user_created` trigger) ships in PR #9 (`feature/supabase-schema-and-rls`) — see D2 and D9. By merge time, PR #9 will have landed on `main`, so this PR's runtime assumes:

- `public.users(id, created_at, location, byok_used)` exists with the RLS policies from PR #9 Migration 003.
- `public.create_public_user_profile()` SECURITY DEFINER function + `on_auth_user_created` AFTER INSERT trigger on `auth.users` (PR #9 Migration 005) auto-create the `public.users` row in the same transaction as signup (D9).

If PR #9 has not merged when this PR is otherwise green, hold the merge per D2 — do not duplicate the migration here.

## API contracts

Three new HTTP-shaped surfaces plus one client-side Supabase call.

### Client → Supabase: `signInWithOtp` (called from `/login` form)

```ts
// In apps/web/app/login/_components/LoginForm.tsx ('use client')
const supabase = createBrowserClient(/* … */);
const { data, error } = await supabase.auth.signInWithOtp({
  email, // user input
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback?next=/home`, // D13
    // shouldCreateUser left at its default (true) — magic-link auto-signs-up (D1)
  },
});
// On resolve without error:
//   - posthog.capture('sign_in_requested', { method: 'magic_link' })  (D7)
//   - swap UI to confirmation state
// On error:
//   - error.status === 429 → rate-limit copy
//   - else → generic copy + Sentry.captureException(error)
```

The `next` value is hard-coded to `/home` for this PR (no per-user deep-link target yet). Later features that link out from an unauth state can pass a different `next` value through their own redirect chain — the callback handler accepts any value as a string.

### `GET /auth/callback?code=<pkce-code>&next=<path>`

**Input (query):**

- `code: string` (required) — PKCE authorization code emitted by Supabase auth into the magic-link URL.
- `next: string` (optional) — relative path to redirect to after a successful exchange. Default `/home`. Treated as a string; the handler 303-redirects to it directly (no validation in this PR — the only callers are the Supabase server and the `/login` form's hard-coded value, both of which we control).

**Behavior (D4):**

1. Build a server Supabase client via `apps/web/lib/supabase/server.ts`.
2. `const { error } = await supabase.auth.exchangeCodeForSession(code)`.
3. On success: 303 redirect to `next` (default `/home`). The `@supabase/ssr` helper's `setAll` (which `server.ts` wires into Next's async `cookies()` store) has already written the session cookies onto the outgoing response.
4. On error: 303 redirect to `/login?error=callback_failed`.

**Output:** `Response` with status 303 and a `Location` header. No JSON body.

**Notes:**

- 303 (not 307/308) — see § Gotchas. A Next-side `redirect()` inside a route handler emits a `NEXT_REDIRECT` thrown signal which is NOT the right shape for the cookie-set + redirect combo; we emit `NextResponse.redirect(url, 303)` so the cookies set by `@supabase/ssr` are on the same response the browser sees.
- Server-side `sign_in_completed` capture is NOT fired here. Per D7, the event fires from `(app)/layout.tsx` on first mount, when the client has both an identified user and `posthog-js` available.

### `POST /auth/signout`

**Input:** no body, no query. Method must be POST.

**Behavior:**

1. Build a server Supabase client via `apps/web/lib/supabase/server.ts`.
2. `await supabase.auth.signOut()`. This revokes the session and clears the auth cookies via `setAll`.
3. 303 redirect to `/login`.

**Output:** `Response` with status 303 and `Location: /login`. Non-POST returns `Response` with `status: 405` + `Allow: POST`.

**Notes:**

- POST-only — `<form method="post">` (D11) is same-origin CSRF-safe; GET sign-out would be CSRF-exploitable via image tags.
- No event fired (D7 — "No event for sign-out").

## Offline behavior

**N/A.** Magic-link sign-in requires network (Supabase API for `signInWithOtp` and `exchangeCodeForSession`; the email provider for delivery). The PWA spike (PR #3) adds a service worker but explicitly does NOT cache `/login`, `/auth/callback`, `/auth/signout`, or `(app)/**` — these routes must always hit the network so cookies stay correct.

If the user is offline on `/login` and submits the form, `signInWithOtp` rejects with a network error and the page surfaces the generic error copy (see § Screens § `/login` § Error states). No queued / retried submission — sign-in is single-shot.

If the user is offline mid-callback (rare — they just clicked the magic link), the `exchangeCodeForSession` POST fails; the callback's error path 303-redirects to `/login?error=callback_failed`. Acceptable since the magic link itself is single-use; the user requests a new link from `/login`.

## Metrics

Two new rows added to `METRICS.md § Events` (D7). Listed here verbatim — Task 6 transcribes these into METRICS.md.

| Event               | When it fires                                                                                                                                       | Key properties             | Why we care                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `sign_in_requested` | Fired from the `/login` form's submit handler in `apps/web/app/login/_components/LoginForm.tsx` after `signInWithOtp` resolves without error.       | `{ method: 'magic_link' }` | Top of the auth funnel — a drop between "requested" and "completed" is a deliverability / UX regression. |
| `sign_in_completed` | Fired from `apps/web/app/(app)/layout.tsx`'s client-component child on first authenticated mount (transition from anonymous to identified PostHog). | `{ method: 'magic_link' }` | Bottom of the auth funnel — measures the realized conversion to a signed-in session.                     |

No feature flags added in this PR. No new Sentry capture sites beyond the existing default-export wiring (`signInWithOtp` errors get `Sentry.captureException(error)` per § Screens, but Sentry doesn't gate on rows in METRICS.md — only PostHog does).

## Files to create/modify

| File                                                        | Action      | Purpose                                                                                                                                                                                      |
| ----------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/login/page.tsx`                               | new         | Server component shell that renders `<LoginForm />`. No client logic. (D5)                                                                                                                   |
| `apps/web/app/login/_components/LoginForm.tsx`              | new         | `'use client'` form: email input, submit handler calls `signInWithOtp` and toggles confirmation state. Fires `sign_in_requested`. (D5, D7, D12)                                              |
| `apps/web/app/login/page.test.tsx`                          | new         | Vitest + Testing Library — form renders, submit calls a mocked `signInWithOtp`, success swaps to confirmation, error surfaces the right copy. (D10)                                          |
| `apps/web/app/auth/callback/route.ts`                       | new         | GET handler — exchanges PKCE code for session, 303-redirects to `next` or `/login?error=callback_failed`. (D4, D5)                                                                           |
| `apps/web/app/auth/callback/route.test.ts`                  | new         | Vitest — mocked Supabase server client; asserts success-path redirect target + cookie set, error-path redirect target. (D10)                                                                 |
| `apps/web/app/auth/signout/route.ts`                        | new         | POST handler — calls `signOut`, 303-redirects to `/login`. Non-POST → 405. (D5, D11)                                                                                                         |
| `apps/web/app/auth/signout/route.test.ts`                   | new         | Vitest — mocked Supabase server client; POST → 303 to `/login`, GET → 405. (D10)                                                                                                             |
| `apps/web/app/(app)/layout.tsx`                             | new         | Server component shell: `supabase.auth.getUser()` defensive check, redirect to `/login` if null, render header with email + sign-out form, mount `<SignInCompletedCapture />`. (D3, D5, D11) |
| `apps/web/app/(app)/layout.test.tsx`                        | new         | Vitest — mocked `getUser`; null user redirects, populated user renders header with the email. (D10)                                                                                          |
| `apps/web/app/(app)/_components/SignInCompletedCapture.tsx` | new         | `'use client'` zero-output component that fires `sign_in_completed` once per session via a `useEffect` + sessionStorage guard. (D7)                                                          |
| `apps/web/app/(app)/home/page.tsx`                          | new         | Minimal authenticated landing: heading + signed-in email paragraph. (D3, D5)                                                                                                                 |
| `apps/web/app/(app)/home/page.test.tsx`                     | new         | Vitest — renders the expected heading + email paragraph for a given mocked user. (D10)                                                                                                       |
| `apps/web/middleware.ts`                                    | modify      | Extend the existing session-refresh middleware with D6 redirect rules: anon + `/home*` → `/login?next=…`; authed + `/login` → `/home`. (D6)                                                  |
| `apps/web/middleware.test.ts`                               | new         | Vitest — mocked `getUser` + `NextRequest`; asserts the four redirect rules and the "leave alone" cases for `/` and asset paths. (D10)                                                        |
| `apps/web/e2e/helpers/inbucket.ts`                          | new         | `latestMagicLink(email: string): Promise<URL>` — polls `http://127.0.0.1:54424/api/v1/mailbox/<email>` and extracts the magic-link URL from the latest message. (D10)                        |
| `apps/web/e2e/magic-link.spec.ts`                           | new         | Full round-trip Playwright spec against the local stack, skipped on non-local via `test.skip(!isLocalSupabase, localSupabaseSkipReason)`. (D10)                                              |
| `METRICS.md` § Events                                       | append      | Two rows per D7 — `sign_in_requested` and `sign_in_completed`.                                                                                                                               |
| `CLAUDE.md` § Where Things Happen                           | append      | One entry per new route, the `(app)` shell, the new middleware redirect behavior, and the new E2E helper + spec. Required by `kit/scripts/commit-hooks/check-docs-freshness-project.sh`.     |
| `BUILD-LOG.md`                                              | (Phase 5.6) | `/ak-build` Phase 5.6 records the build entry on the feature branch; not authored by `/ak-implement`. Flagged here to cover the full PR file scope.                                          |
| `PLAN.md`                                                   | unchanged   | **Do NOT edit** in this PR. PR #9 hasn't merged yet on this branch; PLAN.md bookkeeping is owned by Phase 5.6 after the gate flips.                                                          |

## Tests

### Unit tests (Vitest)

1. **`apps/web/app/login/page.test.tsx`** (D10)
   - Renders the heading and the email input with `type="email"` and `required`.
   - On submit with a valid email, mocked `supabase.auth.signInWithOtp` is called exactly once with the email and `options.emailRedirectTo` matching `<window-origin>/auth/callback?next=/home`.
   - On a mocked success resolve, the DOM swaps to the confirmation state ("Check your email"); the "Use a different email" link resets it back to the form.
   - On a mocked error with `status: 429`, the rate-limit copy appears.
   - On any other mocked error, the generic copy appears and `Sentry.captureException` is called with the error.
   - On success, mocked `posthog.capture('sign_in_requested', { method: 'magic_link' })` is invoked exactly once.

2. **`apps/web/app/auth/callback/route.test.ts`** (D10)
   - GET with `?code=foo&next=/home`: mocked `exchangeCodeForSession` resolves; response is a `Response` with `status: 303` and `Location: /home`.
   - GET with `?code=foo` (no `next`): redirects to `/home` (default).
   - GET with `?code=foo` where `exchangeCodeForSession` rejects: redirects to `/login?error=callback_failed`.
   - GET without `?code`: redirects to `/login?error=callback_failed` (defensive — never call `exchangeCodeForSession(undefined)`).

3. **`apps/web/app/auth/signout/route.test.ts`** (D10)
   - POST: mocked `supabase.auth.signOut` is called once; response is 303 with `Location: /login`.
   - GET: response is 405 with `Allow: POST` and `supabase.auth.signOut` is NOT called.

4. **`apps/web/app/(app)/layout.test.tsx`** (D10)
   - Mocked `supabase.auth.getUser` returns `null`: layout calls Next `redirect('/login')` (assert via mocked redirect spy).
   - Mocked `getUser` returns `{ email: 'a@b.test' }`: rendered output contains `a@b.test` and the `<form action="/auth/signout" method="post">` block.

5. **`apps/web/app/(app)/home/page.test.tsx`** (D10)
   - Renders the `<h1>` ("home-os") and the signed-in-as paragraph for a given mocked user.

6. **`apps/web/middleware.test.ts`** (D10 — new file; extends the existing session-refresh middleware's behavior)
   - Mocked `getUser` returns null + request path `/home` → middleware returns a redirect response to `/login?next=/home`.
   - Mocked `getUser` returns null + request path `/home/anything` → redirect to `/login?next=/home/anything`.
   - Mocked `getUser` returns null + request path `/` → middleware returns the original response unchanged (public landing).
   - Mocked `getUser` returns null + request path `/login` → unchanged (anon can see `/login`).
   - Mocked `getUser` returns a user + request path `/login` → redirect to `/home`.
   - Mocked `getUser` returns a user + request path `/home` → unchanged (allowed through).
   - Asset / `_next` paths are filtered out by the matcher and don't hit the redirect logic (assert the matcher config).

### E2E test (Playwright)

**`apps/web/e2e/magic-link.spec.ts`** (D10) — skips on non-local via `test.skip(!isLocalSupabase, localSupabaseSkipReason)` so CI fast-job reports skipped; slow-job is the enforcement surface (mirrors the `rls-isolation.spec.ts` pattern from PR #9).

Setup (`beforeEach`): generate a fresh email like `playwright-${Date.now()}@test.local` to avoid Supabase's "you signed in too recently" rate limit on a reused address.

Test:

1. Navigate to `/login`.
2. Fill the email input; click "Send magic link".
3. Assert confirmation state visible ("Check your email").
4. `await latestMagicLink(email)` (new helper) — polls `http://127.0.0.1:54424/api/v1/mailbox/<email>` until a message arrives, parses out the `<origin>/auth/callback?code=…&next=/home` URL.
5. `page.goto(magicLinkUrl)` — browser follows the 303 chain to `/home`.
6. Assert `(app)/home` rendered: heading "home-os", signed-in-as paragraph contains the email.
7. Assert the header email matches and the sign-out button is present.
8. Click sign-out; assert the page lands back on `/login`.
9. Assert a subsequent `page.goto('/home')` redirects back to `/login?next=/home` (middleware rule, D6).

### Inbucket helper

**`apps/web/e2e/helpers/inbucket.ts`** (D10)

```ts
// One named export. Implementation outline (not literal):
// 1. const mailbox = email.split('@')[0]
// 2. Poll http://127.0.0.1:54424/api/v1/mailbox/${mailbox} with retry+backoff
//    (max ~10s) until messages.length > 0.
// 3. Fetch the latest message body via the v1 message endpoint.
// 4. Extract the first http(s) URL pointing at <origin>/auth/callback.
// 5. Return new URL(matched) so callers can read query params if needed.
export async function latestMagicLink(email: string): Promise<URL>;
```

Inbucket runs on port `54424` per CLAUDE.md § Local Supabase ports. No new env var added; the port is hard-coded in the helper (same convention as the supabase-runner relay port in `pnpm db:reset`).

### Test-presence hook coverage

Every new `.ts`/`.tsx` under `apps/web/app/` and `apps/web/middleware.ts` is paired with a sibling `*.test.ts` per the project test-presence convention (CLAUDE.md § Testing). The new helper `apps/web/e2e/helpers/inbucket.ts` lives under `apps/web/e2e/` which is outside the test-presence glob (E2E helpers are exempt; mirrors `helpers/admin-client.ts` from PR #9). The Playwright spec is its own test artifact, no paired `.test.ts` needed.

## Dependencies

**No new npm packages added.** The auth flow uses APIs already in the workspace:

- `@supabase/ssr` (already pinned via the existing `apps/web/lib/supabase/{client,server}.ts` factories and `apps/web/middleware.ts`) — exports `createBrowserClient`, `createServerClient`, and the `cookies.setAll` callback shape used by `server.ts`.
- `@supabase/supabase-js` — pulled transitively via `@supabase/ssr`; exposes `supabase.auth.signInWithOtp`, `supabase.auth.exchangeCodeForSession`, `supabase.auth.signOut`, `supabase.auth.getUser`, `supabase.auth.onAuthStateChange`.
- `posthog-js` (already loaded via `apps/web/app/_components/PostHogProvider.tsx` per CLAUDE.md § Where Things Happen) — used to fire `sign_in_requested` and `sign_in_completed`.
- `@sentry/nextjs` (already wired in `sentry.client.config.ts` and the others per CLAUDE.md) — used for `Sentry.captureException` on unexpected `signInWithOtp` errors.
- `next/navigation` (`redirect`) and `next/server` (`NextResponse`, `NextRequest`) — standard Next 16 imports.

**Local infra dependencies** (already present, surfaced for completeness):

- **Inbucket on `127.0.0.1:54424`** — provided by the local Supabase stack per CLAUDE.md § Local Supabase ports. Used by the E2E spec to retrieve magic-link emails. No new container, no new compose entry.
- **supabase-runner relay** — `pnpm db:reset` and `pnpm db:gen-types` are not run by this PR (no migrations), so the relay isn't on this PR's critical path.

**Upstream blocker:** PR #9 (`feature/supabase-schema-and-rls`) must be on `main` before this PR merges (D2). Tracked in the PR description, not as a code dependency.

## Task order

Canonical 8-task list, dependency-ordered. Each task is a single atomic commit; verification step per task. Order matches the Phase 0 `/ak-build` TaskCreate tracker.

1. **Task 1 — `/login` page + form**
   Files: `apps/web/app/login/page.tsx`, `apps/web/app/login/_components/LoginForm.tsx`, `apps/web/app/login/page.test.tsx`.
   Commit: `feat(auth-magic-link): add /login page with magic-link form`
   Verify: `pnpm --filter web vitest run app/login` clean; `pnpm --filter web dev` + manual hit on `/login` shows the form.

2. **Task 2 — `/auth/callback` route handler**
   Files: `apps/web/app/auth/callback/route.ts`, `apps/web/app/auth/callback/route.test.ts`.
   Commit: `feat(auth-magic-link): add /auth/callback PKCE exchange`
   Verify: `pnpm --filter web vitest run app/auth/callback` clean.

3. **Task 3 — `/auth/signout` route handler**
   Files: `apps/web/app/auth/signout/route.ts`, `apps/web/app/auth/signout/route.test.ts`.
   Commit: `feat(auth-magic-link): add /auth/signout POST handler`
   Verify: `pnpm --filter web vitest run app/auth/signout` clean.

4. **Task 4 — `(app)` shell + `/home` page**
   Files: `apps/web/app/(app)/layout.tsx`, `apps/web/app/(app)/layout.test.tsx`, `apps/web/app/(app)/_components/SignInCompletedCapture.tsx`, `apps/web/app/(app)/home/page.tsx`, `apps/web/app/(app)/home/page.test.tsx`.
   Commit: `feat(auth-magic-link): add (app) shell and authenticated /home`
   Verify: `pnpm --filter web vitest run 'app/(app)'` clean.

5. **Task 5 — Middleware redirect rules**
   Files: `apps/web/middleware.ts` (modify), `apps/web/middleware.test.ts` (new).
   Commit: `feat(auth-magic-link): enforce auth redirects in middleware`
   Verify: `pnpm --filter web vitest run middleware` clean; manual hit on `/home` while signed out bounces to `/login?next=/home`.

6. **Task 6 — METRICS events**
   File: `METRICS.md` — append the two rows from D7.
   Commit: `docs(auth-magic-link): document sign_in_requested + sign_in_completed events`
   Verify: `bash kit/scripts/commit-hooks/check-docs-freshness-project.sh` clean (the two new `posthog.capture` call sites from Tasks 1 and 4 are now covered by METRICS.md rows).

7. **Task 7 — Inbucket helper + E2E spec**
   Files: `apps/web/e2e/helpers/inbucket.ts`, `apps/web/e2e/magic-link.spec.ts`.
   Commit: `test(auth-magic-link): add Inbucket helper + magic-link E2E spec`
   Verify: `pnpm --filter web exec playwright test e2e/magic-link.spec.ts` passes against the local stack.

8. **Task 8 — CLAUDE.md docs update**
   File: `CLAUDE.md § Where Things Happen` — append entries per § Files to create/modify above.
   Commit: `docs(auth-magic-link): document login, callback, signout, (app) shell, middleware redirects, E2E helper`
   Verify: `bash kit/scripts/commit-hooks/check-docs-freshness-project.sh` clean; pre-commit clean.

### Task-order delta vs Phase 0 preview

No deltas. The 8 tasks above match the Phase 0 `/ak-build` TaskCreate tracker 1:1. No tasks added, removed, split, or reordered.

## Gotchas

- **PKCE `code_verifier` cookie must round-trip** (D4). `signInWithOtp` writes a `sb-<ref>-auth-token-code-verifier` HttpOnly cookie at request time; `exchangeCodeForSession` reads that same cookie when the magic link redirects back. If the callback runs in a Supabase client built without `@supabase/ssr`'s `cookies.setAll` wiring (e.g., a plain `@supabase/supabase-js` `createClient` call), the verifier won't be read and the exchange fails with "invalid request: both auth code and code verifier should be non-empty". Always build the callback's server client via `apps/web/lib/supabase/server.ts` — never inline a vanilla `createClient`.

- **Cookies must round-trip via `@supabase/ssr`'s `setAll`**. The PKCE flow needs four cookie writes on a single response: clear the `code-verifier`, set the access token, set the refresh token, set the session metadata. `@supabase/ssr`'s `setAll(cookies)` callback (wired in `apps/web/lib/supabase/server.ts`) batches these into Next's `cookies()` mutator. If a hand-rolled cookie path replaces `setAll`, any one missed cookie leaves the session half-written and the very next request appears anonymous.

- **Redirect from the callback must be a 303 (or an external redirect), not Next-side `redirect()`** (D4). Inside a route handler, `redirect()` (from `next/navigation`) throws a `NEXT_REDIRECT` signal that Next intercepts and re-emits. That intercept layer can drop or reorder the response cookies set during the exchange. Emitting `NextResponse.redirect(new URL(next, req.url), 303)` (or a plain `new Response(null, { status: 303, headers: { Location: next } })`) puts the cookie writes and the redirect on the same response the browser sees. Use 303 specifically because the magic-link follow is a GET that already had side effects on the server — 303 is the canonical "redirect after side effect" status; 307/308 preserve method (wrong here) and are subtly different in cookie-set semantics across browsers.

- **`signInWithOtp` rate limit is per-email AND per-IP** (D12). Hitting the rate limit returns `status: 429`. In E2E (D10) this surfaces if a test reuses an email across runs without a cool-down; the spec mints a fresh `Date.now()`-suffixed address each run to dodge.

- **`window.location.origin` differs between local-dev and Vercel preview deploys** (D13). On `http://localhost:3000` it's `http://localhost:3000`; on a preview deploy it's `https://<branch>-<hash>-homeos.vercel.app`. Supabase's `uri_allow_list` covers production + localhost per BUILD-LOG.md but not the preview wildcard — magic-link sign-in is intentionally broken on preview deploys until that wildcard is added (D13). Leave the BUILD-LOG TODO untouched.

- **`(app)/layout.tsx` MUST guard with `supabase.auth.getUser()` even though middleware also guards** (D6, D11). Middleware runs on the edge with cookie reads only — it does NOT validate the JWT against Supabase. A tampered/expired cookie can pass middleware but fail layout-side `getUser()`. The layout's redirect is the defense-in-depth check that catches that case before the user sees any authenticated UI.

- **`sign_in_completed` must fire exactly once per session, not on every layout mount** (D7). `(app)/layout.tsx` is a server component but the `SignInCompletedCapture` child is a client component that re-mounts on every authenticated page navigation. Guard with a sessionStorage key (e.g., `home_os.sign_in_completed_fired:<user-id>`) inside its `useEffect` so the capture fires only the first time the user enters the `(app)` shell post-sign-in. Keying the guard off `user.id` makes a fresh sign-in after sign-out re-fire correctly without needing explicit cleanup on the signout path.

- **PostHog identify must precede the capture** (D7). `posthog-js` distinct_id is anonymous before sign-in; if `sign_in_completed` fires before `posthog.identify(user.id)`, the event lands on the anonymous distinct_id and the conversion funnel under-counts. The capture component should call `posthog.identify(user.id, { email })` first, then `posthog.capture('sign_in_completed', { method: 'magic_link' })` second.

- **Middleware `getUser()` is async + can throw on stale-cookie boot** (D6). Wrap the redirect-decision block in a try/catch — on throw, treat it as "anonymous" for the purposes of the gated-path check (i.e., redirect to `/login`). Logging the throw to Sentry adds observability without blocking the user.

- **Route handlers must opt out of static rendering**: Next 16 may try to statically optimize a route handler that doesn't read request headers/cookies. The callback and signout handlers both touch cookies via `@supabase/ssr` — the dynamic read is implicit and works, but a future Next minor version may tighten the heuristic. Adding `export const dynamic = 'force-dynamic'` to both route files is cheap insurance.

## Acceptance / rollout / rollback

### Acceptance

A PR can land when ALL of:

- [ ] PR #9 (`feature/supabase-schema-and-rls`) is on `main` (D2 hard gate).
- [ ] All 8 tasks committed atomically per § Task order.
- [ ] `pnpm -w typecheck` clean.
- [ ] `pnpm --filter web vitest run` clean (all six new unit test files plus the existing suite).
- [ ] `pnpm --filter web exec playwright test e2e/magic-link.spec.ts` passes against the local stack (full round-trip via Inbucket).
- [ ] `bash kit/scripts/commit-hooks/check-docs-freshness-project.sh` clean — CLAUDE.md path map and METRICS.md events both updated.
- [ ] Manual smoke (local): submit `/login` → email arrives in Inbucket → click link → land on `/home` → click sign-out → land on `/login`. Re-hit `/home` while signed out → bounce to `/login?next=/home`.
- [ ] Branch protection's required checks all green.

### Rollout

- **Merge order:** Merge only after PR #9 is on `main` (D2). PR description carries the gate explicitly.
- **Vercel:** Auto-deploys on merge to `main`. The deployed app gains `/login`, `/auth/callback`, `/auth/signout`, `(app)/home`. Marketing `/` placeholder is unchanged.
- **`deploy-migrations.yml`:** No-op (this PR adds zero migrations).
- **`deploy-functions.yml`:** No-op (no edge functions).
- **Preview-deploy email-auth limitation:** Per D13, magic-link sign-in stays broken on preview deploys until the `uri_allow_list` wildcard is added to the Supabase project — out of scope for this PR. The BUILD-LOG.md head TODO documents this; do not edit.
- **Operator follow-ups:** none required for this PR. CAPTCHA wiring (D8) and the preview-deploy email-auth fix (D13) remain as standing BUILD-LOG.md TODOs.

### Rollback

Acceptable to revert pre-launch — no real homeowner data exists yet.

1. Revert the PR via `gh pr revert` or `git revert <merge-sha>` + new PR.
2. **No DB cleanup needed.** A signed-up homeowner's `auth.users` row plus the trigger-created `public.users` row (from PR #9's `on_auth_user_created` trigger, D9) will persist after revert as orphan rows. RLS isolates them (PR #9 Migration 003) — no other user can read or write them, and post-revert there's no `/login` route to access them through. They're orphan-but-harmless data, not corruption. If a future re-roll of this PR ships, those rows simply mean "this homeowner has signed in before" with a `created_at` predating the new deploy.
3. **No storage cleanup needed.** This PR writes no storage objects.
4. **PostHog backfill:** The two `sign_in_requested` / `sign_in_completed` events from pre-revert sessions stay in the PostHog ingest stream. Acceptable — they're correctly attributed to the pre-revert deploy window.
5. **Vercel auto-redeploys** the revert PR on merge; production loses the new routes. The `/home` URL 404s post-revert (no `(app)/home/page.tsx`), which is correct.

If real homeowner data has begun to land before a rollback decision is made (i.e., post-launch), do NOT revert blindly — design a forward-fix that preserves any session state and only reverts the buggy surface.
