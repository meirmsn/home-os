// What: Unit tests for bounceTimer() — exercises three cadences (1200 /
//       750 / 400 ms) under ideal / jitter / throttled-2x synthetic
//       timestamp arrays per spec § Tests § Unit tests.
// Why:  The readout the operator sees on /spike/comparison drives a
//       ship/defer decision; the math behind it has to be pinned.

import { describe, expect, it } from 'vitest';
import { DRIFT_THRESHOLD, bounceTimer } from './bounce-timer';

const CADENCES = [1200, 750, 400] as const;

/** Build a timestamp array of `count` samples at exactly `interval` ms. */
function ideal(start: number, interval: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(start + i * interval);
  return out;
}

/** Build a timestamp array with bounded jitter (deterministic via index). */
function jittered(
  start: number,
  interval: number,
  count: number,
  jitterFraction: number
): number[] {
  const out: number[] = [];
  let t = start;
  for (let i = 0; i < count; i++) {
    out.push(t);
    // Alternating +/- jitter, scaled by index for variety
    const sign = i % 2 === 0 ? 1 : -1;
    const magnitude = jitterFraction * interval * ((i % 5) / 5);
    t += interval + sign * magnitude;
  }
  return out;
}

describe('bounceTimer', () => {
  it.each(CADENCES)(
    'ideal cadence %ims → drift 0, median ≈ cadence',
    (cadence) => {
      const stats = bounceTimer({
        cadence,
        timestamps: ideal(0, cadence, 60),
      });
      expect(stats.count).toBe(59);
      expect(stats.median).toBeCloseTo(cadence, 6);
      expect(stats.p95).toBeCloseTo(cadence, 6);
      expect(stats.drift).toBe(0);
    }
  );

  it.each(CADENCES)(
    'jitter ±10%% at %ims → drift 0, p95 within 1.1× cadence',
    (cadence) => {
      const stats = bounceTimer({
        cadence,
        timestamps: jittered(0, cadence, 60, 0.1),
      });
      expect(stats.count).toBe(59);
      expect(stats.drift).toBe(0);
      expect(stats.p95).toBeLessThanOrEqual(cadence * 1.1);
    }
  );

  it.each(CADENCES)(
    'throttled 2× at %ims → every interval counted as drift',
    (cadence) => {
      const stats = bounceTimer({
        cadence,
        timestamps: ideal(0, cadence * 2, 60),
      });
      expect(stats.count).toBe(59);
      expect(stats.drift).toBe(59);
      expect(stats.median).toBeCloseTo(cadence * 2, 6);
    }
  );

  it('empty array returns stable zero shape (no NaN)', () => {
    const stats = bounceTimer({ cadence: 750, timestamps: [] });
    expect(stats).toEqual({ count: 0, median: 0, p95: 0, drift: 0 });
  });

  it('single-element array returns stable zero shape', () => {
    const stats = bounceTimer({ cadence: 750, timestamps: [42] });
    expect(stats).toEqual({ count: 0, median: 0, p95: 0, drift: 0 });
  });

  it('two-element array yields one interval, no drift on cadence', () => {
    const stats = bounceTimer({ cadence: 750, timestamps: [0, 750] });
    expect(stats.count).toBe(1);
    expect(stats.median).toBe(750);
    expect(stats.p95).toBe(750);
    expect(stats.drift).toBe(0);
  });

  it('drift threshold is exactly 1.5× cadence (boundary)', () => {
    // Boundary case: an interval of EXACTLY 1.5× cadence should NOT
    // count as drift (strict greater-than). One sample below + one above.
    const cadence = 1000;
    const stats = bounceTimer({
      cadence,
      timestamps: [0, 1500, 3001],
    });
    // intervals: [1500, 1501] — first equals threshold (not drift),
    // second exceeds (drift).
    expect(stats.drift).toBe(1);
  });

  it('exposes DRIFT_THRESHOLD constant as 1.5', () => {
    expect(DRIFT_THRESHOLD).toBe(1.5);
  });
});
