// What: "Compare photos" entry link for a card, rendered only when the card
//       has >= 2 photo-bearing touchpoints. Shared across MonitorView /
//       PlannedView / ClosedView so the gating contract + link treatment live
//       in one place.
// Why:  spec § Entry points + G6 — the entry link is the primary UX gate (the
//       compare route redirects < 2 as defense-in-depth). Centralizing the
//       >= 2 threshold means a future change updates every surface at once.
// Does NOT: Fetch the count — the parent threads it in from page.tsx. Returns
//           null below the threshold (no empty wrapper).

import Link from 'next/link';

export type ComparePhotosLinkProps = {
  cardId: string;
  photoTouchpointCount: number;
};

/** "Compare photos" link, gated on photoTouchpointCount >= 2. */
export function ComparePhotosLink({
  cardId,
  photoTouchpointCount,
}: ComparePhotosLinkProps) {
  if (photoTouchpointCount < 2) return null;
  return (
    <Link
      href={`/cards/${cardId}/compare`}
      data-testid="compare-photos-link"
      className="text-sm text-[var(--color-text-secondary)] underline underline-offset-2"
    >
      Compare photos
    </Link>
  );
}
