// What: Shared lookup mapping a card severity tier to the Tailwind/CSS-var
//       class triple ({bg, text, label}) used by the severity chip across
//       page.tsx + <DiagnosedThread /> + <DecideView /> + <PlannedView />.
//       Mirrors packages/ui/src/tokens.ts severity palette.
// Why:  This file extracts a function that was independently copy-pasted
//       into 4 sibling files. Two copies (DecideView/PlannedView) drifted
//       to non-existent token names (--color-soon, --color-urgent) which
//       silently rendered uncolored chips. Single source of truth prevents
//       the class of drift.
// Does NOT: Export the chip <span> JSX — callers render the markup
//           themselves (the wrapping element differs between page.tsx's
//           <SeverityChip> and DecideView's inline rendering).

export type Severity = 'cosmetic' | 'monitor' | 'soon' | 'urgent';

/** Tailwind-class triple for the severity chip. `bg` and `text` are
 *  arbitrary-value classes consuming the project's CSS-var tokens; the
 *  `label` is the lowercase display string (kept here so all callers
 *  agree on capitalization). */
export type SeverityChipClasses = {
  bg: string;
  text: string;
  label: string;
};

/** Resolve the chip color triple for a given severity tier. */
export function severityChipClasses(severity: Severity): SeverityChipClasses {
  switch (severity) {
    case 'cosmetic':
      return {
        bg: 'bg-[var(--color-note)]/20',
        text: 'text-[var(--color-note)]',
        label: 'cosmetic',
      };
    case 'monitor':
      return {
        bg: 'bg-[var(--color-monitor)]/20',
        text: 'text-[var(--color-monitor)]',
        label: 'monitor',
      };
    case 'soon':
      return {
        bg: 'bg-[var(--color-watch)]/20',
        text: 'text-[var(--color-watch)]',
        label: 'soon',
      };
    case 'urgent':
      return {
        bg: 'bg-[var(--color-act-soon)]/20',
        text: 'text-[var(--color-act-soon)]',
        label: 'urgent',
      };
  }
}
