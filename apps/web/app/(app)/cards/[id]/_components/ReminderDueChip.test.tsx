// What: Unit tests for <ReminderDueChip />. Locks the calm-indigo
//       token + label format + UTC date formatting.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ReminderDueChip } from './ReminderDueChip';

afterEach(() => {
  cleanup();
});

describe('<ReminderDueChip />', () => {
  it('renders the calm-indigo classes (border + text use --color-planned)', () => {
    render(<ReminderDueChip plannedReminderDate="2026-05-10" />);
    const chip = screen.getByTestId('reminder-due-chip');
    expect(chip.className).toContain('border-[var(--color-planned)]');
    expect(chip.className).toContain('text-[var(--color-planned)]');
  });

  it('label format is "Revisit by <humanDate>"', () => {
    render(<ReminderDueChip plannedReminderDate="2026-05-10" />);
    const chip = screen.getByTestId('reminder-due-chip');
    expect(chip.textContent).toMatch(/^Revisit by /);
  });

  it('uses an outline (no background fill)', () => {
    // Calm-indigo "outline only" is the visual lever — make sure the
    // chip doesn't accidentally pull in a bg-* class. Drift here would
    // turn the chip into a high-contrast filled badge, violating the
    // never-overdue / calm posture.
    render(<ReminderDueChip plannedReminderDate="2026-05-10" />);
    const chip = screen.getByTestId('reminder-due-chip');
    expect(chip.className).not.toMatch(/\bbg-\[/);
    expect(chip.className).toContain('border ');
  });

  it('humanDate formatting is UTC-anchored (date does not drift by timezone)', () => {
    render(<ReminderDueChip plannedReminderDate="2026-05-10" />);
    const chip = screen.getByTestId('reminder-due-chip');
    // 2026-05-10 is a Sunday. UTC-anchored formatting should match
    // "Sun" regardless of process TZ.
    expect(chip.textContent).toContain('Sun');
  });
});
