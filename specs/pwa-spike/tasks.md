<!-- generated-by: /ak-implement (Phase 2) -->
<!-- feature: pwa-spike -->

## Task: T1 — Pure-fn helpers + unit tests

**Hat**: FE
**Depends on**: none
**Blocks**: T2, T3, T4
**Done when**: `bounce-timer.ts`, `sync-zoom-transform.ts`, `storage-path.ts` exist under `apps/web/app/(app)/spike/_lib/` with paired `.test.ts` siblings; `pnpm turbo run test:unit` green for the three files.
**Risk**: low
**Status**: in_progress

## Task: T2 — /spike landing page + Where-Things-Happen

**Hat**: FE
**Depends on**: T1
**Blocks**: none
**Done when**: `(app)/spike/page.tsx` server-component renders the orientation paragraph + two internal links + result-doc gate reminder; sibling `page.test.tsx` passes.
**Risk**: low
**Status**: todo

## Task: T3 — /spike/camera dual-path

**Hat**: FE
**Depends on**: T1
**Blocks**: none
**Done when**: `(app)/spike/camera/page.tsx` renders Path A `<input capture>` + Path B `getUserMedia` surfaces with inline dimensions / byte size / upload status; Storage upload wires through `spikePath()`; sibling `page.test.tsx` passes (jsdom — no real camera).
**Risk**: medium
**Status**: todo

## Task: T4 — /spike/comparison sync-zoom + bounce

**Hat**: FE
**Depends on**: T1
**Blocks**: none
**Done when**: `(app)/spike/comparison/page.tsx` renders two stacked panels with `touch-action: none`, pointer-event sync zoom via `pinchToScale()`, opacity-swap bounce at 1200/750/400ms via `bounceTimer()` readouts, FPS overlay, "use bundled / your own" toggle. Sibling `page.test.tsx` passes.
**Risk**: medium
**Status**: todo

## Task: T5 — Sample photos + result-doc skeleton

**Hat**: PM
**Depends on**: T2, T3, T4 (so the result-doc sections match what shipped)
**Blocks**: none
**Done when**: Two visibly-distinguishable JPEGs at `apps/web/public/spike/sample-left.jpg` + `sample-right.jpg`; `.gstack/pwa-spike-result.md` exists with `RESULTS-PENDING: yes` frontmatter + per-gate-item sections (Camera Path A / Path B, Storage upload, Sync zoom, Bounce 1200/750/400ms).
**Risk**: low
**Status**: todo

## Task: T6 — BUILD-LOG head TODO + bookkeeping

**Hat**: PM
**Depends on**: T1–T5
**Blocks**: none
**Done when**: BUILD-LOG.md gains the D8 head TODO (mirror PR #10 pattern). `pnpm turbo run lint typecheck test:unit build` green end-to-end. CLAUDE.md `## Where Things Happen` covers every new path.
**Risk**: low
**Status**: todo

## Decisions

<!-- Append a one-liner per judgment call made during implementation. -->

- T1: helper location resolved to `apps/web/app/(app)/spike/_lib/` (per spec § Files to create/modify) rather than `apps/web/lib/spike/` (per /ak-build calling note). Spec is the formal authority and matches Vitest include globs (`app/**/*.test.ts`). The `_lib/` underscore prefix excludes the directory from App Router file-based routing.
