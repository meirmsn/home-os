'use client';

// What: Client component that renders the four DECIDE commit buttons
//       ("Choose DIY" / "Choose Contractor" / "Set to Monitor" /
//       "Dismiss"). On Monitor click, mounts <MonitorCadencePicker />
//       inline; other paths POST immediately to /api/card/[id]/decide.
//       After commit, fires decide_path_chosen (always) and
//       decide_path_changed (when a previous chosen_path existed and
//       the new path differs), then router.refresh()es so the page
//       transitions to <PlannedView /> / monitoring stub / dismissed.
// Why:  spec § D5 + D9 + § Gotchas #10. The previous chosen_path is
//       snapshotted as a prop so the "from→to" event fires *before*
//       the server refresh wipes the prior path (the post-refresh
//       chosen_path would be the new one — the from value would be
//       lost).
// Does NOT: Carry the monitoring cadence picker UI directly — that's
//           a child component to keep this file's responsibilities
//           narrow. Doesn't fire decide_view_opened — DecideView owns
//           that (one-mount-per-card-id semantics live there).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';
import { MonitorCadencePicker } from './MonitorCadencePicker';

export type ChoosePathProps = {
  cardId: string;
  /** State the card is currently in. `decide` shows the four active
   *  buttons; `planned` greys all four and shows "✓ Chosen" on the
   *  chosen one. */
  cardState: 'decide' | 'planned';
  /** Previous chosen_path (when re-opening from PlannedView, this is
   *  the path the user picked the first time). Used for
   *  decide_path_changed event firing. Null when on a fresh decide. */
  prevChosenPath: 'diy' | 'contractor' | 'monitor' | null;
  /** AI-proposed monitoring cadence — seeded into the cadence picker. */
  proposedCadence: number | null;
};

type FetchState =
  | { kind: 'idle' }
  | { kind: 'committing'; path: string }
  | { kind: 'error'; path: string; message: string };

/** Render the four-button commit row. */
export function ChoosePath({
  cardId,
  cardState,
  prevChosenPath,
  proposedCadence,
}: ChoosePathProps) {
  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'idle' });
  const [showCadencePicker, setShowCadencePicker] = useState(false);
  const router = useRouter();

  const greyed = cardState === 'planned';

  type CommitPath = 'diy' | 'contractor' | 'monitor' | 'dismiss' | 'decide';

  /**
   *
   */
  async function commit(
    path: CommitPath,
    monitoringCadenceDays: number | null
  ) {
    setFetchState({ kind: 'committing', path });
    try {
      const res = await fetch(`/api/card/${cardId}/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path,
          ...(monitoringCadenceDays !== null
            ? { monitoring_cadence_days: monitoringCadenceDays }
            : {}),
        }),
      });
      if (res.status === 200) {
        // decide_path_chosen + decide_path_changed only fire on a real
        // commit (the four user-visible buttons). Re-opening via
        // path='decide' is a no-event transition — the user hasn't
        // committed yet; events fire when they pick a new path on the
        // refreshed DECIDE screen (spec § D9 + Gotchas #10).
        if (path !== 'decide') {
          posthog.capture('decide_path_chosen', {
            card_id: cardId,
            chosen_path: path,
            monitoring_cadence_days: monitoringCadenceDays,
          });
          if (prevChosenPath && prevChosenPath !== path) {
            posthog.capture('decide_path_changed', {
              card_id: cardId,
              from_path: prevChosenPath,
              to_path: path,
            });
          }
        }
        setShowCadencePicker(false);
        setFetchState({ kind: 'idle' });
        router.refresh();
        return;
      }
      let msg = 'Could not save the decision. Please try again.';
      try {
        const body = await res.json();
        if (body?.reason) msg = body.reason;
        else if (body?.error) msg = body.error;
      } catch {
        // ignore parse failure
      }
      setFetchState({ kind: 'error', path, message: msg });
    } catch {
      setFetchState({
        kind: 'error',
        path,
        message: 'Network error. Please try again.',
      });
    }
  }

  /**
   *
   */
  function handleMonitor() {
    setShowCadencePicker(true);
  }

  const buttonBase =
    'rounded-2xl border border-[var(--color-border-default)] px-3 py-2 text-sm';
  const buttonActive =
    'bg-[var(--color-background-raised)] text-[var(--color-text-primary-inverse)]';
  const buttonGreyed = 'opacity-40 cursor-not-allowed';

  const isCommitting = fetchState.kind === 'committing';
  const isError = fetchState.kind === 'error';

  /**
   *
   */
  function renderButton(
    label: string,
    path: 'diy' | 'contractor' | 'monitor' | 'dismiss',
    onClick: () => void
  ) {
    const chosen = prevChosenPath === path;
    const disabled = greyed || isCommitting;
    return (
      <button
        type="button"
        className={`${buttonBase} ${greyed ? buttonGreyed : buttonActive}`}
        disabled={disabled}
        aria-disabled={disabled}
        data-testid={`choose-${path}`}
        onClick={() => {
          if (disabled) return;
          onClick();
        }}
      >
        {label}
        {chosen && <span className="ml-1">✓ Chosen</span>}
        {isCommitting &&
          fetchState.kind === 'committing' &&
          fetchState.path === path &&
          ' …'}
      </button>
    );
  }

  return (
    <div data-testid="choose-path" className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {renderButton('Choose DIY', 'diy', () => commit('diy', null))}
        {renderButton('Choose Contractor', 'contractor', () =>
          commit('contractor', null)
        )}
        {renderButton('Set to Monitor', 'monitor', handleMonitor)}
        {renderButton('Dismiss', 'dismiss', () => commit('dismiss', null))}
      </div>

      {showCadencePicker && (
        <MonitorCadencePicker
          initialCadence={proposedCadence ?? 30}
          onConfirm={(cadence) => commit('monitor', cadence)}
          onCancel={() => setShowCadencePicker(false)}
          isCommitting={
            fetchState.kind === 'committing' && fetchState.path === 'monitor'
          }
        />
      )}

      {greyed && prevChosenPath && (
        <button
          type="button"
          className="text-[var(--color-text-secondary)] text-sm underline"
          data-testid="change-decision"
          onClick={() => commit('decide', null)}
        >
          Change decision
        </button>
      )}

      {isError && (
        <p
          className="text-[var(--color-act-soon)] text-sm"
          data-testid="choose-path-error"
        >
          {fetchState.message}
        </p>
      )}
    </div>
  );
}
