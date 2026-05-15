# Pre-ship review — landing-redirect

Branch: `feature/landing-redirect` · Base: `origin/main` · HEAD: `29e7395`

## Preflight

- gh auth: ok (token logged in as `meirmsn`)
- branch: `feature/landing-redirect` (not main)
- Chromium: `/usr/bin/chromium` v147 (system) + symlinks (`chromium-1208`, `chromium_headless_shell-1208`) wired for the browse daemon
- Supabase bootstrap: `reused: local Supabase already running (via cmd-relay)` **but** `error: seed fixtures missing (expected alice@test.local + bob@test.local in auth.users)` — local stack degraded for auth-touching E2E
  - Per `PLAN.md` row #1 (devcontainer-supabase-fix), this is a separate roadmap row, not this PR
  - Net effect: Gate 9 `/qa` is `blocked` for the authenticated happy-path arm; anonymous-arm hero shots still capturable

Scope: `$TOUCHES_UI` is non-empty (`apps/web/middleware.ts`, `apps/web/app/page.tsx`, plus tests + E2E). UI gates (3, 8, 9, 10) apply.

Diff summary (vs `origin/main`):

- `apps/web/middleware.ts` — root-path branch (anon → `/login?next=/`, authed → `/home`)
- `apps/web/middleware.test.ts` — 4 new redirect cases
- `apps/web/app/page.tsx` — replaced placeholder with noscript-fallback `<a href="/login">` (~10 lines)
- `apps/web/e2e/auth-edge-cases.spec.ts` — E2E for anon `/` → `/login` + authed `/` → `/home`
- `CLAUDE.md` — Where-things-happen entry for `/` page + middleware extension
- `PLAN.md`, `PRODUCT-ROADMAP.md`, `specs/landing-redirect/{spec,tasks}.md` — planning docs

## Gate 1: docs-check (ak)

**Outcome**: `n/a (no kit/ or reference docs touched)`

Diff against `origin/main` contains no `kit/**` or `kit/docs/OVERVIEW.md` / `kit/docs/guide/**` paths.

### Dismissals

None

## Gate 2: metrics-check (ak)

**Outcome**: `pass`

Spec § Metrics declares no new events for this row. The redirect is server-side at the edge; the user agent never sees a render where PostHog is loaded. Existing events (`sign_in_requested`, `sign_in_completed`) get more volume but no new instrumentation needed.

### Dismissals

None

## Gate 2b: rls-coverage (ak)

**Outcome**: `pass`

Ran `bash /devshop/kit/scripts/preship/rls-coverage-check.sh`. The diff touches `apps/web/app/page.tsx` (matches scope predicate) but the change is a noscript anchor — no `from('<table>').insert/update/delete/upsert` calls. No new migrations.

### Dismissals

None

## Gate 2c: slow-job-lifecycle (ak)

**Outcome**: `pass`

Ran `bash /devshop/kit/scripts/preship/slow-job-lifecycle-check.sh`. Project has E2E specs under `apps/web/e2e/*.spec.ts`; slow-job is correctly configured (uncommented, `pull_request` predicate, edge-runtime retry pattern, branch protection includes `slow`).

### Dismissals

None

## Audit 1: pre-polish (2026-05-15)

<!-- audited-at: 29e7395a27c05243558dec0d1dae263f270742b9 -->
<!-- range: origin/main..HEAD -->

findings: high=0 medium=0 low=0

### Docs findings

- (none)

### Tests findings

- (none)

### Bypass trailer audit

- (none)

Notes:

