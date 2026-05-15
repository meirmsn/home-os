<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: landing-redirect -->
<!-- date: 2026-05-15 -->

# Spec: landing-redirect (v0 row #1)

**Sources:**

- `PLAN.md § Planned row #1 (landing-redirect)` — the concrete row this PR closes
- `PRODUCT-ROADMAP.md § v0 § landing-redirect (PLAN.md row #1)` — long-form rationale, candidate-cause analysis, fix shape
- `apps/web/middleware.ts` + `apps/web/middleware.test.ts` — current edge-middleware surface being extended
- `apps/web/app/page.tsx` — current placeholder being replaced
- Prior spec `specs/auth-magic-link/spec.md` (D4, D6) — establishes the `/home` post-auth default + the auth-aware-middleware convention this row mirrors
- `apps/web/e2e/auth-edge-cases.spec.ts` — the E2E surface the new case appends to

**Feature one-liner.** Replace the `/` "Home OS — coming soon" placeholder with an
auth-aware middleware redirect so a fresh visitor to the production URL lands on
`/login` (anon) or `/home` (signed in), closing the "shipped but undiscoverable"
gap that PR #15 left behind. `page.tsx` becomes a noscript-fallback anchor for
clients that don't follow redirects.

---

## Decisions (resolved at spec time)

7 `/ak-spec`-time decisions resolved in Phase 0 with the user. Recorded below so
Phase 1 preserves them verbatim and a crashed Phase 1 resumes without re-asking.

### D1: Redirect status code is 307 (not 303)

**Decision:** Use `NextResponse.redirect()`'s default 307 for both new branches
(anon `/` → `/login`; auth `/` → `/home`).

**Rationale:** Existing middleware rules 1+2 use the same default and every
`middleware.test.ts` case asserts `.status === 307`. `PRODUCT-ROADMAP.md`'s
"303 to /login" reads as imprecise prose, not a normative constraint — there's
no body-state-on-redirect concern here (idempotent GET on an inert root path).
Matching the established convention keeps the test shape uniform.

### D2: New rules slot in after `getUser()`, after existing rules 1+2

**Decision:** Add the two new branches as rules 3+4 in the existing handler,
immediately after the `if (user && pathname === '/login') { redirect('/home') }`
block. Order: rule 1 (anon → gated), rule 2 (auth → /login), rule 3 (anon → /),
rule 4 (auth → /). Then the existing `return response` at the bottom.

**Rationale:** The session refresh side effect on `getUser()` must run for `/`
too (otherwise an authenticated user visiting `/` once a day never refreshes
cookies). Placing the new rules after `getUser()` and as same-shape branches
off the same `user` value keeps the contract declarative.

### D3: Anonymous `/` → `/login` carries no `?next=...`

**Decision:** `return NextResponse.redirect(new URL('/login', request.url))` —
no query string built up.

**Rationale:** Root isn't a protected destination the user was trying to reach;
it's the entry surface. Post-auth lands at `/home` via `safeNext()`'s default
in `auth/callback/route.ts` (the missing `?next=` argument means it falls
through to the `/home` default). Adding `?next=/` would create a redirect
loop (`/login` → auth → `safeNext('/')` → middleware → `/login`) — closing
that loop with another exception would be load-bearing complexity for zero
user benefit.

### D4: Authenticated `/` → `/home`

**Decision:** Send authenticated users at `/` to `/home`, mirroring rule 2's
treatment of `/login`.

**Rationale:** `/home` is the canonical authenticated landing today (the only
surface a signed-in user can reach without typing a deep URL). When marketing
copy exists post-Phase-1, this branch can flip to render a marketing page
instead — one-line change in the middleware, no contract drift in the rest of
the app.

### D5: `page.tsx` becomes a noscript-fallback anchor

**Decision:** Replace the existing "Home OS — coming soon" paragraph with a
minimal `<main>` containing one short heading + an `<a href="/login">Sign in</a>`
link. Keep the dark-ground design tokens (`text-[var(--color-text-primary-inverse)]`)
so the noscript surface still renders in brand. No client-side JS, no auth
detection — the middleware handles that for normal browsers.

