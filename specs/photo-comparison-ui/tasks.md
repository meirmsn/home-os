# Tasks: photo-comparison-ui

Derived from `spec.md § Task order` (6 tasks). Each task = one atomic commit.
Per-task unit tests green before commit; `pnpm turbo run test:unit` green after each.

## Task: Photo-touchpoint data layer (group-touchpoints + compare route shell)

**Hat**: Data | BE
**Depends on**: none
**Blocks**: all
**Done when**: `group-touchpoints.test.ts` green (grouping, min(created_at), slot
map, failed-sign drop, sort, count); `compare/page.tsx` compiles + redirects on
< 2 touchpoints; renders a temporary stub.
**Risk**: low
**Status**: todo

## Task: <PhotoComparison> side-by-side + synced pinch-zoom/pan

**Hat**: FE
**Depends on**: Task 1
**Done when**: full-bleed layout (issue name / panels / dates / wordmark);
two `<img>` share one `{scale,originX,originY}`; Pointer Events pinch+pan;
`touch-action:none` on panels only; unit tests for layout + default pair.
**Risk**: medium
**Status**: todo

## Task: Bounce mode + cadence picker

**Hat**: FE
**Depends on**: Task 2
**Done when**: rAF loop swapping frame on `performance.now()` deltas; instant cut;
segmented cadence picker (1200/750/400, default 750); bounce respects zoom; unit
tests assert state machine + cadence values.
**Risk**: medium
**Status**: todo

## Task: Date pickers + slot selector + missing-photo edge cases

**Hat**: FE
**Depends on**: Tasks 2, 3
**Done when**: two date pickers (photo-bearing only, distinct, default
earliest↔latest); slot selector wide/medium/closeup default wide; missing-slot
greying + placeholder; bounce disabled when either panel missing slot; img onError
fallback; unit tests.
**Risk**: medium
**Status**: todo

## Task: Compare sub-route wiring + entry points

**Hat**: FE | BE
**Depends on**: Tasks 1, 2, 3, 4
**Done when**: `page.tsx` computes `photoTouchpointCount` + threads into 3 views;
Monitor/Planned/ClosedView render "Compare photos" link gated >= 2; compare route
renders real `<PhotoComparison>`; view tests for link present/absent.
**Risk**: low
**Status**: todo

## Task: Metrics event + unit-test sweep + E2E

**Hat**: FE | PM
**Depends on**: Tasks 1-5
**Done when**: `PhotoComparisonOpenedCapture` + test (once-per-session sentinel);
`photo_comparison_opened` fired from `<PhotoComparison>`; METRICS.md row + Sentry
surface row; CLAUDE.md gotchas; `photo-comparison.spec.ts` E2E; full unit suite green.
**Risk**: low
**Status**: todo

## Decisions

(judgment calls recorded here as they happen)
