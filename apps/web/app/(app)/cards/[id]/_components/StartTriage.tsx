'use client';

// What: "Read this for me" client trigger on /(app)/cards/[id] (capturing
//       state body). POSTs to /api/triage, fires the three PostHog
//       events from D10, and dispatches to the right UI state on each
//       response class: 200 → router.refresh(); 202 / 409 → notice +
//       refresh; 429 / 503 / 5xx / network → retry-eligible banner.
// Why:  Only client surface in the cards/[id] tree. PostHog init is
//       browser-only (spec § Gotchas #7), so events live here, not in
//       the route handler.
// Does NOT: Render the success state inline — the route's 200 response
//           is treated as a signal to router.refresh() so the server-
//           rendered page picks up the new `diagnosed` body. Doesn't
//           handle the row-#2 Q&A flow.

import * as Sentry from '@sentry/nextjs';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { posthog } from '@/lib/posthog';
import { useByokKey } from '@/app/(app)/_components/ByokKeyProvider';

/** Set of error_class values aligned with the D9 envelope. */
type ErrorClass =
  | 'validation_failed'
  | 'auth_required'
  | 'card_not_found'
  | 'invalid_state'
  | 'already_triaged'
  | 'triage_in_progress'
  | 'triage_rate_limited'
  | 'triage_invalid_output'
  | 'triage_unavailable'
  | 'server_error'
  | 'network';

type Stage =
  | 'idle'
  | 'submitting'
  | 'in-progress-notice'
  | 'already-triaged-notice'
  | 'retryable-error';

const RETRYABLE_ERRORS: ErrorClass[] = [
  'triage_rate_limited',
  'triage_unavailable',
  'server_error',
  'network',
];

/** Map a non-retryable error_class to the user-facing notice copy. */
const ERROR_NOTICE_COPY: Partial<Record<ErrorClass, string>> = {
  triage_rate_limited: 'AI is rate-limited — try again in a moment.',
  triage_unavailable: 'AI is unavailable right now — try again shortly.',
  server_error: 'Something went wrong — try again.',
  network: 'Connection issue — try again.',
  triage_invalid_output: 'AI returned a malformed read — try again.',
};

/**
 * "Read this for me" trigger button.
 *
 * `cardId` is the uuid of the capturing-state card. `systemTag` is the
 * homeowner-set tag — fed to the `triage_initial_read_started` PostHog
 * event so we can correlate funnels by issue category.
 */
export function StartTriage({
  cardId,
  systemTag,
}: {
  cardId: string;
  systemTag: string;
}) {
  const router = useRouter();
  const { byokKey } = useByokKey();
  const [stage, setStage] = useState<Stage>('idle');
  const [errorClass, setErrorClass] = useState<ErrorClass | null>(null);

  const submit = useCallback(async () => {
    if (stage === 'submitting') return;
    setStage('submitting');
    setErrorClass(null);

    const start = Date.now();
    posthog.capture('triage_initial_read_started', {
      card_id: cardId,
      system_tag: systemTag,
    });

    // Build the fetch body — include byok_key when present per spec D3.
    const fetchBody: Record<string, unknown> = { card_id: cardId };
    if (byokKey) {
      fetchBody.byok_key = byokKey;
    }

    let response: Response;
    try {
      response = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(fetchBody),
      });
    } catch (err) {
      const latency = Date.now() - start;
      Sentry.captureException(err, {
        tags: { surface: 'StartTriage', stage: 'fetch' },
      });
      posthog.capture('triage_initial_read_failed', {
        card_id: cardId,
        error_class: 'network' as ErrorClass,
        latency_ms: latency,
      });
      setErrorClass('network');
      setStage('retryable-error');
      return;
    }

    const latency = Date.now() - start;

    if (response.status === 200) {
      type SuccessBody = {
        severity_provisional: string;
        what_i_need_to_know: string[];
      };
      let body: SuccessBody | null = null;
      try {
        body = (await response.json()) as SuccessBody;
      } catch {
        body = null;
      }
      // Server response doesn't enumerate web_search use directly; we
      // surface search_count via the per-event property and default it
      // to 0 since the server's response shape (D9) doesn't include it
      // (the SDK response does — but the server doesn't forward it).
      // Row #11's eval pipeline will surface it via a different path.
      posthog.capture('triage_initial_read_completed', {
        card_id: cardId,
        system_tag: systemTag,
        severity_provisional: body?.severity_provisional ?? 'unknown',
        latency_ms: latency,
        search_count: 0,
      });
      router.refresh();
      // Stay on the page; server-render picks up the diagnosed body.
      setStage('idle');
      return;
    }

    let error: ErrorClass = 'server_error';
    try {
      const json = (await response.json()) as { error?: string };
      if (typeof json.error === 'string') {
        error = json.error as ErrorClass;
      }
    } catch {
      // Body wasn't JSON; default `error` already set.
    }

    posthog.capture('triage_initial_read_failed', {
      card_id: cardId,
      error_class: error,
      latency_ms: latency,
    });

    if (response.status === 202 || error === 'triage_in_progress') {
      setErrorClass('triage_in_progress');
      setStage('in-progress-notice');
      // Refresh after a brief delay so the page surfaces the triaging skeleton.
      setTimeout(() => router.refresh(), 500);
      return;
    }
    if (error === 'already_triaged') {
      setErrorClass('already_triaged');
      setStage('already-triaged-notice');
      setTimeout(() => router.refresh(), 500);
      return;
    }
    if (RETRYABLE_ERRORS.includes(error)) {
      setErrorClass(error);
      setStage('retryable-error');
      return;
    }

    // Other terminal classes: surface as a non-retryable notice via
    // banner. (validation_failed / auth_required / card_not_found /
    // invalid_state are reachable only on stale clients — refreshing
    // surfaces the right server-render.)
    setErrorClass(error);
    setStage('retryable-error');
  }, [byokKey, cardId, systemTag, router, stage]);

  if (stage === 'in-progress-notice') {
    return (
      <p
        role="status"
        className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text-secondary-inverse)]"
      >
        Already running — refreshing…
      </p>
    );
  }

  if (stage === 'already-triaged-notice') {
    return (
      <p
        role="status"
        className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text-secondary-inverse)]"
      >
        Already diagnosed — refreshing…
      </p>
    );
  }

  if (stage === 'retryable-error') {
    const copy =
      (errorClass && ERROR_NOTICE_COPY[errorClass]) ??
      'Something went wrong — try again.';
    return (
      <div className="space-y-3">
        <p
          role="alert"
          className="rounded-md border border-[var(--color-border-danger)] bg-[var(--color-surface-danger)] px-3 py-2 text-sm text-[var(--color-text-danger)]"
        >
          {copy}
        </p>
        <button
          type="button"
          onClick={submit}
          className="block min-h-11 w-full rounded-md bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm font-semibold text-[var(--color-text-on-primary)] hover:bg-[var(--color-surface-primary-hover)]"
        >
          Read this for me
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={submit}
      disabled={stage === 'submitting'}
      aria-disabled={stage === 'submitting'}
      className="block min-h-11 w-full rounded-md bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm font-semibold text-[var(--color-text-on-primary)] hover:bg-[var(--color-surface-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {stage === 'submitting' ? (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
          Reading…
        </span>
      ) : (
        'Read this for me'
      )}
    </button>
  );
}
