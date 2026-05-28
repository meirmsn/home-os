'use client';

// What: Full-bleed client comparison surface for a card's photographed
//       moments. Side-by-side panels with synchronized pinch-zoom/pan, an
//       instant-cut bounce mode, date pickers + slot selector, and
//       missing-slot greying.
// Why:  spec § D1/D2 — the differentiated comparison experience (bounce +
//       sync zoom) lives here, owning all interaction state so the server
//       route only passes signed URLs + metadata.
// Does NOT: Fetch or sign URLs (the route does that). Doesn't crossfade
//           (instant cut only). Doesn't set touch-action on html/body (panels
//           only — spec G1).

import Link from 'next/link';
import type { CompareTouchpoint } from '../compare/_lib/group-touchpoints';

export type PhotoComparisonProps = {
  cardId: string;
  issueName: string;
  cardState: string;
  /** Sorted by date ascending, length >= 2 (the route gates < 2). */
  touchpoints: CompareTouchpoint[];
};

/** Full-bleed photo-comparison surface — see file header. (Task 1 stub;
 *  Task 2 builds the panels + sync zoom.) */
export function PhotoComparison({
  cardId,
  issueName,
  touchpoints,
}: PhotoComparisonProps) {
  return (
    <div data-testid="photo-comparison">
      <Link href={`/cards/${cardId}`}>Back to issue</Link>
      <p>{issueName}</p>
      <p>{touchpoints.length} touchpoints</p>
    </div>
  );
}
