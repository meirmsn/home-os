// What: Pure transform-math for the sync-zoom panel pair on
//       /spike/comparison. `pinchToScale()` computes a new scale factor
//       from two pointer pairs (before / after positions of the user's
//       two fingers), `clampOrigin()` clamps the translation origin to
//       image bounds at every scale level, and `composeTransform()`
//       returns the exact `translate(...) scale(...)` string the panels
//       apply via `style.transform`.
// Why:  The component reads pointer events; this module owns the math so
//       it can be tested with table-driven cases under jsdom (D9). Math
//       errors here would cause silent drift between the two panels —
//       worth pinning.
// Does NOT: Read DOM events. The component translates pointerdown /
//           pointermove / pointerup into the four points + prevScale
//           arguments this function consumes.

export type Point = { x: number; y: number };

/** Translation origin in panel-local coordinates. */
export type Origin = Point;

export type Bounds = { width: number; height: number };

export type Transform = {
  scale: number;
  origin: Origin;
};

/** Minimum + maximum zoom factor — panel cannot zoom out below 1× (image
 *  always fills its panel) or above 6× (beyond which JPEG pixelation
 *  dominates and the comparison is meaningless). */
export const MIN_SCALE = 1;
export const MAX_SCALE = 6;

/** Compute new scale from a two-finger pinch.
 *
 *  `p0a, p0b` = positions of pointers A and B at gesture start.
 *  `p1a, p1b` = positions of pointers A and B at gesture current.
 *  `prevScale` = scale at gesture start.
 *
 *  If either start-distance or current-distance is zero (single-touch
 *  or fully-collapsed pinch), returns prevScale unchanged (clamped to
 *  the legal range).
 *
 *  Result is clamped to [MIN_SCALE, MAX_SCALE]. */
export function pinchToScale(
  p0a: Point,
  p0b: Point,
  p1a: Point,
  p1b: Point,
  prevScale: number
): number {
  const d0 = distance(p0a, p0b);
  const d1 = distance(p1a, p1b);
  if (d0 === 0 || d1 === 0) {
    return clamp(prevScale, MIN_SCALE, MAX_SCALE);
  }
  const ratio = d1 / d0;
  return clamp(prevScale * ratio, MIN_SCALE, MAX_SCALE);
}

/** Clamp the translation origin so the (scaled) image always covers the
 *  panel. At scale=1 the only legal origin is {0,0} (image fits the
 *  panel exactly); at higher scales the origin can wander within the
 *  symmetric range [-(w*(s-1))/2, +(w*(s-1))/2] on each axis. */
export function clampOrigin(
  origin: Origin,
  scale: number,
  bounds: Bounds
): Origin {
  if (scale <= 1) return { x: 0, y: 0 };
  const maxX = (bounds.width * (scale - 1)) / 2;
  const maxY = (bounds.height * (scale - 1)) / 2;
  return {
    x: clamp(origin.x, -maxX, maxX),
    y: clamp(origin.y, -maxY, maxY),
  };
}

/** Serialize a Transform into the exact CSS transform string the
 *  panels apply. Order matters: translate first, then scale, so the
 *  origin is in pre-scale coordinates. */
export function composeTransform(transform: Transform): string {
  const { scale, origin } = transform;
  return `translate(${origin.x}px, ${origin.y}px) scale(${scale})`;
}

/**
 *
 */
function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 *
 */
function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