- Range covers 5 commits (`739422e..29e7395`) — the full feature delta vs `origin/main`.
- Docs touched in range: `CLAUDE.md` (edge-middleware row description + test-count `9` → `16`; new noscript-fallback row for `apps/web/app/page.tsx`). Both edits are substantive and cite real paths/sections that exist at HEAD.
- Note: spec.md § Task E says "9 cases → 11 cases" but the actual count in `apps/web/middleware.test.ts` is 16 (includes capture-flow PR #15's pre-existing cases not authored by this PR). CLAUDE.md was updated to reflect the actual count. No finding — the spec prose was anticipating just the landing-redirect delta; the doc text matches what shipped.
- New behavior coverage: middleware rules 3 + 4 + stale-cookie-at-`/` covered by `apps/web/middleware.test.ts` (3 new cases, replacing 1 obsolete). E2E coverage in `apps/web/e2e/auth-edge-cases.spec.ts` (2 new cases — anon `/` → `/login` + authed `/` → `/home`). `apps/web/app/page.tsx` body change is exempt from test-presence by filename (`page.tsx` in `EXEMPT_FILENAMES`); covered transitively by the E2E.
- No `Docs-Coverage-Bypass:` / `Tests-Coverage-Bypass:` trailers in range.

## Gate 4: responsive + theme

**Outcome**: `pass`

The only newly-touched user-visible surface for normal browser flows is `/login` (the destination of the new anon-arm redirect). The noscript-fallback `page.tsx` is invisible to normal users; captured once at default size for archival evidence. The project ships dark-warm-charcoal ground only — no light theme exists (single-theme app, see `apps/web/app/globals.css` + `packages/ui/src/tokens.ts`), so light/dark sweep is `n/a`.

Captures in `specs/landing-redirect/screenshots/gate-4-responsive/`:

- `login-desktop-1280.png` (1280×800) — heading + email input + submit centered, no overflow.
- `login-tablet-768.png` (768×1024) — same composition, tighter horizontal padding, no truncation.
- `login-mobile-375.png` (375×812) — heading wraps onto a single line, supporting copy wraps to 2 lines, input + submit full-bleed-within-padding. No horizontal scrollbar.

Noscript-fallback hero capture (default 1280×800) in `specs/landing-redirect/hero/noscript-fallback-page.png`. Method: rendered the same JSX via a transient `/preview-landing-tmp` route (deleted post-capture) because middleware short-circuits `/` with a 307 before `page.tsx`'s body is ever served. The captured DOM matches `apps/web/app/page.tsx` verbatim — `<h1>home-os</h1>` + `<a href="/login">Sign in</a>` on the dark ground.

### Dismissals

None

## Gate 5: /simplify

**Outcome**: `pass`

Diff is small (~70 lines of source change across 4 files). Walked each surface:

1. **`apps/web/middleware.ts`** — rules 3 + 4 are two separate `if` branches that could collapse into one (`if (pathname === '/') return redirect(user ? '/home' : '/login')`). Kept as two branches: (a) preserves visual symmetry with the existing rules 1 + 2 (each rule named + commented), (b) matches spec § D2's explicit "rules 3 + 4" enumeration, (c) the comment block on each rule encodes load-bearing context (D3's "no ?next= because loop"). Single-branch fold would lose two of three.
2. **`apps/web/app/page.tsx`** — 5-line body (main + h1 + anchor). Minimum useful shape.
3. **`apps/web/middleware.test.ts`** — 3 new cases, each follows the file's established `mockResolvedValue` + `expect.status` + `expect.location` pattern. Could parameterize via `it.each`, but the existing 13 cases also don't parameterize — keeping shape uniform across the file beats minor LoC win.
4. **`apps/web/e2e/auth-edge-cases.spec.ts`** — authed-arm inlines the password + cookie-injection helper (same shape as the existing "authenticated /login → /home" test). Extraction into `helpers/authed-page.ts` is a candidate refactor — but the duplication crosses the spec/auth-magic-link boundary, so it's out-of-scope for this PR (would touch the prior PR's test surface). Filed as a possible future cleanup, not a blocker.

No code change.

### Dismissals

None

## Gate 6: /review (pre-landing)

**Outcome**: `pass`

Walked the diff against `origin/main` along the canonical /review axes:

