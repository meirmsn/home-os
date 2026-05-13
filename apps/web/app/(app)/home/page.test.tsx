// @vitest-environment happy-dom
// What: Unit tests for (app)/home/page.tsx. Asserts the heading + the
//       "Signed in as <email>" paragraph render with a mocked-server user
//       (D10).
// Why:  Page is intentionally minimal but the email surface is the
//       smoke-test signal — if this paragraph is empty in production we
//       know the cookie -> getUser pipeline is broken.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { getUser, redirect } = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
  }),
}));

vi.mock('next/navigation', () => ({
  redirect,
}));

import HomePage from './page';

describe('(app)/home', () => {
  afterEach(() => {
    cleanup();
    getUser.mockReset();
    redirect.mockClear();
  });

  it('renders the heading and signed-in email paragraph', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'meir@example.test' } },
    });
    const element = await HomePage();
    render(element as React.ReactElement);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'home-os'
    );
    expect(screen.getByText(/meir@example\.test/)).toBeTruthy();
    expect(screen.getByText(/signed in as/i)).toBeTruthy();
  });

  it('redirects to /login when the defense-in-depth getUser returns null', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
