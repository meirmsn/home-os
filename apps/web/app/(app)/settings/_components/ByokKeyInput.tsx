'use client';

// What: BYOK key input with validate button and inline feedback.
//       Two-state UI per spec D7: State A (first-time, explainer + input)
//       vs State B (returning, input only).
// Why:  Spec D7 — reduces friction for returning users. Validates via
//       POST /api/key-validate and stores the key in ByokKeyProvider
//       context on success.
// Does NOT: Persist the key anywhere. Store the key in a cookie or
//           localStorage — React state only.

import { useCallback, useState, type FormEvent } from 'react';
import { posthog } from '@/lib/posthog';
import { useByokKey } from '@/app/(app)/_components/ByokKeyProvider';

type ValidationState =
  | 'idle'
  | 'validating'
  | 'valid'
  | 'invalid_key'
  | 'out_of_credits'
  | 'network_error';

export type ByokKeyInputProps = {
  /** Whether the user has previously validated a key (users.byok_used). */
  byokUsed: boolean;
};

/**
 * BYOK key input section with validate button and inline feedback.
 */
export function ByokKeyInput({ byokUsed }: ByokKeyInputProps) {
  const { setByokKey } = useByokKey();
  const [key, setKey] = useState('');
  const [state, setState] = useState<ValidationState>('idle');

  const validate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = key.trim();
      if (!trimmed) return;

      setState('validating');

      try {
        const res = await fetch('/api/key-validate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: trimmed }),
        });

        if (!res.ok && res.status !== 200) {
          setState('network_error');
          return;
        }

        const body = (await res.json()) as {
          valid?: boolean;
          error?: string;
        };

        if (body.valid) {
          setState('valid');
          setByokKey(trimmed);
          posthog.capture('byok_key_validated', {});
        } else if (body.error === 'invalid_key') {
          setState('invalid_key');
        } else if (body.error === 'out_of_credits') {
          setState('out_of_credits');
        } else {
          setState('network_error');
        }
      } catch {
        setState('network_error');
      }
    },
    [key, setByokKey]
  );

  const isValidating = state === 'validating';

  return (
    <section aria-label="Claude API key" className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary-inverse)]">
        Claude API key
      </p>

      {/* State A: first-time user sees explainer */}
      {!byokUsed && (
        <p
          className="text-sm text-[var(--color-text-secondary-inverse)]"
          data-testid="byok-explainer"
        >
          Add your own Claude API key to bypass the weekly session limit. Get
          one at{' '}
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--color-text-primary-inverse)]"
          >
            console.anthropic.com
          </a>
          .
        </p>
      )}

      <form onSubmit={validate} className="space-y-3">
        <input
          type="password"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            // Reset feedback when user types
            if (state !== 'idle' && state !== 'validating') {
              setState('idle');
            }
          }}
          placeholder="sk-ant-..."
          disabled={isValidating}
          data-testid="byok-input"
          className="block h-12 w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-input)] px-3 text-sm text-[var(--color-text-primary-inverse)] placeholder:text-[var(--color-text-secondary-inverse)] focus:outline-none focus:ring-2 focus:ring-[var(--color-surface-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={isValidating || key.trim().length === 0}
          data-testid="byok-validate"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-on-primary)] hover:bg-[var(--color-surface-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isValidating ? 'Validating...' : 'Validate'}
        </button>
      </form>

      {/* Inline feedback */}
      {state === 'valid' && (
        <p data-testid="byok-feedback" className="text-sm text-green-500">
          Key accepted
        </p>
      )}

      {state === 'invalid_key' && (
        <p data-testid="byok-feedback" className="text-sm text-red-500">
          Key didn&apos;t work -- check and try again
        </p>
      )}

      {state === 'out_of_credits' && (
        <p data-testid="byok-feedback" className="text-sm text-red-500">
          This key is out of credits --{' '}
          <a
            href="https://console.anthropic.com/settings/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            check your Anthropic billing
          </a>
        </p>
      )}

      {state === 'network_error' && (
        <p data-testid="byok-feedback" className="text-sm text-red-500">
          Couldn&apos;t validate -- check your connection and try again
        </p>
      )}
    </section>
  );
}
