// @vitest-environment happy-dom
// What: Unit tests for /(app)/cards/[id] page. Mocks the SSR Supabase
//       client (cards.maybeSingle + card_photos.maybeSingle +
//       triage_conversations.maybeSingle + storage.createSignedUrl) and
//       the <StartTriage /> client child. Asserts the 6-state body
//       matrix, the ownership/not-found 404, and the photo placeholder.
// Why:  Page is the user-facing surface for the entire card lifecycle;
//       lock the render contract for each state.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const {
  cardSelect,
  photoSelect,
  convoSelect,
  signedUrl,
  getUser,
  notFoundMock,
  redirectMock,
  sentryCaptureException,
  sentryCaptureMessage,
} = vi.hoisted(() => ({
  cardSelect: vi.fn(),
  photoSelect: vi.fn(),
  // New shape: page now fetches the FULL thread (no maybeSingle)
  // via from('triage_conversations').select(...).eq('card_id', id).order(...).
  convoSelect: vi.fn(),
  signedUrl: vi.fn(),
  getUser: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirectMock: vi.fn((dest: string) => {
    throw new Error(`NEXT_REDIRECT:${dest}`);
  }),
  sentryCaptureException: vi.fn(),
  sentryCaptureMessage: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
  // decide-state (PR N) — <ChoosePath /> uses useRouter().refresh()
  // when mounted by <DecideView /> / <PlannedView />. Mock is fine
  // since the page tests don't simulate client interaction.
  useRouter: () => ({ refresh: () => {} }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: sentryCaptureException,
  captureMessage: sentryCaptureMessage,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser,
    },
    from: (table: string) => {
      if (table === 'cards') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: cardSelect }),
          }),
        };
      }
      if (table === 'card_photos') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({ maybeSingle: photoSelect }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'triage_conversations') {
        return {
          select: () => ({
            eq: () => ({ order: convoSelect }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: vi.fn() }) }) };
    },
    storage: {
      from: () => ({ createSignedUrl: signedUrl }),
    },
  }),
}));

vi.mock('./_components/StartTriage', () => ({
  StartTriage: ({ cardId }: { cardId: string }) => (
    <button data-testid={`start-triage-${cardId}`}>Read this for me</button>
  ),
}));

// AnswerThread is a client component — stub with a marker so the page
// tests assert presence without exercising its internals (covered by
// AnswerThread.test.tsx).
vi.mock('./_components/AnswerThread', () => ({
  AnswerThread: ({
    cardId,
    activeQuestion,
    qaUserCount,
  }: {
    cardId: string;
    activeQuestion: string;
    qaUserCount: number;
  }) => (
    <div
      data-testid={`answer-thread-${cardId}`}
      data-active-question={activeQuestion}
      data-qa-user-count={qaUserCount}
    />
  ),
}));

vi.mock('./_components/DiagnosedThread', () => ({
  DiagnosedThread: ({
    severity,
    diagnosis,
    monitoringCadenceDays,
  }: {
    severity: string;
    diagnosis: string | null;
    monitoringCadenceDays: number | null;
  }) => (
    <div
      data-testid="diagnosed-thread"
      data-severity={severity}
      data-cadence={monitoringCadenceDays ?? 'null'}
    >
      {diagnosis}
    </div>
  ),
}));

vi.mock('./_components/QaThread', () => ({
  QaThread: () => <div data-testid="qa-thread-stub" />,
}));

import CardDetailPage from './page';

const CARD_ID = '11111111-2222-3333-4444-555555555555';

type CardState =
  | 'capturing'
  | 'triaging'
  | 'diagnosed'
  | 'decide'
  | 'planned'
  | 'monitoring'
  | 'closed'
  | 'dismissed';

/** Build a card row in the given state. */
function cardRow(state: CardState, extra: Record<string, unknown> = {}) {
  return {
    data: {
      id: CARD_ID,
      state,
      initial_description: 'A leak.',
      system_tag: 'plumbing',
      room_tag: 'Kitchen',
      created_at: '2026-05-15T10:00:00Z',
      closed_at: state === 'closed' ? '2026-05-14T00:00:00Z' : null,
      diagnosis: state === 'diagnosed' ? 'A diagnosis.' : null,
      severity: state === 'diagnosed' ? 'soon' : null,
      severity_confirmed: false,
      contractor_tag: state === 'diagnosed' ? 'plumber' : null,
      monitoring_cadence_days: null,
      ...extra,
    },
    error: null,
  };
}

