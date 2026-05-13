// What: Smoke tests for the design tokens contract.
// Why: A token rename or accidental delete propagates to every consumer; locking
//      the shape catches it in CI before the consumer compile error fires.
// Does NOT: Validate visual values (colors/spacings are intentional).

import { describe, it, expect } from 'vitest';
import { colors, space, radius } from './tokens';

describe('tokens', () => {
  it('exposes the expected color groups', () => {
    expect(colors.text.primary).toBeTruthy();
    expect(colors.text.muted).toBeTruthy();
    expect(colors.surface.base).toBeTruthy();
    expect(colors.surface.raised).toBeTruthy();
    expect(colors.accent).toBeTruthy();
  });

  it('exposes the expected space scale', () => {
    expect(Object.keys(space)).toEqual(['xs', 'sm', 'md', 'lg', 'xl']);
  });

  it('exposes the expected radius scale', () => {
    expect(Object.keys(radius)).toEqual(['sm', 'md', 'lg', 'pill']);
  });
});
