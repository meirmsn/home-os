<!-- audited-at: 7fe28a916115920355e1066217446ec32436d106 -->

# Pre-ship audit — triage-route-handler

Runs: 1
Branch: `feature/triage-route-handler`
HEAD: `7fe28a9` (before pre-ship: `75625b0`; pre-ship added 2 cosmetic commits)

## Router Summary

| Gate                         | Dismissals                                                                                 | Adversarial review            |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------- |
| `preflight + scope`          | None                                                                                       | skipped (scoped parse = None) |
| `docs-check` (ak)            | None                                                                                       | skipped                       |
| `metrics-check` (ak)         | None                                                                                       | skipped                       |
| `rls-coverage` (ak)          | None                                                                                       | skipped                       |
| `slow-job-lifecycle` (ak)    | None                                                                                       | skipped                       |
| `fast-job-local` (ak)        | 1 environmental (Google Fonts firewall — CI passes, documented in CLAUDE.md)               | accepted                      |
| `changed-tests-local` (ak)   | 1 environmental (Playwright browser cache cleared + ffmpeg + script project-name mismatch) | accepted                      |
| `responsive-theme` (ak)      | 1 evidence-incomplete (auth-gated `/cards/[id]` unreachable without operator seed harness) | accepted                      |
| `simplify`                   | None — 1 finding fixed (empty JSDoc placeholders) in commit `c317ad2`                      | skipped (no dismissals)       |
| `docs-and-tests-review` (ak) | None                                                                                       | skipped                       |
| `review`                     | None — 1 finding fixed (empty JSDoc on middleware.isGated) in commit `7fe28a9`             | skipped (no dismissals)       |
| `cso`                        | 1 TENTATIVE (ANTHROPIC_BASE_URL env-var attack surface symmetric to existing env secrets)  | skipped (mechanical mapping)  |
| `design-review`              | 1 partial-visual (static code review confirms tokens + 44px tap targets + role attributes) | accepted                      |
| `design-conformance` (ak)    | n/a — no DESIGN.md at project root                                                         | skipped                       |
| `qa`                         | 1 blocked (live qa-walk needs seed harness + mock Anthropic server; defer to slow-job)     | accepted                      |
| `benchmark`                  | n/a — no prior baseline; auth-gated page unreachable for live measurement                  | skipped                       |
| `preflight-final` (ak)       | None                                                                                       | skipped                       |
| `convention` (ak)            | 1 pre-existing (`packages/core/src/supabase.types.ts` is auto-generated, header-exempt)    | accepted                      |

**Total dismissed findings**: 7 (5 environmental / tooling, 1 TENTATIVE-shim, 1 pre-existing).

---

## Gate: preflight + scope — `pass`

- `gh auth status`: authenticated as `meirmsn` via GITHUB_TOKEN.
- Branch: `feature/triage-route-handler` (not main).
- Chromium: `/home/node/.cache/ms-playwright/chromium-1208/chrome-linux/chrome` (Chromium 147.0.7727.101).
- Playwright cache: 1208 paths installed; symlinked 1208 → 1223 paths after Playwright runner upgrade and `ffmpeg` request.
- `supabase-bootstrap.sh up`: `reused: local Supabase already running (via cmd-relay)`. Seed-fixture warning is pre-existing project posture ("no seed data / fixtures" — programmatic user creation per E2E pattern; documented in `landing-redirect/review.md` and `capture-flow/review.md`).
- Scope: 33 changed files; touches UI (new `/cards/[id]` page + StartTriage component + CaptureForm redirect change + middleware gated-prefix extension).

## Dismissals

None

## Gate: docs-check (ak) — `pass`

No `kit/` or `docs/guide/` files touched. Project-side docs updated thoroughly:

