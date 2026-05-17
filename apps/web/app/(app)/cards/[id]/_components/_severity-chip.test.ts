// What: Unit test for the shared severity-chip class lookup.
// Why:  Lock the token names so accidental drift (--color-soon vs
//       --color-watch) re-surfaces a CI failure instead of an invisible
//       rendering bug. Hand-rolled assertions over the four severity
//       tiers.

import { describe, expect, it } from 'vitest';
import { severityChipClasses } from './_severity-chip';

describe('severityChipClasses', () => {
  it('cosmetic → --color-note tokens', () => {
    const c = severityChipClasses('cosmetic');
    expect(c.bg).toContain('var(--color-note)');
    expect(c.text).toContain('var(--color-note)');
    expect(c.label).toBe('cosmetic');
  });

  it('monitor → --color-monitor tokens', () => {
    const c = severityChipClasses('monitor');
    expect(c.bg).toContain('var(--color-monitor)');
    expect(c.text).toContain('var(--color-monitor)');
    expect(c.label).toBe('monitor');
  });

  it('soon → --color-watch tokens (NOT --color-soon — token does not exist)', () => {
    const c = severityChipClasses('soon');
    expect(c.bg).toContain('var(--color-watch)');
    expect(c.text).toContain('var(--color-watch)');
    expect(c.label).toBe('soon');
  });

  it('urgent → --color-act-soon tokens (NOT --color-urgent — token does not exist)', () => {
    const c = severityChipClasses('urgent');
    expect(c.bg).toContain('var(--color-act-soon)');
    expect(c.text).toContain('var(--color-act-soon)');
    expect(c.label).toBe('urgent');
  });
});
