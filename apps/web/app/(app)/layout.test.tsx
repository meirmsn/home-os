// @vitest-environment happy-dom
// What: Unit tests for the (app) authenticated-shell layout. Asserts the
//       defense-in-depth getUser() check (null user -> redirect('/login'))
//       and the populated-user render (header email + sign-out form +
//       <SignInCompletedCapture /> mount) (D10).
// Why:  Layout is the second auth-checkpoint after middleware (D6 / spec §
//       Gotchas). Locking the redirect branch + the header markup prevents
//       a regression that would either let an anonymous request through or
//       lose the sign-out form.
// Does NOT: Test the SignInCompletedCapture behavior — that lives in the
//           component's own concerns. Layout-side just asserts that the
//           capture child mounts with the right props.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { getUser, redirect } = vi.hoisted(() => ({
  getUser: vi.fn(),
  // redirect is a function that throws a NEXT_REDIRECT signal in Next; we
  // stub it as a throwing mock so the layout's `if (!user) redirect(...)`
  // short-circuits before rendering children.
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

// SignInCompletedCapture is a 'use client' component that uses useEffect +
// posthog; we stub it to a no-output marker so the layout test asserts
// only on the layout's own structure.
vi.mock('./_components/SignInCompletedCapture', () => ({
  SignInCompletedCapture: ({
    userId,
    email,
  }: {
    userId: string;
    email: string;
  }) => (
    <div data-testid="capture-mount" data-user-id={userId} data-email={email} />
  ),
}));

import AppLayout from './layout';

describe('(app)/layout', () => {
  afterEach(() => {
    cleanup();
    getUser.mockReset();
    redirect.mockClear();
  });

  it('redirects to /login when getUser returns null', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(AppLayout({ children: <div>child</div> })).rejects.toThrow(
      'NEXT_REDIRECT:/login'
    );
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('renders the email + sign-out form + capture child for an authed user', async () => {
    getUser.mockResolvedValue({
      data: {
        user: { id: 'user-uuid-123', email: 'meir@example.test' },
      },
    });
    const element = await AppLayout({
      children: <div data-testid="child">child</div>,
    });
    render(element as React.ReactElement);

    expect(screen.getByTestId('signed-in-email').textContent).toBe(
      'meir@example.test'
    );
    const form = document.querySelector(
      'form[action="/auth/signout"][method="post"]'
    );
    expect(form).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(
      screen.getByTestId('capture-mount').getAttribute('data-user-id')
    ).toBe('user-uuid-123');
    expect(screen.getByTestId('child')).toBeTruthy();
  });
});
