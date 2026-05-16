'use client';

// What: Q&A client surface on /(app)/cards/[id] (diagnosed-state body
//       when severity_confirmed=false). Owns the textarea + Send +
//       Skip controls, fires the four D7 PostHog events
//       (triage_qa_round_started / _round_completed / _confirmed /
//       _failed), and dispatches on each response class: 200 →
//       router.refresh(); 409 already_confirmed → "Already confirmed
//       — refreshing…" notice + delayed refresh; 429 / 503 / 502 /
//       5xx / network → retryable banner with textarea content
//       preserved.
// Why:  Spec D8 — the only client surface in the Q&A flow. PostHog
//       init is browser-only (CLAUDE.md § Where Things Happen —
//       apps/web/lib/posthog.ts), so the four events live here.
// Does NOT: Render the prior thread — the parent page server-fetches
//           it and renders <QaThread /> above. Doesn't show success
//           inline — router.refresh() is the bridge to the new
//           server-rendered body. Doesn't fire events from the route
//           handler (server-side has no PostHog init).

import * as Sentry from '@sentry/nextjs';
import { useCallback, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { posthog } from '@/lib/posthog';

/** Aligns with the D10 + D9 envelope error class set (plus `network`). */
type ErrorClass =
  | 'validation_failed'
  | 'auth_required'
  | 'card_not_found'
  | 'invalid_state'
  | 'already_confirmed'
  | 'triage_rate_limited'
  | 'triage_invalid_output'
  | 'triage_unavailable'
  | 'server_error'
  | 'network';

type Stage =
  | 'idle'
  | 'submitting'
  | 'already-confirmed-notice'
  | 'retryable-error';

const RETRYABLE_ERRORS: ErrorClass[] = [
  'triage_rate_limited',
  'triage_unavailable',
  'triage_invalid_output',
  'server_error',
  'network',
];

const ERROR_NOTICE_COPY: Partial<Record<ErrorClass, string>> = {
  triage_rate_limited: 'AI is rate-limited — try again in a moment.',
  triage_unavailable: 'AI is unavailable right now — try again shortly.',
  triage_invalid_output: 'AI returned a malformed read — try again.',
  server_error: 'Something went wrong — try again.',
  network: 'Connection issue — try again.',
};

type AnswerResponseAsk = {
  tool: 'ask_next_question';
  card_id: string;
  round_number: number;
  question: string;
  is_location_ask: boolean;
  updated_provisional_severity: string;
};

type AnswerResponseConfirm = {
  tool: 'confirm_assessment';
  card_id: string;
  severity_confirmed: 'cosmetic' | 'monitor' | 'soon' | 'urgent';
  monitoring_cadence_days: number;
  was_forced: boolean;
};

/** Inputs the parent page passes in. */
export type AnswerThreadProps = {
  cardId: string;
  /** Active question text rendered above the textarea. Comes from the
   *  most-recent ask_next_question assistant row (the parent parses
   *  the content JSON server-side). Empty string is rendered as a
   *  placeholder. */
  activeQuestion: string;
  /** Whether the active question is a location ask (drives a small
   *  hint above the textarea). */
  activeQuestionIsLocationAsk?: boolean;
  /** Count of non-location user reply rows so far. Drives the Skip
   *  button visibility (≥ 1) and the round_number prop on the
   *  PostHog events for the current turn. */
  qaUserCount: number;
  /** Contractor tag from the card row — surfaced on the
   *  triage_qa_confirmed event for funnel breakdown. */
  contractorTag: string | null;
};

/**
 * Render the active question + textarea + Send + Skip controls and
 * own the POST /api/triage/answer round-trip.
 */
export function AnswerThread({
  cardId,
  activeQuestion,
  activeQuestionIsLocationAsk = false,
  qaUserCount,
  contractorTag,
}: AnswerThreadProps) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('idle');
  const [errorClass, setErrorClass] = useState<ErrorClass | null>(null);
  const [answer, setAnswer] = useState('');

  /** Number we report on round_number-shaped events. The route persists
   *  the user reply on `qaUserCount + 1` (its `nextRound` calc when no
   *  location asks were seen). We track the same shape on the client
   *  so dashboards match. */
  const eventRoundNumber = qaUserCount + 1;

  const submit = useCallback(
    async (mode: 'send' | 'skip') => {
      if (stage === 'submitting') return;
      setStage('submitting');
      setErrorClass(null);

      const start = Date.now();
      const isSkip = mode === 'skip';

      posthog.capture('triage_qa_round_started', {
        card_id: cardId,
        round_number: eventRoundNumber,
        is_skip: isSkip,
      });

      let response: Response;
      try {
        response = await fetch('/api/triage/answer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            isSkip
              ? { card_id: cardId, skip: true }
              : { card_id: cardId, answer }
          ),
        });
      } catch (err) {
        const latency = Date.now() - start;
        Sentry.captureException(err, {
          tags: { surface: 'AnswerThread', stage: 'fetch' },
        });
        posthog.capture('triage_qa_failed', {
          card_id: cardId,
          round_number: eventRoundNumber,
          error_class: 'network' satisfies ErrorClass,
          latency_ms: latency,
        });
        setErrorClass('network');
        setStage('retryable-error');
        return;
      }

      const latency = Date.now() - start;

      if (response.status === 200) {
        let body: AnswerResponseAsk | AnswerResponseConfirm | null = null;
        try {
          body = (await response.json()) as
            | AnswerResponseAsk
            | AnswerResponseConfirm;
        } catch {
          body = null;
        }
        if (body && body.tool === 'ask_next_question') {
          posthog.capture('triage_qa_round_completed', {
            card_id: cardId,
            round_number: body.round_number,
            latency_ms: latency,
            is_location_ask: body.is_location_ask,
            // search_count is not exposed by the server response (D9
            // mirrors initial-read's posture — surfaced via the eval
            // pipeline in row #10). Default to 0 so dashboards have a
            // stable shape.
            search_count: 0,
          });
        } else if (body && body.tool === 'confirm_assessment') {
          posthog.capture('triage_qa_confirmed', {
            card_id: cardId,
            total_rounds: eventRoundNumber,
            severity: body.severity_confirmed,
            contractor_tag: contractorTag ?? 'unknown',
            monitoring_cadence_days: body.monitoring_cadence_days,
            latency_ms: latency,
            was_forced: body.was_forced,
          });
        }
        router.refresh();
        setStage('idle');
        // Clear the textarea on a successful Send so the next round
        // starts fresh. (Skip path's textarea is empty by definition.)
        setAnswer('');
        return;
      }

      // Non-200 paths.
      let error: ErrorClass = 'server_error';
      try {
        const json = (await response.json()) as { error?: string };
        if (typeof json.error === 'string') {
          error = json.error as ErrorClass;
        }
      } catch {
        // Body wasn't JSON; default already set.
      }

      posthog.capture('triage_qa_failed', {
        card_id: cardId,
        round_number: eventRoundNumber,
        error_class: error,
        latency_ms: latency,
      });

      if (error === 'already_confirmed') {
        setErrorClass('already_confirmed');
        setStage('already-confirmed-notice');
        setTimeout(() => router.refresh(), 500);
        return;
      }

      if (RETRYABLE_ERRORS.includes(error)) {
        setErrorClass(error);
        setStage('retryable-error');
        return;
      }

      // Other terminal classes (validation_failed / auth_required /
      // card_not_found / invalid_state): banner + textarea preserved
      // so the user can adjust + retry.
      setErrorClass(error);
      setStage('retryable-error');
    },
    [answer, cardId, contractorTag, eventRoundNumber, router, stage]
  );

  const onFormSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (answer.length === 0) return;
      void submit('send');
    },
    [answer, submit]
  );

  const onSkipClick = useCallback(() => {
    void submit('skip');
  }, [submit]);

  if (stage === 'already-confirmed-notice') {
    return (
      <p
        role="status"
        data-testid="already-confirmed-notice"
        className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-text-secondary-inverse)]"
      >
        Already confirmed — refreshing…
      </p>
    );
  }

  const isSubmitting = stage === 'submitting';
  const showRetryBanner = stage === 'retryable-error';
  const retryCopy =
    (errorClass && ERROR_NOTICE_COPY[errorClass]) ??
    'Something went wrong — try again.';
  const skipVisible = qaUserCount >= 1 && !isSubmitting;

  return (
    <section
      aria-label="Active question"
      className="space-y-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5"
      data-testid="answer-thread"
    >
      <div className="space-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary-inverse)]">
          {activeQuestionIsLocationAsk
            ? 'Location question'
            : 'Active question'}
        </h2>
        <p
          data-testid="active-question"
          className="text-sm text-[var(--color-text-primary-inverse)]"
        >
          {activeQuestion}
        </p>
      </div>

      <form onSubmit={onFormSubmit} className="space-y-3">
        <textarea
          name="answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={isSubmitting}
          maxLength={2000}
          placeholder="Type your answer…"
          rows={3}
          data-testid="answer-textarea"
          className="block w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-input)] px-3 py-2 text-sm text-[var(--color-text-primary-inverse)] placeholder:text-[var(--color-text-secondary-inverse)] focus:outline-none focus:ring-2 focus:ring-[var(--color-surface-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        />

        {showRetryBanner && (
          <p
            role="alert"
            data-testid="answer-retry-banner"
            data-error-class={errorClass ?? ''}
            className="rounded-md border border-[var(--color-border-danger)] bg-[var(--color-surface-danger)] px-3 py-2 text-sm text-[var(--color-text-danger)]"
          >
            {retryCopy}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting || answer.length === 0}
            aria-disabled={isSubmitting || answer.length === 0}
            data-testid="answer-send"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm font-semibold text-[var(--color-text-on-primary)] hover:bg-[var(--color-surface-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
                />
                Sending…
              </span>
            ) : (
              'Send'
            )}
          </button>

          {skipVisible && (
            <button
              type="button"
              onClick={onSkipClick}
              data-testid="answer-skip"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--color-border-subtle)] bg-transparent px-3 py-2.5 text-sm text-[var(--color-text-secondary-inverse)] hover:text-[var(--color-text-primary-inverse)]"
            >
              Skip — give me your best assessment
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
