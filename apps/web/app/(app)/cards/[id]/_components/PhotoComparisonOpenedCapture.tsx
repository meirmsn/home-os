'use client';

// What: Zero-output 'use client' component mounted by <PhotoComparison /> that
//       fires the `photo_comparison_opened` PostHog event exactly once per
//       (card × browser session). Mirrors <DecideViewOpenedCapture />.
// Why:  spec § D6 / Metrics — answers "is anyone using comparison?".
//       card_state shows which lifecycle stage drives it; touchpoint_count
//       shows how rich a history users compare against. Once-per-session
//       semantics keep volume off every re-render.

import { useEffect } from 'react';
import posthog from 'posthog-js';

const SESSION_KEY_PREFIX = 'home_os.photo_comparison_opened_fired:';

export type PhotoComparisonOpenedCaptureProps = {
  cardId: string;
  cardState: string;
  touchpointCount: number;
};

/** Fires photo_comparison_opened once per (card × session) — see file header. */
export function PhotoComparisonOpenedCapture({
  cardId,
  cardState,
  touchpointCount,
}: PhotoComparisonOpenedCaptureProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `${SESSION_KEY_PREFIX}${cardId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // sessionStorage can throw on Safari Private Browsing or when storage
      // is disabled. The event is still valuable — fall through and let the
      // upstream dedupe handle duplicates.
    }
    posthog.capture('photo_comparison_opened', {
      card_state: cardState,
      touchpoint_count: touchpointCount,
    });
  }, [cardId, cardState, touchpointCount]);
  return null;
}
