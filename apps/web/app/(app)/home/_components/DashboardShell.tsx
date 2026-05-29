'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { DashboardCardRow } from '../_lib/tier-cards';
import { DashboardCard } from './DashboardCard';
import { FilterBar, type FilterTab } from './FilterBar';
import { EmptyState } from './EmptyState';
import { WalkthroughPrompt } from './WalkthroughPrompt';
import { WalkthroughMode, type WalkthroughCard } from './WalkthroughMode';
import { DashboardViewedCapture } from './DashboardViewedCapture';

export type DashboardShellProps = {
  tier1: DashboardCardRow[];
  tier2: DashboardCardRow[];
  planned: DashboardCardRow[];
  all: DashboardCardRow[];
  overdueMonitor: DashboardCardRow[];
  photoMap: Record<string, string>;
  hasReminderDue: boolean;
  walkthroughCards: WalkthroughCard[];
  totalCards: number;
  tier1Count: number;
  tier2Count: number;
  plannedCount: number;
  triagePendingCount: number;
};

/**
 *
 */
export function DashboardShell({
  tier1,
  tier2,
  planned,
  all,
  overdueMonitor,
  photoMap,
  hasReminderDue,
  walkthroughCards,
  totalCards,
  tier1Count,
  tier2Count,
  plannedCount,
  triagePendingCount,
}: DashboardShellProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('attention');
  const [walkthroughActive, setWalkthroughActive] = useState(false);

  const hasOverdueMonitor = overdueMonitor.length > 0;

  return (
    <section className="mx-auto w-full max-w-[720px]">
      <FilterBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasReminderDue={hasReminderDue}
        disabled={walkthroughActive}
      />

      <div className="px-4 pt-3">
        <Link
          href="/contractor-questions"
          data-testid="contractor-questions-link"
          className="inline-flex min-h-11 items-center text-sm text-[var(--color-text-primary-inverse)] underline underline-offset-2"
        >
          Contractor questions
        </Link>
      </div>

      <div className="py-4">
        {walkthroughActive ? (
          <WalkthroughMode
            overdueCards={walkthroughCards}
            onExit={() => setWalkthroughActive(false)}
          />
        ) : (
          <>
            {activeTab === 'attention' && (
              <AttentionTab
                tier1={tier1}
                tier2={tier2}
                planned={planned}
                photoMap={photoMap}
                hasOverdueMonitor={hasOverdueMonitor}
                overdueCount={overdueMonitor.length}
                onStartWalkthrough={() => setWalkthroughActive(true)}
              />
            )}

            {activeTab === 'planned' && (
              <PlannedTab planned={planned} photoMap={photoMap} />
            )}

            {activeTab === 'all' && <AllTab all={all} photoMap={photoMap} />}
          </>
        )}
      </div>

      <DashboardViewedCapture
        totalCards={totalCards}
        tier1Count={tier1Count}
        tier2Count={tier2Count}
        plannedCount={plannedCount}
        triagePendingCount={triagePendingCount}
        hasOverdueMonitor={hasOverdueMonitor}
      />
    </section>
  );
}

/**
 *
 */
