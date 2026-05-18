// What: Server component for the calm-indigo "Revisit by [date]" chip
//       that lifts to the card-detail page header when a planned card's
//       reminder date has arrived (today or past).
// Why:  spec § D3 — the chip is the urgency cue on a card that has been
//       parked in PLANNED state with an explicit revisit date. Outline
//       only (no fill) keeps the visual weight low; the indigo hue
//       distances PLANNED from the four severity tiers (cosmetic /
//       monitor / soon / urgent — yellow-through-red).
// Does NOT: Render for future reminders (the page wires it conditionally
//           via `isReminderDue`). Doesn't fire any events; pure presentation.

import { humanReminderDate, reminderChipClasses } from './_reminder-chip';

export type ReminderDueChipProps = {
  /** Reminder date as ISO 'YYYY-MM-DD' — used to derive the chip's label
   *  via humanReminderDate(). The page is responsible for not rendering
   *  this component when the date is null or in the future; this prop is
   *  always a non-null past-or-today date. */
  plannedReminderDate: string;
};

/** Calm-indigo outline chip "Revisit by [date]" — see file header. */
export function ReminderDueChip({ plannedReminderDate }: ReminderDueChipProps) {
  const chip = reminderChipClasses(humanReminderDate(plannedReminderDate));
  return (
    <span
      data-testid="reminder-due-chip"
      className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${chip.border} ${chip.text}`}
    >
      {chip.label}
    </span>
  );
}
