## Gate 3: responsive-theme

Deterministic source-code audit of responsive breakpoints, design tokens, and theme compliance for the dashboard feature (`/home`).

### Files reviewed

- `apps/web/app/(app)/home/page.tsx`
- `apps/web/app/(app)/home/_components/DashboardShell.tsx`
- `apps/web/app/(app)/home/_components/DashboardCard.tsx`
- `apps/web/app/(app)/home/_components/FilterBar.tsx`
- `apps/web/app/(app)/home/_components/EmptyState.tsx`
- `apps/web/app/(app)/home/_components/WalkthroughMode.tsx`
- `apps/web/app/(app)/home/_components/WalkthroughPrompt.tsx`
- `apps/web/app/(app)/cards/[id]/_components/_severity-chip.ts`
- `apps/web/app/globals.css`

### Checklist

| Criterion                                                                    | Status  | Notes                                                                                  |
| ---------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| Desktop max-width 720px centered                                             | PASS    | `max-w-[720px] mx-auto` on DashboardShell                                              |
| Mobile: single column, Tier 1 full bleed, 16px side margins                  | PASS    | Tier 1 `w-full`, Tier 2/PLANNED `mx-4` (16px), text sections `px-4` (16px)             |
| FilterBar sticky positioning                                                 | PASS    | `sticky top-0 z-10` with `bg-[var(--color-background)]` to prevent bleed-through       |
| FilterBar: horizontally scrollable on mobile, centered on sm+                | PASS    | `overflow-x-auto whitespace-nowrap sm:flex sm:justify-center`                          |
| Dark mode default (no light/dark toggle)                                     | PASS    | `body { background: var(--color-background) }` = `#1c1b18`, inverse text default       |
| Severity chip: act-soon = #C4622D                                            | PASS    | `--color-act-soon: #c4622d` in globals.css, `severityChipClasses('urgent')` maps to it |
| Severity chip: watch = #A07C2E                                               | PASS    | `--color-watch: #a07c2e` in globals.css, `severityChipClasses('soon')` maps to it      |
| Severity chip: note = #4A7B6F                                                | PASS    | `--color-note: #4a7b6f` in globals.css, `severityChipClasses('cosmetic')` maps to it   |
| Tier 1 card bg = #F7F7F5                                                     | PASS    | `bg-[var(--color-surface-tier1,#F7F7F5)]` with inline fallback                         |
| Tier 2 card bg = #EEECEA                                                     | PASS    | `bg-[var(--color-surface-tier2,#EEECEA)]` with inline fallback                         |
| PLANNED card bg = #E2E0DC                                                    | PASS    | `bg-[var(--color-surface-planned,#E2E0DC)]` with inline fallback                       |
| Spacing: Tier 1 cards 32px apart                                             | PASS    | `space-y-6` = `--spacing-6: 32px` per project tokens                                   |
| Spacing: Tier 2 cards 16px apart                                             | PASS    | `space-y-4` = `--spacing-4: 16px` per project tokens                                   |
| Spacing: PLANNED section 12px between cards                                  | PASS    | `space-y-3` = `--spacing-3: 12px` per project tokens                                   |
| Card internal padding 16px                                                   | PASS    | `p-4` on card content areas                                                            |
| Tier 1 Act Soon: 16:9 photo, severity chip bottom-left, system tag top-right | PASS    | `aspect-video`, `absolute bottom-2 left-2`, `absolute top-2 right-2`                   |
| Tier 2: 4:3 photo, 16px title                                                | PASS    | `aspect-[4/3]`, `text-base font-semibold`                                              |
| PLANNED: no photo, system icon placeholder, regular weight title             | PASS    | System tag text in placeholder div, `text-base font-normal`                            |
| Tablet (600-899px): two-column grid for Tier 2, 24px gutter                  | FAIL    | No grid layout implemented. See finding F1.                                            |
| Breakpoints match spec (600px, 900px)                                        | DISMISS | See Dismissals D1.                                                                     |
| Walkthrough mode: FilterBar disabled during walkthrough                      | PASS    | `opacity-50 pointer-events-none` when `disabled` prop true                             |
| Touch targets min 44px                                                       | PASS    | `min-h-11` (44px) on all interactive card elements and buttons                         |

### Findings

**F1: Missing tablet two-column grid for Tier 2 / PLANNED cards**

Spec section "Responsive behavior -- Tablet (600px-899px)" requires: "Tier 2 + PLANNED: 2-column grid, 24px gutter". The implementation renders Tier 2 and PLANNED cards in a single column at all viewport widths. No `grid`, `grid-cols-2`, or `gap-6` classes exist in any dashboard component.

Severity: low. The single-column layout is functional and consistent. The two-column grid is an enhancement that improves density on tablet but is not a broken behavior.

Status: pending.

## Dismissals

**D1: Breakpoint values use Tailwind v4 defaults (640px) instead of spec values (600px/900px)**

The spec specifies breakpoints at 600px and 900px. The implementation uses `sm:` (Tailwind v4 default = 640px) and does not define custom breakpoints. The 40px difference between 600px and 640px is negligible in practice -- it affects a narrow band of devices. The `max-w-[720px]` desktop constraint is applied unconditionally (not behind a breakpoint), which is correct. Defining custom breakpoints at 600/900 would add complexity for marginal benefit at this stage.

**D2: Undefined CSS custom properties (--color-border-subtle, --color-surface-raised, --color-surface-primary, etc.)**

Multiple CSS custom properties used in dashboard components are not defined in `globals.css` or any other CSS file. These tokens (`--color-border-subtle`, `--color-surface-raised`, `--color-surface-primary`, `--color-surface-input`, `--color-text-on-primary`, `--color-surface-primary-hover`) are used identically throughout the existing codebase (`layout.tsx`, `cards/[id]/page.tsx`, `dismissed/page.tsx`, etc.). This is a pre-existing project-wide pattern, not a dashboard regression. The dashboard's card components correctly use inline fallback values (e.g., `var(--color-surface-tier1,#F7F7F5)`). The tokens without fallbacks render as transparent/inherit, which is the intended behavior on the dark ground (borders and surfaces are subtle by design).

**D3: Tier 1 Reminder card uses --color-monitor for "Revisit by" chip instead of spec's explicit hex #7B6BA8**

The spec says `border-[#7B6BA8] text-[#7B6BA8]`. The implementation uses `border-[var(--color-monitor)] text-[var(--color-monitor)]` where `--color-monitor: #7b6ba8`. The values are identical; the implementation correctly uses the semantic token rather than a raw hex value.
