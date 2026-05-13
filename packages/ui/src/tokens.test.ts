// What: Lock-in tests for the design-system tokens.
// Why: A token rename or accidental delete propagates to every consumer;
//      asserting the shape catches it in CI before the consumer compile
//      fires. Values mirror .gstack/design-review-home-os-2026-05-02.md —
//      tests will fail if a token value drifts, forcing a deliberate update.
// Does NOT: Validate visual rendering (the design review is the visual
//      source of truth; tokens here just hold the values).

import { describe, it, expect } from 'vitest';
import {
  colors,
  text,
  border,
  space,
  radius,
  typography,
  motion,
} from './tokens';

describe('colors', () => {
  it('exposes the dark warm-charcoal background palette', () => {
    expect(colors.background.base).toBe('#1C1B18');
    expect(colors.background.raised).toBe('#242320');
    expect(colors.background.overlay).toMatch(/^rgba\(28,27,24/);
  });

  it('exposes the neutral palette at the spec stops', () => {
    expect(Object.keys(colors.neutral)).toEqual([
      '50',
      '100',
      '150',
      '200',
      '500',
      '800',
    ]);
  });

  it('exposes the severity palette (act-soon / watch / note)', () => {
    expect(colors.severity.actSoon).toBe('#C4622D'); // warm terracotta
    expect(colors.severity.watch).toBe('#A07C2E'); // warm amber
    expect(colors.severity.note).toBe('#4A7B6F'); // muted teal-green
  });

  it('exposes the resolved/active state colors', () => {
    expect(colors.state.planned).toBe('#5C6BC0'); // calm indigo
    expect(colors.state.monitor).toBe('#7B6BA8'); // muted purple
  });
});

describe('semantic text tokens', () => {
  it('points primary text at neutral.800 on card surfaces', () => {
    expect(text.primary).toBe(colors.neutral[800]);
  });

  it('points secondary text at neutral.500 on card surfaces', () => {
    expect(text.secondary).toBe(colors.neutral[500]);
  });

  it('exposes inverse text tokens for the dark ground', () => {
    expect(text.primaryInverse).toBe('#F0EFEB');
    expect(text.secondaryInverse).toBe('#6B6A63');
  });
});

describe('border tokens', () => {
  it('exposes default border + subtle dark-ground divider', () => {
    expect(border.default).toBe(colors.neutral[200]);
    expect(border.subtle).toMatch(/^rgba\(255,255,255/);
  });
});

describe('space scale', () => {
  it('exposes the 8px-base stops the design review specifies', () => {
    expect(Object.keys(space)).toEqual(['1', '2', '3', '4', '5', '6', '8']);
    expect(space[1]).toBe('4px');
    expect(space[8]).toBe('64px');
  });

  it('skips space-7 deliberately', () => {
    expect((space as Record<string, unknown>)['7']).toBeUndefined();
  });
});

describe('radius scale', () => {
  it('exposes only none + sm (Tier 1 no radius, Tier 2/PLANNED 4px)', () => {
    expect(radius.none).toBe('0');
    expect(radius.sm).toBe('4px');
  });
});

describe('typography', () => {
  it('uses Inter as primary typeface', () => {
    expect(typography.fontFamily).toMatch(/^Inter,/);
  });

  it('exposes the 6-stop type scale', () => {
    expect(Object.keys(typography.size)).toEqual([
      'xs',
      'sm',
      'base',
      'lg',
      'xl',
      'display',
    ]);
  });

  it('exposes the three weights the design review loads', () => {
    expect(typography.weight).toEqual({
      regular: 400,
      medium: 500,
      semibold: 600,
    });
  });

  it('exposes the spec line-heights', () => {
    expect(typography.lineHeight.body).toBe(1.5);
    expect(typography.lineHeight.display).toBe(1.3);
    expect(typography.lineHeight.chip).toBe(1);
  });

  it('exposes letter-spacing for chip / body / display', () => {
    expect(typography.letterSpacing.chip).toBe('0.04em');
    expect(typography.letterSpacing.body).toBe('0');
    expect(typography.letterSpacing.display).toBe('-0.01em');
  });
});

describe('motion', () => {
  it('exposes all 5 named animations in the motion budget', () => {
    expect(Object.keys(motion)).toEqual([
      'cardToPlanned',
      'revealMore',
      'dismissExit',
      'chipTransition',
      'bounce',
    ]);
  });

  it('locks the bounce-mode cadence trio', () => {
    expect(motion.bounce).toEqual({
      slow: '1200ms',
      default: '750ms',
      fast: '400ms',
    });
  });
});
