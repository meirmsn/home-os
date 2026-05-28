## Gate 11: convention

**Result: findings (2) fixed**

Checked diff `origin/main...HEAD` (excluding tests/specs) against CLAUDE.md
project conventions. Two finding categories fixed in commit `c5b106e`:

### Finding 1: Raw hex `#7B6BA8` instead of design token `var(--color-monitor)`

Three occurrences of `#7B6BA8` used directly instead of the CSS custom
property `--color-monitor` (defined in `globals.css` with the same value).

- `FilterBar.tsx` line 64 -- `bg-[#7B6BA8]` on the planned-tab dot
- `DashboardCard.tsx` line 97 -- `border-[#7B6BA8]` and `text-[#7B6BA8]` on
  the reminder chip

All replaced with `var(--color-monitor)`.

### Finding 2: Missing `data-testid` on interactive elements

Two navigational `<Link>` elements lacked `data-testid`:

- `DashboardShell.tsx` `+ Capture` button in AttentionTab -- added
  `data-testid="capture-cta-attention"`
- `EmptyState.tsx` `Start capture` button in first-time variant -- added
  `data-testid="capture-cta-first-time"`

### Verified clean after fix

- `pnpm turbo run test:unit` -- 893/893 tests pass
- Typecheck, ESLint, Prettier, gitleaks all pass via pre-commit hook

## Dismissals

| Item                                                                                                    | Reason                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostHog import split (`import posthog from 'posthog-js'` vs `import { posthog } from '@/lib/posthog'`)  | Both patterns coexist in pre-existing mainline code (SignInCompletedCapture uses `@/lib/posthog`; DecideViewOpenedCapture, ChoosePath, ReminderEditor, CloseCardForm use `posthog-js` directly). `@/lib/posthog` re-exports the same instance. Not a new divergence. |
| Empty JSDoc blocks (`/**\n *\n */`) on helper functions                                                 | Pre-existing convention across the codebase (ChoosePath, ReminderEditor, etc. on main). The project CLAUDE.md says "only add [file header comments] when WHY is non-obvious" -- the empty blocks are placeholders, not superfluous explanations.                     |
| Undefined CSS vars (`--color-surface-raised`, `--color-border-subtle`, `--color-surface-primary`, etc.) | Used extensively in pre-existing mainline files (layout.tsx, ByokKeyInput.tsx, UsageBar.tsx). These are design-system tokens that resolve through Tailwind v4 or the browser's CSS fallback mechanism. Not introduced by this diff.                                  |
| Component export style (named exports throughout)                                                       | Consistent: all new components use named exports, matching the codebase convention. No violations.                                                                                                                                                                   |
| Supabase query patterns                                                                                 | All new files use `createClient` from `@/lib/supabase/server`, handle `error` returns, use `maybeSingle()` appropriately. TriagePendingBadge correctly handles `count ?? 0`. No violations.                                                                          |
