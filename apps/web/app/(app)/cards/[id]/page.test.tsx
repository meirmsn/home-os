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
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: convoSelect }),
                }),
              }),
            }),
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

import CardDetailPage from './page';

const CARD_ID = '11111111-2222-3333-4444-555555555555';

type CardState =
  | 'capturing'
  | 'triaging'
  | 'diagnosed'
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
      ...extra,
    },
    error: null,
  };
}

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
  // Defaults: no photo, no convo row.
  photoSelect.mockResolvedValue({ data: null, error: null });
  convoSelect.mockResolvedValue({ data: null, error: null });
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

  it('diagnosed: renders severity chip + diagnosis + what-i-need-to-know + sources', async () => {
    cardSelect.mockResolvedValue(cardRow('diagnosed'));
    convoSelect.mockResolvedValue({
      data: {
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
      },
      error: null,
    });
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
