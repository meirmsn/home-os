// What: Unit test for the shared reminder-chip class lookup. Locks the
//       --color-planned token name + the "Revisit by …" label format so
//       accidental drift surfaces in CI instead of as an invisible
//       rendering bug.

import { describe, expect, it } from 'vitest';
import { reminderChipClasses } from './_reminder-chip';

describe('reminderChipClasses', () => {
  it('uses --color-planned for both border and text tokens', () => {
    const c = reminderChipClasses('Mon, Jun 15');
    expect(c.border).toContain('var(--color-planned)');
    expect(c.text).toContain('var(--color-planned)');
  });

  it('embeds the supplied humanDate verbatim into the label', () => {
    const c = reminderChipClasses('Mon, Jun 15');
    expect(c.label).toBe('Revisit by Mon, Jun 15');
  });

  it('does NOT use --color-watch / --color-act-soon (severity tokens, not planned)', () => {
    // Drift guard: a copy-paste from severityChipClasses would
    // accidentally pull in --color-watch. The reminder chip is
    // semantically distinct (calm/handled, not urgent/watching).
    const c = reminderChipClasses('Mon, Jun 15');
    expect(c.border).not.toContain('var(--color-watch)');
    expect(c.text).not.toContain('var(--color-act-soon)');
  });
});
