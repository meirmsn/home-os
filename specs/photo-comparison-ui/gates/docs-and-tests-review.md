## Gate 5: docs-and-tests-review

- Result: findings (2) fixed
- findings: high=0 medium=1 low=1 (both fixed in e20405b — see Focused fix log)

- medium / tests / apps/web/app/(app)/cards/[id]/\_components/PhotoComparison.test.tsx — The bounce _frame-swap_ (the feature's differentiator per D1) is not asserted: tests pin the toggle's aria-pressed/label and the cadence-button selection, but nothing verifies that while bouncing both panels alternate displayedSrcA↔displayedSrcB (the `bounceFrame` 0↔1 instant cut). The rAF loop + bounceSrc selection are untested. Spec § Tests line 467 ("bounce state machine: starting toggles bounceOn") is partially met (toggle pinned); the actual instant-cut alternation that makes the change "jump out" is not. Testable via fake timers / a requestAnimationFrame mock.

- low / tests / apps/web/app/(app)/cards/[id]/\_components/PhotoComparison.test.tsx — "Starting bounce while zoomed keeps the shared zoom transform" (spec § Bounce mode line 229) is not asserted. Zoom transform math is well covered by sync-zoom-transform.test.ts, but the interaction between an active zoom and bounce-on is unpinned. Low: bounceSrc/transform are independent state, so regression risk is small.

Coverage notes (adequate, not findings):

- group-touchpoints.test.ts: full matrix — grouping, min(created_at), slot map, failed-sign drop, sort, count, type hint, empty. Solid.
- sync-zoom-transform.test.ts: 13 table-driven cases (pinch in/out, identity, single-touch, MIN/MAX clamp, origin clamp, composeTransform order). Solid.
- cadence.test.ts: 1200/750/400 + 750 default + slow/fast order pinned.
- PhotoComparisonOpenedCapture.test.tsx: once-per-session sentinel, payload, no-refire, per-card separation. Solid.
- ComparePhotosLink + MonitorView/PlannedView/ClosedView tests: ≥2 gate present/absent pinned in all three views AND the shared link. The two-place gate (link) is well covered.
- compare/page.tsx (redirect <2, batch-signing, ≥2 route gate): covered by E2E only (no unit test) — consistent with the spec's "server route covered by E2E" posture; the distinct-touchpoint-count dedupe in page.tsx is trivial inline JS, acceptably E2E-covered. The Sentry-on-SELECT-error branch is unexercised (diagnostic edge, acceptable for v0).
- E2E: covers entry-link present/absent, route redirect <2, slot-missing placeholder + bounce-disabled. Does not exercise pinch-zoom or img onError fallback — both intentionally out of scope for E2E per spec (zoom math is unit-tested; onError is unit-tested in PhotoComparison.test.tsx line 235).

Docs (accurate + complete):

- CLAUDE.md: 3 photo-comparison gotchas (touch-action panel scoping, plural createSignedUrls + per-path error drop + img onError, ≥2 gate in two places) — all match the shipped code (PhotoComparison.tsx panelStyle touchAction, compare/page.tsx createSignedUrls loop dropping error entries, ComparePhotosLink + route redirect). Accurate.
- METRICS.md: photo_comparison_opened row (card_state + touchpoint_count, sessionStorage sentinel) matches PhotoComparisonOpenedCapture.tsx exactly; the new `cards SELECT errored on compare page` Sentry row matches the route's captureException tags/extra. Accurate.
- No ARCHITECTURE.md / README change required (no schema change, no new convention — consistent with spec § Files line 169 "touch only if a convention drifts").

## Dismissals

None

## Focused fix log

- Commit: `e20405b` — test(photo-comparison): assert bounce frame-swap + bounce-respects-zoom
- Production code (PhotoComparison.tsx) unchanged — test-only fix.

Findings addressed (both in apps/web/app/(app)/cards/[id]/\_components/PhotoComparison.test.tsx):

1. medium / bounce frame-swap (D1 instant cut) — FIXED. New test
   "alternates both panels A<->B on the cadence interval while bouncing" drives
   the rAF loop deterministically via a captured `requestAnimationFrame`
   callback + a mocked `performance.now()` virtual clock. Asserts: pre-bounce
   panels show own photos (a-wide / b-wide); bounce ON -> both show frame-0
   (a-wide); below 750ms cadence no swap; crossing 750ms flips both to b-wide;
   next interval flips back to a-wide. Pins the `bounceFrame` 0<->1 instant cut.

2. low / bounce-while-zoomed keeps transform (Bounce mode) — FIXED. New test
   "keeps the shared zoom transform across a bounce frame swap" pinches to
   scale(2) via pointer events, enables bounce, drives one frame swap, and
   asserts the img `src` changes (a-wide -> b-wide) while the `{scale, origin}`
   transform string is byte-identical before and after the swap.

Local test result:

- `vitest run PhotoComparison.test.tsx`: 18 passed (16 prior + 2 new).
- `pnpm turbo run test:unit`: 95 files / 947 tests passed (full suite green).
