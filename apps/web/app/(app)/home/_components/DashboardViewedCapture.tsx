'use client';

import { useEffect, useRef } from 'react';
import posthog from 'posthog-js';

export type DashboardViewedCaptureProps = {
  totalCards: number;
  tier1Count: number;
  tier2Count: number;
  plannedCount: number;
  triagePendingCount: number;
  hasOverdueMonitor: boolean;
};

/**
 *
 */
export function DashboardViewedCapture(props: DashboardViewedCaptureProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    posthog.capture('dashboard_viewed', {
      total_cards: props.totalCards,
      tier1_count: props.tier1Count,
      tier2_count: props.tier2Count,
      planned_count: props.plannedCount,
      triage_pending_count: props.triagePendingCount,
      has_overdue_monitor: props.hasOverdueMonitor,
    });
  }, [
    props.totalCards,
    props.tier1Count,
    props.tier2Count,
    props.plannedCount,
    props.triagePendingCount,
    props.hasOverdueMonitor,
  ]);

  return null;
}
