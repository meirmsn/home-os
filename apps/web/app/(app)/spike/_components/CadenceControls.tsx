'use client';

// What: CadenceControls — three cadence buttons (slow 1200 / default
//       750 / fast 400 ms) + a Start/Stop bounce toggle + a "Use your
//       own photos" toggle (D4 + D6).
// Why:  Operator picks the cadence the comparison surface should
//       exercise. Cadences pinned to the three design-review canonical
//       values; spike validates each.
// Does NOT: Drive rAF — the parent comparison page owns the timer
//           loop. This component is a presentation-only control strip.

export type Cadence = 400 | 750 | 1200;

export const CADENCES: ReadonlyArray<{ value: Cadence; label: string }> = [
  { value: 1200, label: 'slow (1200 ms)' },
  { value: 750, label: 'default (750 ms)' },
  { value: 400, label: 'fast (400 ms)' },
] as const;

/** Cadence + bounce + photo-source control strip. */
export function CadenceControls({
  cadence,
  onCadenceChange,
  bouncing,
  onBouncingChange,
  useOwnPhotos,
  onUseOwnPhotosChange,
  ownPhotosAvailable,
}: {
  cadence: Cadence;
  onCadenceChange: (c: Cadence) => void;
  bouncing: boolean;
  onBouncingChange: (b: boolean) => void;
  useOwnPhotos: boolean;
  onUseOwnPhotosChange: (v: boolean) => void;
  ownPhotosAvailable: boolean;
}) {
  return (
    <div
      className="space-y-4 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-background-raised)] p-4"
      data-testid="cadence-controls"
    >
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-[var(--color-text-primary-inverse)]">
          Cadence
        </legend>
        <div className="flex gap-2" role="radiogroup" aria-label="Cadence">
          {CADENCES.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={cadence === c.value}
              onClick={() => onCadenceChange(c.value)}
              className={`min-h-11 flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                cadence === c.value
                  ? 'border-[var(--color-monitor)] bg-[var(--color-monitor)] font-semibold text-[var(--color-text-primary-inverse)]'
                  : 'border-[var(--color-border-subtle)] text-[var(--color-text-primary-inverse)] hover:bg-[var(--color-background)]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onBouncingChange(!bouncing)}
          aria-pressed={bouncing}
          className={`min-h-11 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            bouncing
              ? 'bg-[var(--color-act-soon)] text-[var(--color-text-primary-inverse)]'
              : 'bg-[var(--color-monitor)] text-[var(--color-text-primary-inverse)]'
          }`}
        >
          {bouncing ? 'Stop bounce' : 'Start bounce'}
        </button>

        <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-primary-inverse)]">
          <input
            type="checkbox"
            checked={useOwnPhotos}
            onChange={(e) => onUseOwnPhotosChange(e.target.checked)}
            className="size-4"
          />
          Use your own photos
          {useOwnPhotos && !ownPhotosAvailable && (
            <span className="text-xs text-[var(--color-watch)]">
              (no uploads yet — visit /spike/camera first)
            </span>
          )}
        </label>
      </div>
    </div>
  );
}
