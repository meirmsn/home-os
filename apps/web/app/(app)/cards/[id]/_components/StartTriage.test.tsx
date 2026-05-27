// @vitest-environment happy-dom
// What: Unit tests for <StartTriage />. Mocks posthog + Sentry + the
//       global fetch + next/navigation router.refresh. Covers: idle →
//       mid-fetch → state transitions on each response class, the
//       three PostHog events, and the refresh-on-success/refresh-on-409
//       behavior.
// Why:  Client surface is where all three D10 events fire (server
//       handler has no PostHog init). Locking the dispatch matrix
//       prevents regressions in latency_ms / error_class shape.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const { capture, captureException, routerRefresh } = vi.hoisted(() => ({
  capture: vi.fn(),
  captureException: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock('@/lib/posthog', () => ({
  posthog: { capture },
  initPostHog: () => ({ capture }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

vi.mock('@/app/(app)/_components/ByokKeyProvider', () => ({
  useByokKey: () => ({
    byokKey: null,
    setByokKey: vi.fn(),
    clearByokKey: vi.fn(),
  }),
}));

import { StartTriage } from './StartTriage';

const CARD_ID = '11111111-2222-3333-4444-555555555555';

/** Find a capture call by event name. */
function captureCall(event: string) {
  return capture.mock.calls.find(([name]) => name === event);
}

beforeEach(() => {
  capture.mockReset();
  captureException.mockReset();
  routerRefresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('<StartTriage />', () => {
  it('initial render: enabled "Read this for me" button', () => {
    render(<StartTriage cardId={CARD_ID} systemTag="plumbing" />);
    const btn = screen.getByRole('button', {
      name: /read this for me/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('on submit: fires triage_initial_read_started with card_id + system_tag and disables the button', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchMock = vi.fn(
      () => new Promise<Response>((res) => (resolveFetch = res))
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<StartTriage cardId={CARD_ID} systemTag="plumbing" />);
    const btn = screen.getByRole('button', { name: /read this for me/i });
    fireEvent.click(btn);

    expect(captureCall('triage_initial_read_started')).toBeTruthy();
    expect(captureCall('triage_initial_read_started')?.[1]).toEqual({
      card_id: CARD_ID,
      system_tag: 'plumbing',
    });
    // Disabled + spinner copy.
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: /reading…/i }) as HTMLButtonElement)
          .disabled
      ).toBe(true);
    });
    // Let the still-pending fetch resolve so React doesn't warn on unmount.
    resolveFetch({
      status: 200,
      json: async () => ({
        severity_provisional: 'soon',
        what_i_need_to_know: ['q1'],
      }),
    } as Response);
  });

  it('on 200: fires triage_initial_read_completed with latency_ms + severity + search_count, calls router.refresh', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        severity_provisional: 'soon',
        what_i_need_to_know: ['q1', 'q2', 'q3'],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<StartTriage cardId={CARD_ID} systemTag="plumbing" />);
    fireEvent.click(screen.getByRole('button', { name: /read this for me/i }));

    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const completed = captureCall('triage_initial_read_completed');
    expect(completed).toBeTruthy();
    expect(completed?.[1].card_id).toBe(CARD_ID);
    expect(completed?.[1].system_tag).toBe('plumbing');
    expect(completed?.[1].severity_provisional).toBe('soon');
    expect(typeof completed?.[1].latency_ms).toBe('number');
    expect(completed?.[1].latency_ms).toBeGreaterThanOrEqual(0);
    expect(completed?.[1].search_count).toBe(0);
  });

  it('on 202: fires triage_initial_read_failed with error_class=triage_in_progress; renders notice; refreshes after delay', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 202,
      json: async () => ({ error: 'triage_in_progress' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<StartTriage cardId={CARD_ID} systemTag="plumbing" />);
    fireEvent.click(screen.getByRole('button', { name: /read this for me/i }));

    await waitFor(() => {
      expect(screen.getByText(/already running/i)).toBeTruthy();
    });
    const failed = captureCall('triage_initial_read_failed');
    expect(failed?.[1].error_class).toBe('triage_in_progress');
    expect(typeof failed?.[1].latency_ms).toBe('number');
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled(), {
      timeout: 1500,
    });
  });

  it('on 409 already_triaged: renders the already-diagnosed notice + refreshes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 409,
      json: async () => ({ error: 'already_triaged' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<StartTriage cardId={CARD_ID} systemTag="plumbing" />);
    fireEvent.click(screen.getByRole('button', { name: /read this for me/i }));

    await waitFor(() => {
      expect(screen.getByText(/already diagnosed/i)).toBeTruthy();
    });
    const failed = captureCall('triage_initial_read_failed');
    expect(failed?.[1].error_class).toBe('already_triaged');
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled(), {
      timeout: 1500,
    });
  });

  it('on 429: fires triage_initial_read_failed error_class=triage_rate_limited; renders retry-eligible banner', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 429,
      json: async () => ({
        error: 'triage_rate_limited',
        retry_after_s: 45,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<StartTriage cardId={CARD_ID} systemTag="plumbing" />);
    fireEvent.click(screen.getByRole('button', { name: /read this for me/i }));

    await waitFor(() => {
      expect(screen.getByText(/rate-limited/i)).toBeTruthy();
    });
    expect(captureCall('triage_initial_read_failed')?.[1].error_class).toBe(
      'triage_rate_limited'
    );
    // Banner pair includes a retry button.
    expect(
      screen.getAllByRole('button', { name: /read this for me/i }).length
    ).toBeGreaterThan(0);
  });

  it('on 503: fires triage_initial_read_failed error_class=triage_unavailable; renders retry banner', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 503,
      json: async () => ({
        error: 'triage_unavailable',
        retry_after_s: 30,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<StartTriage cardId={CARD_ID} systemTag="plumbing" />);
    fireEvent.click(screen.getByRole('button', { name: /read this for me/i }));

    await waitFor(() => {
      expect(screen.getByText(/unavailable/i)).toBeTruthy();
    });
    expect(captureCall('triage_initial_read_failed')?.[1].error_class).toBe(
      'triage_unavailable'
    );
  });

  it('on network throw: fires triage_initial_read_failed error_class=network; renders retry banner', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    render(<StartTriage cardId={CARD_ID} systemTag="plumbing" />);
    fireEvent.click(screen.getByRole('button', { name: /read this for me/i }));

    await waitFor(() => {
      expect(screen.getByText(/connection issue/i)).toBeTruthy();
    });
    expect(captureCall('triage_initial_read_failed')?.[1].error_class).toBe(
      'network'
    );
    expect(captureException).toHaveBeenCalled();
  });

  it('retry-from-banner: clicking the retry button re-issues the POST', async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      calls += 1;
      return {
        status: 503,
        json: async () => ({
          error: 'triage_unavailable',
          retry_after_s: 30,
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<StartTriage cardId={CARD_ID} systemTag="plumbing" />);
    fireEvent.click(screen.getByRole('button', { name: /read this for me/i }));
    await waitFor(() => screen.getByText(/unavailable/i));
    fireEvent.click(screen.getByRole('button', { name: /read this for me/i }));
    await waitFor(() => expect(calls).toBe(2));
  });
});
