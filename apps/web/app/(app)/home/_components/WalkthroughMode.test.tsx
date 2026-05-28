// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

const { posthogCapture } = vi.hoisted(() => ({
  posthogCapture: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { capture: posthogCapture },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Stub CheckInForm to avoid complex form rendering
vi.mock('@/app/(app)/cards/[id]/_components/CheckInForm', () => ({
  CheckInForm: ({
    cardId,
    onCheckinSuccess,
  }: {
    cardId: string;
    isOverdue: boolean;
    referencePhotos: unknown[];
    onCheckinSuccess?: () => void;
  }) => (
    <div data-testid={`checkin-form-${cardId}`}>
      <button
        data-testid="mock-checkin-submit"
        onClick={() => onCheckinSuccess?.()}
      >
        Submit check-in
      </button>
    </div>
  ),
}));

import { WalkthroughMode, type WalkthroughCard } from './WalkthroughMode';

/**
 *
 */
function makeWalkthroughCard(
  overrides: Partial<WalkthroughCard> = {}
): WalkthroughCard {
  return {
    id: 'card-1',
    title: 'Leaky faucet',
    severity: 'monitor',
    system_tag: 'plumbing',
    photoUrl: null,
    referencePhotos: [],
    cadenceDays: 30,
    ...overrides,
  };
}

beforeEach(() => {
  posthogCapture.mockReset();
});

afterEach(() => cleanup());

describe('WalkthroughMode', () => {
  it('renders card info + check-in form for first overdue card', () => {
    const cards = [makeWalkthroughCard({ id: 'c1', title: 'Card One' })];
    render(<WalkthroughMode overdueCards={cards} onExit={() => {}} />);
    expect(screen.getByText('Card One')).toBeTruthy();
    expect(screen.getByTestId('checkin-form-c1')).toBeTruthy();
  });

  it('shows progress indicator "Card 1 of N"', () => {
    const cards = [
      makeWalkthroughCard({ id: 'c1' }),
      makeWalkthroughCard({ id: 'c2' }),
    ];
    render(<WalkthroughMode overdueCards={cards} onExit={() => {}} />);
    expect(screen.getByTestId('walkthrough-progress').textContent).toBe(
      'Card 1 of 2'
    );
  });

  it('after check-in submit: shows keep/change options', () => {
    const cards = [makeWalkthroughCard({ id: 'c1' })];
    render(<WalkthroughMode overdueCards={cards} onExit={() => {}} />);
    fireEvent.click(screen.getByTestId('mock-checkin-submit'));
    expect(screen.getByTestId('walkthrough-post-checkin')).toBeTruthy();
    expect(screen.getByTestId('walkthrough-keep-monitoring')).toBeTruthy();
    expect(screen.getByTestId('walkthrough-change-path')).toBeTruthy();
  });

  it('"Keep monitoring" advances to next card', () => {
    const cards = [
      makeWalkthroughCard({ id: 'c1', title: 'Card One' }),
      makeWalkthroughCard({ id: 'c2', title: 'Card Two' }),
    ];
    render(<WalkthroughMode overdueCards={cards} onExit={() => {}} />);
    // Submit check-in for card 1
    fireEvent.click(screen.getByTestId('mock-checkin-submit'));
    // Keep monitoring
    fireEvent.click(screen.getByTestId('walkthrough-keep-monitoring'));
    // Should now show card 2
    expect(screen.getByText('Card Two')).toBeTruthy();
    expect(screen.getByTestId('walkthrough-progress').textContent).toBe(
      'Card 2 of 2'
    );
  });

  it('"Change path" links to /cards/[id]', () => {
    const cards = [makeWalkthroughCard({ id: 'c1' })];
    render(<WalkthroughMode overdueCards={cards} onExit={() => {}} />);
    fireEvent.click(screen.getByTestId('mock-checkin-submit'));
    expect(
      screen.getByTestId('walkthrough-change-path').getAttribute('href')
    ).toBe('/cards/c1');
  });

  it('after all cards: shows "All caught up!" + fires walkthrough_completed', () => {
    const cards = [makeWalkthroughCard({ id: 'c1' })];
    render(<WalkthroughMode overdueCards={cards} onExit={() => {}} />);
    // Submit + keep monitoring
    fireEvent.click(screen.getByTestId('mock-checkin-submit'));
    fireEvent.click(screen.getByTestId('walkthrough-keep-monitoring'));
    expect(screen.getByTestId('walkthrough-complete')).toBeTruthy();
    expect(screen.getByText('All caught up!')).toBeTruthy();
    expect(posthogCapture).toHaveBeenCalledWith('walkthrough_completed', {
      cards_checked: 1,
      cards_skipped: 0,
    });
  });

  it('"Exit walkthrough" returns to normal view without firing completion event', () => {
    const onExit = vi.fn();
    const cards = [makeWalkthroughCard({ id: 'c1' })];
    render(<WalkthroughMode overdueCards={cards} onExit={onExit} />);
    fireEvent.click(screen.getByTestId('walkthrough-exit'));
    expect(onExit).toHaveBeenCalled();
    expect(posthogCapture).not.toHaveBeenCalledWith(
      'walkthrough_completed',
      expect.anything()
    );
  });

  it('fires walkthrough_started on mount', () => {
    const cards = [makeWalkthroughCard({ id: 'c1' })];
    render(<WalkthroughMode overdueCards={cards} onExit={() => {}} />);
    expect(posthogCapture).toHaveBeenCalledWith('walkthrough_started', {
      overdue_count: 1,
    });
  });

  it('skip advances without counting as checked', () => {
    const cards = [
      makeWalkthroughCard({ id: 'c1' }),
      makeWalkthroughCard({ id: 'c2' }),
    ];
    render(<WalkthroughMode overdueCards={cards} onExit={() => {}} />);
    // Skip card 1
    fireEvent.click(screen.getByTestId('walkthrough-skip'));
    // Submit + keep for card 2
    fireEvent.click(screen.getByTestId('mock-checkin-submit'));
    fireEvent.click(screen.getByTestId('walkthrough-keep-monitoring'));
    expect(posthogCapture).toHaveBeenCalledWith('walkthrough_completed', {
      cards_checked: 1,
      cards_skipped: 1,
    });
  });
});
