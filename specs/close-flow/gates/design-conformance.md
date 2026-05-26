## Gate 8b: design-conformance

**Result: PASS (with pre-existing finding noted)**

### Components audited

1. **CloseCardForm** (`apps/web/app/(app)/cards/[id]/_components/CloseCardForm.tsx`)
2. **ClosedView** (`apps/web/app/(app)/cards/[id]/_components/ClosedView.tsx`)
3. **BeforeAfterPhotos** (`apps/web/app/(app)/cards/[id]/_components/BeforeAfterPhotos.tsx`)

### Hardcoded color check

**No hardcoded hex colors found** in any of the three components. All color references use `var(--color-*)` CSS variables via Tailwind arbitrary-value syntax.

### "Closed" chip uses --color-note

The "Closed" chip in ClosedView (line 62-65) uses:

- Background: `bg-[var(--color-note)]/20` (20% opacity note color)
- Text: `text-[var(--color-note)]`

`--color-note` is defined in `globals.css` line 28 as `#4a7b6f` (muted teal-green) and in `tokens.ts` as `colors.severity.note`. PASS.

### CSS variable inventory

All CSS variables used across the three components:

| Variable                       | Defined in globals.css @theme | Defined in tokens.ts              | Used in                                      |
| ------------------------------ | ----------------------------- | --------------------------------- | -------------------------------------------- |
| `--color-note`                 | Yes (line 28)                 | Yes (`severity.note`)             | CloseCardForm, ClosedView                    |
| `--color-border-default`       | Yes (line 41)                 | Yes (`border.default`)            | CloseCardForm                                |
| `--color-background-raised`    | Yes (line 15)                 | Yes (`background.raised`)         | CloseCardForm                                |
| `--color-text-primary-inverse` | Yes (line 36)                 | Yes (`text.primaryInverse`)       | CloseCardForm, ClosedView                    |
| `--color-text-secondary`       | Yes (line 37)                 | Yes (`text.secondary`)            | CloseCardForm, ClosedView, BeforeAfterPhotos |
| `--color-act-soon`             | Yes (line 26)                 | Yes (`severity.actSoon`)          | CloseCardForm (error state)                  |
| `--color-border-subtle`        | **No**                        | Yes (`border.subtle`)             | CloseCardForm, ClosedView, BeforeAfterPhotos |
| `--color-surface-raised`       | **No**                        | No (closest: `background.raised`) | CloseCardForm, ClosedView, BeforeAfterPhotos |
| `text-white`                   | Tailwind built-in             | N/A                               | CloseCardForm (submit button)                |

### Pre-existing finding: `--color-border-subtle` and `--color-surface-raised` undefined in globals.css

These two CSS variables are NOT defined in the `globals.css` `@theme` block. However, this is a **pre-existing project-wide pattern**, not introduced by close-flow. The same variables are used in:

- `apps/web/app/(app)/layout.tsx` (header border, settings link)
- `apps/web/app/(app)/capture/_components/CaptureForm.tsx`
- `apps/web/app/(app)/capture/_components/ExistingCardPicker.tsx`
- `apps/web/app/(app)/dismissed/page.tsx`
- `apps/web/app/(app)/cards/[id]/page.tsx` (multiple occurrences)

`--color-border-subtle` maps to `tokens.ts` `border.subtle = 'rgba(255,255,255,0.06)'`. `--color-surface-raised` has no exact tokens.ts equivalent (the closest is `background.raised = '#242320'`).

The close-flow components correctly follow the established project convention by using these same variables. The missing globals.css definitions are a pre-existing gap that should be addressed project-wide, not attributed to close-flow.

### `text-white` usage

CloseCardForm line 223 uses `text-white` (Tailwind built-in) on the submit button. This is a raw Tailwind color rather than a project token. However, `text-white` on a `bg-[var(--color-note)]` button is a standard accessible contrast pairing and is not a hardcoded hex value in the source.

### Dismissals

- **`--color-border-subtle` and `--color-surface-raised` missing from globals.css @theme**: Dismissed as pre-existing. These are used across 8+ files in the project predating close-flow. Not a close-flow regression.
- **`text-white` on submit button**: Dismissed. Tailwind semantic color, not a hardcoded hex. Standard practice for button text on colored backgrounds.
