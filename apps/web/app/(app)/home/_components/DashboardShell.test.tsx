// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { posthogCapture } = vi.hoisted(() => ({ posthogCapture: vi.fn() }));
vi.mock('posthog-js', () => ({ default: { capture: posthogCapture } }));

import { DashboardShell } from './DashboardShell';

const BASE_PROPS = {
  tier1: [],
  tier2: [],
  planned: [],
  all: [],
  overdueMonitor: [],
  photoMap: {},
  hasReminderDue: false,
  walkthroughCards: [],
  totalCards: 0,
  tier1Count: 0,
  tier2Count: 0,
  plannedCount: 0,
  triagePendingCount: 0,
};

beforeEach(() => posthogCapture.mockReset());
afterEach(() => cleanup());

describe('DashboardShell', () => {
  it('renders the Contractor questions entry-point link to /contractor-questions', () => {
    render(<DashboardShell {...BASE_PROPS} />);
    const link = screen.getByTestId('contractor-questions-link');
    expect(link.getAttribute('href')).toBe('/contractor-questions');
    expect(link.textContent).toContain('Contractor questions');
  });
});
