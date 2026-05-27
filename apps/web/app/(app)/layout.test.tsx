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

vi.mock('./_components/TriagePendingBadge', () => ({
  TriagePendingBadge: () => null,
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

  it('renders a gear icon link to /settings with data-testid="settings-link"', async () => {
    getUser.mockResolvedValue({
      data: {
        user: { id: 'user-uuid-123', email: 'meir@example.test' },
      },
    });
    const element = await AppLayout({
      children: <div>child</div>,
    });
    render(element as React.ReactElement);

    const settingsLink = screen.getByTestId('settings-link');
    expect(settingsLink).toBeTruthy();
    expect(settingsLink.getAttribute('href')).toBe('/settings');
    expect(settingsLink.getAttribute('aria-label')).toBe('Settings');
    // Contains an SVG gear icon
    expect(settingsLink.querySelector('svg')).toBeTruthy();
  });

  it('positions the gear icon between the email and sign-out button', async () => {
    getUser.mockResolvedValue({
      data: {
        user: { id: 'user-uuid-123', email: 'meir@example.test' },
      },
    });
    const element = await AppLayout({
      children: <div>child</div>,
    });
    render(element as React.ReactElement);

    const email = screen.getByTestId('signed-in-email');
    const settingsLink = screen.getByTestId('settings-link');
    const signOutButton = screen.getByRole('button', { name: 'Sign out' });

    // All three share the same parent container (the flex row)
    const container = email.parentElement!;
    const children = Array.from(container.children);

    // Direct children order: SPAN[email] → A[settings-link] → FORM[sign-out]
    const emailIdx = children.indexOf(email);
    const settingsIdx = children.indexOf(settingsLink);
    // The sign-out form is the FORM element among direct children
    const formIdx = children.findIndex((el) => el.tagName === 'FORM');

    expect(emailIdx).toBeGreaterThanOrEqual(0);
    expect(settingsIdx).toBeGreaterThanOrEqual(0);
    expect(formIdx).toBeGreaterThanOrEqual(0);
    // Gear icon (settings-link) sits between email and the sign-out form
    expect(emailIdx).toBeLessThan(settingsIdx);
    expect(settingsIdx).toBeLessThan(formIdx);
    // Verify the form contains the sign-out button
    expect(children[formIdx]!.querySelector('button')).toBe(signOutButton);
  });
});
