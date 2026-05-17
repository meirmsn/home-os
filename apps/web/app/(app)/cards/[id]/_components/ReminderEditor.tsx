'use client';

// What: Client component for setting / editing / clearing the optional
//       PLANNED-state reminder date. Three render states keyed on
//       `plannedReminderDate` + `isReminderDue`:
//         A — no reminder set:    "Set a reminder" link → expand inline
//                                   <input type="date"> + Save / Cancel.
//         B — future reminder:    "Revisit by [date]" subline + Edit /
//                                   Clear text links.
//         C — due reminder:       same shape as B; the calm-indigo chip
//                                   in the page header carries urgency.
// Why:  spec § D5. Native <input type="date"> handles iOS / Android /
//       desktop without a date-picker dependency. PostHog events fire
//       AFTER the PATCH 200 lands (spec § Gotchas #6) — never optimistic.
// Does NOT: Render the indigo chip (that's <ReminderDueChip /> in the
//           page header). Doesn't validate dates client-side beyond the
//           native input — the route handler is the trust boundary.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';
import { humanReminderDate } from './_reminder-chip';

export type ReminderEditorProps = {
  cardId: string;
  /** Current reminder date (ISO `YYYY-MM-DD`) or null when unset. */
  plannedReminderDate: string | null;
  /** Server-derived "today or past" predicate (matches the page
   *  computation in cards/[id]/page.tsx — keeps client + server in sync
   *  on the UTC-stripped comparison from spec § Gotchas #3). */
  isReminderDue: boolean;
};

type FetchState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

/** Compute signed `days_out` from a reminder date string and "now".
 *  Past dates yield negative integers (spec § Gotchas #9 — sign IS the
 *  signal). UTC-stripped to avoid midnight drift. */
function daysOut(reminderIso: string, nowMs: number = Date.now()): number {
  // Strip clock-time from "now" by resolving today's UTC midnight.
  const today = new Date(nowMs);
  const todayUtcMidnight = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  // Reminder strings are already UTC-midnight-equivalent ('YYYY-MM-DD').
  const reminderMs = new Date(`${reminderIso}T00:00:00.000Z`).getTime();
  return Math.round((reminderMs - todayUtcMidnight) / 86400000);
}