**Rationale:** Middleware fires before the page renders for any normal browser
flow, so `page.tsx` is only seen by clients that don't follow redirects
(`curl -I`, headless scrapers, search-engine crawlers indexing the bare `/`).
A one-line anchor preserves SEO + accessibility without leaving "coming soon"
visible to crawlers post-launch.

### D6: Existing "anonymous + / -> NOT redirected" test case flips

**Decision:** The existing `middleware.test.ts` case at lines 67-71 (asserting
`response.headers.get('location') === null` for anon `/`) is replaced with the
inverse (asserting `307` + `Location: /login`). Two further cases added:
authenticated `/` → `/home`, and the matcher coverage check left untouched.

**Rationale:** The contract being asserted has flipped. Keeping the old case
would create internal contradiction with the new behavior — the test suite
must mirror the production contract, not preserve historical states.

### D7: `CLAUDE.md § Where Things Happen` updates

**Decision:** Two row edits:

1. **Edge middleware row** — append to the existing description: "AND root `/`
   redirect (anon → `/login`, auth → `/home`)". Update the test-count summary
   from "9 cases" to whatever count the extended test file lands on (likely
   11, after adding 2 and replacing 1).
2. **`apps/web/app/page.tsx` row** — does not currently appear in § Where
   Things Happen (the file is the only un-listed app-router file). Add a row
   describing it as "noscript-fallback for `/` — middleware redirects normal
   browser flows; only `curl -I` / crawlers / non-following clients hit this
   surface."

**Rationale:** `kit/scripts/commit-hooks/check-docs-freshness-project.sh` blocks
PRs that change a § Where Things Happen surface without updating the section.
The middleware row's behavior just changed (new rules); the page.tsx row's
purpose changed (no longer a landing placeholder).

---

<!-- /ak-spec (Phase 1) expanded the file below this marker. Decisions D1–D7
     above are preserved verbatim. -->

## Core user story

1. Visit `https://home-os-nu-two.vercel.app/` as a brand-new anonymous browser session.
2. See the URL flip to `/login` and the magic-link form render.
3. Sign in via magic-link (existing `auth-magic-link` round-trip), land on `/home`.
4. Revisit `/` in the same authenticated session.
5. See the URL flip back to `/home` (no flash of the placeholder, no manual URL typing).

Five imperative verbs. Each produces a verifiable artifact in `specs/landing-redirect/qa-walk/`: `verb-1-visit-root-anon.png` (the immediate `/` hit), `verb-2-redirected-to-login.png` (DOM assert on `/login` URL + magic-link form visible), `verb-3-signed-in-home.png` (`/home` shell after auth round-trip), `verb-4-revisit-root-authed.png` (the second `/` hit), `verb-5-redirected-to-home.png` (URL assert on `/home`).

## In scope

This PR ships, atomically:

