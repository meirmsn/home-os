'use client';

// What: Client-side magic-link sign-in form. One email input + a submit
//       button that calls `supabase.auth.signInWithOtp` with
//       `emailRedirectTo = <window.location.origin>/auth/callback?next=/home`
//       (D13). On success, swaps to a confirmation state ("Check your
//       email at <addr>…") and fires `posthog.capture('sign_in_requested',
//       { method: 'magic_link' })` (D7). Error mapping per spec § Screens
//       /login § Error states (429 → rate-limit copy; else → generic copy
//       + Sentry capture).
// Why:  Single entry-point for sign-in/up — Supabase magic link handles
//       both implicitly (D1). Keep the form component tiny + client-side
//       so the server shell stays static.
// Does NOT: Validate emails beyond HTML5 `type="email"` — Supabase rejects
//           malformed addresses and the user sees the API error. No
//           custom JS validation in this PR (D12).

import * as Sentry from '@sentry/nextjs';
import { useState } from 'react';
import { posthog } from '@/lib/posthog';
import { createClient } from '@/lib/supabase/client';

type Stage = 'idle' | 'submitting' | 'sent';

type InlineErrorCode = 'rate_limit' | 'generic' | 'callback_failed';

const ERROR_COPY: Record<InlineErrorCode, string> = {
  rate_limit: "You're sending links too fast. Wait a minute and try again.",
  generic: 'Something went wrong. Try again in a moment.',
  callback_failed:
    'That sign-in link expired or was already used. Send a new one.',
};

/** Magic-link sign-in form. `initialErrorCode` lets the parent surface a
 *  callback-error banner without a client round-trip. */
export function LoginForm({ initialErrorCode }: { initialErrorCode?: string }) {
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<InlineErrorCode | null>(
    initialErrorCode === 'callback_failed' ? 'callback_failed' : null
  );

  /**
   *
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage === 'submitting') return;
    setStage('submitting');
    setError(null);

    const supabase = createClient();
    const origin = window.location.origin;
    const { error: apiError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/home`,
      },
    });

    if (apiError) {
      if (apiError.status === 429) {
        setError('rate_limit');
      } else {
        setError('generic');
        Sentry.captureException(apiError);
      }
      setStage('idle');
      return;
    }

    posthog.capture('sign_in_requested', { method: 'magic_link' });
    setStage('sent');
  }

  /**
   *
   */
  function resetToForm() {
    setStage('idle');
    setError(null);
  }

  if (stage === 'sent') {
    return (
      <section
        aria-live="polite"
        className="space-y-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5 text-sm text-[var(--color-text-primary-inverse)]"
      >
        <h2 className="text-base font-semibold">Check your email</h2>
        <p className="text-[var(--color-text-secondary-inverse)]">
          We sent a sign-in link to <strong>{email}</strong>. Open it on this
          device to continue.
        </p>
        <button
          type="button"
          onClick={resetToForm}
          className="text-sm font-medium text-[var(--color-text-accent)] underline-offset-2 hover:underline"
        >
          Use a different email
        </button>
      </section>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit}
      noValidate={false}
      aria-label="Sign in"
    >
      {error && (
        <p
          role="alert"
          className="rounded-md border border-[var(--color-border-danger)] bg-[var(--color-surface-danger)] px-3 py-2 text-sm text-[var(--color-text-danger)]"
        >
          {ERROR_COPY[error]}
        </p>
      )}
      <label className="block space-y-1">
        <span className="text-sm font-medium text-[var(--color-text-primary-inverse)]">
          Email
        </span>
        <input
          type="email"
          required
          autoComplete="email"
          autoFocus
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={stage === 'submitting'}
          className="block min-h-11 w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-surface-input)] px-3 py-2.5 text-sm text-[var(--color-text-primary-inverse)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
          placeholder="you@example.com"
        />
      </label>
      <button
        type="submit"
        disabled={stage === 'submitting'}
        aria-disabled={stage === 'submitting'}
        className="block min-h-11 w-full rounded-md bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm font-semibold text-[var(--color-text-on-primary)] hover:bg-[var(--color-surface-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {stage === 'submitting' ? 'Sending…' : 'Send magic link'}
      </button>
    </form>
  );
}
