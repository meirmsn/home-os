// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

const { posthogCapture } = vi.hoisted(() => ({
  posthogCapture: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { capture: posthogCapture },
}));

import { FilterBar } from './FilterBar';

afterEach(() => {
  cleanup();
  posthogCapture.mockReset();
});

describe('FilterBar', () => {
  it('renders three tabs with "Needs attention" active by default', () => {
    render(
      <FilterBar
        activeTab="attention"
        onTabChange={() => {}}
        hasReminderDue={false}
        disabled={false}
      />
    );
    expect(screen.getByTestId('filter-tab-attention')).toBeTruthy();
    expect(screen.getByTestId('filter-tab-planned')).toBeTruthy();
    expect(screen.getByTestId('filter-tab-all')).toBeTruthy();
    expect(screen.getByTestId('filter-tab-attention').className).toContain(
      'font-semibold'
    );
  });

  it('fires dashboard_filter_changed when switching tabs', () => {
    const onTabChange = vi.fn();
    render(
      <FilterBar
        activeTab="attention"
        onTabChange={onTabChange}
        hasReminderDue={false}
        disabled={false}
      />
    );
    fireEvent.click(screen.getByTestId('filter-tab-planned'));
    expect(posthogCapture).toHaveBeenCalledWith('dashboard_filter_changed', {
      from_tab: 'attention',
      to_tab: 'planned',
    });
    expect(onTabChange).toHaveBeenCalledWith('planned');
  });

  it('does not fire event when clicking the active tab', () => {
    const onTabChange = vi.fn();
    render(
      <FilterBar
        activeTab="attention"
        onTabChange={onTabChange}
        hasReminderDue={false}
        disabled={false}
      />
    );
    fireEvent.click(screen.getByTestId('filter-tab-attention'));
    expect(posthogCapture).not.toHaveBeenCalled();
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('shows dot indicator on "Planned" tab when hasReminderDue=true', () => {
    render(
      <FilterBar
        activeTab="attention"
        onTabChange={() => {}}
        hasReminderDue={true}
        disabled={false}
      />
    );
    expect(screen.getByTestId('planned-dot')).toBeTruthy();
  });

  it('does not show dot indicator when hasReminderDue=false', () => {
    render(
      <FilterBar
        activeTab="attention"
        onTabChange={() => {}}
        hasReminderDue={false}
        disabled={false}
      />
    );
    expect(screen.queryByTestId('planned-dot')).toBeNull();
  });

  it('disables tabs during walkthrough (greyed, no click)', () => {
    const onTabChange = vi.fn();
    render(
      <FilterBar
        activeTab="attention"
        onTabChange={onTabChange}
        hasReminderDue={false}
        disabled={true}
      />
    );
    expect(screen.getByTestId('filter-bar').className).toContain('opacity-50');
    expect(screen.getByTestId('filter-bar').className).toContain(
      'pointer-events-none'
    );
    fireEvent.click(screen.getByTestId('filter-tab-planned'));
    expect(onTabChange).not.toHaveBeenCalled();
    expect(posthogCapture).not.toHaveBeenCalled();
  });
});
