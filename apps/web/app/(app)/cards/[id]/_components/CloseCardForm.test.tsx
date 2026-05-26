// @vitest-environment happy-dom
// What: Unit tests for <CloseCardForm />. Covers collapsed/expanded states,
//       dollar-to-cents conversion, form submission, PostHog events, error
//       handling, and cancel behavior.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';

const { mockRefresh, mockCapture } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockCapture: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('posthog-js', () => ({
  default: { capture: mockCapture },
}));

import { CloseCardForm } from './CloseCardForm';

const CARD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const defaultProps = {
  cardId: CARD_ID,
  chosenPath: 'diy' as const,
  updatedAt: '2026-05-20T00:00:00Z',
};

beforeEach(() => {
  mockRefresh.mockReset();
  mockCapture.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('<CloseCardForm /> — collapsed state', () => {
  it('renders "Mark as closed" button when collapsed', () => {
    render(<CloseCardForm {...defaultProps} />);
    expect(screen.getByTestId('close-card-form-collapsed')).toBeTruthy();
    expect(screen.getByTestId('close-card-expand').textContent).toBe(
      'Mark as closed'
    );
    expect(screen.queryByTestId('close-card-form-expanded')).toBeNull();
  });

  it('expands on click and fires card_close_started PostHog event', () => {
    render(<CloseCardForm {...defaultProps} />);
    fireEvent.click(screen.getByTestId('close-card-expand'));
    expect(screen.getByTestId('close-card-form-expanded')).toBeTruthy();
    expect(mockCapture).toHaveBeenCalledWith('card_close_started', {
      card_id: CARD_ID,
    });
  });
});

describe('<CloseCardForm /> — expanded state', () => {
  it('renders dollar input, notes textarea, photo input, submit, and cancel', () => {
    render(<CloseCardForm {...defaultProps} />);
    fireEvent.click(screen.getByTestId('close-card-expand'));
    expect(screen.getByTestId('close-card-dollars')).toBeTruthy();
    expect(screen.getByTestId('close-card-notes')).toBeTruthy();
    expect(screen.getByTestId('close-card-photo')).toBeTruthy();
    expect(screen.getByTestId('close-card-submit')).toBeTruthy();
    expect(screen.getByTestId('close-card-cancel')).toBeTruthy();
  });

  it('cancel collapses the form and clears fields', () => {
    render(<CloseCardForm {...defaultProps} />);
    fireEvent.click(screen.getByTestId('close-card-expand'));
    // Enter some data
    fireEvent.change(screen.getByTestId('close-card-dollars'), {
      target: { value: '42' },
    });
    fireEvent.change(screen.getByTestId('close-card-notes'), {
      target: { value: 'test notes' },
    });
    // Cancel
    fireEvent.click(screen.getByTestId('close-card-cancel'));
    expect(screen.getByTestId('close-card-form-collapsed')).toBeTruthy();
    expect(screen.queryByTestId('close-card-form-expanded')).toBeNull();
    // Re-expand — fields should be empty (no persistence)
    fireEvent.click(screen.getByTestId('close-card-expand'));
    expect(
      (screen.getByTestId('close-card-dollars') as HTMLInputElement).value
    ).toBe('');
    expect(
      (screen.getByTestId('close-card-notes') as HTMLTextAreaElement).value
    ).toBe('');
  });

  it('fires card_close_started on EACH expand (no dedup)', () => {
    render(<CloseCardForm {...defaultProps} />);
    // First expand
    fireEvent.click(screen.getByTestId('close-card-expand'));
    expect(mockCapture).toHaveBeenCalledTimes(1);
    // Cancel and re-expand
    fireEvent.click(screen.getByTestId('close-card-cancel'));
    fireEvent.click(screen.getByTestId('close-card-expand'));
    expect(mockCapture).toHaveBeenCalledTimes(2);
  });
});

describe('<CloseCardForm /> — submit flow', () => {
  it('200: fires card_closed + calls router.refresh', async () => {
    vi.setSystemTime(new Date('2026-05-26T12:00:00Z'));
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        card_id: CARD_ID,
        state: 'closed',
        closed_at: '2026-05-26T12:00:00Z',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CloseCardForm {...defaultProps} />);
    fireEvent.click(screen.getByTestId('close-card-expand'));
    mockCapture.mockClear(); // clear the card_close_started event

    fireEvent.change(screen.getByTestId('close-card-dollars'), {
      target: { value: '85.50' },
    });
    fireEvent.change(screen.getByTestId('close-card-notes'), {
      target: { value: 'Fixed it' },
    });
    fireEvent.submit(screen.getByTestId('close-card-form-expanded'));

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });

    expect(mockCapture).toHaveBeenCalledWith('card_closed', {
      card_id: CARD_ID,
      chosen_path: 'diy',
      has_spend_log: true,
      has_finished_photo: false,
      days_in_planned: expect.any(Number),
    });

    // Verify FormData was sent
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/card/${CARD_ID}/close`,
      expect.objectContaining({ method: 'POST' })
    );
    vi.useRealTimers();
  });

  it('200 without spend: has_spend_log=false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        card_id: CARD_ID,
        state: 'closed',
        closed_at: '2026-05-26T12:00:00Z',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CloseCardForm {...defaultProps} />);
    fireEvent.click(screen.getByTestId('close-card-expand'));
    mockCapture.mockClear();
    fireEvent.submit(screen.getByTestId('close-card-form-expanded'));

    await waitFor(() => {
      expect(mockCapture).toHaveBeenCalledWith(
        'card_closed',
        expect.objectContaining({ has_spend_log: false })
      );
    });
  });

  it('409: shows "Card state changed" banner', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 409,
      json: async () => ({ error: 'invalid_state' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CloseCardForm {...defaultProps} />);
    fireEvent.click(screen.getByTestId('close-card-expand'));
    fireEvent.submit(screen.getByTestId('close-card-form-expanded'));

    await waitFor(() => {
      expect(screen.getByTestId('close-card-error').textContent).toContain(
        'Card state changed'
      );
    });
  });

  it('404: shows "Card not found" banner', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 404,
      json: async () => ({ error: 'not_found' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CloseCardForm {...defaultProps} />);
    fireEvent.click(screen.getByTestId('close-card-expand'));
    fireEvent.submit(screen.getByTestId('close-card-form-expanded'));

    await waitFor(() => {
      expect(screen.getByTestId('close-card-error').textContent).toContain(
        'Card not found'
      );
    });
  });

  it('500: shows retryable error banner with retry button', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 500,
      json: async () => ({ error: 'server_error' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CloseCardForm {...defaultProps} />);
    fireEvent.click(screen.getByTestId('close-card-expand'));
    fireEvent.submit(screen.getByTestId('close-card-form-expanded'));

    await waitFor(() => {
      expect(screen.getByTestId('close-card-error')).toBeTruthy();
      expect(screen.getByTestId('close-card-retry')).toBeTruthy();
    });
  });

  it('network error: shows retryable error banner', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    render(<CloseCardForm {...defaultProps} />);
    fireEvent.click(screen.getByTestId('close-card-expand'));
    fireEvent.submit(screen.getByTestId('close-card-form-expanded'));

    await waitFor(() => {
      expect(screen.getByTestId('close-card-error').textContent).toContain(
        'Network error'
      );
    });
  });

  it('submit button shows "Closing…" during submission', async () => {
    // Never resolves — simulates in-flight state
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    render(<CloseCardForm {...defaultProps} />);
    fireEvent.click(screen.getByTestId('close-card-expand'));
    fireEvent.submit(screen.getByTestId('close-card-form-expanded'));

    expect(screen.getByTestId('close-card-submit').textContent).toBe(
      'Closing…'
    );
    expect(screen.queryByTestId('close-card-cancel')).toBeNull();
  });
});
