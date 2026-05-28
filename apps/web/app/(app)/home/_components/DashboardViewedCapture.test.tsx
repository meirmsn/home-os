// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const { posthogCapture } = vi.hoisted(() => ({
  posthogCapture: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { capture: posthogCapture },
}));

import { DashboardViewedCapture } from './DashboardViewedCapture';

beforeEach(() => {
  posthogCapture.mockReset();
});

afterEach(() => cleanup());

describe('DashboardViewedCapture', () => {
  it('fires dashboard_viewed with correct properties on mount', () => {
    render(
      <DashboardViewedCapture
        totalCards={10}
        tier1Count={3}
        tier2Count={2}
        plannedCount={4}
        triagePendingCount={1}
        hasOverdueMonitor={true}
      />
    );
    expect(posthogCapture).toHaveBeenCalledWith('dashboard_viewed', {
      total_cards: 10,
      tier1_count: 3,
      tier2_count: 2,
      planned_count: 4,
      triage_pending_count: 1,
      has_overdue_monitor: true,
    });
  });

  it('fires only once per mount (useRef guard)', () => {
    const { rerender } = render(
      <DashboardViewedCapture
        totalCards={10}
        tier1Count={3}
        tier2Count={2}
        plannedCount={4}
        triagePendingCount={1}
        hasOverdueMonitor={true}
      />
    );
    rerender(
      <DashboardViewedCapture
        totalCards={10}
        tier1Count={3}
        tier2Count={2}
        plannedCount={4}
        triagePendingCount={1}
        hasOverdueMonitor={true}
      />
    );
    expect(posthogCapture).toHaveBeenCalledTimes(1);
  });

  it('re-fires on remount (no sessionStorage dedup)', () => {
    const { unmount } = render(
      <DashboardViewedCapture
        totalCards={5}
        tier1Count={1}
        tier2Count={0}
        plannedCount={3}
        triagePendingCount={1}
        hasOverdueMonitor={false}
      />
    );
    unmount();
    render(
      <DashboardViewedCapture
        totalCards={5}
        tier1Count={1}
        tier2Count={0}
        plannedCount={3}
        triagePendingCount={1}
        hasOverdueMonitor={false}
      />
    );
    expect(posthogCapture).toHaveBeenCalledTimes(2);
  });
});
