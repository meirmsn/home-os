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

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens, Data
     model changes, API contracts, Offline behavior, Metrics, Files to
     create/modify, Tests, Dependencies, Task order, Gotchas, Acceptance /
     rollout / rollback. The Decisions section above stays verbatim. -->