function AttentionTab({
  tier1,
  tier2,
  planned,
  photoMap,
  hasOverdueMonitor,
  overdueCount,
  onStartWalkthrough,
}: {
  tier1: DashboardCardRow[];
  tier2: DashboardCardRow[];
  planned: DashboardCardRow[];
  photoMap: Record<string, string>;
  hasOverdueMonitor: boolean;
  overdueCount: number;
  onStartWalkthrough: () => void;
}) {
  if (tier1.length === 0 && tier2.length === 0) {
    return (
      <EmptyState variant="nothing-active" promotedPlannedCards={planned} />
    );
  }

  const tier1ActSoon = tier1.filter(
    (c) => c.state === 'decide' || c.state === 'diagnosed'
  );
  const tier1Reminder = tier1.filter((c) => c.state === 'planned');
  const tier2Overdue = tier2.filter((c) => c.state === 'monitoring');
  const tier2Triage = tier2.filter(
    (c) => c.state === 'capturing' || c.state === 'triaging'
  );

  return (
    <div className="space-y-4">
      {hasOverdueMonitor && (
        <div className="px-4">
          <p
            data-testid="walkthrough-prompt-wrapper"
            className="px-1 text-sm text-[var(--color-text-primary-inverse)]"
          >
            <WalkthroughPrompt overdueCount={overdueCount} />
            {' — '}
            <button
              type="button"
              data-testid="start-walkthrough"
              onClick={onStartWalkthrough}
              className="underline underline-offset-2"
            >
              Start walkthrough
            </button>
          </p>
        </div>
      )}

      {tier1ActSoon.length > 0 && (
        <div className="space-y-6">
          <h2 className="px-4 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary-inverse)]">
            Act soon
          </h2>
          {tier1ActSoon.map((card) => (
            <DashboardCard
              key={card.id}
              card={card}
              tier="tier1-act-soon"
              photoUrl={photoMap[card.id] ?? null}
            />
          ))}
        </div>
      )}

      {tier1Reminder.length > 0 && (
        <div className="space-y-6">
          {tier1Reminder.map((card) => (
            <DashboardCard
              key={card.id}
              card={card}
              tier="tier1-reminder"
              photoUrl={photoMap[card.id] ?? null}
            />
          ))}
        </div>
      )}

      {tier2Overdue.length > 0 && (
        <div className="pt-4">
          <h2 className="px-4 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary-inverse)]">
            Needs check-in
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-1">
            {tier2Overdue.map((card) => (
              <DashboardCard
                key={card.id}
                card={card}
                tier="tier2"
                photoUrl={photoMap[card.id] ?? null}
              />
            ))}
          </div>
        </div>
      )}

      {tier2Triage.length > 0 && (
        <div className="pt-4">
          <h2 className="px-4 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary-inverse)]">
            Triage pending
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-1">
            {tier2Triage.map((card) => (
              <DashboardCard
                key={card.id}
                card={card}
                tier="tier2-triage"
                photoUrl={photoMap[card.id] ?? null}
              />
            ))}
          </div>
        </div>
      )}

      <div className="px-4 pt-4 text-center">
        <Link
          href="/capture"
          data-testid="capture-cta-attention"
          className="inline-flex min-h-11 items-center rounded-md bg-[var(--color-surface-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-text-on-primary)] hover:bg-[var(--color-surface-primary-hover)]"
        >
          + Capture
        </Link>
      </div>
    </div>
  );
}

/**
 *
 */
function PlannedTab({
  planned,
  photoMap,
}: {
  planned: DashboardCardRow[];
  photoMap: Record<string, string>;
}) {
  if (planned.length === 0) {
    return <EmptyState variant="tab-empty" tabName="planned" />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6 lg:grid-cols-1">
      {planned.map((card) => (
        <DashboardCard
          key={card.id}
          card={card}
          tier="planned"
          photoUrl={photoMap[card.id] ?? null}
        />
      ))}
    </div>
  );
}

/**
 *
 */
function AllTab({
  all,
  photoMap,
}: {
  all: DashboardCardRow[];
  photoMap: Record<string, string>;
}) {
  if (all.length === 0) {
    return <EmptyState variant="first-time" />;
  }

  return (
    <div className="space-y-4">
      {all.map((card) => {
        const tier =
          card.state === 'decide' || card.state === 'diagnosed'
            ? ('tier1-act-soon' as const)
            : card.state === 'planned'
              ? ('planned' as const)
              : card.state === 'monitoring'
                ? ('tier2' as const)
                : ('tier2-triage' as const);
        return (
          <DashboardCard
            key={card.id}
            card={card}
            tier={tier}
            photoUrl={photoMap[card.id] ?? null}
          />
        );
      })}
    </div>
  );
}
