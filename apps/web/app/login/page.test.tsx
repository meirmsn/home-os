// @vitest-environment happy-dom
// What: Unit tests for the `/login` page's <LoginForm /> child. Covers the
//       form render, the success-path swap to the confirmation state, the
//       error mapping (429 → rate-limit copy; other errors → generic copy
//       + Sentry capture), the `?error=callback_failed` banner, and the
//       posthog.capture('sign_in_requested') call (D7, D10, D12).
// Why:  The page itself is a thin server-component shell that forwards
//       `searchParams.error` into the form; the form holds all the
//       interactive logic. Co-locating the form test under page.test.tsx
//       matches the spec's task list (D10) and pairs with the page
//       filename for clarity.
// Does NOT: Render the server-component page itself (RSC + searchParams
//           require a full Next runtime). Instead asserts on the
//           <LoginForm /> child directly with both the initial-error and
//           clean states; that's the same code path the page exercises.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { signInWithOtp, captureException, capture } = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  captureException: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signInWithOtp },
  }),
}));

vi.mock('@/lib/posthog', () => ({
  posthog: { capture },
  initPostHog: () => ({ capture }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException,
}));

// Stub window.location.origin so we assert against a deterministic value.
Object.defineProperty(window, 'location', {
  configurable: true,
  value: new URL('http://localhost:3000/login'),
});

import { LoginForm } from './_components/LoginForm';

/**
 *
 */
function submitForm(email = 'meir@example.test') {
  const input = screen.getByLabelText('Email') as HTMLInputElement;
  fireEvent.change(input, { target: { value: email } });
  const button = screen.getByRole('button', { name: 'Send magic link' });
  fireEvent.click(button);
  return { input, button };
}

describe('/login — <LoginForm />', () => {
  afterEach(() => {
    cleanup();
    signInWithOtp.mockReset();
    captureException.mockReset();
    capture.mockReset();
  });

  it('renders the email input and submit button', () => {
    render(<LoginForm />);
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    expect(input.type).toBe('email');
    expect(input.required).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Send magic link' })
    ).toBeTruthy();
  });

  it('calls signInWithOtp with emailRedirectTo derived from window.origin', async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    render(<LoginForm />);
    submitForm('meir@example.test');
    await vi.waitFor(() => {
      expect(signInWithOtp).toHaveBeenCalledTimes(1);
    });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'meir@example.test',
      options: {
        emailRedirectTo: 'http://localhost:3000/auth/callback?next=/home',
      },
    });
  });

  it('swaps to confirmation state on success and fires sign_in_requested once', async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    render(<LoginForm />);
    submitForm('meir@example.test');
    await screen.findByText(/check your email/i);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('sign_in_requested', {
      method: 'magic_link',
    });
    expect(screen.getByText(/meir@example\.test/)).toBeTruthy();
  });

  it('"Use a different email" resets back to the form', async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    render(<LoginForm />);
    submitForm('meir@example.test');
    const reset = await screen.findByRole('button', {
      name: 'Use a different email',
    });
    fireEvent.click(reset);
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it('shows rate-limit copy on a 429 error and does NOT fire sign_in_requested', async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: { status: 429, message: 'Email rate limit exceeded' },
    });
    render(<LoginForm />);
    submitForm();
    await screen.findByText(/sending links too fast/i);
    expect(capture).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('shows generic copy on a non-429 error AND captures to Sentry', async () => {
    const apiError = { status: 500, message: 'kaboom' };
    signInWithOtp.mockResolvedValue({ data: {}, error: apiError });
    render(<LoginForm />);
    submitForm();
    await screen.findByText(/something went wrong/i);
    expect(captureException).toHaveBeenCalledWith(apiError);
    expect(capture).not.toHaveBeenCalled();
  });

  it('renders the callback-failed banner when initialErrorCode is "callback_failed"', () => {
    render(<LoginForm initialErrorCode="callback_failed" />);
    expect(
      screen.getByText(/that sign-in link expired or was already used/i)
    ).toBeTruthy();
  });
});
