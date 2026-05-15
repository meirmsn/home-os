'use client';

// What: Inline-confirm restore strip for the /(app)/dismissed list (D8).
//       Three states: collapsed (just the "Restore" trigger), confirm
//       (canonical copy + Restore + Cancel buttons), and submitting
//       (Restore disabled). On a 200 from POST /api/card/[id]/restore,
//       removes the row from the DOM via the `onRestored` callback.
// Why:  Symmetric with design-review § DISMISS Flow's strip — calm,
//       reversible, no destructive-looking surface.
// Does NOT: Fire a posthog event (D9 — endpoint is silent; D8 trade-off
//           is the row removal IS the confirmation). Doesn't optimistic-
//           hide before the network resolves; the strip stays visible
//           with a spinner so users see what happened.

import * as Sentry from '@sentry/nextjs';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Stage = 'collapsed' | 'confirm' | 'submitting';
type StripError = 'not_found' | 'invalid_state' | 'generic' | null;

const ERROR_COPY: Record<Exclude<StripError, null>, string> = {
  not_found: 'Card not found.',
  invalid_state: 'Card is not in a dismissed state.',
  generic: "Couldn't restore — try again in a moment.",
};

/**
 * Restore strip for a single dismissed card.
 *
 * `onRestored` is optional — the default implementation calls
 * `router.refresh()` so the server-rendered list re-fetches and the
 * row drops out organically. Callers can pass a custom callback to
 * implement an optimistic row-removal UI.
 */
export function RestoreStrip({
  cardId,
  onRestored,
}: {
  cardId: string;
  onRestored?: (cardId: string) => void;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('collapsed');
  const [error, setError] = useState<StripError>(null);

  /**
   *
   */
  async function handleConfirm() {
    if (stage === 'submitting') return;
    setStage('submitting');
    setError(null);

    let response: Response;
    try {
      response = await fetch(`/api/card/${cardId}/restore`, {
        method: 'POST',
      });
    } catch (err) {
      Sentry.captureException(err, {
        tags: { surface: 'RestoreStrip', stage: 'fetch' },
      });
      setError('generic');
      setStage('confirm');
      return;
    }

    if (response.status === 200) {
      if (onRestored) {
        onRestored(cardId);
      } else {
        router.refresh();
      }
      return;
    }
    if (response.status === 404) {
      setError('not_found');
    } else if (response.status === 409) {
      setError('invalid_state');
    } else {
      setError('generic');
      Sentry.captureException(
        new Error(`Unexpected restore status ${response.status}`),
        { tags: { surface: 'RestoreStrip', stage: 'unexpected_status' } }
      );
    }
    setStage('confirm');
  }

  if (stage === 'collapsed') {
    return (
      <button
        type="button"
        onClick={() => setStage('confirm')}
        className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-border-input)] bg-transparent px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary-inverse)] hover:bg-[var(--color-surface-input)]"
      >
        Restore
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-input)] p-3 text-sm">
      <p className="text-[var(--color-text-secondary-inverse)]">
        Restoring will start a new AI triage session — these are limited.
      </p>
      {error && (
        <p role="alert" className="text-xs text-[var(--color-text-danger)]">
          {ERROR_COPY[error]}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={stage === 'submitting'}
          aria-disabled={stage === 'submitting'}
          className="inline-flex min-h-11 items-center rounded-md bg-[var(--color-surface-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-on-primary)] hover:bg-[var(--color-surface-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {stage === 'submitting' ? 'Restoring…' : 'Restore'}
        </button>
        <button
          type="button"
          onClick={() => {
            setStage('collapsed');
            setError(null);
          }}
          disabled={stage === 'submitting'}
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-border-input)] bg-transparent px-3 py-1.5 text-sm text-[var(--color-text-primary-inverse)] hover:bg-[var(--color-surface-raised)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
