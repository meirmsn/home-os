// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const selectMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        in: selectMock,
      }),
    }),
  }),
}));

import { TriagePendingBadge } from './TriagePendingBadge';

afterEach(() => {
  cleanup();
  selectMock.mockReset();
});

describe('TriagePendingBadge', () => {
  it('renders "N captures queued" text when count > 0', async () => {
    selectMock.mockResolvedValue({ count: 3 });
    const el = await TriagePendingBadge();
    render(el as React.ReactElement);
    expect(screen.getByTestId('triage-pending-badge').textContent).toBe(
      '3 captures queued for triage'
    );
  });

  it('renders null when count is 0', async () => {
    selectMock.mockResolvedValue({ count: 0 });
    const el = await TriagePendingBadge();
    expect(el).toBeNull();
  });

  it('handles singular (1 capture queued)', async () => {
    selectMock.mockResolvedValue({ count: 1 });
    const el = await TriagePendingBadge();
    render(el as React.ReactElement);
    expect(screen.getByTestId('triage-pending-badge').textContent).toBe(
      '1 capture queued for triage'
    );
  });

  it('treats null count as 0', async () => {
    selectMock.mockResolvedValue({ count: null });
    const el = await TriagePendingBadge();
    expect(el).toBeNull();
  });
});
