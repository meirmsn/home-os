## Gate 3: responsive-theme

**Result**: pass

### Screenshots captured

| File                    | Viewport | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero/planned-1440.png` | 1440x900 | PLANNED card at desktop. Shows card detail with photo placeholder, description ("Dripping from the handle when turned off"), urgency badge ("soon"), decision banner ("You chose: DIY"), DIY estimate section, "Before you close" summary, action buttons row (Choose DIY, Choose Contractor, Set to Monitor, Dismiss), "Change decision" link, "Set a reminder" link, and "Mark as closed" button. Content is centered in a max-width column with comfortable margins on both sides. |
| `hero/planned-375.png`  | 375x812  | PLANNED card at mobile. Same content stacked vertically, full-width. Action buttons wrap to two rows. All text is readable, no horizontal overflow. "Mark as closed" button spans full width.                                                                                                                                                                                                                                                                                         |
| `hero/closed-1440.png`  | 1440x900 | CLOSED card at desktop. Shows card detail with photo placeholder, description ("Small crack near the shower door"), urgency/status chips ("cosmetic", "closed"), close date ("Closed on Tue, May 26"), diagnosis summary ("Hairline crack - cosmetic only"), before/after photo placeholders side-by-side ("No capture photo" / "No finished photo"), and spend card ("You spent: $85.10 / Tile repair kit and grout").                                                               |
| `hero/closed-375.png`   | 375x812  | CLOSED card at mobile. Same content stacked vertically. Before/after photo placeholders stack to single column. Spend card full-width at bottom. All text readable.                                                                                                                                                                                                                                                                                                                   |

### Responsive verification

**PLANNED card (CloseCardForm visible):**

- Desktop (1440px): Content centered in a max-width column (~600px visual width). Action buttons (Choose DIY, Choose Contractor, Set to Monitor, Dismiss) laid out horizontally in a single row. "Mark as closed" button is a full-width bordered button at the bottom.
- Mobile (375px): Content fills viewport width with horizontal padding. Action buttons wrap to multiple rows naturally. "Mark as closed" button spans full width. No horizontal scrolling, no text truncation.
- Layout difference confirmed: desktop has generous side margins; mobile uses full width with padding. Buttons reflow from single row to multi-row.

**CLOSED card (ClosedView with spend data):**

- Desktop (1440px): Before/after photo placeholders render side-by-side in a 2-column grid. Spend card ("You spent: $85.10") is full-width below the photo grid. Status chips ("cosmetic", "closed") on a single line.
- Mobile (375px): Before/after photo placeholders stack vertically (single column). Spend card full-width. All content stacked vertically with no overflow.
- Layout difference confirmed: photo grid collapses from 2-column to 1-column at mobile breakpoint.

### Dark theme compliance

Body background color verified via Playwright: `rgb(28, 27, 24)` which maps to `#1C1B18` (the warm charcoal ground defined in globals.css as `--color-background`).

Visual confirmation from screenshots:

- Dark charcoal background renders consistently across all four screenshots
- Text is light-on-dark (off-white text on dark ground) throughout
- Card surfaces use a slightly raised dark tone (visible border outlines on photo placeholders, description cards, estimate sections)
- Accent colors (urgency badge "soon" in muted gold, status chips "cosmetic"/"closed" in muted green) are subtle and cohesive with the dark palette
- "Mark as closed" button uses a teal/green accent that stands out against the dark background without being jarring
- No white flashes, no light-mode leaks, no hardcoded light colors visible

### Content verification

- PLANNED card: "Mark as closed" button (CloseCardForm trigger) is visible at both viewports
- CLOSED card: "You spent: $85.10" with description "Tile repair kit and grout" is visible at both viewports, confirming ClosedView spend data renders correctly with proper dollar formatting (two decimal places)

### Dismissals

None
