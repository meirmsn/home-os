'use client';

// What: The per-group appointment-nudge banner shown inside a contractor-
//       type group whose oldest open card is ≥ NUDGE_AGE_DAYS (30) days
//       old. Renders the D3 copy and fires `contractor_appointment_nudge_
//       shown` once on mount.
// Why:  spec § D3 + D4 / Metrics — a "book the visit" nudge for trades the
//       user has been sitting on, plus the surfacing metric. Mounted only
//       when the group's showNudge is true (the server/grouping lib owns
//       the threshold decision), so a mount == a real surfaced nudge.
// Does NOT: Compute the age or the threshold (that's the grouping lib).
//           Does NOT dedup across mounts beyond the useRef once-guard —
//           one rendered banner == one event, mirroring DashboardViewed-
//           Capture's per-mount semantics.

import { useEffect, useRef } from 'react';
import posthog from 'posthog-js';
import type { ContractorTag } from '@/app/api/triage/_lib/parse-tool-output';
import { contractorTagLabel } from '../_lib/contractor-tag-label';

export type ContractorAppointmentNudgeProps = {
  contractorType: ContractorTag;
  questionCount: number;
  oldestCardDays: number;
};

/**
 * Per-group appointment nudge banner; fires
 * `contractor_appointment_nudge_shown` once per mount.
 */
export function ContractorAppointmentNudge({
  contractorType,
  questionCount,
  oldestCardDays,
}: ContractorAppointmentNudgeProps) {
  const fired = useRef(false);
  const label = contractorTagLabel(contractorType);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    posthog.capture('contractor_appointment_nudge_shown', {
      contractor_type: contractorType,
      question_count: questionCount,
      oldest_card_days: oldestCardDays,
    });
  }, [contractorType, questionCount, oldestCardDays]);

  return (
    <div
      data-testid="contractor-appointment-nudge"
      role="status"
      className="rounded-md border border-l-4 border-[var(--color-border-default)] border-l-[var(--color-watch)] bg-[var(--color-background-raised)] px-4 py-3 text-sm text-[var(--color-text-primary-inverse)]"
    >
      You have {questionCount} open question{questionCount === 1 ? '' : 's'} for
      your {label} contractor.
    </div>
  );
}
