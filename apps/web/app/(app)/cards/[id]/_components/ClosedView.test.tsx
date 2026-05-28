// @vitest-environment happy-dom
// What: Unit tests for <ClosedView />. Covers severity chip, closed chip,
//       closed_at date, spend log, diagnosis thread, and photo pair
//       delegation.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ClosedView, type ClosedViewProps } from './ClosedView';

// ConversationRow uses Sentry on the server
vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

afterEach(() => cleanup());

const defaultProps: ClosedViewProps = {
  cardId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  severity: 'soon',
  closedAt: '2026-05-26T12:00:00Z',
  diagnosis: 'Slow P-trap leak under the kitchen sink.',
  chosenPath: 'diy',
  actualSpendCents: 8550,
  spendNotes: 'P-trap kit + wrench',
  before: {
    url: 'https://signed.example/before.jpg',
    date: '2026-05-10T00:00:00Z',
  },
  after: {
    url: 'https://signed.example/after.jpg',
    date: '2026-05-26T12:00:00Z',
  },
  thread: [],
  photoTouchpointCount: 2,
};

describe('<ClosedView />', () => {
  it('renders severity chip when severity is non-null', () => {
    render(<ClosedView {...defaultProps} />);
    expect(screen.getByTestId('closed-severity-chip')).toBeTruthy();
    expect(screen.getByTestId('closed-severity-chip').textContent).toBe('soon');
  });

  it('renders calm-green "Closed" chip', () => {
    render(<ClosedView {...defaultProps} />);
    const chip = screen.getByTestId('closed-chip');
    expect(chip.textContent).toBe('closed');
    expect(chip.className).toContain('color-note');
  });

  it('renders closed_at date', () => {
    render(<ClosedView {...defaultProps} />);
    const dateEl = screen.getByTestId('closed-date');
    expect(dateEl.textContent).toContain('Closed on');
  });

  it('renders spend log when present', () => {
    render(<ClosedView {...defaultProps} />);
    const spend = screen.getByTestId('closed-spend');
    expect(spend.textContent).toContain('You spent: $85.50');
    expect(spend.textContent).toContain('P-trap kit + wrench');
  });

  it('hides spend section when actualSpendCents is null', () => {
    render(
      <ClosedView {...defaultProps} actualSpendCents={null} spendNotes={null} />
    );
    expect(screen.queryByTestId('closed-spend')).toBeNull();
  });

  it('renders spend without notes when spendNotes is null', () => {
    render(<ClosedView {...defaultProps} spendNotes={null} />);
    const spend = screen.getByTestId('closed-spend');
    expect(spend.textContent).toContain('$85.50');
    expect(spend.textContent).not.toContain('P-trap kit');
  });

  it('renders "How we diagnosed this" collapsible when thread has rows', () => {
    const thread = [
      {
        role: 'assistant' as const,
        round: 1,
        content: JSON.stringify({ summary: 'Initial read.' }),
        is_location_ask: false,
        tool_name: 'record_initial_read',
        created_at: '2026-05-10T00:00:00Z',
      },
    ];
    render(<ClosedView {...defaultProps} thread={thread} />);
    expect(screen.getByTestId('closed-how-we-diagnosed')).toBeTruthy();
    expect(screen.getByText('How we diagnosed this')).toBeTruthy();
  });

  it('omits "How we diagnosed this" when thread is empty', () => {
    render(<ClosedView {...defaultProps} thread={[]} />);
    expect(screen.queryByTestId('closed-how-we-diagnosed')).toBeNull();
  });

  it('does not render severity chip when severity is null', () => {
    render(<ClosedView {...defaultProps} severity={null} />);
    expect(screen.queryByTestId('closed-severity-chip')).toBeNull();
    // Closed chip should still render
    expect(screen.getByTestId('closed-chip')).toBeTruthy();
  });

  it('does not render closed_at line when closedAt is null', () => {
    render(<ClosedView {...defaultProps} closedAt={null} />);
    expect(screen.queryByTestId('closed-date')).toBeNull();
  });

  it('renders diagnosis text when present', () => {
    render(<ClosedView {...defaultProps} />);
    expect(
      screen.getByText('Slow P-trap leak under the kitchen sink.')
    ).toBeTruthy();
  });

  it('delegates to BeforeAfterPhotos with both photos', () => {
    render(<ClosedView {...defaultProps} />);
    expect(screen.getByTestId('before-after-photos')).toBeTruthy();
    expect(screen.getByAltText('Before photo')).toBeTruthy();
    expect(screen.getByAltText('After photo')).toBeTruthy();
  });

  it('delegates to BeforeAfterPhotos with placeholders when photos missing', () => {
    render(<ClosedView {...defaultProps} before={null} after={null} />);
    expect(screen.getByTestId('before-placeholder')).toBeTruthy();
    expect(screen.getByTestId('after-placeholder')).toBeTruthy();
  });

  it('formats spend with two decimal places (Gotcha #6)', () => {
    render(<ClosedView {...defaultProps} actualSpendCents={500} />);
    expect(screen.getByTestId('closed-spend').textContent).toContain('$5.00');
  });

  it('formats spend correctly for single cents (e.g. $0.01)', () => {
    render(<ClosedView {...defaultProps} actualSpendCents={1} />);
    expect(screen.getByTestId('closed-spend').textContent).toContain('$0.01');
  });

  it('renders the Compare photos link when photoTouchpointCount >= 2', () => {
    render(<ClosedView {...defaultProps} photoTouchpointCount={2} />);
    const link = screen.getByTestId('compare-photos-link');
    expect(link.getAttribute('href')).toBe(
      `/cards/${defaultProps.cardId}/compare`
    );
  });

  it('hides the Compare photos link when photoTouchpointCount < 2', () => {
    render(<ClosedView {...defaultProps} photoTouchpointCount={1} />);
    expect(screen.queryByTestId('compare-photos-link')).toBeNull();
  });
});
