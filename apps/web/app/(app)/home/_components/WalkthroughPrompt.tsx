export type WalkthroughPromptProps = {
  overdueCount: number;
};

/** Inline prompt text for walkthrough CTA. Parent provides container styling. */
export function WalkthroughPrompt({ overdueCount }: WalkthroughPromptProps) {
  if (overdueCount === 0) return null;

  return (
    <p
      data-testid="walkthrough-prompt"
      className="text-sm text-[var(--color-text-primary-inverse)]"
    >
      {overdueCount} {overdueCount === 1 ? 'item needs' : 'items need'} a
      check-in
    </p>
  );
}