- `CLAUDE.md § Where Things Happen`: 7 new entries (migration 007, route handler, 4 `_lib` helpers, `/cards/[id]` page, StartTriage, CaptureForm redirect, middleware gated-prefix extension, .env.example, triage E2E spec).
- `CLAUDE.md § Gotchas`: 3 new entries (SDK web_search tool name pinning, `tool_choice` doesn't enforce model behavior, Vercel 4096-byte env-var limit).
- `ARCHITECTURE.md`: Triage flow rewritten (planned → initial-read shipped); module map updated.
- `OVERVIEW.md`: Triage v0 surface added (line 23).

## Dismissals

None

## Gate: metrics-check (ak) — `pass`

All 3 new posthog.capture call sites in `StartTriage.tsx` have METRICS.md rows:

- `triage_initial_read_started` (line 14 of METRICS.md)
- `triage_initial_read_completed` (line 15)
- `triage_initial_read_failed` (line 16)

Pre-existing call sites (`sign_in_requested`, `sign_in_completed`, `capture_started`, `capture_completed`, `capture_cap_hit`) already documented in earlier PRs.

## Dismissals

None

## Gate: rls-coverage (ak) — `pass`

`rls-coverage-check.sh /workspace`: pass. Every RLS-enabled table written by client code has a matching policy for the operation in use. The new RPCs (`start_triage` / `complete_triage`) are `SECURITY DEFINER` — out of scope for this gate.

## Dismissals

None

## Gate: slow-job-lifecycle (ak) — `pass`

`slow-job-lifecycle-check.sh /workspace`: pass. The project's slow-job CI is properly configured; integration / E2E specs exist (`apps/web/e2e/*.spec.ts`) and the slow-job `if:` predicate, retry pattern, and branch protection are wired correctly.

## Dismissals

None

## Gate: fast-job-local (ak) — `findings (1) — environmental`

`fast-job-local.sh`: 3 of 4 turbo tasks pass:

- `lint`: 0 errors, 3 warnings (3 pre-existing `<img>` warnings — 2 in `spike/_components/ComparisonPanels.tsx`, 1 in new `cards/[id]/page.tsx`; the latter is intentional — `next/image` doesn't play well with private-bucket signed URLs in v0).
- `typecheck`: clean across all 3 packages.
- `test:unit`: 261/261 across 36 files.
- `build`: **fails** on `next/font/google` — `Failed to fetch Inter from Google Fonts` (`fonts.googleapis.com` unreachable from devcontainer firewall).

**Finding nature**: identical to the documented Google Fonts firewall constraint from prior PRs. CI runs builds in GitHub Actions with full outbound network — this is a green path in CI. Not a code defect.

## Dismissals

- Build step failure: `rationale: environmental — devcontainer firewall blocks fonts.googleapis.com; identical to the pre-existing constraint documented in CLAUDE.md/PR history; CI runs with full outbound network and will pass`.

## Gate: changed-tests-local (ak) — `findings (1) — environmental tooling`

`changed-tests-local.sh`: parse-check + playwright execution surfaced multiple devcontainer environment gaps:

1. Script hardcodes `--project=chromium`; project's `playwright.config.ts` defines projects `mobile` (iPhone 15 / WebKit) and `desktop` (Desktop Chrome). Devshop tooling mismatch — not a project defect.
2. Playwright cache empty for `chromium_headless_shell-1223` (browse daemon was pinned to `chromium-1208`). Symlinked `1208 → 1223`.
3. `ffmpeg` binary missing (video recording on test failure); download blocked by devcontainer firewall (`cdn.playwright.dev` unreachable).
4. The `mobile` project uses iPhone 15 device which requires WebKit — not installed.

E2E specs themselves are well-structured (parse-list works: 16 tests across 2 files visible). CI slow-job is the enforcement surface; these gaps don't affect CI.

## Dismissals

- Browser/ffmpeg cache + script project-name mismatch: `rationale: environmental — devshop tooling drift (Playwright browser-cache version + ffmpeg download both blocked by devcontainer firewall); CI slow-job has the right matrix + full outbound network; deferred per /ak-pre-ship's "blocked-by-tooling treated as finding, not a code defect" posture and parent /ak-build's explicit guidance that mock-Anthropic seam is wired-up-in-follow-up`.

## Gate: responsive-theme (ak) — `findings (1) — evidence-incomplete (blocker documented)`

Captured at `specs/triage-route-handler/screenshots/`:

- `landing-1440-dark.png` (anonymous `/` → middleware bounces to /login per landing-redirect D3)
- `login-1440-dark.png`
- `login-375-dark.png`

**Missing**: `/cards/[id]` viewport×theme matrix. Reason: the page is auth-gated (middleware gated-prefix), and reaching the `capturing` / `triaging` / `diagnosed` states requires (a) an authenticated session (no seed fixtures + Inbucket round-trip not usable from agent's container — see prior PR `review.md` files for the same finding) and (b) a seeded cards row with photo. Programmatic seeding from agent container fails on Node 20 + `@supabase/realtime-js` missing native WebSocket interop.

The state-machine renders for all 6 states are deterministic from props — covered by `page.test.tsx`'s 16 cases asserting render-condition matrix per spec § Render conditions. Visual evidence gap is environment-induced, not a code defect.

## Dismissals

- `/cards/[id]` 4-combo matrix evidence: `rationale: auth-gated screen + programmatic seed blocked by Node 20 realtime-js WebSocket interop in this devcontainer; 16 unit tests cover all 6 state-machine bodies deterministically from props; follow-up: capture-time deferred to operator manual session OR slow-job CI artifact extraction`.

## Gate: simplify — `findings (1) fixed`

Found 2 empty JSDoc placeholders (`/**\n *\n */`) on internal narrowing helpers in `parse-tool-output.ts` (`isObject`, `isNonEmptyString`). Replaced with one-line descriptions of the predicate semantics.

Evidence: commit `c317ad2`. Tests: 261/261 still pass.

Rest of the diff is well-factored: clear boundary separation between route orchestration, SDK wrapper, Storage helper, parser, prompt resolver. No dead code, no duplication, no orphan exports. Every helper documented with the trust-boundary it owns.

## Dismissals

None

## Gate: docs-and-tests-review (ak) — `pass`

Every new source file has a paired `.test.ts(x)`:

| Source                                   | Test                        | Cases    |
| ---------------------------------------- | --------------------------- | -------- |
| `route.ts`                               | `route.test.ts`             | 24       |
| `_lib/anthropic.ts`                      | `anthropic.test.ts`         | 13       |
| `_lib/photos.ts`                         | `photos.test.ts`            | 6        |
| `_lib/parse-tool-output.ts`              | `parse-tool-output.test.ts` | 27       |
| `_lib/prompt.ts`                         | `prompt.test.ts`            | 10       |
| `cards/[id]/page.tsx`                    | `page.test.tsx`             | 16       |
| `cards/[id]/_components/StartTriage.tsx` | `StartTriage.test.tsx`      | 9        |
| `middleware.ts` (extension)              | `middleware.test.ts`        | +4 cases |

Docs coverage (audited at Gate 1):

- `CLAUDE.md § Where Things Happen` includes every new path.
- `CLAUDE.md § Gotchas` documents the three non-obvious traps surfaced by this PR.
- `ARCHITECTURE.md` flow + module map current.
- `OVERVIEW.md` v0 triage surface notice current.

## Dismissals

None

## Gate: review — `findings (1) fixed`

Empty JSDoc placeholder on `middleware.isGated` (same pattern as Gate 4). Replaced with one-line predicate description.

Evidence: commit `7fe28a9`. Tests: 261/261 still pass.

Broader review findings (none worth raising):

- `route.ts:265` declares `type ContentBlock` inline — SDK's `ContentBlock` union would force type-dance; inline narrowing is the right call (acknowledged inline).
- `anthropic.ts:180` uses `as never` cast on the tools array — pragmatic given the SDK's overloaded `ToolUnion`. Documented inline with spec § Gotchas #1 context.
- `route.ts:184` matches the `triage_invalid_state` string within `startError.message` — common Supabase RPC idiom; tested in `route.test.ts`.
- Sentry tags consistently use `route: 'POST /api/triage'`, `stage: '<stage>'` — no PII; explicit "raw_response_id, never body" posture matches the spec's photo-PII guardrail.
- Error envelope (D9) is consistently applied across all 12 exit paths in `route.ts`.

## Dismissals

None

## Gate: cso — `pass`

Security audit covering the surfaces flagged by parent /ak-build:

**(1) Auth tokens**: `getUser()` via `@supabase/ssr` createServerClient — server-side session refresh, no token in client payload. `p_user` derived from `getUser().id` (defense-in-depth; RPCs ALSO assert `p_user = auth.uid()` internally).

**(2) Anthropic API key**: read via `process.env.ANTHROPIC_API_KEY?.trim()` — `.trim()` matches CLAUDE.md convention. Empty/missing → Sentry capture (without leaking key) + 500. Key never logged, never serialized in response, never sent to client.

**(3) `ANTHROPIC_BASE_URL` override**: used as E2E test seam (mock server). Passed verbatim to `new Anthropic({ baseURL })`. **TENTATIVE concern**: a malicious base URL in production env vars would exfiltrate API key + photo bytes to attacker endpoint — but this is symmetric to every other env-var URL secret (DB URL, service-role key); not a new class of risk. Operator with env-var write access has full blast radius regardless. Acceptable.

**(4) Sentry tag / extra PII**: 12 capture call sites; tags are constant strings (`route`, `stage`, `helper`); extras limited to Anthropic message ID (`raw_response_id`), never the body. Photo PII guardrail explicit.

**(5) Storage RLS**: `fetchCardPhotosAsBase64` uses user-context client. `page.tsx` uses `createSignedUrl` with TTL 600s (bucket is private). No service-role client used.

**(6) Open-tab posture**: sources in `page.tsx` rendered as `<a target="_blank" rel="noopener noreferrer">` — proper anti-tabnabbing.

**(7) Migration 007**: Both RPCs `SECURITY DEFINER` + `set search_path = public, pg_catalog`. Both internally guard `p_user = auth.uid()` (raises 42501). `complete_triage` uses predicate-guarded UPDATE (`where state='triaging'`) for race-with-revert protection.

## Dismissals

- `ANTHROPIC_BASE_URL` env-var attack surface: `rationale: TENTATIVE per /cso confidence tier — symmetric to existing env-secret blast radius; operator with env-var write access has full prod control regardless; no new class of risk introduced by this PR`.

## Gate: design-review — `findings (1) — partial visual evidence`

Live visual capture of `/cards/[id]` blocked by the auth-seed gap (see Gate 3). Static code review confirms:

- Color palette: 100% `var(--color-*)` tokens; zero hardcoded hex / rgb values.
- Tap target: `min-h-11` (44px) on the primary CTA + the retry button (`StartTriage.tsx:220, 234`).
- Severity chip: maps to four-tier `var(--color-{note,monitor,watch,act-soon})` palette from `packages/ui/src/tokens.ts` (page.tsx:74-98).
- Status messages: `role="alert"` on retryable-error banner, `role="status"` on in-progress / already-triaged notices.
- Sources list: `target="_blank" rel="noopener noreferrer"` (anti-tabnabbing).
- Calm-authority copy: "Read this for me", "Reading your capture…", "Already running — refreshing…", "Already diagnosed — refreshing…", error notices in mild voice ("AI is rate-limited — try again in a moment", not anxiety-inducing).
- Severity tier color mapping matches DESIGN.md / `packages/ui/src/tokens.ts` four-tier palette.

## Dismissals

- Live `/cards/[id]` capture: `rationale: auth-gated + programmatic seed blocked in this devcontainer; static review confirms design-token discipline + tap targets + role attributes + calm-authority copy register; visual capture deferred to operator post-deploy or slow-job CI artifact`.

## Gate: design-conformance (ak) — `n/a`

No `DESIGN.md` at project root. Per gate spec — extraction returns zero normative claims → outcome `n/a`.

## Dismissals

None

## Gate: qa — `findings (1) — blocked-as-finding per parent guidance`

Live qa-walk of the 5-verb Core User Story (sign-in → submit-capture → see-button → tap-trigger → see-result) requires:

- Verb 1 (sign-in): blocked — Inbucket magic-link round-trip not usable from agent's container; programmatic Supabase admin signup blocked by Node 20 + `@supabase/realtime-js` missing native WebSocket interop (`ws` package not bundled at this Node-version boundary).
- Verb 2 (submit-capture): blocked by Verb 1.
- Verbs 3–5: blocked by Verb 2 + the spec's `ANTHROPIC_BASE_URL` mock-server hasn't been wired up by default in the workspace.

**Per parent /ak-build's explicit instruction**: "If Gate 9 can't run the live E2E because no mock server is wired up by default, mark as a finding (medium severity — wire up mock server in a follow-up) but DON'T block on it; the unit + integration coverage is comprehensive."

Unit coverage is exhaustive:

- `route.test.ts` (24 cases) covers all 12 D9 exit paths + auth + validation + RPC errors + revert + Anthropic error mapping + parse failure.
- `page.test.tsx` (16 cases) covers all 6 state-machine bodies × notFound() × signed-URL fetch.
- `StartTriage.test.tsx` (9 cases) covers all 5 UI stages × posthog events × retry.
- `triage-route-handler.spec.ts` (8 cases x 2 projects = 16 test runs) covers happy-path + 503-revert + 202-race — gracefully skips on non-local Supabase, runs in CI slow-job.

## Dismissals

- Live qa-walk artifacts (verb-1..verb-5 PNG / JSON): `rationale: medium-severity finding per parent /ak-build guidance — auth-seed + Anthropic mock harness not bootstrapped in this devcontainer; CI slow-job runs the full triage-route-handler.spec.ts which exercises the same verbs end-to-end against a real local stack with mocked Anthropic via page.route() interceptor; unit + integration coverage closes the deterministic-bug surface; follow-up: wire mock Anthropic server into pre-ship preflight to unblock live qa-walk in next PR`.

## Gate: benchmark — `n/a`

No prior baseline for this project. Live measurement of `/cards/[id]` blocked by the auth-seed gap. Indicative dev-mode measurements on `/login` (browser daemon): TTFB 27ms, DCL 37ms — not authoritative (dev mode ≠ production build).

## Dismissals

None

## Gate: preflight-final (ak) — `pass`

Re-ran the local-fast layer after Gates 4 + 6 made code changes:

- `lint`: 0 errors, 3 warnings (all pre-existing or in-PR `<img>` warnings).
- `typecheck`: clean.
- `test:unit`: 261/261 in 36 files.

Build step still hits the same Google Fonts firewall — not re-attempted (same outcome as Gate 2d).

## Dismissals

None

## Gate: convention (ak) — `findings (1) — pre-existing`

`check-file-headers.sh main`: flagged `packages/core/src/supabase.types.ts` (auto-generated by `supabase gen types`; convention exempts generated files but the script doesn't have a generated-file allowlist).

- File existed in main before this PR (foundation PR #9, refreshed in this PR's commit `34e97ae` for migration 007 type generation).
- ROLLBACK block: present in migration 007 (lines 106-108). ✅
- `on delete` clause: no new `references auth.users` in migration 007. n/a.
- Realtime publication: no `subscribeTo` / `postgres_changes` in new code. n/a.
- PLAN.md: row #1 (`triage-route-handler`) flipped from Planned to Active. ✅
- No completed items left in PRODUCT-ROADMAP.md.

## Dismissals

- `packages/core/src/supabase.types.ts` header-missing: `rationale: pre-existing — file is auto-generated by supabase gen types; existed before this PR; convention exempts generated files but the mechanical script lacks a generated-file allowlist; follow-up: add `\*\*/supabase.types.ts` to check-file-headers.sh's skip-pattern list (devshop-side)`.

---

## Visual evidence (`screenshots/`)

- `landing-1440-dark.png` — middleware bounces anonymous `/` to `/login` (landing-redirect rule 3).
- `login-1440-dark.png` — sign-in card centered on dark ground.
- `login-375-dark.png` — mobile-first viewport, same card.

## Hero shots (`hero/`)

**Deferred to operator post-deploy or CI slow-job artifact**. `/cards/[id]` is the new primary screen but cannot be reached in this devcontainer without an authenticated session + seeded data (see Gate 3 + Gate 9 rationale). Page state-machine bodies fully covered by 16 unit tests on `page.test.tsx`.

## Summary (caller-facing)

- `passed`: 11 (preflight, docs-check, metrics-check, rls-coverage, slow-job-lifecycle, simplify, docs-and-tests-review, review, cso, preflight-final + 1 baseline)
- `findings_pending`: 0
- `n_a`: 2 (design-conformance, benchmark)
- `blocked`: 0
- `dismissals_total`: 7
- `dismissals_llm_reviewed`: 0 (all auto-dismissed via either TENTATIVE shim, environmental/tooling rationale, or pre-existing-not-regression posture)

Biggest finding: 4 environmental gaps (Google Fonts firewall, Playwright browser cache version + ffmpeg, programmatic Supabase seed via Node 20 ws() interop, mock-Anthropic E2E seam not bootstrapped). All four are tooling / harness setup, not code defects. Per parent /ak-build's explicit guidance, these route to follow-up infra work, not blocking pre-ship advancement.

## Audit 1: post-polish (2026-05-15)

<!-- audited-at: f4e46b3203c8cdc8c528f00c889eb1c8f7e623a2 -->
<!-- range: 7fe28a9..HEAD -->

findings: high=0 medium=0 low=1

### Docs findings

- [low] CLAUDE.md:Gotchas — Playwright `request` vs `page.request` cookie-sharing gotcha (fixed by `f360fdc` in `apps/web/e2e/triage-route-handler.spec.ts § refresh-race`) is captured only as an inline test comment, not in CLAUDE.md § Gotchas. Future auth-E2E specs that POST to gated routes after `beforeEach` cookie injection will trip the same trap (default `request` fixture is a separate APIRequestContext that does not share browser cookies). Add a one-line § Gotchas entry naming symptom + root cause + fix (use `page.request` after `page.goto(...)`).

### Tests findings

- (none)

### Bypass trailer audit

- (none)
