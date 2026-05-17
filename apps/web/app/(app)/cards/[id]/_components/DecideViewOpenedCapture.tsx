'use client';

// What: Zero-output 'use client' component mounted by <DecideView />
//       that fires the `decide_view_opened` PostHog event exactly once
//       per (card × browser session). Mirrors the
//       <SignInCompletedCapture /> pattern from the (app) layout: the
//       parent server component pre-screens the conditions (state=
//       'decide'); this client surface owns the side effect.
// Why:  spec § D9 — decide_view_opened. Once-per-session-per-card
//       semantics keep the funnel granular without inflating event
//       volume on every server refresh.

import { useEffect } from 'react';
import posthog from 'posthog-js';

const SESSION_KEY_PREFIX = 'home_os.decide_view_opened_fired:';

export type DecideViewOpenedCaptureProps = {
  cardId: string;
};

/**
 *
 */
export function DecideViewOpenedCapture({
  cardId,
}: DecideViewOpenedCaptureProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `${SESSION_KEY_PREFIX}${cardId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // sessionStorage can throw on Safari Private Browsing or when
      // the user has disabled storage. The event firing is still
      // valuable — fall through and let the upstream dedupe handle
      // duplicates.
    }
    posthog.capture('decide_view_opened', { card_id: cardId });
  }, [cardId]);
  return null;
}
