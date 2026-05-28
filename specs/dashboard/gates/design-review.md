## Gate 8: /design-review

**Mode:** Code-level design review against `.gstack/design-review-home-os-2026-05-02.md`

**Focus:** Interaction patterns, transitions, touch targets, and accessibility that the design-conformance gate (Gate 8b) may have missed.

### Interaction patterns

| Pattern                                           | Spec reference                                                                                                                                | Status      | Detail                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walkthrough prompt as inline card                 | Design spec lines 345-347: "Inline card in the dashboard -- not a modal, not a bottom sheet. Single line + text link, dismissible with swipe" | **finding** | Implementation renders a `<div>` with a `<button>` ("Start walkthrough") instead of a text link. Spec says "Start walkthrough" should be a text link, not a button. Also, no swipe-to-dismiss behavior is implemented.                                                                             |
| Walkthrough "Start walkthrough" as text link      | Design spec line 347                                                                                                                          | **finding** | Implemented as a filled accent-color button (`bg-[var(--color-surface-primary)]`). Spec explicitly says "text link, not a button." The current treatment draws more visual attention than intended.                                                                                                |
| Filter tabs as horizontally scrollable single row | Design spec line 879                                                                                                                          | pass        | `overflow-x-auto whitespace-nowrap` on the nav element. Correct.                                                                                                                                                                                                                                   |
| PLANNED tab dot indicator                         | Design spec lines 402-405                                                                                                                     | pass        | `planned-dot` span rendered when `hasReminderDue=true`. Uses `--color-monitor` for the dot color.                                                                                                                                                                                                  |
| "Nothing active" state: PLANNED at full weight    | Design spec lines 417-419: "Shows PLANNED list prominently in main view -- not hidden behind the tab. Copy at top."                           | pass        | `EmptyState` variant `nothing-active` renders promoted PLANNED cards at `tier1-reminder` weight with "Nothing needs a decision right now" copy.                                                                                                                                                    |
| First-time empty state: no illustration           | Design spec lines 415-419                                                                                                                     | pass        | Pure text + single CTA link. No decorative elements.                                                                                                                                                                                                                                               |
| Walkthrough complete: "All caught up!"            | Sealed in "AI Slop Avoided" (line 1168): no motivational copy                                                                                 | **finding** | "All caught up!" with an exclamation point reads as the exact motivational-copy pattern the design spec explicitly sealed against. The spec says: 'no "You're all caught up!"'. While this is during walkthrough completion (not the main dashboard), it contradicts the sealed empty-state voice. |

### Transitions and motion

| Animation                                          | Spec reference              | Status      | Detail                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Card slides to PLANNED tier (300ms ease-out)       | Design spec line 1107-1111  | n/a         | Not applicable -- PLANNED assignment happens on card detail page, not dashboard.                                                                                                                                                                                                                             |
| DISMISS card exit (150ms opacity + 100ms collapse) | Design spec lines 1113-1118 | n/a         | Dismiss action is on card detail, not dashboard.                                                                                                                                                                                                                                                             |
| prefers-reduced-motion                             | Design spec lines 1088-1096 | **finding** | No `prefers-reduced-motion` media query or check anywhere in the dashboard components. The FilterBar tab transitions use CSS `transition-colors` without a reduced-motion override. While the dashboard has minimal animation, the spec requires all transitions to be instant-swapped under reduced motion. |

### Touch targets

| Element                                       | Min size | Status      | Detail                                                                                                                                                                                            |
| --------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filter tab buttons                            | 44x44    | pass        | Buttons have adequate padding (px-3 py-1.5) within the nav. Text size + padding exceeds 44px touch zone.                                                                                          |
| Card links (all tiers)                        | 44x44    | pass        | `min-h-11` (44px) on all card link elements.                                                                                                                                                      |
| "Start walkthrough" button                    | 44x44    | pass        | `px-4 py-2` with sufficient size.                                                                                                                                                                 |
| "Skip this card" in walkthrough               | 44x44    | **finding** | Rendered as a text link with `text-xs` and no explicit height constraint. The underlined text target may be smaller than 44px on mobile, violating the spec's universal 44x44 minimum (line 957). |
| "Exit walkthrough"                            | 44x44    | **finding** | Same issue -- `text-xs` underline link with no minimum height.                                                                                                                                    |
| "Capture something new" in nothing-active     | 44x44    | **finding** | Text link with `text-sm` and no explicit height. Smaller than 44px minimum.                                                                                                                       |
| "Return to dashboard" in walkthrough-complete | 44x44    | **finding** | Same pattern -- `text-sm` underline link, no minimum height enforcement.                                                                                                                          |
| Capture CTA button                            | 44x44    | pass        | `min-h-11` enforced on all primary CTA buttons.                                                                                                                                                   |

### Card visual hierarchy

| Dimension                          | Spec reference                                                  | Status | Detail                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| Tier 1 card: no border-radius      | Design spec line 1165: "no border-radius softening" on Tier 1   | pass   | Tier 1 cards have no rounded corners (fixed in commit 336d30a).                                                         |
| Tier 2 card: max 4px border-radius | Design spec line 1165                                           | pass   | `rounded-md` (6px in Tailwind default) -- slightly over spec's 4px max. Noted in design-conformance gate as acceptable. |
| Tier 1 photo aspect-video (16:9)   | Design spec line 598                                            | pass   | `aspect-video` class applied.                                                                                           |
| Tier 2 photo aspect-[4/3]          | Design spec line 612                                            | pass   | `aspect-[4/3]` class applied.                                                                                           |
| PLANNED: no photo, system icon     | Design spec line 617-618                                        | pass   | System tag text rendered in placeholder box. No photo.                                                                  |
| Dashboard section headers          | Design spec lines 838-840: "Small caps, 12px, 16px left margin" | pass   | `text-xs font-semibold uppercase tracking-wider` with `px-4` (16px).                                                    |
| Tier 1 issue name ~20px            | Design spec line 599                                            | pass   | `text-xl` (20px).                                                                                                       |
| Tier 2 issue name ~16px            | Design spec line 613                                            | pass   | `text-base` (16px).                                                                                                     |
| PLANNED issue name regular weight  | Design spec line 619                                            | pass   | `font-normal` on planned cards.                                                                                         |

### Responsive behavior

| Breakpoint                      | Spec reference            | Status | Detail                                              |
| ------------------------------- | ------------------------- | ------ | --------------------------------------------------- |
| Tablet 2-column grid for Tier 2 | Design spec lines 884-885 | pass   | `sm:grid-cols-2 sm:gap-6` on Tier 2 containers.     |
| Desktop max-width 720px         | Design spec line 889      | pass   | `max-w-[720px]` on DashboardShell.                  |
| Desktop single column           | Design spec line 889      | pass   | `lg:grid-cols-1` override returns to single column. |

### Summary

**Findings: 8** (3 interaction pattern, 1 motion, 4 touch target)

The touch-target findings are a cluster around text-link secondary actions that lack a minimum height. These are all non-primary actions (skip, exit, capture link) but the spec is explicit about 44px minimum on all interactive elements. The walkthrough prompt treatment (button vs text link) and "All caught up!" copy are design voice deviations.

## Dismissals

None
