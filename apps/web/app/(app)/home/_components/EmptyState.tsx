import Link from 'next/link';
import type { DashboardCardRow } from '../_lib/tier-cards';
import { DashboardCard } from './DashboardCard';

export type EmptyStateProps = {
  variant: 'first-time' | 'nothing-active' | 'tab-empty';
  promotedPlannedCards?: DashboardCardRow[];
  tabName?: string;
};

/**
 *
 */
export function EmptyState({
  variant,
  promotedPlannedCards,
  tabName,
}: EmptyStateProps) {
  if (variant === 'first-time') {
    return (
      <div
        data-testid="empty-state-first-time"
        className="flex flex-col items-center justify-center py-20 px-6 text-center"
      >
        <p className="text-lg text-[var(--color-text-secondary-inverse)] mb-6">
          Nothing logged yet. What&apos;s been on your mind about the house?
        </p>
        <Link
          href="/capture"
          data-testid="capture-cta-first-time"
          className="inline-flex min-h-11 items-center rounded-md bg-[var(--color-surface-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-text-on-primary)] hover:bg-[var(--color-surface-primary-hover)]"
        >
          Start capture
        </Link>
      </div>
    );
  }

  if (variant === 'tab-empty') {
    return (
      <div
        data-testid="empty-state-tab"
        className="flex items-center justify-center py-20 px-6 text-center"
      >
        <p className="text-sm text-[var(--color-text-secondary-inverse)]">
          No {tabName ?? 'matching'} items.
        </p>
      </div>
    );
  }

  // nothing-active
  return (
    <div data-testid="empty-state-nothing-active" className="space-y-6 py-8">
      <p className="text-center text-sm text-[var(--color-text-secondary-inverse)]">
        Nothing needs a decision right now.
      </p>
      {promotedPlannedCards && promotedPlannedCards.length > 0 && (
        <div className="space-y-6">
          {promotedPlannedCards.map((card) => (
            <DashboardCard
              key={card.id}
              card={card}
              tier="tier1-reminder"
              photoUrl={null}
            />
          ))}
        </div>
      )}
      <div className="text-center">
        <Link
          href="/capture"
          data-testid="capture-cta"
          className="text-sm text-[var(--color-text-primary-inverse)] underline underline-offset-2"
        >
          Capture something new
        </Link>
      </div>
    </div>
  );
}
