## Gate 4: /simplify

Reviewed diff between `origin/main` and `HEAD` for simplification opportunities.

### Findings (3 fixed)

1. **Dead `size` parameter on `SeverityChipOverlay`** (`DashboardCard.tsx`): The `size` prop accepted `'normal' | 'small'` but was only ever called with `'normal'`. The `'small'` branch was unreachable dead code. Removed the parameter and inlined the `'normal'` variant.

2. **Double-wrapped `WalkthroughPrompt`** (`WalkthroughPrompt.tsx` / `DashboardShell.tsx`): The `WalkthroughPrompt` component rendered a `<div>` with `rounded-lg bg-[var(--color-surface-raised)] p-5`, but its parent in `DashboardShell` already wrapped it in a container with the same styling. Simplified the component to render just a `<p>` since the parent provides the container.

3. **Incomplete comment** (`cards/[id]/page.tsx` line 171): Comment read "Server component renders once -- Date.now() is stable within a single" (truncated mid-sentence). Completed it to "...within a single request."

### Reviewed and retained (not findings)

- `humanDate` functions in `DashboardCard.tsx` and `CheckInTimeline.tsx` have different format options (month+day vs weekday+month+day) -- intentionally different, not duplication.
- `UUID_RE` duplicated across API routes -- pre-existing codebase convention, not introduced by this branch.
- `DashboardViewedCapture` uses both `useRef` guard and dependency array -- React lint compliance, ref is the real guard. Same pattern as `MonitorViewOpenedCapture`.
- Photo rendering blocks in `tier2`/`tier2-triage` branches are structurally similar but differ in inner content -- extracting a wrapper would add complexity without meaningful reduction.
- Empty JSDoc comments (`/** \n * \n */`) appear in many new files but are a low-signal cosmetic issue.

## Dismissals

None
