// @vitest-environment happy-dom
// What: Unit tests for <AnswerThread />. Mocks posthog + Sentry +
//       global fetch + next/navigation router.refresh. Covers Send +
//       Skip happy paths, the four PostHog events, the response-class
//       dispatch matrix (200 ask / 200 confirm / 409 already_confirmed
//       / 429 / 503 / 502 / network), and the Skip-button visibility
//       gate.
// Why:  The Q&A surface is where all four D7 events fire (server
//       handler has no PostHog init). Locking the dispatch matrix
//       here prevents regressions in error_class / latency_ms / round
//       number shape.

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

import { AnswerThread } from './AnswerThread';

const CARD_ID = '11111111-2222-3333-4444-555555555555';

/**
 *
 */
function captureCall(event: string) {
  return capture.mock.calls.find(([name]) => name === event);
}

/**
 *
 */
function defaultProps(
  overrides: Partial<Parameters<typeof AnswerThread>[0]> = {}
) {
  return {
    cardId: CARD_ID,
    activeQuestion: 'How long has it been there?',
    activeQuestionIsLocationAsk: false,
    qaUserCount: 0,
    contractorTag: 'plumber',
    ...overrides,
  };
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

/**
 *
 */
function typeAnswer(text: string) {
  const ta = screen.getByTestId('answer-textarea') as HTMLTextAreaElement;
  fireEvent.change(ta, { target: { value: text } });
}

describe('<AnswerThread /> — initial render', () => {
  it('renders the active question, textarea, and Send button', () => {
    render(<AnswerThread {...defaultProps()} />);
    expect(screen.getByTestId('active-question').textContent).toBe(
      'How long has it been there?'
    );
    expect(screen.getByTestId('answer-textarea')).toBeTruthy();
    expect(screen.getByTestId('answer-send')).toBeTruthy();
  });

  it('Send button is disabled when textarea is empty', () => {
    render(<AnswerThread {...defaultProps()} />);
    const btn = screen.getByTestId('answer-send') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('Skip button is hidden when qaUserCount=0 (round 0)', () => {
    render(<AnswerThread {...defaultProps({ qaUserCount: 0 })} />);
    expect(screen.queryByTestId('answer-skip')).toBeNull();
  });

  it('Skip button is visible when qaUserCount>=1', () => {
    render(<AnswerThread {...defaultProps({ qaUserCount: 1 })} />);
    expect(screen.getByTestId('answer-skip')).toBeTruthy();
  });

  it('renders "Location question" label when activeQuestionIsLocationAsk=true', () => {
    render(
      <AnswerThread {...defaultProps({ activeQuestionIsLocationAsk: true })} />
    );
    expect(screen.getByText(/location question/i)).toBeTruthy();
  });
});

describe('<AnswerThread /> — Send happy paths', () => {
  it('on Send: fires triage_qa_round_started with is_skip=false and POST body has answer', async () => {
    let lastFetchInit: RequestInit | null = null;
    let resolveFetch!: (r: Response) => void;
    const fetchMock = vi.fn(
      (_: string, init: RequestInit) =>
        new Promise<Response>((res) => {
          lastFetchInit = init;
          resolveFetch = res;
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<AnswerThread {...defaultProps()} />);
    typeAnswer('two weeks');
    fireEvent.click(screen.getByTestId('answer-send'));

    expect(captureCall('triage_qa_round_started')).toBeTruthy();
    expect(captureCall('triage_qa_round_started')?.[1]).toEqual({
      card_id: CARD_ID,
      round_number: 1,
      is_skip: false,
    });
    // Mid-fetch: Sending… spinner copy
    await waitFor(() => {
      expect(screen.getByText(/sending…/i)).toBeTruthy();
    });
    // Body has the answer text.
    expect(lastFetchInit).not.toBeNull();
    const body = JSON.parse((lastFetchInit!.body as string) ?? '{}');
    expect(body.card_id).toBe(CARD_ID);
    expect(body.answer).toBe('two weeks');
    expect(body.skip).toBeUndefined();
    // Resolve to let unmount complete cleanly.
    resolveFetch({
      status: 200,
      json: async () => ({
        tool: 'ask_next_question',
        card_id: CARD_ID,
        round_number: 1,
        question: 'next',
        is_location_ask: false,
        updated_provisional_severity: 'monitor',
      }),
    } as Response);
  });

  it('on 200 ask_next_question: fires triage_qa_round_completed + router.refresh()', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          tool: 'ask_next_question',
          card_id: CARD_ID,
          round_number: 1,
          question: 'next',
          is_location_ask: true,
          updated_provisional_severity: 'soon',
        }),
      })
    );
    render(<AnswerThread {...defaultProps()} />);
    typeAnswer('answer');
    fireEvent.click(screen.getByTestId('answer-send'));

    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const completed = captureCall('triage_qa_round_completed');
    expect(completed).toBeTruthy();
    expect(completed?.[1].card_id).toBe(CARD_ID);
    expect(completed?.[1].round_number).toBe(1);
    expect(completed?.[1].is_location_ask).toBe(true);
    expect(typeof completed?.[1].latency_ms).toBe('number');
    expect(completed?.[1].search_count).toBe(0);
  });

  it('on 200 confirm_assessment: fires triage_qa_confirmed with severity + cadence + was_forced + router.refresh()', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          tool: 'confirm_assessment',
          card_id: CARD_ID,
          severity_confirmed: 'urgent',
          monitoring_cadence_days: 3,
          was_forced: true,
        }),
      })
    );
    render(<AnswerThread {...defaultProps({ qaUserCount: 2 })} />);
    typeAnswer('final answer');
    fireEvent.click(screen.getByTestId('answer-send'));

    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const confirmed = captureCall('triage_qa_confirmed');
    expect(confirmed).toBeTruthy();
    expect(confirmed?.[1].card_id).toBe(CARD_ID);
    // total_rounds = qaUserCount + 1 (the current turn)
    expect(confirmed?.[1].total_rounds).toBe(3);
    expect(confirmed?.[1].severity).toBe('urgent');
    expect(confirmed?.[1].contractor_tag).toBe('plumber');
    expect(confirmed?.[1].monitoring_cadence_days).toBe(3);
    expect(confirmed?.[1].was_forced).toBe(true);
    expect(typeof confirmed?.[1].latency_ms).toBe('number');
  });
});

