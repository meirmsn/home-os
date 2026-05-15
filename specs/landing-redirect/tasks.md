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
**Status**: done

## Task: D — Extend auth-edge-cases.spec.ts (E2E)

**Hat**: BE
**Depends on**: A, C
**Blocks**: none
**Done when**: two new Playwright cases inside the existing `test.describe('auth edge cases', …)` block — anon `/` → `/login` (URL + form assert); authed `/` → `/home` (reuses password+cookie-injection helper, asserts `/home` heading). Both inherit file-level `test.skip(!isLocalSupabase, …)` gate. Typecheck clean.
**Risk**: low
**Status**: done

## Task: E — Update CLAUDE.md § Where Things Happen

**Hat**: PM
**Depends on**: A, C
**Blocks**: none
**Done when**: edge-middleware row description rewritten to include the new rules + test-count bumps to "16 cases" (see Decisions for the count correction); new row added for `apps/web/app/page.tsx` describing noscript-fallback role; existing `layout.tsx + page.tsx` combined row split. Pre-commit clean.
**Risk**: low
**Status**: done

## Decisions

- **Task E test-count**: spec D7 said "9 → 11 cases" but CLAUDE.md's stale "9 cases" was already wrong (capture-flow PR #15 extended `middleware.test.ts` to 13 cases without bumping the doc). After this PR the file holds 16 cases (13 existing + 2 added + 1 flipped). Bumped CLAUDE.md from "9" straight to "16" to match reality, not the arithmetic in D7.
- **Task E middleware-row edit**: spec D7 said "append to the existing description" but the existing description called out `/` as "(public landing) stays untouched" — that's now actively wrong. Rewrote the redirect-rules clause to include the new rules AND removed the `/` from the "stays untouched" list. Same net intent as D7; spec language was written before the contradiction surfaced.
- **Task E page.tsx row placement**: spec D7 said add a new row; I placed it directly after the `apps/web/app/layout.tsx` row (the file's nearest sibling in the app-router tree) and split the existing combined `layout.tsx + page.tsx` row to give `page.tsx` its own line. Cleaner than appending at the section's tail where it'd be far from `layout.tsx`.
