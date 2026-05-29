'use client';

// What: Zero-output 'use client' component mounted by the Contractor
//       Questions view that fires the `contractor_questions_view_opened`
//       PostHog event exactly once per browser session. Mirrors
//       MonitorViewOpenedCapture / DecideViewOpenedCapture.
// Why:  spec § D4 / Metrics — top-of-funnel signal for how often the
//       cross-card retrieval view is opened + how much question inventory
//       the user has accumulated at view time. Once-per-session dedup
//       keeps event volume off every server refresh.
// Does NOT: Render anything. Does NOT throw if sessionStorage is
//           unavailable (Safari Private Browsing) — falls through and
//           fires anyway; the upstream PostHog dedup tolerates the rare
//           double-fire.

import { useEffect } from 'react';
import posthog from 'posthog-js';

const SESSION_KEY = 'home_os.contractor_questions_view_opened_fired';

export type ContractorQuestionsViewOpenedCaptureProps = {
  groupCount: number;
  totalQuestionCards: number;
};

/**
 * Fire `contractor_questions_view_opened` once per browser session.
 */
export function ContractorQuestionsViewOpenedCapture({
  groupCount,
  totalQuestionCards,
}: ContractorQuestionsViewOpenedCaptureProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      // sessionStorage can throw on Safari Private Browsing or when the
      // user has disabled storage. Fall through and let the upstream
      // dedupe handle duplicates.
    }
    posthog.capture('contractor_questions_view_opened', {
      group_count: groupCount,
      total_question_cards: totalQuestionCards,
    });
  }, [groupCount, totalQuestionCards]);
  return null;
}
