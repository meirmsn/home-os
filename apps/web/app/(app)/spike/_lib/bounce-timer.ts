// What: Pure functions that compute bounce-mode cadence statistics from a
//       sequence of `performance.now()` timestamps captured at each
//       opacity-swap tick. Returns median + p95 frame-interval and a
//       drift count (swaps that landed > 1.5× the configured cadence).
// Why:  The spike's cadence finding is operator-validated on real iPhone
//       Safari (D9), but the math itself is deterministic and worth
//       pinning with a unit test so the readout the operator sees is
//       trustworthy. Pure-fn so we can drive it with synthetic arrays
//       under Vitest + jsdom.
// Does NOT: Drive `requestAnimationFrame` — that lives in the component.
//           This module only computes statistics from a timestamp array
//           that the component supplies.

/** Drift multiplier: a swap counts as drift when its interval is greater
 *  than this fraction of the configured cadence. D4 pins 1.5×. */
export const DRIFT_THRESHOLD = 1.5;

export type CadenceStats = {
  /** Number of intervals observed (timestamps.length - 1, clamped >= 0). */
  count: number;
  /** Median interval in ms across the observed window. 0 when count < 1. */
  median: number;
  /** 95th-percentile interval in ms. 0 when count < 1. */
  p95: number;
  /** Number of intervals exceeding `cadence * DRIFT_THRESHOLD`. */
  drift: number;
};

/** Compute cadence stats from an array of timestamps (ms, e.g.
 *  performance.now() values). `cadence` is the configured swap interval
 *  in ms. Returns a stable shape even for empty / single-element inputs
 *  (no NaN, no division-by-zero). */
export function bounceTimer({
  cadence,
  timestamps,
}: {
  cadence: number;
  timestamps: readonly number[];
}): CadenceStats {
  if (timestamps.length < 2) {
    return { count: 0, median: 0, p95: 0, drift: 0 };
  }

  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const prev = timestamps[i - 1];
    const curr = timestamps[i];
    if (prev === undefined || curr === undefined) continue;
    intervals.push(curr - prev);
  }

  if (intervals.length === 0) {
    return { count: 0, median: 0, p95: 0, drift: 0 };
  }

  const sorted = [...intervals].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const driftLimit = cadence * DRIFT_THRESHOLD;
  const drift = intervals.reduce(
    (acc, interval) => (interval > driftLimit ? acc + 1 : acc),
    0
  );

  return { count: intervals.length, median, p95, drift };
}

/** Linear-interpolation percentile over a pre-sorted ascending array.
 *  Returns 0 for an empty input. */
function percentile(sortedAsc: readonly number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0] ?? 0;
  const rank = q * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const fraction = rank - lo;
  const loVal = sortedAsc[lo] ?? 0;
  const hiVal = sortedAsc[hi] ?? loVal;
  return loVal + (hiVal - loVal) * fraction;
}