1. **Two new middleware redirect branches** — `apps/web/middleware.ts` extended with rules 3 + 4 (D2) immediately after the existing `if (user && pathname === '/login') { redirect('/home') }` block. Rule 3: `!user && pathname === '/'` → 307 `Location: /login` (D1, D3). Rule 4: `user && pathname === '/'` → 307 `Location: /home` (D1, D4). No matcher change required — the existing matcher already includes `/` (it excludes `_next/static`, `_next/image`, `favicon.ico`, and explicit asset extensions; the bare `/` route doesn't match any of those exclusions).
2. **`page.tsx` rewrite to noscript-fallback anchor** — `apps/web/app/page.tsx` body replaced per D5. A `<main>` with one short heading + one `<a href="/login">Sign in</a>`. Dark-ground tokens preserved (`text-[var(--color-text-primary-inverse)]`). No `'use client'`, no auth detection, no copy beyond the anchor.
3. **`middleware.test.ts` extension** — `apps/web/middleware.test.ts` per D6:
   - Replace the existing case at lines 67–71 (anon `/` → NOT redirected) with its inverse — anon `/` → 307 `Location: /login`.
   - Add a new case — authenticated `/` → 307 `Location: /home`.
   - Add a new case — stale-cookie throw at `/` → treated as anonymous → 307 `Location: /login` (mirrors the existing stale-cookie-at-`/home` case at line 105).
   - Existing matcher-config assertion case (lines 159–168) stays untouched.
4. **E2E extension** — `apps/web/e2e/auth-edge-cases.spec.ts` (modify): one new `test('anonymous /' → /login: middleware rule 3 (landing-redirect)', …)` + one new `test('authenticated /' → /home: middleware rule 4 (landing-redirect)', …)`. The authed case reuses the password + cookie-injection pattern already in the file's "authenticated /login → /home" test. Both inherit the file-level `test.skip(!isLocalSupabase, …)` gate.
5. **`CLAUDE.md § Where Things Happen` updates** — per D7:
   - Edge-middleware row: append the new rule summary to the description; bump the test-count from "9 cases" to "11 cases".
   - New row for `apps/web/app/page.tsx` describing its noscript-fallback role.

## Out of scope (deferred)

Explicit non-goals — surfaced so a reviewer doesn't ask "where's X?":

- **Marketing landing page on `/`** — PRODUCT-ROADMAP § landing-redirect "Decision shape" sub-option 1 (rejected). When Phase 1 stabilizes with real users and there's an actual marketing message to land, the authenticated branch in D4 can flip to render that page instead — a one-line middleware change.
- **`?next=/` carry on the anon-`/` redirect** — D3. Adding `next=/` would create a redirect loop (`/login` → auth → `safeNext('/')` → middleware → `/login`).
- **`/ak-pre-ship` "placeholder page" gate** — PRODUCT-ROADMAP § landing-redirect Cross-refs identifies this as a future devshop generalization candidate; not in scope here.
- **Crawler-specific copy on the noscript surface** — D5. One short heading + one anchor link. No SEO meta-tags, no marketing copy, no JS.
- **Removing the `getUser()` call on `/`** — D2 rationale: the session-refresh side effect on `getUser()` must run for `/` too. We do NOT optimize the rule order to short-circuit before `getUser()`.

## Screens

### `/` (anonymous)

**Purpose:** Entry surface. For any normal browser flow, middleware fires before the page renders and 307-redirects to `/login` (D1, D3). The page body is only seen by clients that don't follow redirects (`curl -I`, headless scrapers without auto-follow, search-engine crawlers indexing the bare `/`).

**Visual hierarchy (D5):**

- Primary: One short heading — "home-os" (matches the brand voice in `/home` and `/login`).
- Secondary: One anchor — `<a href="/login">Sign in</a>`.
- Tertiary: None.

**Key elements:**

- `<main>` wrapper with the existing dark-ground tokens (`text-[var(--color-text-primary-inverse)]`).
- `<h1>` heading — single short string, calm-authority voice (no "coming soon", no marketing copy).
- One `<a href="/login">` link, brand-styled.
- No `'use client'`, no `useEffect`, no client-side auth detection — middleware handles the redirect; this surface is the fallback contract for non-following clients.

**Copy hints:**

- Heading: `home-os`
- Anchor: `Sign in`

**Error states:** None — pure static markup, no data fetch, no auth. The middleware redirect is the dynamic behavior; `page.tsx` is the inert fallback.

### `/` (authenticated)

Identical render contract — the noscript-fallback anchor remains rendered to non-following clients. For normal browser flow, middleware fires and 307-redirects to `/home` (D1, D4) before the page body is requested.

## Render conditions

The feature touches one new conditional surface (the middleware redirect branches) and one visibility-modified element (the `page.tsx` body). Matrices below resolve every state combination.

### Middleware redirect for `/`

| Element                           | anon + `/` (rule 3) | auth + `/` (rule 4) | anon + `/login` (rule 2 inverse) | auth + `/login` (rule 2) | anon + `/home` (rule 1) | auth + `/home` (rule 1 inverse) |
| --------------------------------- | ------------------- | ------------------- | -------------------------------- | ------------------------ | ----------------------- | ------------------------------- |
| 307 `Location: /login`            | shown               | hidden              | hidden                           | hidden                   | shown (with `?next=`)   | hidden                          |
| 307 `Location: /home`             | hidden              | shown               | hidden                           | shown                    | hidden                  | hidden                          |
| Pass-through (no Location header) | hidden              | hidden              | shown                            | hidden                   | hidden                  | shown                           |

Three columns are existing rules (preserved verbatim by D2 ordering); two columns (anon + `/`, auth + `/`) are the new branches.

### `apps/web/app/page.tsx` body

| Element                               | anon (middleware redirects)        | auth (middleware redirects)        | non-following client (curl / crawler) |
| ------------------------------------- | ---------------------------------- | ---------------------------------- | ------------------------------------- |
| `<h1>home-os</h1>` heading            | hidden (never reaches page render) | hidden (never reaches page render) | shown                                 |
| `<a href="/login">Sign in</a>` anchor | hidden (never reaches page render) | hidden (never reaches page render) | shown                                 |
| "Home OS — coming soon." placeholder  | n/a (removed)                      | n/a (removed)                      | n/a (removed)                         |

The placeholder row is included to make the deletion explicit — the "coming soon" line is removed in this PR; no state combination renders it.

## Data model changes

**No changes.** No new tables, no new columns, no new enums, no migrations. This row is a pure routing-layer change against shipped infra.

## API contracts

**No new endpoints, no contract changes.** The redirect target URLs (`/login`, `/home`) are existing surfaces with their own specs (`auth-magic-link/spec.md`). The middleware does not call any HTTP API beyond Supabase's `auth.getUser()` (which already runs on every non-asset request — D2 rationale).

## Offline behavior

**Online-only (default — class (a) per spec template).** Middleware runs at the edge on every request and depends on Supabase reachability for `auth.getUser()`. If Supabase is unreachable, `getUser()` throws and the existing catch falls through to "anonymous", which means an offline authenticated user visiting `/` lands on `/login` instead of `/home`. Accepted — this is the same behavior as the existing rule 1 (anon → gated path → `/login`) under the same failure mode.

No new offline upgrade in scope. The PWA shell (per `pwa-spike-result.md`) doesn't cache `/` separately; the existing service-worker posture is unchanged.

## Metrics

**No new events.** PRODUCT-ROADMAP § landing-redirect doesn't propose any, and the D1–D7 Decisions don't introduce a user-facing action that needs tracking — the redirect is invisible to the user in the happy path (they typed `/`, they got `/login` or `/home`, they never saw the placeholder).

**Existing event impact:**

- `sign_in_requested` and `sign_in_completed` (METRICS.md rows 1–2): top-of-funnel volume should increase post-merge because more anonymous visitors now reach `/login` instead of seeing the placeholder and bouncing. Monitor this as a leading indicator the row landed correctly — if `sign_in_requested` doesn't tick up after deploy, the redirect isn't taking effect.
- No PostHog identify / capture call from the new middleware branches. The redirect is server-side at the edge; the user agent never sees a render where PostHog is loaded.

If a "redirect from root happened" event ever becomes useful (e.g., to attribute the conversion lift to this row), it would be a new METRICS.md row and require Decision-row sign-off per Confidence Calibration. Not in scope here.

## Files to create

| File                                                            | Purpose                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| `specs/landing-redirect/qa-walk/verb-1-visit-root-anon.png`     | Gate 9 artifact — captured during `/ak-pre-ship` qa-walk. |
| `specs/landing-redirect/qa-walk/verb-2-redirected-to-login.png` | Gate 9 artifact.                                          |
| `specs/landing-redirect/qa-walk/verb-3-signed-in-home.png`      | Gate 9 artifact.                                          |
| `specs/landing-redirect/qa-walk/verb-4-revisit-root-authed.png` | Gate 9 artifact.                                          |
| `specs/landing-redirect/qa-walk/verb-5-redirected-to-home.png`  | Gate 9 artifact.                                          |

Gate 9 qa-walk artifacts are captured by the pre-ship pipeline, not authored by hand; the rows above pin the canonical paths Gate 9 expects.

## Files to modify

| File                                   | Action | Why                                                                                                                                                                                                                                                    |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/middleware.ts`               | modify | Insert rules 3 + 4 after the existing `/login` rule per D2. ~6 lines added.                                                                                                                                                                            |
| `apps/web/middleware.test.ts`          | modify | Replace the existing anon-`/` case (D6), add an authed-`/` case, add the stale-cookie-at-`/` case. Three test-block changes total; "9 cases" → "11 cases" (net +2 because one case flipped, two added).                                                |
| `apps/web/app/page.tsx`                | modify | Replace the "coming soon" body with the noscript-fallback anchor per D5.                                                                                                                                                                               |
| `apps/web/e2e/auth-edge-cases.spec.ts` | modify | Add two new Playwright cases — anon `/` → `/login` (no fixtures needed; goto + URL assert) and authed `/` → `/home` (reuse the file's existing password + cookie-injection helper). Both inherit the file-level `test.skip(!isLocalSupabase, …)` gate. |
| `CLAUDE.md` § Where Things Happen      | modify | Two row edits per D7 — middleware row description + test-count bump; new row for `apps/web/app/page.tsx`.                                                                                                                                              |

**No file creation in implementation surface.** Every change lands as an edit to an existing file. The qa-walk PNG artifacts above are pre-ship outputs, not implementation inputs.

## Tests

### Unit tests (Vitest)

**`apps/web/middleware.test.ts`** — three changes:

1. **Replace** the case at lines 67–71 (`'anonymous + / (public landing) -> NOT redirected'`). New shape:

   ```ts
   it('anonymous + / -> 307 redirect to /login (landing-redirect rule 3)', async () => {
     getUser.mockResolvedValue({ data: { user: null } });
     const response = await middleware(mockRequest('/'));
     expect(response.status).toBe(307);
     expect(response.headers.get('location')).toBe(
       'http://localhost:3000/login'
     );
   });
   ```

   Asserts D1 (307) + D3 (no `?next=` query string).

2. **Add** an authenticated-`/`-→-`/home` case:

   ```ts
   it('authenticated + / -> 307 redirect to /home (landing-redirect rule 4)', async () => {
     getUser.mockResolvedValue({
       data: { user: { id: 'u-1', email: 'a@b.test' } },
     });
     const response = await middleware(mockRequest('/'));
     expect(response.status).toBe(307);
     expect(response.headers.get('location')).toBe(
       'http://localhost:3000/home'
     );
   });
   ```

   Asserts D1 + D4.

3. **Add** a stale-cookie-throw-at-`/` case mirroring the existing stale-cookie-at-`/home` case at line 105:

   ```ts
   it('treats a stale-cookie getUser throw at / as anonymous (-> /login)', async () => {
     getUser.mockRejectedValue(new Error('stale cookie boot'));
     const response = await middleware(mockRequest('/'));
     expect(response.status).toBe(307);
     expect(response.headers.get('location')).toBe(
       'http://localhost:3000/login'
     );
   });
   ```

   Asserts the existing try/catch fallthrough (CLAUDE.md § Gotchas: stale cookie can pass middleware but fail layout-side `getUser`) also covers the new rule 3.

**No other unit test files change.** `apps/web/app/page.tsx` does not currently have a paired `page.test.tsx`; the file is in `.devshop-test-coverage-exempt` by virtue of being the public landing placeholder. Per CLAUDE.md § Testing the test-presence hook scans `apps/web/{app,components,lib,hooks}/` — `page.tsx` is covered by the Playwright E2E (verb-2-redirected-to-login.png + verb-5-redirected-to-home.png). If the test-presence hook trips on the modify, add `apps/web/app/page.tsx` to `.devshop-test-coverage-exempt` with a one-line comment pointing at the E2E coverage.

### E2E tests (Playwright)

**`apps/web/e2e/auth-edge-cases.spec.ts`** (modify) — add two new tests inside the existing `test.describe('auth edge cases', …)` block. Both inherit `test.skip(!isLocalSupabase, …)`.

1. **`'anonymous / → /login: middleware rule 3 (landing-redirect)'`** — no fixture / cookie injection needed. `await page.goto('/')`; `await page.waitForURL('**/login')`; `expect(page.url()).toMatch(/\/login$/)`; assert the magic-link form is visible (`getByLabel(/email/i)`).

2. **`'authenticated / → /home: middleware rule 4 (landing-redirect)'`** — reuse the password-create + cookie-injection helper inlined in the existing "authenticated /login → /home" test (lines 49–113). Inject the auth cookie, `await page.goto('/')`, `await page.waitForURL('**/home')`, `expect(page.url()).toMatch(/\/home$/)`, assert the `/home` shell heading is visible (`getByRole('heading', { level: 1, name: 'home-os' })`).

**Why this spec, not a new file:** D6 + the existing file's purpose (auth edge cases). The two new branches are middleware-level redirects on `/` — semantically siblings of the existing `/login` → `/home` redirect. Same test surface, same skip gate, same admin-client cleanup pattern. Adding a separate `landing-redirect.spec.ts` would duplicate the skip gate + the admin-client teardown.

### Test-presence hook coverage

The two modified files (`middleware.ts`, `auth-edge-cases.spec.ts`) already have paired tests. `page.tsx` modifies an existing file with no paired unit test — see above for the `.devshop-test-coverage-exempt` fallback if the hook trips. The qa-walk PNGs are Gate 9 artifacts, not Vitest tests; they don't intersect the test-presence hook's globs.

### What this PR does NOT add to the test pyramid

- No new integration test (no API surface added).
- No new RLS isolation case (no schema change, no data access path added).
- No fast-job / slow-job threshold crossing — `auth-edge-cases.spec.ts` is already a Playwright spec, gated by `isLocalSupabase`. The slow-job lifecycle Decision row (Phase 1c/1g) is unchanged.

## Dependencies

**Shipped, already on `main`:**

- **`capture-flow`** (PR #15, BUILD-LOG row) — the feature whose discoverability gap this row closes. PR #15 added `/capture` and `/dismissed` to `GATED_PREFIXES` and shipped the CTA on `/home`; this row makes that surface reachable from a fresh prod-URL visit.
- **`auth-magic-link`** (PR #10) — provides `/login`, the PKCE callback flow, the `(app)` route group with defense-in-depth `getUser()`, and the `safeNext()` open-redirect defense in `apps/web/app/auth/callback/route.ts` (the `safeNext()` `/home` default is why D3 can skip the `?next=` query string).
- **`supabase-schema-and-rls`** (PR #9) — base auth posture; `auth.getUser()` resolves against the shipped schema.

**No new npm packages.** Uses only `@supabase/ssr` `createServerClient`, `next/server` `NextResponse` — both already canonical in `apps/web/middleware.ts`.

**No upstream feature blocker.** All three rows above are on `main`; the row can land independently.

## Task order

Canonical 5-task list, dependency-ordered, matching the Phase 0 `/ak-build` TaskCreate tracker (P2/Task A..E). Each task is a single atomic commit; verification step per task.

1. **Task A — Extend `middleware.ts` with root-path redirects**
   File: `apps/web/middleware.ts`.
   Insert rules 3 + 4 after the existing `if (user && pathname === '/login') { redirect('/home') }` block (D2). Update the file's "What:" header comment to add the two new rules to the list.
   Commit: `feat(landing-redirect): redirect / based on auth state (anon → /login, auth → /home)`
   Verify: `pnpm --filter web typecheck` clean.

2. **Task B — Extend `middleware.test.ts`**
   File: `apps/web/middleware.test.ts`.
   Replace the anon-`/`-not-redirected case + add authed-`/`-→-`/home` + add stale-cookie-at-`/` (D6). 11 cases total after the change.
   Commit: `test(landing-redirect): cover new / redirect rules + stale-cookie-at-/`
   Verify: `pnpm --filter web vitest run middleware` clean — all 11 cases green.

3. **Task C — Replace `page.tsx` with noscript-fallback anchor**
   File: `apps/web/app/page.tsx`.
   Body replaced per D5: `<main>` + `<h1>home-os</h1>` + `<a href="/login">Sign in</a>` with brand tokens preserved. Update the file's `// What:` / `// Why:` / `// Does NOT:` header comments to reflect the new role.
   Commit: `feat(landing-redirect): replace / placeholder with noscript-fallback Sign in anchor`
   Verify: `pnpm --filter web build` clean; render the page in isolation to spot-check the dark ground.

4. **Task D — Extend `auth-edge-cases.spec.ts`**
   File: `apps/web/e2e/auth-edge-cases.spec.ts`.
   Add the two new Playwright cases per § Tests > E2E above. Reuse the existing password-helper + cookie-injection pattern for the authed case.
   Commit: `test(landing-redirect): E2E for anon / → /login and authed / → /home`
   Verify: `pnpm --filter web exec playwright test e2e/auth-edge-cases.spec.ts` passes against the local stack (or skips with `test.skip(!isLocalSupabase, …)` on a stack-less workspace per `devcontainer-supabase-fix` row #2).

5. **Task E — Update `CLAUDE.md § Where Things Happen`**
   File: `CLAUDE.md` (single section edit; two row changes per D7).
   1. Edge-middleware row: append "AND root `/` redirect (anon → `/login`, auth → `/home`)" to the description; bump "Test: `apps/web/middleware.test.ts` (9 cases)" → "(11 cases)".
   2. New row for `apps/web/app/page.tsx` describing its noscript-fallback role.
      Commit: `docs(landing-redirect): document the / redirect + page.tsx noscript fallback in CLAUDE.md`
      Verify: `bash kit/scripts/commit-hooks/check-docs-freshness-project.sh` clean; pre-commit clean.

### Task-order delta vs Phase 0 preview

No deltas. Tasks A–E match the Phase 0 `/ak-build` TaskCreate tracker 1:1 (existing tasks #4–#8 on the task list).

## Gotchas

- **`NextResponse.redirect()` defaults to 307, not 303.** PRODUCT-ROADMAP § landing-redirect prose says "303 to /login" but the existing middleware rules 1 + 2 use 307 (`NextResponse.redirect`'s default) and every existing `middleware.test.ts` case asserts `.status === 307`. D1 codifies 307 for the new branches. Don't pass an explicit `{ status: 303 }` option to match the prose — it would create a mismatched-assertion regression in the existing test suite.

- **Middleware fires before `page.tsx` renders for any normal browser flow.** The `page.tsx` body is the fallback contract for clients that don't follow redirects (curl `-I`, scrapers, crawlers). Don't add client-side auth detection to `page.tsx` — middleware is the single declarative enforcement surface (mirrors auth PR D6's posture). A `useEffect(() => router.replace('/login'))` would race the middleware redirect and surface a flash of the placeholder.

- **The existing matcher already includes `/`.** No `apps/web/middleware.ts` `config.matcher` change is needed. The current matcher (`'/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'`) excludes `_next/static`, `_next/image`, `favicon.ico`, and explicit asset extensions — the bare `/` route matches none of those exclusions, so the handler already runs for `/`. The unit-test case at lines 159–168 pins this contract; do not modify the matcher in this PR.

- **`getUser()` must still run on `/` (D2 rationale).** The session-refresh side effect rotates access/refresh cookies via `setAll`. Short-circuiting before `getUser()` for `/` (e.g., redirecting anon `/` → `/login` based on cookie presence alone) would mean an authenticated user visiting `/` once a day never refreshes cookies. The decision was to place the new rules AFTER `getUser()` and branch off the resolved `user` value — same shape as rule 1 + 2.

- **`safeNext()` defaults to `/home` when `?next` is absent or unsafe** (`apps/web/app/auth/callback/route.ts`). D3 leans on this — the anon-`/`-→-`/login` redirect carries no `?next=` query string, so the magic-link callback falls through to `/home` after auth. Adding `?next=/` would create the loop spelled out in D3. The defense lives in `safeNext()`; don't break it by accepting `/` as a valid `next` target in a future PR without re-resolving this loop.

- **The "9 cases" → "11 cases" doc update is not arithmetic.** D6 replaces one existing case (anon `/` → not redirected, flipped to anon `/` → 307 `/login`) and adds two new cases (authed `/` → `/home`, stale-cookie-at-`/`). Net: 9 + 2 = 11. The replacement doesn't change the count; the two adds do.

- **`page.tsx` is currently the only un-listed app-router file in `CLAUDE.md § Where Things Happen`.** D7 codifies adding a row for it because the file's purpose is changing (no longer "landing placeholder", now "noscript fallback anchor"). The `check-docs-freshness-project.sh` hook scans for surface-introducing changes; this PR's `page.tsx` modify trips the hook even though the file existed before, because its role + the surrounding contract changed.

## Acceptance

The PR is ready to merge when, on the preview deploy:

1. `curl -sI https://<preview>.vercel.app/` returns `307` with `Location: /login` (no body fetched).
2. `curl -sI -H "Cookie: <valid-sb-auth-cookie>" https://<preview>.vercel.app/` returns `307` with `Location: /home` (smoke-test for the authed branch; cookie sourced from a manual sign-in in the same preview).
3. `curl -s https://<preview>.vercel.app/` (with `-L` to follow) lands on `/login` and contains the magic-link form's `<input type="email">`.
4. Browser-driven: anonymous visit to `/` lands on `/login`; sign in via magic link; land on `/home`; visit `/` again; bounce to `/home` (no flash of the noscript anchor).
5. `pnpm --filter web vitest run` clean (middleware.test.ts shows 11 cases passing).
6. `pnpm --filter web exec playwright test e2e/auth-edge-cases.spec.ts` clean against the local stack (or skip-with-reason on a stack-less workspace).
7. `bash kit/scripts/commit-hooks/check-docs-freshness-project.sh` clean.
8. `/ak-pre-ship` Gate 9 produces the five qa-walk PNGs under `specs/landing-redirect/qa-walk/` and Gate 9 emits `pass`.

## Rollout

- **Push to feature branch** → Vercel preview auto-deploys (CLAUDE.md § Deploy Configuration).
- **Manual smoke on the preview URL** per Acceptance criteria 1–4.
- **Merge to `main`** → Vercel auto-deploys to production. Health check: `curl -sf https://home-os-nu-two.vercel.app/ -o /dev/null -w "%{http_code}"` should return `307` (not `200` — the public landing now redirects).
- **Post-deploy verify** PRODUCT-ROADMAP § landing-redirect Fix-shape final bullet: `curl -sI https://home-os-nu-two.vercel.app/` returns `307 Location: /login`.
- **Monitor** `sign_in_requested` PostHog event volume for the 24h post-deploy — the leading indicator that anonymous visitors are now reaching `/login` instead of bouncing off the placeholder.

No DB migration, no edge-function deploy, no env-var change. The PR is pure code; Vercel's standard auto-deploy is the entire rollout surface.

## Rollback

**Revert the two new middleware branches.** One-line diff:

```diff
-  // Rule 3: anonymous request to / -> /login (landing-redirect)
-  if (!user && pathname === '/') {
-    return NextResponse.redirect(new URL('/login', request.url));
-  }
-
-  // Rule 4: authenticated request to / -> /home (landing-redirect)
-  if (user && pathname === '/') {
-    return NextResponse.redirect(new URL('/home', request.url));
-  }
-
   return response;
```

If `page.tsx`'s new shape is the regression (e.g., a brand-token mismatch flagged post-deploy), revert that file independently — middleware behavior is unaffected.

**Why rollback is cheap.** No schema, no data, no third-party integration, no env var. The change is two `if` branches in middleware + a 5-line `page.tsx` rewrite + one E2E test + one CLAUDE.md doc edit. `git revert <pr-merge-sha>` restores prior behavior atomically.

**What rollback would look like for the user.** Anonymous visits to `/` would once again render "Home OS — coming soon." with no link to `/login` — the exact gap this row exists to close. Acceptable as a temporary state during incident response; not acceptable long-term. If the rollback proves necessary, the follow-up PR carries the same Decisions (D1–D7) without re-resolution.
