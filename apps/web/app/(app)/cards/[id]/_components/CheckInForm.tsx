'use client';

// What: Client component for the inline check-in form on MonitorView.
//       "Check in now" button expands to: optional notes textarea + up to
//       3 photo slots (wide/zoom/detail) + reference photos + "Submit
//       check-in" confirm + Cancel. PostHog events fire from here per D8.
// Why:  spec § D5 — inline expansion matches CloseCardForm pattern.
// Does NOT: Fire server-side events. Photos after RPC (G1).

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';
import type { CheckInPhoto } from './CheckInTimeline';

export type CheckInFormProps = {
  cardId: string;
  isOverdue: boolean;
  /** Reference photos from the last check-in (or capture photos if no
   *  prior check-in). Shown alongside the photo inputs for angle matching. */
  referencePhotos: CheckInPhoto[];
  /** Optional callback fired after a successful check-in submission.
   *  Used by WalkthroughMode (dashboard) to advance to the next card. */
  onCheckinSuccess?: () => void;
};

type FetchState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string; retryable: boolean };

/** CheckInForm — see file header. */
export function CheckInForm(props: CheckInFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState('');
  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'idle' });
  const wideRef = useRef<HTMLInputElement>(null);
  const zoomRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /**
   *
   */
  function handleExpand() {
    setExpanded(true);
  }

  /**
   *
   */
  function handleCancel() {
    setExpanded(false);
    setNotes('');
    setFetchState({ kind: 'idle' });
    if (wideRef.current) wideRef.current.value = '';
    if (zoomRef.current) zoomRef.current.value = '';
    if (detailRef.current) detailRef.current.value = '';
  }

  /**
   *
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFetchState({ kind: 'submitting' });

    const fd = new FormData();

    if (notes.trim() !== '') {
      fd.append('notes', notes.trim());
    }

    const wideFile = wideRef.current?.files?.[0];
    const zoomFile = zoomRef.current?.files?.[0];
    const detailFile = detailRef.current?.files?.[0];
    if (wideFile) fd.append('photo_wide', wideFile);
    if (zoomFile) fd.append('photo_zoom', zoomFile);
    if (detailFile) fd.append('photo_detail', detailFile);

    const photoCount = [wideFile, zoomFile, detailFile].filter(Boolean).length;

    try {
      const res = await fetch(`/api/card/${props.cardId}/checkin`, {
        method: 'POST',
        body: fd,
      });

      if (res.status === 200) {
        posthog.capture('monitor_checkin_submitted', {
          card_id: props.cardId,
          photo_count: photoCount,
          has_notes: notes.trim() !== '',
          is_overdue: props.isOverdue,
        });
        props.onCheckinSuccess?.();
        router.refresh();
        return;
      }

      let bodyText = 'Could not submit check-in. Please try again.';
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
      <div data-testid="checkin-form-collapsed">
        <button
          type="button"
          data-testid="checkin-expand"
          className="w-full rounded-lg border border-[var(--color-monitor)] px-4 py-3 text-sm font-medium text-[var(--color-monitor)] transition-colors hover:bg-[var(--color-monitor)]/10"
          onClick={handleExpand}
        >
          Check in now
        </button>
      </div>
    );
  }

  // --- Expanded form ---
  const isSubmitting = fetchState.kind === 'submitting';

  return (
    <form
      data-testid="checkin-form-expanded"
      className="space-y-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5"
      onSubmit={handleSubmit}
    >
      <div>
        <label className="block text-sm text-[var(--color-text-secondary)]">
          Notes (optional)
          <textarea
            placeholder="What do you see?"
            maxLength={500}
            data-testid="checkin-notes"
            className="mt-1 block w-full rounded border border-[var(--color-border-default)] bg-[var(--color-background-raised)] p-2 text-[var(--color-text-primary-inverse)]"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isSubmitting}
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-[var(--color-text-secondary)]">
          Photos (optional)
        </p>
        <div className="space-y-2">
          <label className="block text-xs text-[var(--color-text-secondary)]">
            Wide
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={wideRef}
              data-testid="checkin-photo-wide-input"
              className="mt-1 block w-full text-sm text-[var(--color-text-secondary)]"
              disabled={isSubmitting}
            />
          </label>
          <label className="block text-xs text-[var(--color-text-secondary)]">
            Zoom
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={zoomRef}
              data-testid="checkin-photo-zoom-input"
              className="mt-1 block w-full text-sm text-[var(--color-text-secondary)]"
              disabled={isSubmitting}
            />
          </label>
          <label className="block text-xs text-[var(--color-text-secondary)]">
            Detail
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={detailRef}
              data-testid="checkin-photo-detail-input"
              className="mt-1 block w-full text-sm text-[var(--color-text-secondary)]"
              disabled={isSubmitting}
            />
          </label>
        </div>
      </div>

      {props.referencePhotos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Last check-in photos
          </p>
          <div className="flex gap-2">
            {props.referencePhotos.map((photo) => (
              <img
                key={photo.slot}
                src={photo.url}
                alt={`Reference ${photo.slot}`}
                className="h-20 w-20 rounded border border-[var(--color-border-subtle)] object-cover"
                data-testid={`reference-photo-${photo.slot}`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          data-testid="checkin-submit"
          className="rounded bg-[var(--color-monitor)] px-4 py-2 text-sm font-medium text-white"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting…' : 'Submit check-in'}
        </button>
        {!isSubmitting && (
          <button
            type="button"
            data-testid="checkin-cancel"
            className="text-sm underline text-[var(--color-text-secondary)]"
            onClick={handleCancel}
          >
            Cancel
          </button>
        )}
      </div>

      {fetchState.kind === 'error' && (
        <div
          data-testid="checkin-error"
          className="rounded border border-[var(--color-act-soon)]/30 bg-[var(--color-act-soon)]/10 p-3 text-sm text-[var(--color-act-soon)]"
        >
          {fetchState.message}
          {fetchState.retryable && (
            <button
              type="button"
              data-testid="checkin-retry"
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
