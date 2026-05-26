// What: Usage bar showing "X of 5 sessions used" with a progress bar
//       and reset-day indicator. Pure presentational — receives data via
//       props from the server-rendered settings page.
// Why:  Spec D6 — surfaces the hidden 5/wk session cap with a clear
//       progress bar. Color shifts to terracotta at 5/5 to communicate
//       urgency without text color changes.

export type UsageBarProps = {
  /** Current triage session count for the week. */
  count: number;
  /** Whether the user has a BYOK key active (changes display text). */
  hasByokKey?: boolean;
};

/**
 * Usage bar: full-width 4px progress bar + count text + reset indicator.
 */
export function UsageBar({ count, hasByokKey = false }: UsageBarProps) {
  const atLimit = count >= 5;
  const fillPercent = Math.min((count / 5) * 100, 100);
  const fillColor = atLimit ? 'var(--color-act-soon)' : 'var(--color-planned)';

  return (
    <section aria-label="AI triage usage" className="space-y-2">
      <p className="text-sm text-[var(--color-text-secondary-inverse)]">
        AI triage this week
      </p>
      <p
        className="text-2xl font-semibold text-[var(--color-text-primary-inverse)]"
        data-testid="usage-count"
      >
        {hasByokKey
          ? `${count} sessions this week`
          : `${count} of 5 sessions used`}
      </p>

      {/* Progress bar — 4px height, full-width, rounded. */}
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-raised)]"
        role="progressbar"
        aria-valuenow={count}
        aria-valuemin={0}
        aria-valuemax={5}
        data-testid="usage-bar"
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${fillPercent}%`,
            backgroundColor: fillColor,
          }}
          data-testid="usage-bar-fill"
        />
      </div>

      <p className="text-xs text-[var(--color-text-secondary-inverse)]">
        Resets Monday
      </p>
    </section>
  );
}
