// @vitest-environment happy-dom
// What: Unit tests for <ExistingCardPicker />. Mocks the SSR Supabase
//       client so we can drive the four branches: empty state, three
//       cards (no search input), six cards (search input rendered),
//       and the supabase-error fallback (also empty state).
// Why:  D4 — picker UI ships fully exercised even though the
//       post-pick submit defers to monitor-beta. The branch behaviours
//       are the contract.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

afterEach(() => cleanup());

const { selectMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        not: () => ({
          order: () => ({
            limit: selectMock,
          }),
        }),
      }),
    }),
  }),
}));

import { ExistingCardPicker } from './ExistingCardPicker';

beforeEach(() => {
  selectMock.mockReset();
});

/** Helper to build a card row. */
function makeCard(
  id: string,
  title: string
): {
  id: string;
  title: string;
  system_tag: string;
  updated_at: string;
} {
  return {
    id,
    title,
    system_tag: 'plumbing',
    updated_at: '2026-05-13T00:00:00Z',
  };
}

describe('<ExistingCardPicker />', () => {
  it('renders the empty state when supabase returns no rows', async () => {
    selectMock.mockResolvedValue({ data: [], error: null });
    const element = await ExistingCardPicker();
    render(element);
    expect(screen.getByText(/no active cards yet/i)).toBeTruthy();
  });

  it('renders the empty state when supabase returns an error', async () => {
    selectMock.mockResolvedValue({
      data: null,
      error: { code: 'XX', message: 'boom' },
    });
    const element = await ExistingCardPicker();
    render(element);
    expect(screen.getByText(/no active cards yet/i)).toBeTruthy();
  });

  it('renders three card rows without the search input', async () => {
    selectMock.mockResolvedValue({
      data: [
        makeCard('1', 'Card A'),
        makeCard('2', 'Card B'),
        makeCard('3', 'Card C'),
      ],
      error: null,
    });
    const element = await ExistingCardPicker();
    render(element);
    expect(screen.getByText('Card A')).toBeTruthy();
    expect(screen.getByText('Card B')).toBeTruthy();
    expect(screen.getByText('Card C')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/search by title/i)).toBeNull();
  });

  it('renders the search input when count > 5', async () => {
    selectMock.mockResolvedValue({
      data: Array.from({ length: 6 }, (_, i) =>
        makeCard(String(i + 1), `Card ${i + 1}`)
      ),
      error: null,
    });
    const element = await ExistingCardPicker();
    render(element);
    expect(screen.getByPlaceholderText(/search by title/i)).toBeTruthy();
  });
});