const INITIAL_READ_ROW = {
  content: JSON.stringify({
    summary: 'A diagnosis.',
    severity_provisional: 'soon',
    what_im_confident_about: 'confidence',
    what_i_need_to_know: ['q1?', 'q2?', 'q3?'],
    sources: [
      { url: 'https://example.com/a', title: 'A page' },
      { url: 'https://example.com/b', title: 'Another page' },
    ],
    system_tag_proposed: 'plumbing',
    contractor_tag_proposed: 'plumber',
  }),
  created_at: '2026-05-15T10:00:00Z',
  round: 1,
  role: 'assistant',
  is_location_ask: false,
  tool_name: 'record_initial_read',
};

beforeEach(() => {
  cardSelect.mockReset();
  photoSelect.mockReset();
  convoSelect.mockReset();
  signedUrl.mockReset();
  getUser.mockReset();
  notFoundMock.mockClear();
  redirectMock.mockClear();
  sentryCaptureException.mockClear();
  sentryCaptureMessage.mockClear();
  // Default authed user.
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  // Defaults: no photo, empty thread.
  photoSelect.mockResolvedValue({ data: null, error: null });
  convoSelect.mockResolvedValue({ data: [], error: null });
  signedUrl.mockResolvedValue({
    data: { signedUrl: 'https://signed.example/p.jpg' },
    error: null,
  });
});

afterEach(() => cleanup());

/** Render the page server component synchronously (it's an async fn). */
async function renderPage() {
  const element = await CardDetailPage({
    params: Promise.resolve({ id: CARD_ID }),
  });
  render(element);
}

describe('/(app)/cards/[id] — auth + 404', () => {
  it('redirects to /login?next=/cards/<id> when no session is present', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(renderPage()).rejects.toThrow(
      `NEXT_REDIRECT:/login?next=/cards/${CARD_ID}`
    );
    expect(redirectMock).toHaveBeenCalledWith(`/login?next=/cards/${CARD_ID}`);
    // Don't issue the cards SELECT once we know there's no session.
    expect(cardSelect).not.toHaveBeenCalled();
  });

  it('calls notFound() and captures a Sentry message when the card row is missing', async () => {
    cardSelect.mockResolvedValue({ data: null, error: null });
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalled();
    expect(sentryCaptureMessage).toHaveBeenCalledTimes(1);
    const call = sentryCaptureMessage.mock.calls[0]!;
    const options = call[1];
    expect(options).toMatchObject({
      level: 'warning',
      tags: { surface: 'cards/[id]', stage: 'card_missing' },
      extra: { card_id: CARD_ID, user_id: 'user-1' },
    });
  });

  it('calls notFound() and captures a Sentry exception when the card row select errors', async () => {
    cardSelect.mockResolvedValue({
      data: null,
      error: { message: 'rls', code: '42P01', details: 'no_table' },
    });
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(sentryCaptureException).toHaveBeenCalledTimes(1);
    const call = sentryCaptureException.mock.calls[0]!;
    const options = call[1];
    expect(options).toMatchObject({
      tags: { surface: 'cards/[id]', stage: 'card_select' },
      extra: expect.objectContaining({
        card_id: CARD_ID,
        user_id: 'user-1',
        error_message: 'rls',
        error_code: '42P01',
      }),
    });
  });
});

describe('/(app)/cards/[id] — header on every state', () => {
  it.each<CardState>([
    'capturing',
    'triaging',
    'diagnosed',
    'monitoring',
    'closed',
    'dismissed',
  ])('renders room/system/created_at on %s', async (state) => {
    cardSelect.mockResolvedValue(cardRow(state));
    await renderPage();
    expect(screen.getByTestId('room-tag').textContent).toBe('Kitchen');
    expect(screen.getByTestId('system-tag-chip').textContent).toBe('plumbing');
    expect(screen.getByTestId('created-at').textContent).toMatch(/captured/i);
  });
});

