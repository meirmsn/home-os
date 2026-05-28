// What: Unit tests for the bounce-cadence constants — the canonical
//       1200/750/400 ms values + the 750 default, in slow->fast order.
// Why:  spec § Bounce mode — the picker UI and the rAF loop must agree on
//       these exact values; pin them so a refactor can't silently drift them.

import { describe, expect, it } from 'vitest';
import { CADENCE_OPTIONS, DEFAULT_CADENCE_MS } from './cadence';

describe('cadence constants', () => {
  it('defaults to 750 ms', () => {
    expect(DEFAULT_CADENCE_MS).toBe(750);
  });

  it('exposes the three canonical cadences in slow->fast order', () => {
    expect(CADENCE_OPTIONS.map((c) => c.value)).toEqual([1200, 750, 400]);
  });

  it('labels them Slow / Default / Fast', () => {
    expect(CADENCE_OPTIONS.map((c) => c.label)).toEqual([
      'Slow',
      'Default',
      'Fast',
    ]);
  });
});