/** Reminder management UI for a planned-state card. See file header. */
export function ReminderEditor(props: ReminderEditorProps) {
  const [editing, setEditing] = useState(false);
  // The native <input type="date"> value is always a 'YYYY-MM-DD' string
  // in JS, regardless of browser locale display. Initialize with the
  // existing reminder date (or empty when setting a new one).
  const [draft, setDraft] = useState<string>(props.plannedReminderDate ?? '');
  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'idle' });
  const router = useRouter();

  /** PATCH /api/card/[id]/reminder + fire the right PostHog event AFTER 200. */
  async function commit(next: string | null) {
    setFetchState({ kind: 'saving' });
    try {
      const res = await fetch(`/api/card/${props.cardId}/reminder`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reminder_date: next }),
      });
      if (res.status === 200) {
        const prev = props.plannedReminderDate;
        if (next === null) {
          // _cleared: had_future_date distinguishes regret (future
          // cleared) from acknowledgment (already-due cleared).
          // Compute from the *pre-clear* state, not the (now-cleared) row.
          posthog.capture('planned_reminder_cleared', {
            card_id: props.cardId,
            had_future_date: !props.isReminderDue && prev !== null,
          });
        } else if (prev === null) {
          // _set: transitioning from "no reminder" to "has reminder".
          posthog.capture('planned_reminder_set', {
            card_id: props.cardId,
            reminder_date: next,
            days_out: daysOut(next),
          });
        } else {
          // _edited: B/C → B/C, date changed.
          posthog.capture('planned_reminder_edited', {
            card_id: props.cardId,
            from_date: prev,
            to_date: next,
            days_out: daysOut(next),
          });
        }
        setEditing(false);
        setFetchState({ kind: 'idle' });
        router.refresh();
        return;
      }
      let bodyText = 'Could not update the reminder. Please try again.';
      try {
        const body = await res.json();
        if (body?.reason) bodyText = body.reason;
        else if (body?.error) bodyText = body.error;
      } catch {
        // ignore JSON parse failure; keep the generic message
      }
      setFetchState({ kind: 'error', message: bodyText });
    } catch {
      setFetchState({
        kind: 'error',
        message: 'Network error. Please try again.',
      });
    }
  }

  // --- Editing surface (expanded native date input) ---
  if (editing) {
    return (
      <form
        data-testid="reminder-editor-form"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft) {
            setFetchState({
              kind: 'error',
              message: 'Pick a date before saving.',
            });
            return;
          }
          commit(draft);
        }}
      >
        <label className="block text-sm text-[var(--color-text-secondary)]">
          Revisit date
          <input
            type="date"
            // No min/max — D5 explicitly allows past/future.
            data-testid="reminder-date-input"
            className="bg-[var(--color-background-raised)] mt-1 block w-full rounded border border-[var(--color-border-default)] p-2 text-[var(--color-text-primary-inverse)]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            required
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            data-testid="reminder-save"
            className="bg-[var(--color-text-primary-inverse)] text-[var(--color-background)] rounded px-3 py-1.5 text-sm"
            disabled={fetchState.kind === 'saving'}
          >
            {fetchState.kind === 'saving' ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            data-testid="reminder-cancel"
            className="text-sm underline"
            onClick={() => {
              setEditing(false);
              setDraft(props.plannedReminderDate ?? '');
              setFetchState({ kind: 'idle' });
            }}
          >
            Cancel
          </button>
          {fetchState.kind === 'error' && (
            <p
              className="text-[var(--color-act-soon)] text-sm"
              data-testid="reminder-error"
            >
              {fetchState.message}
            </p>
          )}
        </div>
      </form>
    );
  }

  // --- State A: no reminder set ---
  if (props.plannedReminderDate === null) {
    return (
      <div
        className="flex flex-wrap items-center gap-3"
        data-testid="reminder-editor-a"
      >
        <button
          type="button"
          data-testid="reminder-set-link"
          className="text-sm underline"
          onClick={() => {
            setDraft('');
            setEditing(true);
            setFetchState({ kind: 'idle' });
          }}
        >
          Set a reminder
        </button>
        {fetchState.kind === 'error' && (
          <p
            className="text-[var(--color-act-soon)] text-sm"
            data-testid="reminder-error"
          >
            {fetchState.message}
          </p>
        )}
      </div>
    );
  }

  // --- States B (future) + C (due) — same shape, differ only in the
  //     header chip rendered by <ReminderDueChip /> elsewhere. ---
  return (
    <div
      className="flex flex-wrap items-center gap-3"
      data-testid={
        props.isReminderDue ? 'reminder-editor-c' : 'reminder-editor-b'
      }
    >
      <p
        className="text-sm text-[var(--color-text-secondary)]"
        data-testid="reminder-subline"
      >
        Revisit by {humanReminderDate(props.plannedReminderDate)}
      </p>
      <button
        type="button"
        data-testid="reminder-edit-link"
        className="text-sm underline"
        onClick={() => {
          setDraft(props.plannedReminderDate ?? '');
          setEditing(true);
          setFetchState({ kind: 'idle' });
        }}
      >
        Edit
      </button>
      <button
        type="button"
        data-testid="reminder-clear-link"
        className="text-sm underline text-[var(--color-text-secondary)]"
        onClick={() => commit(null)}
        disabled={fetchState.kind === 'saving'}
      >
        Clear
      </button>
      {fetchState.kind === 'error' && (
        <p
          className="text-[var(--color-act-soon)] text-sm"
          data-testid="reminder-error"
        >
          {fetchState.message}
        </p>
      )}
    </div>
  );
}
