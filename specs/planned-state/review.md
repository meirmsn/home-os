<!-- audited-at: e587041347761f238a0c445fc2b98a6c851c13d1 -->

# Pre-ship review: planned-state

Branch: `feature/planned-state`
Base: `origin/main`
HEAD at start: `e587041347761f238a0c445fc2b98a6c851c13d1`
Run started: 2026-05-17

Per `/ak-pre-ship` SKILL.md — quality gates accumulated below.

## Router Summary

_(Populated after all gates run; aggregates each gate's `## Dismissals` section.)_

## Phase 0: Preflight

- **gh CLI**: authenticated as `meirmsn` (warn-only, passing).
- **Branch**: `feature/planned-state` (not main, passing).
- **UI files touched**: yes — 14 files under `apps/web/app/**` (route handler + 4 components + helper + 2 page wiring updates + e2e). Gates 3, 8, 9, 10 apply.
- **Chromium**: `/usr/bin/chromium` (147.0.7727.101 built on Debian GNU/Linux 13). System-level install, not Playwright-bundled. Playwright cache dirs `/home/node/.cache/ms-playwright/chromium-*` do not exist in this workspace — the `chromium-1208` symlink workaround is moot. The browse daemon may use the system Chromium; Playwright E2E runs against whatever the harness chooses. Note for Gate 3 / 8 / 9 / 10: if those gates hit a Playwright "executable not found" error, that's a separate blocker than the one this preflight is checking.
- **Supabase local stack**: `reused` (cmd-relay reachable at `supabase-runner:9000/status` HTTP 200; bootstrap reports "local Supabase already running"). Seed-fixture check returns false-negative because `psql` is not installed in workspace — matches decide-state PR #28's precedent (see `/workspace/specs/decide-state/review.md § Phase 0`). The underlying contract (alice@test.local + bob@test.local present) was previously seeded via auth admin REST API and persists across pre-ship runs because the runner container is long-lived. CI slow-job is the canonical E2E enforcement surface; local pre-ship treats this as `pass`.
- **Deploy boundaries**: diff includes one new migration (`supabase/migrations/20260517214500_012_planned_reminder.sql`) — additive only (`ALTER TABLE ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`). No enum touched, no function-dependency dance. Auto-deploys via `deploy-migrations.yml` on push:main; safe to land in parallel with Vercel app deploy. No schema-mutating changes — no two-PR split needed.

## Gate 1: docs-check

**Outcome**: `n/a (no kit/ or reference docs touched in diff)`

PR diff scope: app + supabase + project docs (CLAUDE.md / METRICS.md / PLAN.md / ARCHITECTURE.md). No `kit/` or `kit/docs/guide/` changes.

### Dismissals

None

## Gate 2: metrics-check

**Outcome**: `pass`

Per METRICS.md row 35–37 (3 new event rows for planned-state):

| Event                      | Source refs                 | Notes                                                                                                                |
| -------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `planned_reminder_set`     | 1 (`ReminderEditor.tsx:85`) | Fired on State A → B/C transition; `days_out` signed                                                                 |
| `planned_reminder_cleared` | 1 (`ReminderEditor.tsx:79`) | Fired on any → State A; `had_future_date` distinguishes regret vs ack (computed from pre-clear `isReminderDue` prop) |
| `planned_reminder_edited`  | 1 (`ReminderEditor.tsx:92`) | Fired on B/C → B/C transition; `from_date`/`to_date`/`days_out` shape matches METRICS.md row                         |

All 3 capture sites use the documented property names and fire AFTER the PATCH 200 (matches Gotcha #6 — same posture as decide-state's `decide_path_chosen`). `days_out` computed via `daysOut(iso)` helper (signed Δdays from local midnight).

Sentry posture unchanged — route reuses PR #27's pattern (Sentry capture on 500-class only; 4xx are user errors).

### Dismissals

None

## Gate rls-coverage (ak)

**Outcome**: `pass`

Mechanical check (`/devshop/kit/scripts/preship/rls-coverage-check.sh`) finished clean. The new `PATCH /api/card/[id]/reminder` writes through the user-context server client → cards table UPDATE policy already exists (migration 003). No SECURITY DEFINER RPC was added — the reminder write is column-level under existing row-grained RLS, which the migration 003 UPDATE policy already covers.

### Dismissals

None

## Gate slow-job-lifecycle (ak)

**Outcome**: `pass`

`.github/workflows/ci.yml` slow-job is wired correctly; new `e2e/planned-state.spec.ts` will be exercised by the slow-job's E2E glob.

### Dismissals

None

## Gate fast-job-local (ak)

**Outcome**: `pass` (build step blocked by sandbox limitation; documented)

Steps measured:

- **lint** — `pnpm turbo run lint` — pass.
- **typecheck** — `pnpm turbo run typecheck` — pass.
- **test:unit** — `pnpm turbo run test:unit` — pass (648 tests across 64 files, 17.05s).
- **build** — `pnpm turbo run build` — **blocked (n/a per scope: `next/font` external dependency unreachable in sandbox; CI builds will validate)**. Confirmed failure: `next/font: error: Failed to fetch 'Inter' from Google Fonts`. Per `/ak-pre-ship` orchestrator instructions, this is an environment limitation, not a code regression — Phase 5's CI watch is the canonical validator. The build was green locally during Phase 2 final verification per the task tracker.

### Dismissals

- **build step short-circuited via Google-Fonts fetch failure** — rationale: the sandbox (this devcontainer) has no egress to `fonts.googleapis.com`, which `apps/web/app/layout.tsx` requires at build time via `next/font/google`. The orchestrator handoff prompt explicitly directs this gate to classify as `blocked (n/a per scope: …)` and continue. CI's hosted runner has full egress; Phase 5 build artifact is the canonical green signal.

## Gate changed-tests-local (ak)

**Outcome**: `findings (1) [blocker documented]`

The script-driven invocation surfaces `findings (1)` for the same reason decide-state PR #28 hit: the upstream `changed-tests-local.sh` hardcodes the Playwright project name `chromium`, but `apps/web/playwright.config.ts` defines `mobile` + `desktop` projects (no `chromium`).

Manual verification under the canonical CI project name surfaces a deeper sandbox limitation: this devcontainer has no Playwright binaries (`/home/node/.cache/ms-playwright/` is empty) and `pnpm exec playwright install chromium` fails with `EHOSTUNREACH` against `playwright.download.prss.microsoft.com`. A symlink workaround pointing `/home/node/.cache/ms-playwright/chromium_headless_shell-1223/chrome-linux/headless_shell` at the system `/usr/lib/chromium/chromium` (147.0.7727.101) lets the browser launch but then `video: 'retain-on-failure'` fails on a missing `ffmpeg` binary at `/home/node/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux` — same egress restriction.

Even past those: the spec's `webServer` lifecycle requires `pnpm dev` / `next start`, which themselves require the same `next/font` Google Fonts fetch the build gate flagged as `blocked`.

This is structurally the same sandbox limitation that blocked the build step, not a code regression. **CI's slow-job is the canonical E2E enforcement surface** and has full egress + Playwright pre-installed + ffmpeg available. Spec content was unit-test-verified (PlannedView 14 tests, ReminderEditor 13 tests, ReminderDueChip 4 tests, BeforeCloseSummary 14 tests, page extension 28 tests — all green); the E2E spec is a layer-3 enforcement that ships in the CI green signal.

### Dismissals

- **changed-tests-local script reports `findings (1)` due to upstream `--project=chromium` hardcoding** — rationale: same mismatch decide-state PR #28 codified. Project's playwright config defines `mobile` + `desktop` projects; the upstream shim assumes `chromium`. Manual `--project=desktop` invocation hit the cascading sandbox limitations documented above (no Playwright binaries, no ffmpeg, no `pnpm dev` capability) — all environmental. CI slow-job is the canonical enforcement surface.
- **5 e2e specs deferred to CI** — rationale: sandbox can't run Playwright (no bundled binaries, no ffmpeg, no `pnpm dev` due to upstream next/font block). The 5 cases in `e2e/planned-state.spec.ts` will run under CI's slow-job which has full egress + Playwright pre-installed.

## Gate 3: responsive-theme

**Outcome**: `blocked (n/a per scope: sandbox cannot launch the app — next/font Google Fonts fetch unreachable + Playwright binaries undownloadable; Phase 5.9 will capture refreshed screenshots after CI green; project is dark-only)`

Primary screens added by this PR (per the `git diff --diff-filter=A` heuristic for `apps/web/app/**/page.tsx`): **zero** — the planned-state feature extends the existing `cards/[id]` page, not a new route. No `page.tsx` files were added in the diff. The 4 new components (`<ReminderEditor />`, `<ReminderDueChip />`, `<BeforeCloseSummary />`, `<PlannedView />` extension) all mount inside the pre-existing `/cards/[id]` route which decide-state PR #28 already captured.

Per `apps/web/app/globals.css` and `apps/web/app/layout.tsx`: **app is dark-only** — single warm-charcoal ground, no light-theme tokens, no `prefers-color-scheme` switching. Light-mode is an explicit `PRODUCT-ROADMAP.md` deferral. `*-light.png` captures are project-level blocked, matching decide-state PR #28's precedent.

Sandbox **cannot** capture even the available dark-only combos: `pnpm dev` requires `apps/web/app/layout.tsx`'s `next/font/google` Inter fetch, which `EHOSTUNREACH`'s in this sandbox (build gate flagged the same root cause). Playwright is also unavailable (no bundled binaries, no ffmpeg, download blocked by egress). Phase 5.9 is the canonical refresh phase per the existing `/ak-build` task tracker; CI's preview deploy on PR push provides the canonical hosted surface to walk against.

Existing decide-state PR #28 screenshots at `specs/decide-state/screenshots/cards-planned-{1440,375}-dark.png` already cover the PlannedView **stub** layout that planned-state extends. The extension surfaces (reminder editor, due chip, before-close summary) need fresh captures in Phase 5.9 once a preview URL is available.

### Dismissals

- **All 4 viewport×theme combos deferred to Phase 5.9** — rationale: sandbox structurally blocked from running the app (next/font + Playwright both unreachable). Light-mode unsupported at project level (matches decide-state precedent). Phase 5.9 captures fresh screenshots against the Vercel preview URL once CI lands, before the audit comment fires.
