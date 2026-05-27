'use client';

// What: Zero-output 'use client' component mounted by <MonitorView />
//       that fires the `monitor_view_opened` PostHog event exactly once
//       per (card x browser session). Mirrors DecideViewOpenedCapture.
// Why:  spec § D8 — monitor_view_opened. Once-per-session-per-card
//       semantics keep the funnel granular without inflating event
//       volume on every server refresh.

import { useEffect } from 'react';
import posthog from 'posthog-js';

const SESSION_KEY_PREFIX = 'home_os.monitor_view_opened_fired:';

export type MonitorViewOpenedCaptureProps = {
  cardId: string;
  daysSinceLastCheckin: number | null;
  isOverdue: boolean;
};

/**
 *
 */
export function MonitorViewOpenedCapture({
  cardId,
  daysSinceLastCheckin,
  isOverdue,
}: MonitorViewOpenedCaptureProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `${SESSION_KEY_PREFIX}${cardId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // sessionStorage can throw on Safari Private Browsing or when
      // the user has disabled storage. Fall through and let the
      // upstream dedupe handle duplicates.
    }
    posthog.capture('monitor_view_opened', {
      card_id: cardId,
      days_since_last_checkin: daysSinceLastCheckin,
      is_overdue: isOverdue,
    });
  }, [cardId, daysSinceLastCheckin, isOverdue]);
  return null;
}
