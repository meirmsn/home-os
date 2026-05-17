'use client';

// What: Inline cadence picker mounted by <ChoosePath /> when the user
//       taps "Set to Monitor". Reads the AI-proposed cadence as initial
//       value, lets the user adjust with a numeric input (min 7, max
//       365 days per spec), then on Confirm calls back to ChoosePath
//       with the picked cadence.
// Why:  spec § Screens — the AI-proposed cadence is the seed value;
//       users can pick a different cadence at MONITOR commit time
//       without round-tripping through a separate page.
// Does NOT: POST to /api/card/[id]/decide itself — that's ChoosePath's
//           responsibility. Doesn't fire any PostHog events — the
//           commit event (decide_path_chosen) lives in ChoosePath.

import { useState } from 'react';

const CADENCE_MIN = 7;
const CADENCE_MAX = 365;

export type MonitorCadencePickerProps = {
  initialCadence: number;
  onConfirm: (cadenceDays: number) => void;
  onCancel: () => void;
  isCommitting: boolean;
};

/** Clamp into [CADENCE_MIN, CADENCE_MAX]. NaN → CADENCE_MIN. */
function clampCadence(n: number): number {
  if (!Number.isFinite(n) || Number.isNaN(n)) return CADENCE_MIN;
  return Math.max(CADENCE_MIN, Math.min(CADENCE_MAX, Math.round(n)));
}

/** Inline cadence stepper rendered below the four-button row when
 *  the user taps "Set to Monitor". */
export function MonitorCadencePicker({
  initialCadence,
  onConfirm,
  onCancel,
  isCommitting,
}: MonitorCadencePickerProps) {
  const [cadence, setCadence] = useState(clampCadence(initialCadence));

  return (
    <div
      data-testid="monitor-cadence-picker"
      className="bg-[var(--color-background-raised)] flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-border-default)] p-3"
    >
      <label className="text-[var(--color-text-primary-inverse)] text-sm">
        Check back in
        <input
          type="number"
          min={CADENCE_MIN}
          max={CADENCE_MAX}
          step={1}
          value={cadence}
          data-testid="cadence-input"
          onChange={(e) => setCadence(clampCadence(Number(e.target.value)))}
          className="bg-[var(--color-background)] mx-2 w-20 rounded border border-[var(--color-border-default)] p-1"
        />
        days
      </label>
      <button
        type="button"
        data-testid="cadence-confirm"
        className="bg-[var(--color-text-primary-inverse)] text-[var(--color-background)] rounded px-3 py-1.5 text-sm"
        disabled={isCommitting}
        onClick={() => onConfirm(cadence)}
      >
        {isCommitting ? 'Saving…' : 'Confirm'}
      </button>
      <button
        type="button"
        data-testid="cadence-cancel"
        className="text-sm underline"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
