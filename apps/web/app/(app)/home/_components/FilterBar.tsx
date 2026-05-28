'use client';

import posthog from 'posthog-js';

export type FilterTab = 'attention' | 'planned' | 'all';

export type FilterBarProps = {
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  hasReminderDue: boolean;
  disabled: boolean;
};

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'attention', label: 'Needs attention' },
  { key: 'planned', label: 'Planned' },
  { key: 'all', label: 'All' },
];

/**
 *
 */
export function FilterBar({
  activeTab,
  onTabChange,
  hasReminderDue,
  disabled,
}: FilterBarProps) {
  /**
   *
   */
  function handleClick(tab: FilterTab) {
    if (disabled || tab === activeTab) return;
    posthog.capture('dashboard_filter_changed', {
      from_tab: activeTab,
      to_tab: tab,
    });
    onTabChange(tab);
  }

  return (
    <nav
      data-testid="filter-bar"
      className={`sticky top-0 z-10 bg-[var(--color-background)] border-b border-[var(--color-border-subtle)] px-4 py-2 overflow-x-auto whitespace-nowrap sm:flex sm:justify-center ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          data-testid={`filter-tab-${key}`}
          onClick={() => handleClick(key)}
          className={`inline-flex items-center px-3 py-1.5 text-sm transition-colors ${
            key === activeTab
              ? 'font-semibold text-[var(--color-text-primary-inverse)] border-b-2 border-[var(--color-text-primary-inverse)]'
              : 'font-normal text-[var(--color-text-secondary-inverse)]'
          }`}
        >
          {label}
          {key === 'planned' && hasReminderDue && (
            <span
              data-testid="planned-dot"
              className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-monitor)]"
            />
          )}
        </button>
      ))}
    </nav>
  );
}
