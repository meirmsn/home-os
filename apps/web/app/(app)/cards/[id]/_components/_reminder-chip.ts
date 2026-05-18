// What: Shared lookup mapping the reminder-due state to the Tailwind/
//       CSS-var class triple used by <ReminderDueChip /> in the card
//       detail header. Mirrors _severity-chip.ts posture so both chip
//       families share one drift-resistant lookup pattern.
// Why:  Only one chip variant ships today (calm-indigo outline using
//       --color-planned), but codifying the lookup matches the
//       _severity-chip.ts convention and gives PR #4 (dashboard tier-1
//       lift) a re-use anchor when the same chip needs to appear on
//       dashboard cards. Single source of truth prevents the class of
//       drift that bit _severity-chip.ts pre-refactor (--color-soon /
//       --color-urgent — tokens that don't exist).
// Does NOT: Export the chip <span> JSX — <ReminderDueChip /> owns the
//           markup. This file is a class triple only.

/** Tailwind-class triple for the reminder-due chip. `border` and `text`
 *  are arbitrary-value classes consuming `--color-planned`; `label`
 *  drives the chip's display copy (kept here so all callers agree on
 *  capitalization and prefix). */
export type ReminderChipClasses = {
  border: string;
  text: string;
  label: string;
};

/** Resolve the chip class triple for a reminder-due indicator. The
 *  `humanDate` argument is the formatted date string the chip embeds;
 *  the function returns the *full* label ("Revisit by …") so callers
 *  don't re-concat. */
export function reminderChipClasses(humanDate: string): ReminderChipClasses {
  return {
    border: 'border-[var(--color-planned)]',
    text: 'text-[var(--color-planned)]',
    label: `Revisit by ${humanDate}`,
  };
}

/** Format a `'YYYY-MM-DD'` reminder date string as a short, human-readable
 *  label (e.g. "Mon Jan 15"). UTC-anchored on both sides so the rendered
 *  label never drifts vs. the stored date — spec § Gotchas #3 codifies
 *  the same UTC-strip discipline for the date comparison.
 *
 *  Shared between <ReminderEditor /> (subline copy) and <ReminderDueChip />
 *  (chip label) so a future format tweak ripples to both surfaces. The
 *  `humanDate` in cards/[id]/page.tsx is a separate helper that takes a
 *  full ISO timestamp from `created_at` — different input shape, different
 *  function. */
export function humanReminderDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return date.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