describe('/(app)/cards/[id] — body matrix', () => {
  it('capturing: renders <StartTriage> and no skeleton / diagnosis', async () => {
    cardSelect.mockResolvedValue(cardRow('capturing'));
    await renderPage();
    expect(screen.getByTestId(`start-triage-${CARD_ID}`)).toBeTruthy();
    expect(screen.queryByTestId('triaging-skeleton')).toBeNull();
    expect(screen.queryByTestId('diagnosed-body')).toBeNull();
  });

  it('triaging: renders the skeleton + Reading copy; no button', async () => {
    cardSelect.mockResolvedValue(cardRow('triaging'));
    await renderPage();
    expect(screen.getByTestId('triaging-skeleton')).toBeTruthy();
    expect(screen.getByText(/reading your capture/i)).toBeTruthy();
    expect(screen.queryByTestId(`start-triage-${CARD_ID}`)).toBeNull();
  });

  it('diagnosed (provisional, qaUserCount=0): renders severity chip + diagnosis + what-i-need-to-know + sources + <AnswerThread />', async () => {
    cardSelect.mockResolvedValue(cardRow('diagnosed'));
    convoSelect.mockResolvedValue({ data: [INITIAL_READ_ROW], error: null });
    await renderPage();
    expect(screen.getByTestId('diagnosed-body')).toBeTruthy();
    const chip = screen.getByTestId('severity-chip');
    expect(chip.getAttribute('data-severity')).toBe('soon');
    expect(screen.getByText('A diagnosis.')).toBeTruthy();
    const questions = screen.getByTestId('what-i-need-to-know');
    expect(questions.querySelectorAll('li')).toHaveLength(3);
    const sources = screen.getByTestId('sources');
    expect(sources.querySelectorAll('li')).toHaveLength(2);
    // Sources render as external links (target=_blank rel=noopener).
    const link = sources.querySelector('a');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    // <AnswerThread /> mounted with the first what_i_need_to_know question as the active prompt.
    const at = screen.getByTestId(`answer-thread-${CARD_ID}`);
    expect(at.getAttribute('data-active-question')).toBe('q1?');
    expect(at.getAttribute('data-qa-user-count')).toBe('0');
    // QaThread should NOT render (no Q&A rounds yet).
    expect(screen.queryByTestId('qa-thread-stub')).toBeNull();
    // DiagnosedThread should NOT render (severity not confirmed).
    expect(screen.queryByTestId('diagnosed-thread')).toBeNull();
  });

  it('diagnosed (provisional, qaUserCount=1): renders <QaThread /> + <AnswerThread /> + hides "what I need to know"', async () => {
    cardSelect.mockResolvedValue(cardRow('diagnosed'));
    convoSelect.mockResolvedValue({
      data: [
        INITIAL_READ_ROW,
        {
          content: 'two weeks',
          created_at: '2026-05-15T10:01:00Z',
          round: 2,
          role: 'user',
          is_location_ask: false,
          tool_name: null,
        },
        {
          content: JSON.stringify({
            question: 'Has it grown?',
            is_location_ask: false,
          }),
          created_at: '2026-05-15T10:01:01Z',
          round: 2,
          role: 'assistant',
          is_location_ask: false,
          tool_name: 'ask_next_question',
        },
      ],
      error: null,
    });
    await renderPage();
    expect(screen.getByTestId('qa-thread-stub')).toBeTruthy();
    const at = screen.getByTestId(`answer-thread-${CARD_ID}`);
    expect(at.getAttribute('data-active-question')).toBe('Has it grown?');
    expect(at.getAttribute('data-qa-user-count')).toBe('1');
    // Initial-read preview's "what I need to know" list should NOT
    // render at this sub-state (it's stale; the AI is mid-conversation).
    expect(screen.queryByTestId('what-i-need-to-know')).toBeNull();
  });

  it('diagnosed (confirmed): renders <DiagnosedThread />; <AnswerThread /> not present', async () => {
    cardSelect.mockResolvedValue(
      cardRow('diagnosed', {
        severity_confirmed: true,
        monitoring_cadence_days: 14,
      })
    );
    convoSelect.mockResolvedValue({ data: [INITIAL_READ_ROW], error: null });
    await renderPage();
    const dt = screen.getByTestId('diagnosed-thread');
    expect(dt.getAttribute('data-severity')).toBe('soon');
    expect(dt.getAttribute('data-cadence')).toBe('14');
    // <AnswerThread /> should NOT be present.
    expect(screen.queryByTestId(`answer-thread-${CARD_ID}`)).toBeNull();
    // The PR #19 provisional preview block should NOT render either.
    expect(screen.queryByTestId('diagnosed-body')).toBeNull();
  });

  // decide-state (PR N) — new state branches
  it('decide: renders <DecideView /> with diagnosis + both PathCards', async () => {
    cardSelect.mockResolvedValue(
      cardRow('decide', {
        diagnosis: 'A P-trap leak.',
        severity: 'soon',
        severity_confirmed: true,
        monitoring_cadence_days: 14,
        cost_estimate_diy: {
          skill_level: 'intermediate',
          time_hours_min: 1,
          time_hours_max: 2,
          materials: [{ name: 'kit', cost_min: 10, cost_max: 20 }],
          tools: [{ name: 'wrench', cost_min: 0, cost_max: 25 }],
          total_min: 10,
          total_max: 45,
          gotchas: 'g',
          abort_condition: 'a',
          steps: ['s1'],
        },
        cost_estimate_hire: {
          contractor_type: 'plumber',
          cost_range_min: 100,
          cost_range_max: 300,
          questions_for_contractor: ['q1?'],
          red_flags: [],
          good_completion: 'gc',
        },
      })
    );
    await renderPage();
    expect(screen.getByTestId('decide-view')).toBeTruthy();
    expect(screen.getByText('A P-trap leak.')).toBeTruthy();
    expect(screen.getByTestId('path-card-diy')).toBeTruthy();
    expect(screen.getByTestId('path-card-contractor')).toBeTruthy();
    expect(screen.getByTestId('choose-path')).toBeTruthy();
  });

  it('planned: renders <PlannedView /> with chosen DIY banner', async () => {
    cardSelect.mockResolvedValue(
      cardRow('planned', {
        diagnosis: 'A diagnosis.',
        severity: 'soon',
        severity_confirmed: true,
        chosen_path: 'diy',
        cost_estimate_diy: {
          skill_level: 'intermediate',
          time_hours_min: 1,
          time_hours_max: 2,
          materials: [],
          tools: [],
          total_min: 10,
          total_max: 45,
          gotchas: 'g',
          abort_condition: 'a',
          steps: ['s1'],
        },
        cost_estimate_hire: {
          contractor_type: 'plumber',
          cost_range_min: 100,
          cost_range_max: 300,
          questions_for_contractor: ['q1?'],
          red_flags: [],
          good_completion: 'gc',
        },
      })
    );
    await renderPage();
    expect(screen.getByTestId('planned-view')).toBeTruthy();
    expect(screen.getByTestId('planned-banner').textContent).toBe(
      'You chose: DIY'
    );
  });

  it('decide with malformed jsonb: falls back to "Estimate unavailable" without throwing', async () => {
    cardSelect.mockResolvedValue(
      cardRow('decide', {
        diagnosis: 'A leak.',
        severity: 'soon',
        severity_confirmed: true,
        cost_estimate_diy: { wrong: 'shape' },
        cost_estimate_hire: { wrong: 'shape' },
      })
    );
    await renderPage();
    expect(screen.getByTestId('path-card-diy-badge').textContent).toBe(
      'Estimate unavailable'
    );
    expect(screen.getByTestId('path-card-contractor-badge').textContent).toBe(
      'Estimate unavailable'
    );
  });

  it('monitoring: renders the row-#6 deferred stub', async () => {
    cardSelect.mockResolvedValue(cardRow('monitoring'));
    await renderPage();
    expect(screen.getByText(/monitor-beta/i)).toBeTruthy();
  });

  it('closed: renders the row-#5 deferred stub with closed_at', async () => {
    cardSelect.mockResolvedValue(cardRow('closed'));
    await renderPage();
    expect(screen.getByText(/card closed/i)).toBeTruthy();
  });

  it('dismissed: renders the stub with a /dismissed link', async () => {
    cardSelect.mockResolvedValue(cardRow('dismissed'));
    await renderPage();
    // Multiple text nodes match /dismissed/ (header chip, body copy);
    // assert the link existence + href specifically.
    const link = screen.getByRole('link', { name: '/dismissed' });
    expect(link.getAttribute('href')).toBe('/dismissed');
    expect(screen.getByText(/this card was dismissed/i)).toBeTruthy();
  });
});

