import Link from 'next/link';
import { severityChipClasses } from '@/app/(app)/cards/[id]/_components/_severity-chip';
import type { DashboardCardRow, Severity } from '../_lib/tier-cards';

export type DashboardCardTier =
  | 'tier1-act-soon'
  | 'tier1-reminder'
  | 'tier2'
  | 'tier2-triage'
  | 'planned';

export type DashboardCardProps = {
  card: DashboardCardRow;
  tier: DashboardCardTier;
  photoUrl: string | null;
};

/**
 *
 */
function humanDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 *
 */
export function DashboardCard({ card, tier, photoUrl }: DashboardCardProps) {
  const displayTitle =
    card.title || card.initial_description || 'Untitled card';

  if (tier === 'tier1-act-soon') {
    return (
      <Link
        href={`/cards/${card.id}`}
        data-testid={`dashboard-card-${card.id}`}
        className="block w-full min-h-11 bg-[var(--color-surface-tier1,#F7F7F5)] overflow-hidden"
      >
        <div className="relative">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="w-full aspect-video object-cover"
              data-testid="card-photo"
            />
          ) : (
            <div
              className="w-full aspect-video bg-[var(--color-surface-input)]"
              data-testid="card-photo-placeholder"
            />
          )}
          {card.severity && <SeverityChipOverlay severity={card.severity} />}
          {card.system_tag && (
            <span className="absolute top-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
              {card.system_tag}
            </span>
          )}
        </div>
        <div className="p-4 space-y-1">
          <h3 className="text-xl font-semibold text-[var(--color-text-primary-inverse)]">
            {displayTitle}
          </h3>
          {card.diagnosis && (
            <p className="text-sm text-[var(--color-text-secondary-inverse)] line-clamp-1">
              {card.diagnosis}
            </p>
          )}
        </div>
      </Link>
    );
  }

  if (tier === 'tier1-reminder') {
    return (
      <Link
        href={`/cards/${card.id}`}
        data-testid={`dashboard-card-${card.id}`}
        className="block w-full min-h-11 bg-[var(--color-surface-tier1,#F7F7F5)] overflow-hidden"
      >
        <div className="w-full aspect-video bg-[var(--color-surface-input)] flex items-center justify-center">
          <span className="text-2xl font-light text-[var(--color-text-secondary-inverse)]">
            {card.system_tag ?? 'other'}
          </span>
        </div>
        <div className="p-4 space-y-2">
          <h3 className="text-xl font-semibold text-[var(--color-text-primary-inverse)]">
            {displayTitle}
          </h3>
          {card.planned_reminder_date && (
            <span
              data-testid="reminder-chip"
              className="inline-flex items-center rounded-full border border-[var(--color-monitor)] px-3 py-1 text-xs text-[var(--color-monitor)]"
            >
              Revisit by {humanDate(card.planned_reminder_date)}
            </span>
          )}
          <p className="text-sm text-[var(--color-text-secondary-inverse)]">
            {card.chosen_path === 'diy'
              ? 'DIY'
              : card.chosen_path === 'contractor'
                ? 'Contractor'
                : ''}
          </p>
        </div>
      </Link>
    );
  }

  if (tier === 'tier2-triage') {
    return (
      <Link
        href={`/cards/${card.id}`}
        data-testid={`dashboard-card-${card.id}`}
        className="block mx-4 min-h-11 rounded-md bg-[var(--color-surface-tier2,#EEECEA)] overflow-hidden"
      >
        <div className="flex gap-3 p-4">
          <div className="shrink-0 w-28">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                className="w-full aspect-[4/3] object-cover rounded-md"
                data-testid="card-photo"
              />
            ) : (
              <div
                className="w-full aspect-[4/3] bg-[var(--color-surface-input)] rounded-md"
                data-testid="card-photo-placeholder"
              />
            )}
          </div>
          <div className="space-y-1 min-w-0">
            <h3 className="text-base font-semibold text-[var(--color-text-primary-inverse)]">
              {displayTitle}
            </h3>
            <span
              data-testid="triage-pending-chip"
              className="inline-flex items-center rounded-full border border-[var(--color-text-secondary-inverse)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary-inverse)]"
            >
              triage pending
            </span>
          </div>
        </div>
      </Link>
    );
  }

  if (tier === 'tier2') {
    return (
      <Link
        href={`/cards/${card.id}`}
        data-testid={`dashboard-card-${card.id}`}
        className="block mx-4 min-h-11 rounded-md bg-[var(--color-surface-tier2,#EEECEA)] overflow-hidden"
      >
        <div className="flex gap-3 p-4">
          <div className="shrink-0 w-28">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                className="w-full aspect-[4/3] object-cover rounded-md"
                data-testid="card-photo"
              />
            ) : (
              <div
                className="w-full aspect-[4/3] bg-[var(--color-surface-input)] rounded-md"
                data-testid="card-photo-placeholder"
              />
            )}
          </div>
          <div className="space-y-1 min-w-0">
            <h3 className="text-base font-semibold text-[var(--color-text-primary-inverse)]">
              {displayTitle}
            </h3>
            {card.severity && <SmallSeverityChip severity={card.severity} />}
            <p className="text-xs text-[var(--color-text-secondary-inverse)]">
              Overdue
            </p>
          </div>
        </div>
      </Link>
    );
  }

  // planned
  return (
    <Link
      href={`/cards/${card.id}`}
      data-testid={`dashboard-card-${card.id}`}
      className="block mx-4 min-h-11 rounded-md bg-[var(--color-surface-planned,#E2E0DC)] overflow-hidden"
    >
      <div className="flex gap-3 p-4">
        <div className="shrink-0 w-28">
          <div className="w-full aspect-[4/3] bg-[var(--color-surface-input)] rounded-md flex items-center justify-center">
            <span className="text-base font-light text-[var(--color-text-secondary-inverse)]">
              {card.system_tag ?? 'other'}
            </span>
          </div>
        </div>
        <div className="space-y-1 min-w-0">
          <h3 className="text-base font-normal text-[var(--color-text-primary-inverse)]">
            {displayTitle}
          </h3>
          <span
            data-testid="planned-chip"
            className="inline-flex items-center rounded-full border border-[var(--color-border-subtle)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary-inverse)]"
          >
            planned - {card.chosen_path === 'contractor' ? 'contractor' : 'diy'}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Positioned severity chip overlay for card photos. */
function SeverityChipOverlay({ severity }: { severity: Severity }) {
  const { bg, text, label } = severityChipClasses(severity);
  return (
    <span
      data-testid="severity-chip"
      className={`absolute bottom-2 left-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider ${bg} ${text}`}
    >
      {label}
    </span>
  );
}

/**
 *
 */
function SmallSeverityChip({ severity }: { severity: Severity }) {
  const { bg, text, label } = severityChipClasses(severity);
  return (
    <span
      data-testid="severity-chip"
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${bg} ${text}`}
    >
      {label}
    </span>
  );
}
