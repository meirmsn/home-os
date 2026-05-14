<!-- audited-at: PENDING (filled at end of run) -->

# Pre-ship review: capture-flow

Branch: `feature/capture-flow`
Base: `main` (auth-magic-link PR landed; foundation v0 schema + auth shipped)
HEAD: c136da8 (pre-ship start; in-band fix commits appended below if any)
Date: 2026-05-13

(Router Summary will be inserted here after all gates complete.)

## Preflight

- gh: authenticated as meirmsn.
- Branch: `feature/capture-flow` (not main).
- Chromium: `/home/node/.cache/ms-playwright/chromium-1223/chrome-linux/chrome` — Chromium 148.0.7778.0.
- Browse daemon symlinks: `chromium-1208 -> chromium-1223`, `chromium_headless_shell-1208 -> chromium_headless_shell-1223` created (idempotent).
- UI scope: yes — diff touches `apps/web/app/**`, `packages/ui` not changed but `apps/web/middleware.ts` modified and four new page surfaces (`/capture`, `/dismissed`, `POST /api/card`, `POST /api/card/[id]/restore`) added. Gates 3, 8, 9, 10 apply.
- Supabase bootstrap: `reused: local Supabase already running (via cmd-relay)` followed by `error: seed fixtures missing (expected alice@test.local + bob@test.local in auth.users)`. **Note:** Same pre-existing project gap auth-magic-link PR documented — this project elected "No seed data / fixtures" per PR #9 D6 / D10. E2E specs create users programmatically via the admin client. The bootstrap's seed-existence check is a devshop-wide convention this project's foundation didn't adopt. **Not a regression from this PR.**
- Local Supabase reachability from inside this container: Kong on `localhost:54421` returns connection-refused; Inbucket on `:54424` also unreachable. The Supabase stack runs on the macOS host; only certain ports forward into the devcontainer. Same shape as auth PR's preflight noted.
- Consequence: Gate 9 live-walk over the full HTTP round-trip cannot run from this container. E2E spec `capture-flow.spec.ts` is gated by `test.skip(!isLocalSupabase, …)` — CI slow-job is the canonical enforcement surface per spec § Tests.

Outcome: preflight `pass` (with documented Supabase-reachability + seed-fixture limitations — pre-existing project gaps, both routing Gate 9 to `blocked` honestly).

## Deploy-boundaries note

This PR adds two migrations under `supabase/migrations/**` (006a + 006b) — `deploy-migrations.yml` will auto-deploy on merge in parallel with the Vercel app deploy. The migrations are **additive-only** (ALTER TYPE ADD VALUE, ADD COLUMN, ADD CONSTRAINT, CREATE FUNCTION) — no rename / drop / type change / NOT NULL without default. The dual-shape concern doesn't apply; the deploy can race the app deploy without breaking backwards compatibility. Spec § Rollout covers operator follow-ups (none required); spec § Gotchas covers the 006a transaction-free constraint.

## Audit 1: pre-polish (2026-05-13)

<!-- audited-at: c136da8a7766ce5f37cd7d4fd908bd72c85acc8e -->
<!-- range: origin/main..HEAD -->

findings: high=0 medium=1 low=0

### Docs findings

- (none)

Coverage: every new surface mentioned in `apps/web/app/**` (the four new routes — `/api/card`, `/api/card/[id]/restore`, `/(app)/capture`, `/(app)/dismissed` — plus `CaptureForm`, `ExistingCardPicker`, `RestoreStrip`, the middleware gated-prefix extension, and the two migrations `006a` + `006b`) is registered in `CLAUDE.md § Where Things Happen` with file paths verified against HEAD. The three new `posthog.capture` call sites (`capture_started` / `capture_completed` / `capture_cap_hit` from `CaptureForm.tsx`) carry matching `METRICS.md § Events` rows naming the exact file paths and Decision references. `ARCHITECTURE.md § Module map` row updated to mention the two new route handlers. `OVERVIEW.md § Core flows § Capture` + § `Dismiss + Restore` rows updated to name `/(app)/capture` + the 20/wk atomic cap + the cap-hit preservation + `/(app)/dismissed`. Test-count claims spot-verified (route.test.ts `11 cases` ✓; title-from-description.test.ts `8 cases` table-driven ✓). No contradictions detected against the unchanged reference docs.

### Tests findings

- [medium] `apps/web/e2e/capture-flow.spec.ts:33` — `test.skip(!isLocalSupabase, …)` runs the E2E nowhere in CI today because the slow-job stub is still commented out (cross-refs Gate 2c carry-over from PR #9 / PR #10). Fix: uncomment slow-job per `kit/docs/guide/conventions.md § Slow-Job Lifecycle § Uncommenting checklist`. Same root cause as Gate 2c finding; deduplicates against the convention-level fix.

### Bypass trailer audit

**Docs-Coverage-Bypass** (all VERIFIED — temporal coordination across the T9 + T10 → T3-T8 reorder per tasks.md § Decisions; every cited follow-up commit shipped within the range):

- e3492f7 Docs-Coverage-Bypass (Phase 1 spec.md) — VERIFIED (spec.md names future METRICS events as design intent; rows shipped in f4b3dc8).
- 763f4c5 Docs-Coverage-Bypass (T3 POST /api/card) — VERIFIED (CLAUDE.md entry + ARCHITECTURE.md row shipped in 9443254; METRICS rows for client-side events shipped in f4b3dc8; Sentry error paths covered by the umbrella catch-all posture).
- e2bccc4 Docs-Coverage-Bypass (T4 restore route) — VERIFIED (CLAUDE.md entry shipped in 9443254; no posthog event per D8/D9).
- edc968e Docs-Coverage-Bypass (T5 CaptureForm) — VERIFIED (CLAUDE.md entry shipped in 9443254; all three METRICS rows shipped in f4b3dc8 — the docs commits exactly front-loaded this surface).
- 71cd8a3 Docs-Coverage-Bypass (T6 page + picker) — VERIFIED (CLAUDE.md entry shipped in 9443254; ARCHITECTURE module-map row in same commit).
- 6a4c223 Docs-Coverage-Bypass (T7 dismissed + RestoreStrip) — VERIFIED (CLAUDE.md entry shipped in 9443254; OVERVIEW.md `Dismiss + Restore` row updated in same commit).
- 1f2d1cc Docs-Coverage-Bypass (T8 home CTA + middleware) — VERIFIED (both `/home Capture CTA` row and `Middleware gated-prefix extension` row shipped in 9443254).
- c136da8 Docs-Coverage-Bypass (T11 tasks.md status mark) — VERIFIED (bookkeeping commit; no source-file or doc-row impact).

**Tests-Coverage-Bypass**: no trailers in range. The diff includes 22 new test files (5 unit tests for capture pages + components, 3 unit tests for API routes + helpers, 5 middleware test cases, 1 E2E spec, 1 rls-isolation extension with 3 new cases) — no test-presence exemption was needed.
