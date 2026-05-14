// @vitest-environment happy-dom
// What: Unit test for /(app)/dismissed page. Mocks the SSR Supabase
//       client + the RestoreStrip child so we can drive the two
//       branches: empty state (no rows) and list state (renders rows
//       with the strip mounted). D8.
// Why:  Page is the destination surface for the DISMISS reversible
//       flow; lock its rendering contract.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: selectMock,
        }),
      }),
    }),
  }),
}));

vi.mock('./_components/RestoreStrip', () => ({
  RestoreStrip: ({ cardId }: { cardId: string }) => (
    <div data-testid={`restore-strip-${cardId}`}>[strip {cardId}]</div>
  ),
}));

import DismissedPage from './page';

beforeEach(() => {
  selectMock.mockReset();
});

afterEach(() => cleanup());

describe('/(app)/dismissed page', () => {
  it('renders the empty state when no dismissed cards exist', async () => {
    selectMock.mockResolvedValue({ data: [], error: null });
    const element = await DismissedPage();
    render(element);
    expect(screen.getByText(/nothing dismissed yet/i)).toBeTruthy();
  });

  it('renders one row per dismissed card and mounts a RestoreStrip per row', async () => {
    selectMock.mockResolvedValue({
      data: [
        {
          id: 'card-1',
          title: 'Card one',
          system_tag: 'plumbing',
          updated_at: '2026-05-10T00:00:00Z',
        },
        {
          id: 'card-2',
          title: 'Card two',
          system_tag: 'roof',
          updated_at: '2026-05-09T00:00:00Z',
        },
      ],
      error: null,
    });
    const element = await DismissedPage();
    render(element);
    expect(screen.getByText('Card one')).toBeTruthy();
    expect(screen.getByText('Card two')).toBeTruthy();
    expect(screen.getByTestId('restore-strip-card-1')).toBeTruthy();
    expect(screen.getByTestId('restore-strip-card-2')).toBeTruthy();
  });

  it('falls back to empty state when the supabase query errors', async () => {
    selectMock.mockResolvedValue({
      data: null,
      error: { code: 'XX', message: 'boom' },
    });
    const element = await DismissedPage();
    render(element);
    expect(screen.getByText(/nothing dismissed yet/i)).toBeTruthy();
  });
});
