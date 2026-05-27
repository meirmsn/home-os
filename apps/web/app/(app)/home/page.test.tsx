// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { getUser, redirect, selectCards, selectCount, selectPhotos } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    redirect: vi.fn((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    }),
    selectCards: vi.fn(),
    selectCount: vi.fn(),
    selectPhotos: vi.fn(),
  }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => {
      if (table === 'cards') {
        return {
          select: (
            _cols: string,
            opts?: { count?: string; head?: boolean }
          ) => {
            if (opts?.head) {
              return selectCount();
            }
            return {
              not: () => selectCards(),
            };
          },
        };
      }
      if (table === 'card_photos') {
        return {
          select: () => ({
            in: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => selectPhotos(),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: { signedUrl: 'https://example.com/signed.jpg' },
        }),
      }),
    },
  }),
}));

vi.mock('next/navigation', () => ({
  redirect,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('./_components/DashboardShell', () => ({
  DashboardShell: (props: Record<string, unknown>) => (
    <div
      data-testid="dashboard-shell"
      data-tier1-count={String(props.tier1Count)}
      data-tier2-count={String(props.tier2Count)}
      data-planned-count={String(props.plannedCount)}
      data-total-cards={String(props.totalCards)}
    >
      Dashboard Shell
    </div>
  ),
}));

vi.mock('./_components/EmptyState', () => ({
  EmptyState: ({ variant }: { variant: string }) => (
    <div data-testid={`empty-state-${variant}`}>Empty: {variant}</div>
  ),
}));

import HomePage from './page';

afterEach(() => {
  cleanup();
  getUser.mockReset();
  selectCards.mockReset();
  selectCount.mockReset();
  selectPhotos.mockReset();
  redirect.mockClear();
});

describe('(app)/home', () => {
  it('redirects to /login when no user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('shows first-time empty state when user has 0 cards', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'test@test.com' } },
    });
    selectCount.mockResolvedValue({ count: 0 });
    const element = await HomePage();
    render(element as React.ReactElement);
    expect(screen.getByTestId('empty-state-first-time')).toBeTruthy();
  });

  it('renders dashboard shell when user has active cards', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'test@test.com' } },
    });
    selectCount.mockResolvedValue({ count: 3 });
    selectCards.mockResolvedValue({
      data: [
        {
          id: 'c1',
          state: 'decide',
          title: 'Leaky faucet',
          initial_description: 'Drip',
          severity: 'urgent',
          severity_confirmed: true,
          system_tag: 'plumbing',
          room_tag: null,
          chosen_path: null,
          planned_reminder_date: null,
          next_check_at: null,
          monitoring_cadence_days: null,
          diagnosis: 'Worn cartridge',
          created_at: '2026-05-01T00:00:00Z',
          updated_at: '2026-05-01T00:00:00Z',
        },
      ],
      error: null,
    });
    selectPhotos.mockResolvedValue({ data: [], error: null });
    const element = await HomePage();
    render(element as React.ReactElement);
    expect(screen.getByTestId('dashboard-shell')).toBeTruthy();
    expect(
      screen.getByTestId('dashboard-shell').getAttribute('data-tier1-count')
    ).toBe('1');
  });

  it('renders dashboard with 0 active cards when all closed', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'test@test.com' } },
    });
    selectCount.mockResolvedValue({ count: 5 });
    selectCards.mockResolvedValue({ data: [], error: null });
    selectPhotos.mockResolvedValue({ data: [], error: null });
    const element = await HomePage();
    render(element as React.ReactElement);
    expect(screen.getByTestId('dashboard-shell')).toBeTruthy();
    expect(
      screen.getByTestId('dashboard-shell').getAttribute('data-total-cards')
    ).toBe('0');
  });
});
