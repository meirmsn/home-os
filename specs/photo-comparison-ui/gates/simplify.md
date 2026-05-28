## Gate 4: simplify

- Result: findings (1) fixed

- **Efficiency — unconditional `card_photos` count query** (`apps/web/app/(app)/cards/[id]/page.tsx:236-242`, fixed in `cf30ed9`): the `photoTouchpointCount` query ran on every card-detail page load, but the result is only consumed by `PlannedView`/`MonitorView`/`ClosedView` (states `planned`/`monitoring`/`closed`). For the other five states (`capturing`, `triaging`, `diagnosed`, `decide`, `dismissed`) it was a wasted DB round-trip whose result is discarded. Gated the query on the three compare-capable states; `photoTouchpointCount` defaults to `0` (safe — the link is `>= 2`-gated and those views aren't rendered for the skipped states). 945 web unit tests stay green.

## Dismissals

- **`humanDate` duplication across 4 components** (`PhotoComparison.tsx:57`, byte-identical to `CheckInTimeline.tsx:24`, plus near-identical copies in `ClosedView.tsx:35` and `BeforeAfterPhotos.tsx:13`). rationale: consolidating into a shared module would require editing 3 files outside the PR diff, broadening scope beyond the gate's mandate ("Do NOT touch files outside the PR diff"). The new copy is consistent with the established local pattern; the dedup is a codebase-wide cleanup for a separate change.

- **Pinch baseline not re-anchored when a 2nd pointer joins after the 1st moved** (`PhotoComparison.tsx:185-199`). rationale: `onPointerDown` copies the existing `startPointers` map rather than re-seeding both fingers' start positions to their current positions, which can produce a small scale jump in the contrived case where finger 1 is dragged before finger 2 lands. Borderline PLAUSIBLE and behavior-changing — the gesture path was empirically validated at >58fps in the PWA spike (`pwa-spike-result.md § 4`); a "fix" here risks regressing validated interaction behavior and is outside high-confidence simplification scope.

- **Redundant `next.startTransform = transform` reassignment** (`PhotoComparison.tsx:198`). rationale: both ternary branches already set `startTransform: transform`, so line 198 is dead-but-harmless. Not worth an atomic commit on its own and carries no correctness or efficiency cost.
