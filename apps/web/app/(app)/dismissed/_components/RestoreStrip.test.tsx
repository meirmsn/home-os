// @vitest-environment happy-dom
// What: Unit tests for <RestoreStrip />. Covers: initial collapsed
//       state shows only the trigger; tapping it reveals the canonical
//       confirm copy + Cancel button; Confirm POSTs to /api/card/[id]/
//       restore and calls onRestored on 200; 404 / 409 / network paths
//       surface inline error copy and DON'T fire onRestored.
// Why:  Three failure paths + one success path = the contract. Lock
//       them so a future "smart" rewrite can't quietly degrade.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const { captureException, routerRefresh } = vi.hoisted(() => ({
  captureException: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

import { RestoreStrip } from './RestoreStrip';

beforeEach(() => {
  captureException.mockReset();
  routerRefresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('<RestoreStrip />', () => {
  it('starts collapsed (only the "Restore" trigger is shown)', () => {
    render(<RestoreStrip cardId="card-1" />);
    expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
    expect(screen.queryByText(/AI triage session/i)).toBeNull();
  });

  it('expanding the strip reveals the canonical confirm copy + Cancel', () => {
    render(<RestoreStrip cardId="card-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(
      screen.getByText(/Restoring will start a new AI triage session/i)
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('Cancel returns to the collapsed state without firing a fetch', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<RestoreStrip cardId="card-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // After cancel: confirm copy gone, fetch never called.
    expect(screen.queryByText(/AI triage session/i)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Confirm: 200 path calls onRestored with the card id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const onRestored = vi.fn();
    render(<RestoreStrip cardId="card-99" onRestored={onRestored} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledWith('card-99'));
    expect(fetchMock).toHaveBeenCalledWith('/api/card/card-99/restore', {
      method: 'POST',
    });
  });

  it('Confirm: 200 path falls back to router.refresh when no onRestored', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    render(<RestoreStrip cardId="card-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalledTimes(1));
  });

  it('Confirm: 404 path surfaces "Card not found" and does NOT fire onRestored', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    const onRestored = vi.fn();
    render(<RestoreStrip cardId="card-1" onRestored={onRestored} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(screen.getByText(/Card not found/i)).toBeTruthy()
    );
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('Confirm: 409 path surfaces "Card is not in a dismissed state"', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 409 });
    vi.stubGlobal('fetch', fetchMock);
    render(<RestoreStrip cardId="card-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(screen.getByText(/not in a dismissed state/i)).toBeTruthy()
    );
  });

  it('Confirm: network error surfaces generic copy and captures to Sentry', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    render(<RestoreStrip cardId="card-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(screen.getByText(/Couldn.t restore/i)).toBeTruthy()
    );
    expect(captureException).toHaveBeenCalled();
  });
});