describe('<AnswerThread /> — Skip path', () => {
  it('clicking Skip: POST body is { card_id, skip: true } + round_started has is_skip=true', async () => {
    let lastFetchInit: RequestInit | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((_: string, init: RequestInit) => {
        lastFetchInit = init;
        return Promise.resolve({
          status: 200,
          json: async () => ({
            tool: 'confirm_assessment',
            card_id: CARD_ID,
            severity_confirmed: 'monitor',
            monitoring_cadence_days: 30,
            was_forced: true,
          }),
        });
      })
    );
    render(<AnswerThread {...defaultProps({ qaUserCount: 1 })} />);
    fireEvent.click(screen.getByTestId('answer-skip'));

    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
    const body = JSON.parse((lastFetchInit!.body as string) ?? '{}');
    expect(body.card_id).toBe(CARD_ID);
    expect(body.skip).toBe(true);
    expect(body.answer).toBeUndefined();
    expect(captureCall('triage_qa_round_started')?.[1].is_skip).toBe(true);
  });
});

describe('<AnswerThread /> — error response paths', () => {
  it('on 429 triage_rate_limited: triage_qa_failed + retry banner + textarea preserved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 429,
        json: async () => ({ error: 'triage_rate_limited', retry_after_s: 12 }),
      })
    );
    render(<AnswerThread {...defaultProps()} />);
    typeAnswer('answer with content');
    fireEvent.click(screen.getByTestId('answer-send'));

    await waitFor(() =>
      expect(screen.getByTestId('answer-retry-banner')).toBeTruthy()
    );
    expect(captureCall('triage_qa_failed')?.[1].error_class).toBe(
      'triage_rate_limited'
    );
    // Textarea content preserved
    expect(
      (screen.getByTestId('answer-textarea') as HTMLTextAreaElement).value
    ).toBe('answer with content');
    // Banner data attr matches
    expect(
      screen.getByTestId('answer-retry-banner').getAttribute('data-error-class')
    ).toBe('triage_rate_limited');
  });

  it('on 503 triage_unavailable: error_class=triage_unavailable + retry banner', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 503,
        json: async () => ({ error: 'triage_unavailable', retry_after_s: 30 }),
      })
    );
    render(<AnswerThread {...defaultProps()} />);
    typeAnswer('x');
    fireEvent.click(screen.getByTestId('answer-send'));

    await waitFor(() =>
      expect(screen.getByTestId('answer-retry-banner')).toBeTruthy()
    );
    expect(captureCall('triage_qa_failed')?.[1].error_class).toBe(
      'triage_unavailable'
    );
  });

  it('on 502 triage_invalid_output: retry banner + textarea preserved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 502,
        json: async () => ({ error: 'triage_invalid_output' }),
      })
    );
    render(<AnswerThread {...defaultProps()} />);
    typeAnswer('answer');
    fireEvent.click(screen.getByTestId('answer-send'));

    await waitFor(() =>
      expect(screen.getByTestId('answer-retry-banner')).toBeTruthy()
    );
    expect(captureCall('triage_qa_failed')?.[1].error_class).toBe(
      'triage_invalid_output'
    );
    expect(
      (screen.getByTestId('answer-textarea') as HTMLTextAreaElement).value
    ).toBe('answer');
  });

  it('on 409 already_confirmed: renders the "Already confirmed — refreshing…" notice + refreshes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 409,
        json: async () => ({ error: 'already_confirmed' }),
      })
    );
    render(<AnswerThread {...defaultProps()} />);
    typeAnswer('x');
    fireEvent.click(screen.getByTestId('answer-send'));

    await waitFor(() =>
      expect(screen.getByTestId('already-confirmed-notice')).toBeTruthy()
    );
    expect(captureCall('triage_qa_failed')?.[1].error_class).toBe(
      'already_confirmed'
    );
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled(), {
      timeout: 1500,
    });
  });

  it('on network throw: error_class=network + retry banner + textarea preserved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    );
    render(<AnswerThread {...defaultProps()} />);
    typeAnswer('keep this');
    fireEvent.click(screen.getByTestId('answer-send'));

    await waitFor(() =>
      expect(screen.getByTestId('answer-retry-banner')).toBeTruthy()
    );
    expect(captureException).toHaveBeenCalled();
    expect(captureCall('triage_qa_failed')?.[1].error_class).toBe('network');
    expect(
      (screen.getByTestId('answer-textarea') as HTMLTextAreaElement).value
    ).toBe('keep this');
  });
});
