<!-- generated-by: /ak-implement (Phase 2) -->
<!-- feature: pwa-spike -->

## Task: T1 — Pure-fn helpers + unit tests

**Hat**: FE
**Depends on**: none
**Blocks**: T2, T3, T4
**Done when**: `bounce-timer.ts`, `sync-zoom-transform.ts`, `storage-path.ts` exist under `apps/web/app/(app)/spike/_lib/` with paired `.test.ts` siblings; `pnpm turbo run test:unit` green for the three files.
**Risk**: low
**Status**: done

## Task: T2 — /spike landing page + Where-Things-Happen

**Hat**: FE
**Depends on**: T1
**Blocks**: none
**Done when**: `(app)/spike/page.tsx` server-component renders the orientation paragraph + two internal links + result-doc gate reminder; sibling `page.test.tsx` passes.
**Risk**: low
**Status**: done

## Task: T3 — /spike/camera dual-path

**Hat**: FE
**Depends on**: T1
**Blocks**: none
**Done when**: `(app)/spike/camera/page.tsx` renders Path A `<input capture>` + Path B `getUserMedia` surfaces with inline dimensions / byte size / upload status; Storage upload wires through `spikePath()`; sibling `page.test.tsx` passes (jsdom — no real camera).
**Risk**: medium
**Status**: done

## Task: T4 — /spike/comparison sync-zoom + bounce

**Hat**: FE
**Depends on**: T1
**Blocks**: none
**Done when**: `(app)/spike/comparison/page.tsx` renders two stacked panels with `touch-action: none`, pointer-event sync zoom via `pinchToScale()`, opacity-swap bounce at 1200/750/400ms via `bounceTimer()` readouts, FPS overlay, "use bundled / your own" toggle. Sibling `page.test.tsx` passes.
**Risk**: medium
**Status**: done

## Task: T5 — Sample photos + result-doc skeleton

**Hat**: PM
**Depends on**: T2, T3, T4 (so the result-doc sections match what shipped)
**Blocks**: none
**Done when**: Two visibly-distinguishable JPEGs at `apps/web/public/spike/sample-left.jpg` + `sample-right.jpg`; `.gstack/pwa-spike-result.md` exists with `RESULTS-PENDING: yes` frontmatter + per-gate-item sections (Camera Path A / Path B, Storage upload, Sync zoom, Bounce 1200/750/400ms).
**Risk**: low
**Status**: done

## Task: T6 — BUILD-LOG head TODO + bookkeeping

**Hat**: PM
**Depends on**: T1–T5
**Blocks**: none
**Done when**: BUILD-LOG.md gains the D8 head TODO (mirror PR #10 pattern). `pnpm turbo run lint typecheck test:unit build` green end-to-end. CLAUDE.md `## Where Things Happen` covers every new path. PLAN.md § Active row matches the actual branch name.
**Risk**: low
**Status**: in_progress

## Decisions

<!-- One-liner per judgment call made during implementation that wasn't
     explicitly resolved in the Phase 0 D-rows. -->

- **T1 helper location**: resolved to `apps/web/app/(app)/spike/_lib/` (per spec § Files to create/modify) rather than `apps/web/lib/spike/` (per /ak-build calling note). Spec is the formal authority and matches Vitest include globs (`app/**/*.test.ts`). The `_lib/` underscore prefix excludes the directory from App Router file-based routing.
- **T1 bounce-timer drift boundary**: drift uses strict `>` comparison (interval exactly 1.5× cadence is NOT counted as drift). Spec says "swaps that arrived > 1.5× the configured cadence" — the `>` is taken literally.
- **T1 sync-zoom scale clamping**: scale is clamped to `[1, 6]`. Min 1 (image always fills panel) and max 6 (beyond which JPEG pixelation dominates) are reasonable defaults for the spike — not from the spec, but a sensible fence so the operator can't pinch into useless extremes.
- **T2 CLAUDE.md entries front-loaded**: all three spike pages' `## Where Things Happen` entries (landing + camera + comparison) added in the T2 commit so the docs-freshness check accepts T3/T4/T5 commits without requiring further CLAUDE.md edits per commit. The alternative — adding entries incrementally — would have produced three commits that each tripped the docs-freshness check.
- **T2 docs-freshness exemption strategy**: spike pages (D1: operator-only, no production link) and `apps/web/public/spike/` JPEGs (D6) are listed by EXACT FILE PATH in `.devshop-docs-freshness-exempt` rather than as directory prefixes — the check's `is_override()` uses `grep -Fxq` exact-match, not glob match. Citing the covering spec (`specs/pwa-spike/spec.md`) is what passes the adversarial reviewer's "30-second verifiability" bar.
- **T3 component splitting**: spec enumerates `CameraPathA.tsx` + `CameraPathB.tsx` as separate files under `_components/`. Each gets its OWN sibling `*.test.tsx` (not transitive exemption via parent) because the adversarial-review check rejected transitive coverage for jsdom-testable surfaces like `<input type="file">`. Direct smoke tests are cheaper than fighting the bypass system.
- **T3 + T4 Sentry.captureException → bypass trailer**: D10 forbids PostHog analytics events on spike surfaces, but D9's gotchas explicitly require `Sentry.captureException` on upload-failure / permission-denied / Storage-list-failure paths. These are error capture, not analytics. METRICS.md tracks analytics events, not Sentry captures. Used the project's `devshop.docsCoverageReason` git-config trailer (Docs-Coverage-Bypass: ...) to land the commits. Will be revisited at audit time per the trailer's contract.
- **T4 storage-list ordering for "Use your own photos"**: spec says "two most-recent uploads" — used `limit: 2` + `sortBy: { column: 'created_at', order: 'desc' }`. Created signed URLs at 10-minute TTL (no spec value; long enough for an operator session, short enough to bound exposure of the per-user spike photos).
- **T4 bounce overlay implementation**: each panel renders BOTH images stacked (the panel's "home" photo + the other panel's photo on top as bounce overlay) and opacity-swaps via the shared `bounceFrame` state. Simpler than a single floating overlay and avoids any cross-panel layout interaction; both panels alternate exactly in sync because they share the same state.
- **T5 sample JPEG colors**: slate-blue `#3a4f6b` (left) and warm-brown `#6b4f3a` (right) — solid colors only, no text annotation (ImageMagick's default font was unavailable in the devcontainer). The two-color choice is intentional: high enough contrast that the bounce swap is unambiguously visible at any cadence; muted enough that they don't visually compete with the actual operator-uploaded photos when toggled.
- **T5 `.gitignore` rule**: extended `.gitignore` with `!.gstack/` + `!.gstack/*-result.md` re-include rules placed AFTER the broad `.gstack/` exclusion. The narrow `*-result.md` glob means future spike result docs (or any `<feature>-result.md` in the `.gstack/` root) are tracked, while transient `.gstack/` runtime artifacts (browse logs, design reviews) remain ignored.
- **T6 PLAN.md branch name fix**: PLAN.md's Active row read `feat/pwa-spike`, but the actual checked-out branch is `feature/pwa-spike` (matching the project's `feature/` convention from PR #9 and PR #11). Updated PLAN.md so the source-of-truth Active row matches the branch.