// PR planned-state — <ReminderDueChip /> mount conditions + isReminderDue
// derivation. The chip is server-rendered in the header section.
describe('/(app)/cards/[id] — reminder-due chip (planned-state)', () => {
  // Freeze "now" at 2026-05-17 so the predicate is deterministic.
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-05-17T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts <ReminderDueChip /> when planned + reminder is today (boundary)', async () => {
    cardSelect.mockResolvedValue(
      cardRow('planned', {
        severity: 'soon',
        severity_confirmed: true,
        chosen_path: 'diy',
        planned_reminder_date: '2026-05-17',
      })
    );
    await renderPage();
    expect(screen.getByTestId('reminder-due-chip')).toBeTruthy();
  });

  it('mounts <ReminderDueChip /> when planned + reminder is in the past', async () => {
    cardSelect.mockResolvedValue(
      cardRow('planned', {
        severity: 'soon',
        severity_confirmed: true,
        chosen_path: 'diy',
        planned_reminder_date: '2026-05-10',
      })
    );
    await renderPage();
    expect(screen.getByTestId('reminder-due-chip')).toBeTruthy();
  });

  it('does NOT mount the chip for a future reminder date', async () => {
    cardSelect.mockResolvedValue(
      cardRow('planned', {
        severity: 'soon',
        severity_confirmed: true,
        chosen_path: 'diy',
        planned_reminder_date: '2026-12-01',
      })
    );
    await renderPage();
    expect(screen.queryByTestId('reminder-due-chip')).toBeNull();
  });

  it('does NOT mount the chip when planned + reminder is null', async () => {
    cardSelect.mockResolvedValue(
      cardRow('planned', {
        severity: 'soon',
        severity_confirmed: true,
        chosen_path: 'diy',
        planned_reminder_date: null,
      })
    );
    await renderPage();
    expect(screen.queryByTestId('reminder-due-chip')).toBeNull();
  });

  it('does NOT mount the chip when state != planned even with a past reminder', async () => {
    cardSelect.mockResolvedValue(
      cardRow('decide', {
        severity: 'soon',
        severity_confirmed: true,
        chosen_path: null,
        planned_reminder_date: '2026-05-10',
      })
    );
    await renderPage();
    expect(screen.queryByTestId('reminder-due-chip')).toBeNull();
  });

  it('chip label contains the formatted human date for past reminders', async () => {
    cardSelect.mockResolvedValue(
      cardRow('planned', {
        severity: 'soon',
        severity_confirmed: true,
        chosen_path: 'diy',
        planned_reminder_date: '2026-05-10',
      })
    );
    await renderPage();
    const chip = screen.getByTestId('reminder-due-chip');
    expect(chip.textContent).toMatch(/^Revisit by /);
  });
});

describe('/(app)/cards/[id] — photo block', () => {
  it('renders the most-recent primary/wide photo when present', async () => {
    cardSelect.mockResolvedValue(cardRow('capturing'));
    photoSelect.mockResolvedValue({
      data: { storage_path: 'u/cards/c/p.jpg' },
      error: null,
    });
    await renderPage();
    const img = screen.getByAltText('Captured photo') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://signed.example/p.jpg');
  });

  it('renders the placeholder when no photo row exists', async () => {
    cardSelect.mockResolvedValue(cardRow('capturing'));
    photoSelect.mockResolvedValue({ data: null, error: null });
    await renderPage();
    expect(screen.getByText(/no photo on this card/i)).toBeTruthy();
  });
});
