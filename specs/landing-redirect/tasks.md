# Tasks: landing-redirect

Source spec: `specs/landing-redirect/spec.md` — Decisions D1–D7 + § Task order A–E.

## Task: A — Extend middleware.ts with root-path redirects

**Hat**: BE
**Depends on**: none
**Blocks**: B, D
**Done when**: `apps/web/middleware.ts` carries rules 3 (anon `/` → 307 `/login`) + 4 (auth `/` → 307 `/home`) immediately after rule 2 per D2, with `// What:` header refreshed. `pnpm --filter web typecheck` clean.
**Risk**: low
**Status**: done

## Task: B — Extend middleware.test.ts

**Hat**: BE
**Depends on**: A
**Blocks**: none
**Done when**: existing anon-`/`-not-redirected case (lines 67–71) replaced with the 307→`/login` inverse per D6; authed-`/`-→-`/home` case added; stale-cookie-throw-at-`/` case added (mirrors line 105). `pnpm turbo run test:unit` clean.
**Risk**: low
**Status**: done

## Task: C — Replace page.tsx with noscript-fallback anchor

**Hat**: FE
**Depends on**: none (parallel-safe vs A/B)
**Blocks**: D, E
**Done when**: `apps/web/app/page.tsx` body replaced per D5 — `<main>` + `<h1>home-os</h1>` + `<a href="/login">Sign in</a>` with brand tokens preserved; header `// What:` / `// Why:` / `// Does NOT:` refreshed to noscript-fallback role. `pnpm --filter web typecheck` clean.
**Risk**: low
**Status**: todo

## Task: D — Extend auth-edge-cases.spec.ts (E2E)

**Hat**: BE
**Depends on**: A, C
**Blocks**: none
**Done when**: two new Playwright cases inside the existing `test.describe('auth edge cases', …)` block — anon `/` → `/login` (URL + form assert); authed `/` → `/home` (reuses password+cookie-injection helper, asserts `/home` heading). Both inherit file-level `test.skip(!isLocalSupabase, …)` gate. Typecheck clean.
**Risk**: low
**Status**: todo

## Task: E — Update CLAUDE.md § Where Things Happen

**Hat**: PM
**Depends on**: A, C
**Blocks**: none
**Done when**: edge-middleware row description appends "AND root `/` redirect (anon → `/login`, auth → `/home`)" + test-count bumps to "12 cases" (existing 9 + 2 new + 1 flipped — see Decisions); new row added for `apps/web/app/page.tsx` describing noscript-fallback role. `bash kit/scripts/commit-hooks/check-docs-freshness-project.sh` clean.
**Risk**: low
**Status**: todo

## Decisions

(Append a one-liner here when a judgment call is made during implementation that wasn't pre-resolved in spec D1–D7.)
