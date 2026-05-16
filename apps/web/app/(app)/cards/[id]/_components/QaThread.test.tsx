// @vitest-environment happy-dom
// What: Unit tests for <QaThread />. Locks the compact-thread filter
//       (initial-read excluded) + the nothing-to-show case (returns
//       null when there are no Q&A rounds yet).
// Why:  This surface only appears mid-Q&A; a regression that renders
//       the empty container at the just-after-initial-read state
//       would visually duplicate the PR #19 preview.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

import { QaThread, type QaThreadInputRow } from './QaThread';

afterEach(() => {
  cleanup();
});

/**
 *
 */
function row(o: Partial<QaThreadInputRow>): QaThreadInputRow {
  return {
    role: 'user',
    round: 2,
    content: 'x',
    is_location_ask: false,
    tool_name: null,
    created_at: '2026-05-16T00:00:00.000Z',
    ...o,
  };
}

describe('<QaThread />', () => {
  it('returns null (renders nothing) when only the initial-read assistant row is present', () => {
    const { container } = render(
      <QaThread
        rows={[
          row({
            role: 'assistant',
            round: 1,
            content: '{"summary":"x"}',
            tool_name: 'record_initial_read',
          }),
        ]}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when rows is empty', () => {
    const { container } = render(<QaThread rows={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one user row + one assistant question row for a single Q&A pair (excluding initial read)', () => {
    render(
      <QaThread
        rows={[
          row({
            role: 'assistant',
            round: 1,
            content: '{"summary":"init"}',
            tool_name: 'record_initial_read',
            created_at: '2026-05-16T00:00:00.000Z',
          }),
          row({
            role: 'user',
            round: 2,
            content: 'two weeks',
            created_at: '2026-05-16T00:01:00.000Z',
          }),
          row({
            role: 'assistant',
            round: 2,
            content: '{"question":"How big is the stain?"}',
            tool_name: 'ask_next_question',
            created_at: '2026-05-16T00:01:01.000Z',
          }),
        ]}
      />
    );
    expect(screen.getByTestId('qa-thread')).toBeTruthy();
    expect(screen.getByText(/conversation so far/i)).toBeTruthy();
    expect(screen.getByText(/your reply \(round 2\)/i)).toBeTruthy();
    expect(screen.getByText(/question 2/i)).toBeTruthy();
    // Initial-read row excluded:
    expect(screen.queryByText(/initial read/i)).toBeNull();
  });

  it('shows the Location tag on a location-ask user reply', () => {
    render(
      <QaThread
        rows={[
          row({
            role: 'assistant',
            round: 1,
            content: '{"summary":"x"}',
            tool_name: 'record_initial_read',
            created_at: '2026-05-16T00:00:00.000Z',
          }),
          row({
            role: 'user',
            round: 2,
            content: '94110',
            is_location_ask: true,
            created_at: '2026-05-16T00:01:00.000Z',
          }),
          row({
            role: 'assistant',
            round: 2,
            content: '{"question":"What climate zone?"}',
            tool_name: 'ask_next_question',
            is_location_ask: true,
            created_at: '2026-05-16T00:01:01.000Z',
          }),
        ]}
      />
    );
    // Both rows have the Location tag.
    expect(screen.getAllByTestId('location-tag').length).toBe(2);
  });
});
