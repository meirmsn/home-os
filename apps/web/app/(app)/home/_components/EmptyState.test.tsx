// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { DashboardCardRow } from '../_lib/tier-cards';

vi.mock('@/app/(app)/cards/[id]/_components/_severity-chip', () => ({
  severityChipClasses: (s: string) => ({
    bg: `bg-${s}`,
    text: `text-${s}`,
    label: s,
  }),
}));

import { EmptyState } from './EmptyState';

/**
 *
 */
function makeCard(overrides: Partial<DashboardCardRow> = {}): DashboardCardRow {
  return {
    id: 'card-1',
    state: 'planned',
    title: 'Fix the roof',
    initial_description: null,
    severity: null,
    severity_confirmed: false,
    system_tag: 'roof',
    room_tag: null,
    chosen_path: 'diy',
    planned_reminder_date: '2026-05-20',
    next_check_at: null,
    monitoring_cadence_days: null,
    diagnosis: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

afterEach(() => cleanup());

describe('EmptyState', () => {
  it('first-time: renders prompt text + capture CTA link to /capture', () => {
    render(<EmptyState variant="first-time" />);
    expect(screen.getByTestId('empty-state-first-time')).toBeTruthy();
    expect(screen.getByText(/Nothing logged yet/i)).toBeTruthy();
    const link = screen.getByRole('link', { name: /start capture/i });
    expect(link.getAttribute('href')).toBe('/capture');
  });

  it('nothing-active: renders copy + promoted PLANNED cards + capture CTA', () => {
    const cards = [makeCard({ id: 'p1' }), makeCard({ id: 'p2' })];
    render(
      <EmptyState variant="nothing-active" promotedPlannedCards={cards} />
    );
    expect(screen.getByTestId('empty-state-nothing-active')).toBeTruthy();
    expect(
      screen.getByText(/Nothing needs a decision right now/i)
    ).toBeTruthy();
    expect(screen.getByTestId('dashboard-card-p1')).toBeTruthy();
    expect(screen.getByTestId('dashboard-card-p2')).toBeTruthy();
    expect(screen.getByTestId('capture-cta').getAttribute('href')).toBe(
      '/capture'
    );
  });

  it('tab-empty: renders "No planned items." for empty Planned tab', () => {
    render(<EmptyState variant="tab-empty" tabName="planned" />);
    expect(screen.getByTestId('empty-state-tab')).toBeTruthy();
    expect(screen.getByText(/No planned items/i)).toBeTruthy();
  });
});
