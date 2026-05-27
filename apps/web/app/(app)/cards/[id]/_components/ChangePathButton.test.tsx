// What: Unit tests for <ChangePathButton />. Verifies click behavior
//       and error display.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const { mockRefresh } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { ChangePathButton } from './ChangePathButton';

const CARD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  mockRefresh.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('<ChangePathButton />', () => {
  it('renders the change path button', () => {
    render(<ChangePathButton cardId={CARD_ID} />);
    expect(screen.getByTestId('change-path-button').textContent).toBe(
      'Change path'
    );
  });

  it('calls fetch and refreshes on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ card_id: CARD_ID, state: 'decide' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ChangePathButton cardId={CARD_ID} />);
    fireEvent.click(screen.getByTestId('change-path-button'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/card/${CARD_ID}/decide`,
        expect.objectContaining({ method: 'POST' })
      );
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows error on non-200 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 500,
      json: async () => ({ error: 'server_error' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ChangePathButton cardId={CARD_ID} />);
    fireEvent.click(screen.getByTestId('change-path-button'));

    await waitFor(() => {
      expect(screen.getByTestId('change-path-error')).toBeTruthy();
    });
  });
});
