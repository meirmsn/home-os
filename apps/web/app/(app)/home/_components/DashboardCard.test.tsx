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

import { DashboardCard } from './DashboardCard';

/**
 *
 */
function makeCard(overrides: Partial<DashboardCardRow> = {}): DashboardCardRow {
  return {
    id: 'card-1',
    state: 'decide',
    title: 'Leaky faucet',
    initial_description: 'Kitchen faucet dripping',
    severity: 'soon',
    severity_confirmed: true,
    system_tag: 'plumbing',
    room_tag: null,
    chosen_path: null,
    planned_reminder_date: null,
    next_check_at: null,
    monitoring_cadence_days: null,
    diagnosis: 'The faucet cartridge is worn',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

afterEach(() => cleanup());

describe('DashboardCard', () => {
  describe('Tier 1 Act Soon', () => {
    it('renders photo, severity chip, title, consequence line, and system tag', () => {
      render(
        <DashboardCard
          card={makeCard()}
          tier="tier1-act-soon"
          photoUrl="https://example.com/photo.jpg"
        />
      );
      expect(screen.getByTestId('card-photo')).toBeTruthy();
      expect(screen.getByTestId('severity-chip').textContent).toBe('soon');
      expect(screen.getByText('Leaky faucet')).toBeTruthy();
      expect(screen.getByText('The faucet cartridge is worn')).toBeTruthy();
      expect(screen.getByText('plumbing')).toBeTruthy();
    });

    it('links to /cards/[id]', () => {
      render(
        <DashboardCard
          card={makeCard({ id: 'abc-123' })}
          tier="tier1-act-soon"
          photoUrl={null}
        />
      );
      const link = screen.getByTestId('dashboard-card-abc-123');
      expect(link.getAttribute('href')).toBe('/cards/abc-123');
    });

    it('renders placeholder when no photo URL', () => {
      render(
        <DashboardCard
          card={makeCard()}
          tier="tier1-act-soon"
          photoUrl={null}
        />
      );
      expect(screen.getByTestId('card-photo-placeholder')).toBeTruthy();
    });
  });

  describe('Tier 1 Reminder-due PLANNED', () => {
    it('renders system icon, Revisit by chip, and path label', () => {
      render(
        <DashboardCard
          card={makeCard({
            state: 'planned',
            chosen_path: 'diy',
            planned_reminder_date: '2026-05-27',
            system_tag: 'hvac',
          })}
          tier="tier1-reminder"
          photoUrl={null}
        />
      );
      expect(screen.getByText('hvac')).toBeTruthy();
      expect(screen.getByTestId('reminder-chip')).toBeTruthy();
      expect(screen.getByTestId('reminder-chip').textContent).toContain(
        'Revisit by'
      );
      expect(screen.getByText('DIY')).toBeTruthy();
    });
  });

  describe('Tier 2', () => {
    it('renders smaller photo, smaller text, severity chip', () => {
      render(
        <DashboardCard
          card={makeCard({ state: 'monitoring', severity: 'monitor' })}
          tier="tier2"
          photoUrl="https://example.com/photo.jpg"
        />
      );
      expect(screen.getByTestId('card-photo')).toBeTruthy();
      expect(screen.getByTestId('severity-chip').textContent).toBe('monitor');
      expect(screen.getByText('Overdue')).toBeTruthy();
    });
  });

  describe('TRIAGE_PENDING', () => {
    it('renders "TRIAGE PENDING" chip', () => {
      render(
        <DashboardCard
          card={makeCard({ state: 'capturing', severity: null })}
          tier="tier2-triage"
          photoUrl={null}
        />
      );
      expect(screen.getByTestId('triage-pending-chip')).toBeTruthy();
      expect(screen.getByTestId('triage-pending-chip').textContent).toContain(
        'triage pending'
      );
    });
  });

  describe('PLANNED tab card', () => {
    it('renders system icon and PLANNED chip', () => {
      render(
        <DashboardCard
          card={makeCard({
            state: 'planned',
            chosen_path: 'contractor',
            system_tag: 'roof',
          })}
          tier="planned"
          photoUrl={null}
        />
      );
      expect(screen.getByText('roof')).toBeTruthy();
      expect(screen.getByTestId('planned-chip').textContent).toContain(
        'planned - contractor'
      );
    });
  });

  it('falls back to initial_description when title is null', () => {
    render(
      <DashboardCard
        card={makeCard({ title: null, initial_description: 'Fallback desc' })}
        tier="tier1-act-soon"
        photoUrl={null}
      />
    );
    expect(screen.getByText('Fallback desc')).toBeTruthy();
  });
});
