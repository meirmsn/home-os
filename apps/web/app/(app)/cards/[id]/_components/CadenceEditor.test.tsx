// What: Unit tests for <CadenceEditor />. Verifies display state,
//       editing expansion, save/cancel, PostHog event firing.

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

const { mockRefresh } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { capture: posthogCapture },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { CadenceEditor } from './CadenceEditor';

const CARD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => {
  posthogCapture.mockReset();
  mockRefresh.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('<CadenceEditor />', () => {
  it('displays current cadence', () => {
    render(<CadenceEditor cardId={CARD_ID} cadenceDays={30} />);
    expect(screen.getByTestId('cadence-editor-display')).toBeTruthy();
    expect(screen.getByText('Check-in every 30 days')).toBeTruthy();
  });

  it('expands to edit on click', () => {
    render(<CadenceEditor cardId={CARD_ID} cadenceDays={30} />);
    fireEvent.click(screen.getByTestId('cadence-editor-edit'));
    expect(screen.getByTestId('cadence-editor-form')).toBeTruthy();
    const input = screen.getByTestId(
      'cadence-editor-input'
    ) as HTMLInputElement;
    expect(input.value).toBe('30');
  });

  it('cancel resets to display state', () => {
    render(<CadenceEditor cardId={CARD_ID} cadenceDays={30} />);
    fireEvent.click(screen.getByTestId('cadence-editor-edit'));
    fireEvent.click(screen.getByTestId('cadence-editor-cancel'));
    expect(screen.getByTestId('cadence-editor-display')).toBeTruthy();
  });

  it('fires monitor_cadence_changed on successful save', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        card_id: CARD_ID,
        monitoring_cadence_days: 14,
        next_check_at: '2026-06-10T00:00:00Z',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CadenceEditor cardId={CARD_ID} cadenceDays={30} />);
    fireEvent.click(screen.getByTestId('cadence-editor-edit'));
    fireEvent.change(screen.getByTestId('cadence-editor-input'), {
      target: { value: '14' },
    });
    fireEvent.click(screen.getByTestId('cadence-editor-save'));

    await waitFor(() => {
      expect(posthogCapture).toHaveBeenCalledWith('monitor_cadence_changed', {
        card_id: CARD_ID,
        old_cadence: 30,
        new_cadence: 14,
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

    render(<CadenceEditor cardId={CARD_ID} cadenceDays={30} />);
    fireEvent.click(screen.getByTestId('cadence-editor-edit'));
    fireEvent.click(screen.getByTestId('cadence-editor-save'));

    await waitFor(() => {
      expect(screen.getByTestId('cadence-editor-error')).toBeTruthy();
    });
  });
});
