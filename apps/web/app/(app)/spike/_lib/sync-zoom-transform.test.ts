// What: Unit tests for pinchToScale, clampOrigin, composeTransform —
//       the pure transform-math for /spike/comparison's sync-zoom panel
//       pair. Table-driven per spec § Tests § Unit tests.
// Why:  Component math errors here cause silent drift between the two
//       panels; pinning catches regressions.

import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE,
  MIN_SCALE,
  clampOrigin,
  composeTransform,
  pinchToScale,
} from './sync-zoom-transform';

describe('pinchToScale', () => {
  it('2× zoom-in: doubling the inter-pointer distance doubles the scale', () => {
    const next = pinchToScale(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      1
    );
    expect(next).toBe(2);
  });

  it('0.5× zoom-out: halving the inter-pointer distance halves the scale', () => {
    const next = pinchToScale(
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 50, y: 0 },
      { x: 150, y: 0 },
      2
    );
    expect(next).toBe(1);
  });

  it('identity: no pointer movement returns prevScale unchanged', () => {
    const next = pinchToScale(
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      1.7
    );
    expect(next).toBeCloseTo(1.7, 6);
  });

  it('single-touch (zero start distance) clamps to prevScale', () => {
    const next = pinchToScale(
      { x: 50, y: 50 },
      { x: 50, y: 50 },
      { x: 60, y: 60 },
      { x: 70, y: 70 },
      2
    );
    expect(next).toBe(2);
  });

  it('clamps to MIN_SCALE on extreme zoom-out', () => {
    const next = pinchToScale(
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      1
    );
    expect(next).toBe(MIN_SCALE);
  });

  it('clamps to MAX_SCALE on extreme zoom-in', () => {
    const next = pinchToScale(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      1
    );
    expect(next).toBe(MAX_SCALE);
  });
});

describe('clampOrigin', () => {
  it('returns {0,0} at scale=1 regardless of input origin', () => {
    expect(
      clampOrigin({ x: 100, y: 200 }, 1, { width: 400, height: 300 })
    ).toEqual({ x: 0, y: 0 });
  });

  it('returns {0,0} at scale<1 (defensive — should not happen in prod)', () => {
    expect(
      clampOrigin({ x: 100, y: 200 }, 0.5, { width: 400, height: 300 })
    ).toEqual({ x: 0, y: 0 });
  });

  it('clamps to the legal symmetric range at scale=2', () => {
    // bounds 400x300 at scale=2 → maxX = 200, maxY = 150
    expect(
      clampOrigin({ x: 999, y: 999 }, 2, { width: 400, height: 300 })
    ).toEqual({ x: 200, y: 150 });
    expect(
      clampOrigin({ x: -999, y: -999 }, 2, { width: 400, height: 300 })
    ).toEqual({ x: -200, y: -150 });
  });

  it('passes-through in-range origins unchanged', () => {
    expect(
      clampOrigin({ x: 50, y: 25 }, 2, { width: 400, height: 300 })
    ).toEqual({ x: 50, y: 25 });
  });
});

describe('composeTransform', () => {
  it('returns translate(...)scale(...) in canonical order', () => {
    expect(composeTransform({ scale: 2, origin: { x: 10, y: 20 } })).toBe(
      'translate(10px, 20px) scale(2)'
    );
  });

  it('handles zero origin at scale=1 (identity)', () => {
    expect(composeTransform({ scale: 1, origin: { x: 0, y: 0 } })).toBe(
      'translate(0px, 0px) scale(1)'
    );
  });

  it('preserves negative origins', () => {
    expect(composeTransform({ scale: 1.5, origin: { x: -25, y: -50 } })).toBe(
      'translate(-25px, -50px) scale(1.5)'
    );
  });
});
