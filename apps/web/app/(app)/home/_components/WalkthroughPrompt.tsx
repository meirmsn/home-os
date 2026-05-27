export type WalkthroughPromptProps = {
  overdueCount: number;
};

/** Inline prompt text for walkthrough CTA. Parent provides container styling. */
export function WalkthroughPrompt({ overdueCount }: WalkthroughPromptProps) {
  if (overdueCount === 0) return null;

  return (
    <div data-testid="walkthrough-prompt">
      <p className="text-sm font-semibold text-[var(--color-text-primary-inverse)]">
        {overdueCount} {overdueCount === 1 ? 'item needs' : 'items need'} a
        check-in
      </p>
      <p className="mt-1 text-xs text-[var(--color-text-secondary-inverse)]">
        Review overdue items one by one
      </p>
    </div>
  );
}
