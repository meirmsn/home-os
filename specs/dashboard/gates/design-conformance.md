## Gate 8b: design-conformance

**Status:** findings (2) pending

Checked implementation in `apps/web/app/(app)/home/` against design spec
`.gstack/design-review-home-os-2026-05-02.md` (lines 386-448, 562-575,
595-635, 700-760, 838-845, 866-900).

### Conformance checklist

| Dimension                       | Spec                                                           | Implementation                                                                                  | Verdict |
| ------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------- |
| Tier 1 title size/weight        | ~20px, medium-heavy                                            | `text-xl font-semibold` (20px/600)                                                              | PASS    |
| Tier 2 title size/weight        | ~16px, same weight                                             | `text-base font-semibold` (16px/600)                                                            | PASS    |
| PLANNED title size/weight       | ~16px, regular weight                                          | `text-base font-normal` (16px/400)                                                              | PASS    |
| Severity chip colors            | #C4622D / #A07C2E / #4A7B6F                                    | `--color-act-soon` / `--color-watch` / `--color-note` mapped to exact hex values in globals.css | PASS    |
| Severity chip position (Tier 1) | Bottom-left over photo                                         | `absolute bottom-2 left-2`                                                                      | PASS    |
| Severity chip (Tier 2)          | Present, same color, smaller                                   | SmallSeverityChip with `text-[10px]`, same color system                                         | PASS    |
| Tier1-to-Tier2 spacing          | 32px (space-6)                                                 | `space-y-4` (16px margin) + `pt-4` (16px padding) = 32px effective                              | PASS    |
| Between Tier 2 cards            | 16px (space-4)                                                 | `gap-4` (16px)                                                                                  | PASS    |
| PLANNED header-to-card          | 12px (space-3)                                                 | PlannedTab `gap-3` (12px)                                                                       | PASS    |
| Card internal padding           | 16px (space-4)                                                 | `p-4` (16px)                                                                                    | PASS    |
| Section headers: size           | 12px                                                           | `text-xs` (12px)                                                                                | PASS    |
| Section headers: case           | Small caps                                                     | `uppercase tracking-wider` (functionally equivalent)                                            | PASS    |
| Section headers: left margin    | 16px                                                           | `px-4` (16px)                                                                                   | PASS    |
| Section headers: color          | --text-secondary-inverse                                       | `text-[var(--color-text-secondary-inverse)]`                                                    | PASS    |
| Filter bar: sticky              | Sticky below top nav                                           | `sticky top-0 z-10`                                                                             | PASS    |
| Filter bar: mobile scroll       | Horizontally scrollable, no wrap                               | `overflow-x-auto whitespace-nowrap`                                                             | PASS    |
| Filter bar: tablet              | Full row, no scroll                                            | `sm:flex sm:justify-center`                                                                     | PASS    |
| Planned dot indicator           | Dot when reminder due                                          | `hasReminderDue` drives 1.5x1.5 rounded dot                                                     | PASS    |
| Empty state: first-time         | No illustration, centered prompt, single CTA                   | Centered text + "Start capture" link, no illustration                                           | PASS    |
| Empty state: nothing-active     | "Nothing needs a decision right now." + PLANNED at full weight | Matches: promoted cards use `tier="tier1-reminder"`                                             | PASS    |
| Tier 1 photo aspect             | 16:9                                                           | `aspect-video` (16:9)                                                                           | PASS    |
| Tier 2 photo aspect             | 4:3                                                            | `aspect-[4/3]`                                                                                  | PASS    |
| Reminder chip                   | Calm indigo, outline only                                      | `border-[var(--color-monitor)]` outline, no fill                                                | PASS    |
| PLANNED chip                    | Outline only, neutral                                          | `border-[var(--color-border-subtle)]`, no fill                                                  | PASS    |
| Desktop max width               | 720px centered                                                 | `max-w-[720px] mx-auto` on DashboardShell                                                       | PASS    |
| Tablet 2-column                 | Tier 2 reflows to 2-col at 600px+                              | `sm:grid-cols-2 sm:gap-6` (sm = 640px, close match)                                             | PASS    |
| Desktop single column           | All cards single column within 720px                           | `lg:grid-cols-1`                                                                                | PASS    |

### Findings

**F1: Tier 1 cards have `rounded-lg` — spec says "no border-radius softening"**

- File: `apps/web/app/(app)/home/_components/DashboardCard.tsx` lines 41, 49, 83
- Spec line 598: "Full viewport width, photo at 16:9, no border-radius softening"
- Implementation: card wrapper has `rounded-lg` (8px), photo has `rounded-t-lg`
- Tokens file (`packages/ui/src/tokens.ts` line 73-76): radius spec is `none` for Tier 1
- Impact: Visual — softens the full-bleed edge-to-edge authority the spec intends for Tier 1 cards. Tier 2 and PLANNED correctly use `rounded-md` (4px / `radius-sm`).
- Fix: Replace `rounded-lg` with `rounded-none` on Tier 1 card wrappers; remove `rounded-t-lg` from Tier 1 photos.

**F2: TRIAGE_PENDING chip uses filled background — spec says "outline only"**

- File: `apps/web/app/(app)/home/_components/DashboardCard.tsx` line 143
- Spec line 635: "TRIAGE_PENDING chip: outline only, neutral (#8A8880) — no severity implied"
- Implementation: `bg-[var(--color-surface-input)]` (filled background), no border
- Impact: Visual — filled chip implies a state category similar to severity chips; outline-only would correctly distinguish "pending" from "assessed" at scan speed.
- Fix: Replace `bg-[var(--color-surface-input)]` with `border border-[var(--color-text-secondary-inverse)]` and remove the fill.

## Dismissals

**D1: `uppercase tracking-wider` vs CSS `font-variant: small-caps` for section headers** — The spec says "Small caps, 12px." The implementation uses `text-xs uppercase tracking-wider`, which renders all-uppercase 12px text with wider tracking. True CSS `small-caps` would keep the typed case and render lowercase letters as smaller uppercase glyphs. However, since all section header labels are short phrases that read identically in either treatment ("ACT SOON", "NEEDS CHECK-IN", "TRIAGE PENDING"), the visual result is indistinguishable for these strings. No user-facing impact. Dismissed.

**D2: Tablet breakpoint is `sm` (640px) vs spec's 600px** — Tailwind v4's default `sm` breakpoint is 640px; the spec defines tablet at 600px. The 40px delta is negligible for the reflow behavior (2-column grid). Customizing the breakpoint would add configuration complexity for no material UX difference. Dismissed.

**D3: `--color-surface-input` / `--color-surface-primary` / `--color-surface-raised` tokens are not defined in `@theme`** — Several components reference CSS variables that are not in `globals.css @theme` (e.g., `--color-surface-input`, `--color-surface-primary`, `--color-text-on-primary`). These appear to resolve from browser-level or framework-level defaults, or may render as `unset`. This is a broader token gap across the app, not dashboard-specific. Noted but dismissed from this gate as it affects all surfaces equally and is not a design-conformance delta introduced by the dashboard feature.
