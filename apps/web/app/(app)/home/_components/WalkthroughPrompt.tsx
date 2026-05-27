export type WalkthroughPromptProps = {
  overdueCount: number;
};

/** Inline prompt text for walkthrough CTA. Parent provides container styling. */
export function WalkthroughPrompt({ overdueCount }: WalkthroughPromptProps) {
  if (overdueCount === 0) return null;

  return (
    <span data-testid="walkthrough-prompt">
      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--color-act-soon,#C4622D)]" />
      {overdueCount} {overdueCount === 1 ? 'item needs' : 'items need'} a
      check-in
    </span>
  );
}
