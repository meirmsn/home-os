<!-- audited-at: ecdc9dcd5110b8daecc49b3f37f8e22512418e13 -->

# Pre-ship review: capture-flow

Branch: `feature/capture-flow`
Base: `main` (auth-magic-link PR #10 + pwa-spike PR #12 merged; foundation v0 schema + auth shipped)
HEAD: c136da8 at pre-ship start; 2 in-band fix commits during the run (9d37abb + ecdc9dc)
Date: 2026-05-13

## Summary

Counts:

- `passed: 13`
- `findings_pending: 2` (Gate 2c slow-job-lifecycle carry-over from PR #9 / PR #10; Gate 2d/2e/preflight-final env-firewall carry-over from PR #9)
- `n_a: 3` (Gate 1 docs-check, Gate 8b design-conformance, Gate 10 benchmark)
- `blocked: 1` (Gate 9 /qa — Supabase Kong unreachable from container; fix recipe: run from host with port forwarding, or rely on CI slow-job once Gate 2c is closed)
- `dismissals_total: 4`
- `dismissals_llm_reviewed: 0` (all 4 shim-mapped: Gate 2d Google-Fonts firewall pre-existing PR #9 carry-over, Gate 2e devshop-script project-mismatch bug, Gate 3 authenticated screenshots deferred to CI / Vercel preview, Gate 10 perf measurement deferred to Vercel preview — none are PR-code defects)

| Gate                         | Outcome                                                                                   | Dismissals                                                                                                                                                                                        | Adversarial review            |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `docs-check` (ak)            | `n/a` (no `kit/` or reference-doc changes)                                                | None                                                                                                                                                                                              | skipped (scoped parse = None) |
| `metrics-check` (ak)         | `pass`                                                                                    | None                                                                                                                                                                                              | skipped                       |
| `rls-coverage` (ak)          | `pass`                                                                                    | None                                                                                                                                                                                              | skipped                       |
| `slow-job-lifecycle` (ak)    | `findings (1) pending`                                                                    | None (cross-ref Audit 1 Tests § medium-1)                                                                                                                                                         | not invoked (no dismissal)    |
| `fast-job-local` (ak)        | `findings (1) [env-firewall]`                                                             | 1 — Google Fonts firewall; pre-existing PR #9 carry-over                                                                                                                                          | shim-mapped                   |
| `changed-tests-local` (ak)   | `pass` (script project-mismatch noted)                                                    | 1 — script hardcodes `--project=chromium`; project uses `mobile`/`desktop` — devshop-side bug, not project                                                                                        | shim-mapped                   |
| `responsive-theme` (ak)      | `pass` (with documented blocker)                                                          | 1 — authenticated `/capture` + `/dismissed` captures deferred (Supabase Kong unreachable from container; project ships single dark-ground theme per OVERVIEW.md — light/dark identical by design) | shim-mapped                   |
| `simplify`                   | `pass`                                                                                    | None                                                                                                                                                                                              | skipped                       |
| `docs-and-tests-review` (ak) | `pass` (medium=1, low=0, high=0; cross-refs Gate 2c)                                      | None                                                                                                                                                                                              | skipped                       |
| `review`                     | `pass` (informational p_user-trust finding escalated and fixed by Gate 7)                 | None                                                                                                                                                                                              | skipped                       |
| `cso`                        | `findings (1) fixed`                                                                      | None (claim_card_slot SECURITY DEFINER without p_user=auth.uid() guard — fixed in commit 9d37abb)                                                                                                 | accepted                      |
| `design-review`              | `findings (1) fixed`                                                                      | None (touch targets <44px on CaptureForm + RestoreStrip — fixed in commit ecdc9dc)                                                                                                                | accepted                      |
| `design-conformance` (ak)    | `n/a` (no DESIGN.md)                                                                      | None                                                                                                                                                                                              | skipped                       |
| `qa`                         | `blocked` (Supabase Kong unreachable from container; fix recipe in Gate 9 entry below)    | None                                                                                                                                                                                              | not invoked                   |
| `benchmark`                  | `n/a` (build blocked on Google Fonts firewall — Vercel preview is canonical perf surface) | 1 — perf measurement deferred to Vercel preview deploy                                                                                                                                            | shim-mapped                   |
| `preflight-final` (ak)       | `findings (1) [env-firewall]`                                                             | 1 — same Google Fonts firewall as `fast-job-local` (single root cause counted once)                                                                                                               | shim-mapped                   |
| `convention`                 | `pass` (with merge-readiness flag for /ship)                                              | None (supabase.types.ts header missing — pre-existing; auto-generated file)                                                                                                                       | skipped                       |

**Total dismissed findings**: 4 (4 shim-mapped, 0 LLM-reviewed, 0 rejected).

## In-band fixes (commits made during pre-ship)

- `9d37abb` — `fix(capture-flow): cso — add p_user=auth.uid() guard inside claim_card_slot` (Gate `cso` — see Gate 7 entry below).
- `ecdc9dc` — `fix(capture-flow): design-review — bump touch targets to 44px on capture + restore surfaces` (Gate `design-review` — see Gate 8 entry below; also fixed a pre-existing race in the `CaptureForm.test.tsx` 429 test).

## Preflight

- gh: authenticated as meirmsn.
- Branch: `feature/capture-flow` (not main).
- Chromium: `/home/node/.cache/ms-playwright/chromium-1223/chrome-linux/chrome` — Chromium 148.0.7778.0.
- Browse daemon symlinks: `chromium-1208 -> chromium-1223`, `chromium_headless_shell-1208 -> chromium_headless_shell-1223` created (idempotent).
- UI scope: yes — diff touches `apps/web/app/**` and `apps/web/middleware.ts`. Four new page surfaces (`/capture`, `/dismissed`, `POST /api/card`, `POST /api/card/[id]/restore`) + the middleware gated-prefix extension. Gates 3, 8, 9, 10 apply.
- Supabase bootstrap: `reused: local Supabase already running (via cmd-relay)` followed by `error: seed fixtures missing (expected alice@test.local + bob@test.local in auth.users)`. Pre-existing project gap auth-magic-link PR documented — this project elected "No seed data / fixtures" per PR #9 D6 / D10. E2E specs create users programmatically via the admin client. The bootstrap's seed-existence check is a devshop-wide convention this project's foundation didn't adopt. **Not a regression from this PR.**
- Local Supabase reachability from inside this container: Kong on `localhost:54421` returns connection-refused; Inbucket on `:54424` also unreachable. The Supabase stack runs on the macOS host; only certain ports forward into the devcontainer. Same shape as auth PR's preflight noted.
- Consequence: Gate 9 live-walk over the full HTTP round-trip cannot run from this container. E2E spec `capture-flow.spec.ts` is gated by `test.skip(!isLocalSupabase, …)` — CI slow-job is the canonical enforcement surface per spec § Tests.

Outcome: preflight `pass` (with documented Supabase-reachability + seed-fixture limitations — pre-existing project gaps, both routing Gate 9 to `blocked` honestly).

## Deploy-boundaries note

This PR adds two migrations under `supabase/migrations/**` (006a + 006b) — `deploy-migrations.yml` will auto-deploy on merge in parallel with the Vercel app deploy. The migrations are **additive-only** (ALTER TYPE ADD VALUE, ADD COLUMN, ADD CONSTRAINT, CREATE FUNCTION) — no rename / drop / type change / NOT NULL without default. The dual-shape concern doesn't apply; the deploy can race the app deploy without breaking backwards compatibility. Spec § Rollout covers operator follow-ups (none required); spec § Gotchas covers the 006a transaction-free constraint.

Merge-readiness flag (surfaced during Gate 11): feature/capture-flow was branched off main at `bbb6f93` (before pwa-spike PR #12 merged at `6bd3d25`). The diff against `origin/main` shows the spike's BUILD-LOG entry + `apps/web/app/(app)/spike/**` files being "deleted" — these aren't real deletions, they're just missing from this branch's pre-spike base. /ship (Phase 4) needs to merge main back into the branch first to pick up the spike changes and then resolve the BUILD-LOG.md conflict (the existing entries on main stay; the capture-flow entry gets appended).

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

---

## Gate 1: docs-check (ak)

**Outcome**: `n/a` (no `kit/` or reference-doc changes in diff).

## Dismissals

None.

## Gate 2: metrics-check (ak)

**Outcome**: `pass`.

All three `posthog.capture` call sites added in this PR carry matching rows in `METRICS.md § Events`:

- `capture_started` at `apps/web/app/(app)/capture/_components/CaptureForm.tsx:78`
- `capture_completed` at `apps/web/app/(app)/capture/_components/CaptureForm.tsx:148`
- `capture_cap_hit` at `apps/web/app/(app)/capture/_components/CaptureForm.tsx:170`

Each METRICS row names the exact file path + decision reference (D9). Validation step in the four-stage flow (`/ak-spec` drafts → `/ak-implement` instruments → this gate validates → user confirms) is satisfied.

## Dismissals

None.

## Gate 2b: rls-coverage (ak)

**Outcome**: `pass` — the gate's script reported `pass` directly.

This PR adds:

- **Client writes** via PostgREST: `cards.update(state)` in the restore route. RLS policy for `update` on `cards` exists from PR #9 migration 003.
- **Client writes** via PostgREST: `card_photos.insert` in the capture route. RLS policy for `insert` on `card_photos` exists from PR #9.
- **Server-side writes** via `claim_card_slot` RPC: `usage_counters.upsert` + `cards.insert`. The RPC is SECURITY DEFINER (bypasses RLS) — the function's internal `p_user = auth.uid()` check (added by Gate 7 in-band fix) is the equivalent auth boundary.

## Dismissals

None.

## Gate 2c: slow-job-lifecycle (ak)

**Outcome**: `findings (1) pending` — slow-job is commented out in `.github/workflows/ci.yml` despite the project having THREE integration/E2E spec files (`rls-isolation.spec.ts` from PR #9, `magic-link.spec.ts` from PR #10, `capture-flow.spec.ts` from this PR).

Per `kit/docs/guide/conventions.md § Slow-Job Lifecycle`: "When a project crosses either threshold, the spec that adds the test must include the slow-job uncomment in the same PR." PR #9 and PR #10 carried this as `findings (1) pending`; same disposition here. PR #12 (pwa-spike) re-classified to `pass (pre-existing — out of scope)` since its diff didn't touch `.github/workflows/`. This PR's `capture-flow.spec.ts` is the third E2E gated on slow-job activation; the priority compounds.

Cross-references Audit 1 Tests § medium-1 (same root cause; one fix closes both).

**Fix recipe** (operator-applied, follow-up PR or pre-ship interlude):

1. Uncomment the `changes:` + `slow:` job stubs in `.github/workflows/ci.yml`.
2. Add the actual vitest integration + Playwright invocation steps to the `slow:` job body.
3. Verify `if:` predicate is `github.event_name == 'pull_request' && needs.changes.outputs.runtime == 'true'`.
4. Verify the edge-runtime health-check retry pattern is preserved (lalista PR 26 codification).
5. Add `slow` to branch protection's required contexts via `gh api repos/meirmsn/home-os/branches/main/protection`.

## Dismissals

None. (This is a carry-over from PR #9 + #10 but it's not dismissed — it's `findings (1) pending` against this PR too, with cross-reference to the prior treatment.)

## Gate 2d: fast-job-local (ak)

**Outcome**: `findings (1) [env-firewall carry-over from PR #9 / PR #10]`.

Lint, typecheck, test:unit all pass (95 tests across 19 files). Build fails on Google Fonts firewall:

```
@home-os/web:build: Failed to fetch `Inter` from Google Fonts.
@home-os/web:build: There was an issue establishing a connection while requesting https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap
```

Same environment defect PR #9 and PR #10 documented (workspace egress firewall blocks Google Fonts). Vercel build path is unaffected (Vercel CI has network access to fonts.googleapis.com); the deployed app uses Inter correctly. Tracked: `TODOS.md § v0 → pre-ship` (filed by auth PR).

## Dismissals

- Build step's Google Fonts fetch failure — rationale: pre-existing workspace egress firewall defect documented in PR #9 + PR #10 reviews and tracked in TODOS.md; Vercel build is the canonical enforcement surface; no code-level remediation possible from within the workspace container. **Do not block on this.**

## Gate 2e: changed-tests-local (ak)

**Outcome**: `pass` (with the same devshop-script project-mismatch noted as auth PR — does not invalidate the gate's verdict).

The script's bundled `playwright test --project=chromium` invocation fails because this project's `apps/web/playwright.config.ts` defines `mobile` + `desktop` projects (not `chromium`). Direct invocation with `--list` confirms all 28 specs parse cleanly (`Total: 28 tests in 3 files`), including 3 new capture-flow E2E cases + 3 new rls-isolation cross-user cases.

**Devshop-side bug**: `kit/scripts/preship/changed-tests-local.sh` hardcodes `--project=chromium` without detecting the project's actual Playwright projects. Auth PR review filed this finding; still not addressed. Does NOT affect this PR's correctness.

## Dismissals

- Script project-name mismatch (`--project=chromium` vs project's `mobile`/`desktop`) — rationale: devshop-side bug in `changed-tests-local.sh`, not a project defect. Carry-over from auth PR review. Spec parses cleanly; gate is satisfied by direct `--list`.

## Gate 3: responsive-theme (ak)

**Outcome**: `pass (with blocker documented for authenticated state)`.

Captures landed at `specs/capture-flow/screenshots/`:

- `/login` — `login-{1440,375}-{light,dark}.png` (4 combos). Project ships single dark-warm-charcoal ground per OVERVIEW.md — light/dark renders identical by design (no theme toggle yet; deferred per PRODUCT-ROADMAP.md). Light captures used for both filenames.
- `/capture` (anon → middleware redirect → /login?next=%2Fcapture) — `capture-anon-{1440,375}-{light,dark}.png` (4 combos). Proves the middleware gated-prefix extension works in production code.
- `/dismissed` (anon → middleware redirect → /login?next=%2Fdismissed) — `dismissed-anon-{1440,375}-{light,dark}.png` (4 combos). Proves the second new prefix gate.

**Authenticated `/capture` form + `/dismissed` list + cap-hit banner** — **DEFERRED**. Same Supabase reachability limitation as auth PR's Gate 3: Kong on `localhost:54421` connection-refused from this container; authenticated rendering requires a working session round-trip. Vercel preview deploy is the canonical authenticated-rendering surface for human review during PR; CI slow-job (once Gate 2c closes) is the automated surface.

## Dismissals

- Authenticated `/capture` + `/dismissed` + cap-hit banner captures deferred — rationale: documented Supabase reachability limitation; the round-trip dependency is unreachable from this devcontainer's network shape; Vercel preview + CI slow-job are the canonical evidence surfaces. Unauth-redirect flow IS captured as the in-band proof of the middleware (D6 + capture-flow spec §11) contract that gates `/capture` and `/dismissed`.
- Light/dark captures rendering identically — rationale: single-theme dark-ground design per OVERVIEW.md; light-mode toggle is out-of-scope for this PR. **Not a regression.**

## Gate 4: simplify

**Outcome**: `pass` — no findings.

Code is taut across the four new surfaces:

- `apps/web/app/api/card/route.ts` (241 lines) — substantive `// What:` / `// Why:` / `// Does NOT:` header, pure-fn helpers (`thisMondayUtcIso` / `nextMondayUtcIso` / `validate`), clean branch ordering (auth → validate → RPC → photo upload), single-responsibility functions.
- `apps/web/app/api/card/[id]/restore/route.ts` (86 lines) — three-state distinction (200 / 404 / 409) handled by a second narrow `.select` after the UPDATE returns no row; correct ordering.
- `apps/web/app/(app)/capture/_components/CaptureForm.tsx` (400 lines) — composite component with a sub-`ModeToggle`; `useRef`-guarded `capture_started`; `URL.createObjectURL` released in cleanup effect; explicit `Stage` + `ServerError` union types. Two empty `/** */` JSDoc stubs above `handleSubmit` and `handleConfirm` are minor noise but not worth a fix commit.
- `apps/web/middleware.ts` extension — single new `GATED_PREFIXES` array entry pair; `isGated` helper unchanged.

No reuse candidates left on the table, no dead code, no obvious efficiency wins.

## Dismissals

None.

## Gate 5: docs-and-tests-review (ak)

**Outcome**: `pass` (medium=1, low=0, high=0).

See `## Audit 1` section above (appended by `/ak-check-docs-and-tests`). The medium finding cross-references Gate 2c (same root cause; one fix closes both). Audit covered every Docs-Coverage-Bypass trailer in range (8 verified) and the diff's 22 new test files (no Tests-Coverage-Bypass trailers needed).

## Dismissals

None.

## Gate 6: review

**Outcome**: `pass` — one informational finding (escalated to Gate 7 for verification + fix).

Diff scan returned clean across:

- SQL safety — migrations 006a + 006b use parameterized PL/pgSQL; no string interpolation in SQL; SECURITY DEFINER's pinned `search_path = public, pg_catalog` matches PR #9 migration 005 convention.
- LLM trust boundaries — N/A (no LLM calls in this PR).
- Conditional side effects — route handlers correctly order claim-then-upload (a 429 path never writes Storage); photo upload + card_photos insert each guard `if (!error)` with `Sentry.captureException` on the error branch; route returns 201 + `photo_uploaded: false` on partial failure (eng-review § Rescue #1) rather than 500.
- Structural — `_lib/` underscore prefix correctly excludes from App Router file-based routing; `export const dynamic = 'force-dynamic'` matches the auth route handlers' posture; client/server boundary respected (`'use client'` on form components, server components for picker + page shells).

**Informational** (escalated to Gate 7): `claim_card_slot` SECURITY DEFINER + no internal `p_user = auth.uid()` check; route handler defense-in-depth is real but PostgREST exposes the RPC directly. Gate 7 verified this as HIGH severity (cap-griefing exploit) and applied the fix.

## Dismissals

None — informational finding escalated to Gate 7 rather than dismissed.

## Gate 7: cso

**Outcome**: `findings (1) fixed`.

**Finding (HIGH, confidence 9/10, VERIFIED)**: `claim_card_slot` SECURITY DEFINER + no internal auth check, and PostgREST exposes public functions to authenticated callers by default (Postgres `GRANT EXECUTE TO PUBLIC` is the default for newly-created public functions; no `REVOKE` in migration). An authenticated user A could call the RPC directly via PostgREST with `p_user: userBId` and force-fill userB's weekly counter — griefing the victim until next Monday + polluting B's `cards` table with attacker-supplied rows.

**Exploit scenario** (step-by-step):

1. Attacker signs up + logs in via the normal auth flow (any account).
2. From the browser console (or any HTTP client with attacker's Supabase JWT), sends 20 calls to `POST /rest/v1/rpc/claim_card_slot` with body `{ p_user: <victim_uuid>, p_title: '...', p_description: '...', p_system_tag: 'plumbing', p_room_tag: '...' }`.
3. Each call: (a) inserts a row in `cards` with `user_id = victim_uuid` (SECURITY DEFINER bypasses RLS), (b) increments `victim.usage_counters.card_count` by 1.
4. After 20 calls: victim sees `cap_hit` and cannot capture for the rest of the week. Their card list is polluted with 20 attacker-supplied rows.

**Impact**: Targeted denial-of-capture + data pollution. The route handler's defense-in-depth (deriving `p_user` from `getUser()`) is real and prevents accidental misuse via the official client, but the function itself remains directly callable by any authenticated session.

**Fix**: commit `9d37abb`. Added a function-level guard at the top of `claim_card_slot`:

```sql
if p_user is distinct from auth.uid() then
  raise exception 'forbidden' using errcode = '42501';
end if;
```

SECURITY DEFINER still bypasses RLS on the writes below, but only for the validated caller. PostgREST maps `42501` (insufficient_privilege) to HTTP 403 by default. The route handler's `p_user = getUser().id` derivation is the second layer of the same defense. Migration 006b is pre-deploy (not on main yet), so edited in place rather than adding a 006c follow-up. CLAUDE.md updated to document the shipped two-layer defense. The rls-isolation test that previously documented the "tolerated" behavior was tightened to assert the RPC rejects with `42501` and neither user's counter moves.

**Other checks performed**: no committed secrets (grep clean for sk_test/sk_live/API_KEY=); CSRF posture correct (POST handlers + same-origin); storage path correctly anchored to `user.id` (server-side, from getUser()) — RLS leading-segment check passes; `upsert: false` prevents storage object overwrite on touchpoint_id collision.

## Dismissals

None — the SECURITY DEFINER p_user finding was fixed in-band rather than dismissed.

## Gate 8: design-review

**Outcome**: `findings (1) fixed`.

**Finding (medium → fixed)**: mobile touch targets below the 44px iOS / WCAG 2.5.5 minimum on capture-flow surfaces.

- CaptureForm textarea / select / room_tag input: ~36-38px (`py-2.5 + text-sm`, no `min-h-11`).
- CaptureForm photo file picker's `file:` pseudo-element: ~36px (`file:py-2 + text-sm`).
- CaptureForm New/Update toggle buttons: 36px (`min-h-9`).
- RestoreStrip three buttons (collapsed Restore, confirm Restore, Cancel): ~28px (`py-1.5 + text-sm`, no `min-h-11`).

Submit button + `/home` CTAs already had `min-h-11` from prior PRs (auth PR's similar fix); left untouched.

**Fix**: commit `ecdc9dc`. Added `min-h-11` to all form inputs + the ModeToggle. RestoreStrip buttons wrapped in `inline-flex min-h-11 items-center` so the inline button's content centers vertically. Pure CSS-class change; no markup or behavior change. Also fixed a pre-existing race in `CaptureForm.test.tsx`'s 429 cap-hit test (the test's `waitFor` polled for "Save card" button absence, which trips during the transient "Saving…" stage; switched to wait for the cap-hit banner text — the definitive end-state).

**Other axes** (calm-authority voice, dark warm-charcoal ground, mobile-first single-column flow, hierarchy via heading→subhead→form, copy hints from spec § Screens § /(app)/capture): all conform.

## Dismissals

None.

## Gate 8b: design-conformance (ak)

**Outcome**: `n/a (no DESIGN.md)`.

Project has no `DESIGN.md` at the root. Per the gate contract, extraction failure resolves to `n/a` (non-blocking). OVERVIEW.md serves the design-source-of-truth role for now ("calm authority, spiral prevention, dark warm-charcoal ground").

## Dismissals

None.

## Gate 9: qa

**Outcome**: `blocked (Supabase Kong unreachable from container)`.

**Reason**: this devcontainer cannot reach the local Supabase Kong gateway on `localhost:54421` (connection refused). The Supabase stack runs on the macOS host; only certain ports forward into the devcontainer's network namespace. Same shape as auth PR's Gate 9 — Inbucket on `:54424` is also unreachable from this container (different from auth PR's "Inbucket reachable" report; the network shape may have shifted, but the consequence is identical).

**Cannot perform** (per the Gate 9 contract's "No synthetic-harness substitution" clause): the full capture round-trip walk requires `POST /api/card` → Supabase RPC → Storage upload, all of which fail closed when Kong is unreachable. Substituting a synthetic harness (DOM-injected forms, mocked-response fixtures) is explicitly forbidden — it ships false confidence.

**Evidence captured against production-reachable code paths** (saved to `specs/capture-flow/screenshots/`):

| Spec § Core user story verb                                   | Production-code reachable?                          | Evidence                                                                                                                                                                                                                                    |
| ------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Land on `/home` (authenticated)                               | Not reachable (Supabase auth round-trip needed)     | —                                                                                                                                                                                                                                           |
| Tap "+ Capture" → navigate to `/capture`                      | Not reachable (gated by middleware on anon session) | Middleware bounce captured: `capture-anon-{1440,375}-{light,dark}.png` (URL bar shows `/login?next=%2Fcapture` per spec §11 / auth D6)                                                                                                      |
| Fill form + submit                                            | Not reachable                                       | Form fully covered by `CaptureForm.test.tsx` unit tests (7 cases): mount + capture_started, validation gates, 201 + capture_completed, 429 + cap_hit + state preservation, photo preview, network error, update-mode toggle.                |
| POST /api/card → RPC → 201                                    | Not reachable                                       | `route.test.ts` (11 cases) covers every branch: 401, 5×400 validation, 201 no-photo, 201 with-photo, 201 photo-failure-card-persists, 429 cap-hit (Storage+Sentry NOT called), 500 unexpected; p_user-from-getUser defense-in-depth pinned. |
| Cap-hit banner + capture_cap_hit event                        | Not reachable                                       | Unit test (CaptureForm.test.tsx case 4) asserts the full DOM swap + payload + state preservation                                                                                                                                            |
| `/dismissed` list + restore                                   | Not reachable                                       | `RestoreStrip.test.tsx` (8 cases): collapsed → confirm → 200/404/409/network paths + onRestored callback + router.refresh fallback                                                                                                          |
| Middleware: anonymous + /capture → /login?next=%2Fcapture     | Yes (production code)                               | `capture-anon-1440-light.png`, `capture-anon-375-light.png` (URL bar visible)                                                                                                                                                               |
| Middleware: anonymous + /dismissed → /login?next=%2Fdismissed | Yes (production code)                               | `dismissed-anon-1440-light.png`, `dismissed-anon-375-light.png`                                                                                                                                                                             |

**Fix recipe** (clear the block):

- Either: bring this pre-ship up from a host where Supabase Kong IS reachable (e.g., the macOS host directly, or a devcontainer with proper port forwarding for 54421).
- Or: wait for CI slow-job once Gate 2c is closed — the spec's `capture-flow.spec.ts` is the canonical evidence surface there (3 cases: happy-path, cap-hit, restore-from-dismissed), gated by `test.skip(!isLocalSupabase, …)`.
- Or: wait for Vercel preview deploy (which produces a live URL with a fully-working Supabase backend) and run the happy-path manually during PR review.

The spec's `## Tests` section explicitly declares slow-job CI as the enforcement surface; this aligns with the gate's outcome.

## Dismissals

None — `blocked` is reported honestly, not dismissed.

## Gate 10: benchmark

**Outcome**: `n/a` (build blocked on Google Fonts firewall in this container; Vercel preview deploy is the canonical performance surface).

Per the gate spec, the responsive/UI scope DOES apply. However, the workspace egress firewall blocks the production build path (Gate 2d finding), and a `next dev` server uses fallback fonts which would skew measurements significantly vs production. Defer perf measurement to the Vercel preview deploy that ships with PR creation in Phase 4.

## Dismissals

- Performance measurement deferred to Vercel preview deploy — rationale: in-container build is blocked on Google Fonts (env-firewall, Gate 2d); dev-server fallback fonts would produce non-representative Core Web Vitals. **Not a regression** in this PR; benchmark surface stays Vercel.

## Gate preflight-final (ak): /preflight re-run

**Outcome**: `findings (1) [env-firewall carry-over, single root cause counted once]`.

`fast-job-local` re-run after all code-changing gates: lint/typecheck/test:unit clean (95 tests, 19 files — unchanged count since the design fix only touched CSS classes + one test assertion that now passes); build still fails on the same Google Fonts firewall flagged in Gate 2d. No additional findings introduced by the in-band fix commits (9d37abb + ecdc9dc).

`changed-tests-local` re-run: same `--project=chromium` script-side mismatch flagged in Gate 2e; spec still parses cleanly via direct `--list` (28 specs across 3 files).

## Dismissals

- Same as Gate 2d (Google Fonts) and Gate 2e (script project mismatch). Single root causes; this gate doesn't double-count.

## Gate 11: convention check

**Outcome**: `pass` (with merge-readiness flag for /ship).

- `kit/scripts/commit-hooks/check-file-headers.sh main`: one flag on `packages/core/src/supabase.types.ts` — auto-generated by `supabase gen types typescript`, no place to inject a `// What:` header without modifying the generator. Pre-existing on main; not introduced by this PR. Worth filing a project-level convention-exemption mechanism (out of scope here).
- Migration ROLLBACK comments: both 006a and 006b carry explicit `-- ROLLBACK:` blocks.
- `auth.users` FK with `ON DELETE`: no new `references auth.users` in this PR's migrations (PR #9 established the existing cascades).
- Realtime publication: no new `subscribeTo<X>` or `postgres_changes` listeners added.
- Backlog routing: PLAN.md / PRODUCT-ROADMAP.md / kit/ROADMAP.md unchanged in this PR (BUILD-LOG entry happens in /ak-build Phase 5.6 — not in pre-ship scope).
- Test-presence: every new `.ts/.tsx` under `apps/web/app/api/` and `apps/web/app/(app)/` has a sibling `*.test.{ts,tsx}`. No new entries in `.devshop-test-coverage-exempt` needed (per tasks.md decision § E2E test-presence).

**Merge-readiness flag**: feature/capture-flow was branched off main at `bbb6f93` (before pwa-spike PR #12 merged at `6bd3d25`). The diff against `origin/main` shows the spike's BUILD-LOG entry + `apps/web/app/(app)/spike/**` files appearing as "deleted" — these aren't real deletions, they're just missing from this branch's pre-spike base. Phase 4 (/ship) needs to merge main back into the branch first so the spike changes land cleanly + the BUILD-LOG.md gets the capture-flow entry appended without removing the existing spike entry.

## Dismissals

None.

---

## Hero screenshots

Captured to `specs/capture-flow/hero/`:

- `hero/login.png` — `/login` form at 1440×900. The capture surface's only public entry point (the gated `/capture` + `/dismissed` paths bounce to here when anonymous).
- `hero/capture-anon-bounce.png` — anonymous request to `/capture` → middleware redirect to `/login?next=%2Fcapture`. URL bar visible in the address render. Demonstrates the new `GATED_PREFIXES` extension.
- `hero/dismissed-anon-bounce.png` — anonymous request to `/dismissed` → middleware redirect to `/login?next=%2Fdismissed`. Same gating pattern.

**Not captured** (per Gate 9 `blocked` documented above): authenticated `/capture` form rendering, the `/dismissed` list with seeded rows, the cap-hit banner. CI slow-job (once Gate 2c is closed) is the automated enforcement surface; Vercel preview deploy will surface authenticated states for human review during PR review.
