'use client';

// What: Client component for the "Change path" action on MonitorView.
//       POSTs to /api/card/[id]/decide with { path: 'decide' } to
//       return the card from monitoring to the DECIDE surface.
// Why:  spec § D7 — "Change path" returns to DECIDE with full context.
// Does NOT: Fire PostHog events for the transition — the DECIDE view
//           fires decide_view_opened when it renders.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type ChangePathButtonProps = {
  cardId: string;
};

/** ChangePathButton — see file header. */
export function ChangePathButton({ cardId }: ChangePathButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  /**
   *
   */
  async function handleClick() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/card/${cardId}/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: 'decide' }),
      });
      if (res.status === 200) {
        router.refresh();
        return;
      }
      setError('Could not change path. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        data-testid="change-path-button"
        className="text-sm underline text-[var(--color-text-secondary)]"
        onClick={handleClick}
        disabled={submitting}
      >
        {submitting ? 'Changing…' : 'Change path'}
      </button>
      {error && (
        <p
          data-testid="change-path-error"
          className="text-sm text-[var(--color-act-soon)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