- **SQL safety**: no SQL surfaces touched.
- **LLM / edge-function trust boundaries**: no LLM calls.
- **Conditional side effects**: `getUser()`'s session-refresh side effect runs before the new rules per D2 — correct order; covers the "authenticated user visits / once a day, never refreshes cookies" case spec § Gotchas calls out.
- **Race conditions**: middleware runs serially per request; E2E cookie injection precedes goto. None.
- **Authorization boundaries**: rule 3 sends anon to `/login` (no auth needed); rule 4 sends auth to `/home` (defense-in-depth at the (app) layout's `getUser()` per CLAUDE.md). New rules preserve the existing posture.
- **Open redirect class**: new redirect URLs constructed via `new URL('/login', request.url)` and `new URL('/home', request.url)` — paths are hardcoded literals; no user-controlled input flows into the destination. The `safeNext()` defense in `/auth/callback/route.ts` covers the user-controlled `?next=` case (out-of-band here per D3 — no `?next=` carried).
- **Pathname normalization edge cases** verified live against the dev server:
  - `GET /` → `307 Location: /login` ✓
  - `GET //` → `308 Location: /` → `307 Location: /login` (Next normalizes double-slash before middleware sees it) ✓
  - `GET /?foo=bar` → `307 Location: /login` (query string dropped per D3) ✓
- **Tests**: 3 new unit cases + 2 new E2E cases. Stale-cookie-at-`/` mirrors the existing stale-cookie-at-`/home` case for symmetric coverage.
- **Typecheck**: `pnpm --filter web typecheck` clean.
- **Lint**: `pnpm --filter web lint` reports 2 pre-existing warnings in capture-flow + spike code (not touched by this PR); no new findings from the diff.

### Dismissals

None

## Gate 7: /cso (security audit)

**Outcome**: `pass`

Focused on the open-redirect-defense angle flagged in the resume instructions. The four `new URL('<path>', request.url)` construction sites in `apps/web/middleware.ts` (rules 1-4) all use **hardcoded path literals** (`'/login'`, `'/home'`). No user-controlled input flows into either argument. Output URL stays on the request origin by construction. Contrast: the `safeNext()` defense in `/auth/callback/route.ts` exists because `next` flows from `request.nextUrl.searchParams.get('next')` — user-controlled. Here the equivalent class doesn't exist; no defense gap.

Other axes:

- **`request.url` provenance**: an absolute URL of the incoming request. `new URL('/login', request.url)` produces an absolute URL with the same origin. Standard same-origin redirect pattern.
- **Cookies / session**: `request.cookies.getAll()` + Supabase SSR `setAll` canonical pattern. Stale-cookie throw caught and treated as anonymous (no info leak via 500).
- **No new event capture** (PostHog) and **no new error-handler surfaces** (Sentry) in this PR.
- **CSP / connect-src**: unchanged — no new origins.
- **CSRF**: 307 GET redirects only; no state change, no CSRF surface.
- **`page.tsx` body**: single static `<h1>` + `<a>` anchor. No JS, no auth detection, no user-controlled state — no XSS surface; safe for crawler indexing.
- **E2E test credentials**: `landing-redirect-test-password-2026` is a hardcoded local-only test password (matches the existing authed-/login test pattern in the same file); the temp user is admin-created and `finally`-deleted. No production-credential exposure.
- **Information leakage**: noscript-fallback emits only the brand string `home-os` + a `/login` link. No env hints, no user data.

### Dismissals

None

## Gate 8: /design-review

**Outcome**: `n/a`

The PR has zero net change to surfaces normal users see. The destinations of the new redirects (`/login`, `/home`) are not modified by this PR — they were shipped + design-reviewed in `auth-magic-link` (PR #10). The only new design-bearing surface is `apps/web/app/page.tsx`, which middleware short-circuits for every normal browser flow — only non-following clients (curl, scrapers, crawlers) ever render it. Hero shot in `specs/landing-redirect/hero/noscript-fallback-page.png` confirms brand voice + dark-ground tokens preserved per D5.

### Dismissals

None

## Gate 9: /qa (happy-path walkthrough)

**Outcome**: `pass (anon arm) / blocked (auth arm)`

Spec § Core user story declares 5 verbs. Anon arm covers verbs 1–2; auth arm covers verbs 3–5.

**Anon arm (runnable, passes):**

- **Verb 1 — visit `/` as a brand-new anonymous browser session.** Browse daemon storage empty (no `sb-*` cookies). `goto http://127.0.0.1:3000/` → 307 → `/login`. URL bar resolves to `http://127.0.0.1:3000/login` (asserted via `browse url`). Capture: `specs/landing-redirect/qa-walk/verb-1-visit-root-anon.png`.
- **Verb 2 — observe URL flips to `/login` and the magic-link form renders.** Same capture (the redirect happens at the network layer, so the visual is the destination): `specs/landing-redirect/qa-walk/verb-2-redirected-to-login.png` shows the `Sign in to home-os` heading + email input + Send magic link button.

**Auth arm (blocked):**

- **Verb 3 — sign in via magic-link, land on `/home`.** Blocked: devcontainer-supabase-fix (PLAN.md row #1, separate roadmap item) — seed fixtures `alice@test.local` + `bob@test.local` missing in `auth.users` and the local Inbucket round-trip path isn't usable from this agent's container. Logging in via admin-create + cookie-injection (the E2E pattern) is also impractical here without re-running the slow-job harness.
- **Verb 4 — revisit `/` in same authenticated session.** Blocked (depends on verb 3).
- **Verb 5 — observe URL flips to `/home`.** Blocked (depends on verb 3).

Auth-arm coverage is delivered through alternate surfaces:

- `apps/web/middleware.test.ts:77` — authenticated `/` → 307 `Location: /home` unit case.
- `apps/web/middleware.test.ts:86` — stale-cookie throw at `/` → treated anon → `/login` unit case.
- `apps/web/e2e/auth-edge-cases.spec.ts:131` — Playwright authed `/` → `/home` E2E case (skips locally per `test.skip(!isLocalSupabase, …)`, enforced in CI slow-job).
- Hero shot `specs/landing-redirect/hero/noscript-fallback-page.png` proves the fallback shape that authenticated users would see if they bypassed middleware.

Once devcontainer-supabase-fix lands (PLAN.md row #1), `/ak-pre-ship` re-run will close verbs 3-5 visually.

### Dismissals

None — auth arm is `blocked` (expected per preflight); not a finding.

## Gate 10: /benchmark

**Outcome**: `n/a`

No perf-sensitive changes. Middleware adds one constant-time branch evaluation per non-asset request (rule 3 + rule 4 — both `pathname === '/'` string compares); the `getUser()` call was already there. `page.tsx` slimmed from one paragraph to two elements — same order of magnitude. No new dependencies, no new bundle weight, no new network round-trips internal to the app.

Visitors to `/` now incur one extra HTTP hop (307 → `/login`) vs landing directly on the placeholder. This is the explicit discoverability tradeoff accepted in `PRODUCT-ROADMAP.md § landing-redirect` and spec § Rollout (the redirect is the entire feature). No-op to measure pre- vs post-merge.

### Dismissals

None

## Gate 11: convention check

**Outcome**: `pass`

Per `kit/docs/guide/conventions.md`:

- **File headers (`// What:` / `// Why:` / `// Does NOT:`)** — all four touched files (`middleware.ts`, `page.tsx`, `middleware.test.ts`, `e2e/auth-edge-cases.spec.ts`) carry the canonical trio, and each block was updated to reflect the new behavior (verified via grep).
- **Test presence** — `apps/web/middleware.test.ts` paired with `middleware.ts`; `apps/web/app/page.tsx` exempt by filename per `EXEMPT_FILENAMES` (`page.tsx`) in `check-tests-coverage-project.sh`; E2E `auth-edge-cases.spec.ts` extends existing file (no new spec file).
- **§ Where Things Happen** — `CLAUDE.md` updated for both touched surfaces (edge middleware + new noscript-fallback row for `apps/web/app/page.tsx`).
- **Spec hygiene** — `specs/landing-redirect/spec.md` Decisions D1-D7 preserved verbatim; § Task order matches the 5 atomic commits in `git log origin/main..HEAD`.
- **Slow-job lifecycle** — already verified green in Gate 2c.
- **Unit test gate** — `pnpm turbo run test:unit` clean (29 files / 152 tests) on the final HEAD.
- **Typecheck** — clean.
- **Lint** — 2 pre-existing warnings outside this PR's scope; no new findings from the diff.

### Dismissals

None
