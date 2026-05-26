'use client';

// What: Client component for the close-card inline form on PlannedView.
//       "Mark as closed" button expands to: optional dollar input + optional
//       notes textarea + optional photo file input + "Close this card"
//       confirm + Cancel. PostHog events fire from here per spec D8.
// Why:  spec § D5 — low-friction close. Inline expansion matches the
//       ReminderEditor set-a-reminder pattern.
// Does NOT: Fire server-side events. Doesn't validate spend as non-negative
//           — D1 allows any value. Dollar-to-cents conversion happens
//           client-side via Math.round(parseFloat * 100).

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';

export type CloseCardFormProps = {
  cardId: string;
  chosenPath: 'diy' | 'contractor' | 'monitor';
  /** cards.updated_at — proxy for planned_entered_at (Gotcha #8). */
  updatedAt: string;
};

type FetchState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string; retryable: boolean };

/** CloseCardForm — see file header. */
export function CloseCardForm(props: CloseCardFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [dollars, setDollars] = useState('');
  const [notes, setNotes] = useState('');
  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'idle' });
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /**
   *
   */
  function handleExpand() {
    setExpanded(true);
    posthog.capture('card_close_started', { card_id: props.cardId });
  }

  /**
   *
   */
  function handleCancel() {
    setExpanded(false);
    setDollars('');
    setNotes('');
    setFetchState({ kind: 'idle' });
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  }

  /**
   *
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFetchState({ kind: 'submitting' });

    const fd = new FormData();

    // Dollar-to-cents conversion (Gotcha #6).
    if (dollars.trim() !== '') {
      const parsed = parseFloat(dollars);
      if (!isNaN(parsed)) {
        fd.append('spend_amount_cents', String(Math.round(parsed * 100)));
      }
    }

    if (notes.trim() !== '') {
      fd.append('spend_notes', notes.trim());
    }

    const file = fileRef.current?.files?.[0];
    if (file) {
      fd.append('photo', file);
    }

    try {
      const res = await fetch(`/api/card/${props.cardId}/close`, {
        method: 'POST',
        body: fd,
      });

      if (res.status === 200) {
        // days_in_planned = approximate (Gotcha #8).
        const daysInPlanned = Math.floor(
          (Date.now() - new Date(props.updatedAt).getTime()) / 86400000
        );
        posthog.capture('card_closed', {
          card_id: props.cardId,
          chosen_path: props.chosenPath,
          has_spend_log: dollars.trim() !== '' && !isNaN(parseFloat(dollars)),
          has_finished_photo: !!file,
          days_in_planned: daysInPlanned,
        });
        router.refresh();
        return;
      }

      let bodyText = 'Could not close the card. Please try again.';
      try {
        const body = await res.json();
        if (res.status === 409) {
          setFetchState({
            kind: 'error',
            message: 'Card state changed — refreshing…',
            retryable: false,
          });
          setTimeout(() => router.refresh(), 1500);
          return;
        }
        if (res.status === 404) {
          setFetchState({
            kind: 'error',
            message: 'Card not found — refreshing…',
            retryable: false,
          });
          setTimeout(() => router.refresh(), 1500);
          return;
        }
        if (body?.reason) bodyText = body.reason;
        else if (body?.error) bodyText = body.error;
      } catch {
        // ignore JSON parse failure; keep generic message
      }
      setFetchState({ kind: 'error', message: bodyText, retryable: true });
    } catch {
      setFetchState({
        kind: 'error',
        message: 'Network error. Please try again.',
        retryable: true,
      });
    }
  }

  // --- Collapsed state ---
  if (!expanded) {
    return (
      <div data-testid="close-card-form-collapsed">
        <button
          type="button"
          data-testid="close-card-expand"
          className="w-full rounded-lg border border-[var(--color-note)] px-4 py-3 text-sm font-medium text-[var(--color-note)] transition-colors hover:bg-[var(--color-note)]/10"
          onClick={handleExpand}
        >
          Mark as closed
        </button>
      </div>
    );
  }

  // --- Expanded form ---
  const isSubmitting = fetchState.kind === 'submitting';

  return (
    <form
      data-testid="close-card-form-expanded"
      className="space-y-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5"
      onSubmit={handleSubmit}
    >
      <div>
        <label className="block text-sm text-[var(--color-text-secondary)]">
          Amount spent ($)
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Amount spent ($)"
            data-testid="close-card-dollars"
            className="mt-1 block w-full rounded border border-[var(--color-border-default)] bg-[var(--color-background-raised)] p-2 text-[var(--color-text-primary-inverse)]"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            disabled={isSubmitting}
          />
        </label>
      </div>

      <div>
        <label className="block text-sm text-[var(--color-text-secondary)]">
          Notes
          <textarea
            placeholder="Notes (e.g. parts, who did the work)"
            maxLength={500}
            data-testid="close-card-notes"
            className="mt-1 block w-full rounded border border-[var(--color-border-default)] bg-[var(--color-background-raised)] p-2 text-[var(--color-text-primary-inverse)]"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isSubmitting}
          />
        </label>
      </div>

      <div>
        <label className="block text-sm text-[var(--color-text-secondary)]">
          Finished photo
          <input
            type="file"
            accept="image/*"
            ref={fileRef}
            data-testid="close-card-photo"
            className="mt-1 block w-full text-sm text-[var(--color-text-secondary)]"
            disabled={isSubmitting}
          />
          <span className="mt-1 block text-xs text-[var(--color-text-secondary)]">
            Add a finished photo for your before &amp; after
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          data-testid="close-card-submit"
          className="rounded bg-[var(--color-note)] px-4 py-2 text-sm font-medium text-white"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Closing…' : 'Close this card'}
        </button>
        {!isSubmitting && (
          <button
            type="button"
            data-testid="close-card-cancel"
            className="text-sm underline text-[var(--color-text-secondary)]"
            onClick={handleCancel}
          >
            Cancel
          </button>
        )}
      </div>

      {fetchState.kind === 'error' && (
        <div
          data-testid="close-card-error"
          className="rounded border border-[var(--color-act-soon)]/30 bg-[var(--color-act-soon)]/10 p-3 text-sm text-[var(--color-act-soon)]"
        >
          {fetchState.message}
          {fetchState.retryable && (
            <button
              type="button"
              data-testid="close-card-retry"
              className="ml-2 underline"
              onClick={() => setFetchState({ kind: 'idle' })}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </form>
  );
}
