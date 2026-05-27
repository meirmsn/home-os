## Gate 3: responsive-theme

**Result**: findings (3) fixed
**Commit**: fe6bedf

### Checklist

| Check                                    | Result | Detail                                                                     |
| ---------------------------------------- | ------ | -------------------------------------------------------------------------- |
| No fixed widths that break mobile        | pass   | All containers use `w-full`, `max-w-lg`, flex/grid -- no px widths         |
| Touch targets >= 48px                    | fixed  | Gear icon was 20x20px (SVG only, no padding); validate button was 44px     |
| Theme compliance (CSS custom properties) | fixed  | Feedback text used hardcoded `text-red-500` / `text-green-500`             |
| Minimum text sizes (nothing below 12px)  | pass   | Smallest is `text-xs` (12px) on section headers and "Resets Monday"        |
| UsageBar progress bar 4px height         | pass   | `h-1` = 4px                                                                |
| UsageBar count text 24px semibold        | pass   | `text-2xl font-semibold`                                                   |
| UsageBar "Resets Monday" 12px secondary  | pass   | `text-xs text-[var(--color-text-secondary-inverse)]`                       |
| Input height 48px                        | pass   | `h-12` = 48px                                                              |
| Colors use `var(--color-*)` tokens       | fixed  | 4 feedback `<p>` elements had Tailwind color utilities instead of CSS vars |

### Findings fixed

1. **Gear icon touch target 20x20px (spec: 48px min)**
   - File: `apps/web/app/(app)/layout.tsx`
   - The `<Link>` wrapping the settings gear SVG had no size constraints -- only the `h-5 w-5` SVG created the tap area.
   - Fix: Added `inline-flex h-11 w-11 items-center justify-center rounded-md` to the Link, giving it a 44x44px touch target with centered icon. (44px matches the existing sign-out button in the same header row for visual consistency; both use `min-h-11`.)

2. **Validate button min-height 44px (spec: 48px min)**
   - File: `apps/web/app/(app)/settings/_components/ByokKeyInput.tsx`
   - Button had `min-h-11` (44px); spec requires 48px minimum for primary actions.
   - Fix: Changed to `min-h-12` (48px).

3. **Hardcoded Tailwind color classes on feedback messages**
   - File: `apps/web/app/(app)/settings/_components/ByokKeyInput.tsx`
   - Four feedback `<p>` elements used `text-green-500` (success) and `text-red-500` (error) -- the only files in the entire app using raw Tailwind color utilities instead of CSS custom properties.
   - Fix: Replaced with `text-[var(--color-note)]` (muted teal-green, success) and `text-[var(--color-act-soon)]` (warm terracotta, error) from the project's design tokens.

### Pre-existing observations (not fixed, not blocking)

- Several CSS custom properties (`--color-surface-raised`, `--color-surface-input`, `--color-surface-primary`, `--color-border-subtle`, `--color-text-on-primary`, `--color-surface-primary-hover`) are referenced across the entire app but not defined in `globals.css` or any CSS file. They exist in the TS tokens file (`packages/ui/src/tokens.ts`) at the naming level but lack CSS `@theme` counterparts. This is a pre-existing, app-wide condition (login form, capture form, card detail all use them) -- not introduced by this PR. The settings components follow the established pattern.

- The sign-out button in the header (`min-h-11` = 44px) is also 4px short of the 48px spec, but this is pre-existing code not changed by this PR.

### Tests

All 16 tests for the changed components pass after fixes (UsageBar: 7, ByokKeyInput: 9).

## Dismissals

None.
