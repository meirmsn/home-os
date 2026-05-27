// What: Unit tests for <CheckInForm />. Verifies collapsed/expanded
//       states, form submission, PostHog event firing, error/retry states.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const { posthogCapture } = vi.hoisted(() => ({
  posthogCapture: vi.fn(),
}));

const { mockPush, mockRefresh } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { capture: posthogCapture },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

import { CheckInForm } from './CheckInForm';

const CARD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  posthogCapture.mockReset();
  mockPush.mockReset();
  mockRefresh.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('<CheckInForm />', () => {
  it('renders collapsed state with CTA button', () => {
    render(
      <CheckInForm cardId={CARD_ID} isOverdue={false} referencePhotos={[]} />
    );
    expect(screen.getByTestId('checkin-form-collapsed')).toBeTruthy();
    expect(screen.getByTestId('checkin-expand').textContent).toBe(
      'Check in now'
    );
  });

  it('expands to form on CTA click', () => {
    render(
      <CheckInForm cardId={CARD_ID} isOverdue={false} referencePhotos={[]} />
    );
    fireEvent.click(screen.getByTestId('checkin-expand'));
    expect(screen.getByTestId('checkin-form-expanded')).toBeTruthy();
    expect(screen.getByTestId('checkin-notes')).toBeTruthy();
    expect(screen.getByTestId('checkin-submit')).toBeTruthy();
  });

  it('cancel resets to collapsed state', () => {
    render(
      <CheckInForm cardId={CARD_ID} isOverdue={false} referencePhotos={[]} />
    );
    fireEvent.click(screen.getByTestId('checkin-expand'));
    fireEvent.click(screen.getByTestId('checkin-cancel'));
    expect(screen.getByTestId('checkin-form-collapsed')).toBeTruthy();
  });

  it('fires monitor_checkin_submitted on successful submit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        checkin_id: 'xxx',
        card_id: CARD_ID,
        next_check_at: '2026-06-10T00:00:00Z',
        photo_count: 0,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CheckInForm cardId={CARD_ID} isOverdue={true} referencePhotos={[]} />
    );
    fireEvent.click(screen.getByTestId('checkin-expand'));
    fireEvent.click(screen.getByTestId('checkin-submit'));

    await waitFor(() => {
      expect(posthogCapture).toHaveBeenCalledWith('monitor_checkin_submitted', {
        card_id: CARD_ID,
        photo_count: 0,
        has_notes: false,
        is_overdue: true,
      });
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows error state on non-200 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 500,
      json: async () => ({ error: 'server_error' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CheckInForm cardId={CARD_ID} isOverdue={false} referencePhotos={[]} />
    );
    fireEvent.click(screen.getByTestId('checkin-expand'));
    fireEvent.click(screen.getByTestId('checkin-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('checkin-error')).toBeTruthy();
    });
    expect(screen.getByTestId('checkin-retry')).toBeTruthy();
  });

  it('shows reference photos when provided', () => {
    render(
      <CheckInForm
        cardId={CARD_ID}
        isOverdue={false}
        referencePhotos={[{ slot: 'wide', url: 'https://example.com/ref.jpg' }]}
      />
    );
    fireEvent.click(screen.getByTestId('checkin-expand'));
    expect(screen.getByTestId('reference-photo-wide')).toBeTruthy();
  });
});
