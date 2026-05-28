// What: Pure transform-math for the synced sync-zoom panel pair in
//       <PhotoComparison>. `pinchToScale()` computes a new scale factor from
//       two pointer pairs (before / after positions of the user's two
//       fingers), `clampOrigin()` clamps the translation origin to image
//       bounds at every scale level, and `composeTransform()` returns the
//       exact `translate(...) scale(...)` string the panels apply via
//       `style.transform`.
// Why:  The component reads pointer events; this module owns the math so it
//       can be unit-tested without a DOM. Math errors here would cause silent
//       drift between the two panels (spec § Panel behavior). Ported from the
//       PWA spike (`pwa-spike-result.md § 4` — validated >58fps on iOS Safari)
//       so the feature component doesn't depend on the operator-only spike path.
// Does NOT: Read DOM events. The component translates pointerdown / pointermove
//           / pointerup into the four points + prevScale arguments.

export type Point = { x: number; y: number };

/** Translation origin in panel-local coordinates. */
export type Origin = Point;

export type Bounds = { width: number; height: number };

export type Transform = {
  scale: number;
  origin: Origin;
};

/** Minimum + maximum zoom factor — panel cannot zoom out below 1x (image
 *  always fills its panel) or above 6x (beyond which JPEG pixelation
 *  dominates and the comparison is meaningless). */
export const MIN_SCALE = 1;
export const MAX_SCALE = 6;

/**
 * Compute a new scale from a two-finger pinch.
 *
 * @param p0a - Pointer A position at gesture start.
 * @param p0b - Pointer B position at gesture start.
 * @param p1a - Pointer A current position.
 * @param p1b - Pointer B current position.
 * @param prevScale - Scale at gesture start.
 * @returns The new scale, clamped to [MIN_SCALE, MAX_SCALE]. Returns
 *   `prevScale` (clamped) when either start- or current-distance is zero
 *   (single-touch or fully-collapsed pinch).
 */
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

/**
 * Clamp the translation origin so the (scaled) image always covers the panel.
 *
 * @returns At scale <= 1 the only legal origin is {0,0} (image fits exactly);
 *   at higher scales the origin wanders within the symmetric range
 *   [-(w*(s-1))/2, +(w*(s-1))/2] on each axis.
 */
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

/**
 * Serialize a Transform into the CSS transform string the panels apply. Order
 * matters: translate first, then scale, so the origin is in pre-scale coords.
 */
export function composeTransform(transform: Transform): string {
  const { scale, origin } = transform;
  return `translate(${origin.x}px, ${origin.y}px) scale(${scale})`;
}

/** Euclidean distance between two points. */
function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Constrain n into the inclusive range [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
