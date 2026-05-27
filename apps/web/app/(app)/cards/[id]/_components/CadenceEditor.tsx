'use client';

// What: Client component for inline cadence adjustment on MonitorView.
//       "Check-in every N days" with an "Edit" link. On click, expands
//       to a number input (min 1, max 365) + "Save" + "Cancel".
// Why:  spec § Screens — MonitorView body section 4. Same inline
//       expansion pattern as ReminderEditor.
// Does NOT: Fetch initial cadence — receives it as a prop.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';

export type CadenceEditorProps = {
  cardId: string;
  cadenceDays: number;
};

const CADENCE_MIN = 1;
const CADENCE_MAX = 365;

type FetchState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

/** CadenceEditor — see file header. */
export function CadenceEditor(props: CadenceEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.cadenceDays);
  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'idle' });
  const router = useRouter();

  /**
   *
   */
  async function commit(newCadence: number) {
    setFetchState({ kind: 'saving' });
    try {
      const res = await fetch(`/api/card/${props.cardId}/cadence`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cadence_days: newCadence }),
      });
      if (res.status === 200) {
        posthog.capture('monitor_cadence_changed', {
          card_id: props.cardId,
          old_cadence: props.cadenceDays,
          new_cadence: newCadence,
        });
        setEditing(false);
        setFetchState({ kind: 'idle' });
        router.refresh();
        return;
      }
      let bodyText = 'Could not update cadence. Please try again.';
      try {
        const body = await res.json();
        if (body?.reason) bodyText = body.reason;
        else if (body?.error) bodyText = body.error;
      } catch {
        // ignore JSON parse failure; keep generic message
      }
      setFetchState({ kind: 'error', message: bodyText });
    } catch {
      setFetchState({
        kind: 'error',
        message: 'Network error. Please try again.',
      });
    }
  }

  // --- Editing surface ---
  if (editing) {
    return (
      <form
        data-testid="cadence-editor-form"
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const clamped = Math.max(
            CADENCE_MIN,
            Math.min(CADENCE_MAX, Math.round(draft))
          );
          commit(clamped);
        }}
      >
        <label className="text-sm text-[var(--color-text-primary-inverse)]">
          Check-in every
          <input
            type="number"
            min={CADENCE_MIN}
            max={CADENCE_MAX}
            step={1}
            value={draft}
            data-testid="cadence-editor-input"
            onChange={(e) => setDraft(Number(e.target.value))}
            className="mx-2 w-20 rounded border border-[var(--color-border-default)] bg-[var(--color-background-raised)] p-1 text-[var(--color-text-primary-inverse)]"
          />
          days
        </label>
        <button
          type="submit"
          data-testid="cadence-editor-save"
          className="rounded bg-[var(--color-text-primary-inverse)] px-3 py-1.5 text-sm text-[var(--color-background)]"
          disabled={fetchState.kind === 'saving'}
        >
          {fetchState.kind === 'saving' ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          data-testid="cadence-editor-cancel"
          className="text-sm underline"
          onClick={() => {
            setEditing(false);
            setDraft(props.cadenceDays);
            setFetchState({ kind: 'idle' });
          }}
        >
          Cancel
        </button>
        {fetchState.kind === 'error' && (
          <p
            className="text-sm text-[var(--color-act-soon)]"
            data-testid="cadence-editor-error"
          >
            {fetchState.message}
          </p>
        )}
      </form>
    );
  }

  // --- Display state ---
  return (
    <div
      className="flex flex-wrap items-center gap-3"
      data-testid="cadence-editor-display"
    >
      <p className="text-sm text-[var(--color-text-secondary)]">
        Check-in every {props.cadenceDays} days
      </p>
      <button
        type="button"
        data-testid="cadence-editor-edit"
        className="text-sm underline"
        onClick={() => {
          setDraft(props.cadenceDays);
          setEditing(true);
          setFetchState({ kind: 'idle' });
        }}
      >
        Edit
      </button>
      {fetchState.kind === 'error' && (
        <p
          className="text-sm text-[var(--color-act-soon)]"
          data-testid="cadence-editor-error"
        >
          {fetchState.message}
        </p>
      )}
    </div>
  );
}
