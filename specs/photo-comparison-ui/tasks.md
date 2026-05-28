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
**Status**: done

## Task: <PhotoComparison> side-by-side + synced pinch-zoom/pan

**Hat**: FE
**Depends on**: Task 1
**Done when**: full-bleed layout (issue name / panels / dates / wordmark);
two `<img>` share one `{scale,originX,originY}`; Pointer Events pinch+pan;
`touch-action:none` on panels only; unit tests for layout + default pair.
**Risk**: medium
**Status**: done

## Task: Bounce mode + cadence picker

**Hat**: FE
**Depends on**: Task 2
**Done when**: rAF loop swapping frame on `performance.now()` deltas; instant cut;
segmented cadence picker (1200/750/400, default 750); bounce respects zoom; unit
tests assert state machine + cadence values.
**Risk**: medium
**Status**: done

## Task: Date pickers + slot selector + missing-photo edge cases

**Hat**: FE
**Depends on**: Tasks 2, 3
**Done when**: two date pickers (photo-bearing only, distinct, default
earliest↔latest); slot selector wide/medium/closeup default wide; missing-slot
greying + placeholder; bounce disabled when either panel missing slot; img onError
fallback; unit tests.
**Risk**: medium
**Status**: done

## Task: Compare sub-route wiring + entry points

**Hat**: FE | BE
**Depends on**: Tasks 1, 2, 3, 4
**Done when**: `page.tsx` computes `photoTouchpointCount` + threads into 3 views;
Monitor/Planned/ClosedView render "Compare photos" link gated >= 2; compare route
renders real `<PhotoComparison>`; view tests for link present/absent.
**Risk**: low
**Status**: done

## Task: Metrics event + unit-test sweep + E2E

**Hat**: FE | PM
**Depends on**: Tasks 1-5
**Done when**: `PhotoComparisonOpenedCapture` + test (once-per-session sentinel);
`photo_comparison_opened` fired from `<PhotoComparison>`; METRICS.md row + Sentry
surface row; CLAUDE.md gotchas; `photo-comparison.spec.ts` E2E; full unit suite green.
**Risk**: low
**Status**: done

## Decisions

- **Ported the spike's sync-zoom transform math into `compare/_lib/` rather than
  importing from `/spike`.** The `/spike` surface is operator-only and slated for
  deletion (its own header marks it "deleted with photo-comparison-ui, D8"), so
  importing across that boundary would couple the feature to a deletable path.
  Copied `sync-zoom-transform.ts` + its table-driven test into the feature lib.
- **Bounce shows the SAME alternating frame in BOTH panels** (rather than each
  panel keeping its own static photo while a third element bounces). The spec's
  "instant-cut alternation between the two dates' photo" reads most naturally as
  a side-by-side flip both panels participate in, matching the spike's opacity-
  swap model converted to an instant src swap.
- **Effective bounce state is derived (`isBouncing = bounceOn && bounceEnabled`),
  not synced via setState-in-effect.** ESLint's react-hooks rule flags
  setState-in-effect as cascading-render risk; deriving the effective flag is the
  boring fix and avoids a dead "on" toggle when a slot switch removes a photo.
- **Used the real design tokens `--color-background-raised` / `--color-border-
default`** (not the `--color-surface-raised` / `--color-border-subtle` that
  existing card views reference but which are undefined in globals.css). The new
  component uses the tokens that actually resolve.
- **`<img onError>` reuses the missing-slot placeholder path (G9)** keyed by URL,
  so an expired signed URL greys that panel rather than showing a broken-image
  glyph, and a re-selection of a still-live photo recovers.
