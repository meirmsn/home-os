// What: Bounce-cadence constants for <PhotoComparison>. The three canonical
//       instant-cut cadences (slow / default / fast) in milliseconds, plus the
//       default, as a single shared source for the cadence picker UI and the
//       rAF bounce loop.
// Why:  spec § D1 + Bounce mode — the picker and the timer must agree on the
//       same values; pinning them in one module lets a unit test assert the
//       1200/750/400 contract without rendering the component.
// Does NOT: Drive the rAF loop — the component owns the timer; this is data.

/** A bounce cadence in milliseconds between instant-cut frame swaps. */
export type CadenceMs = 1200 | 750 | 400;

/** The default cadence on first render (spec § Bounce mode — default 750). */
export const DEFAULT_CADENCE_MS: CadenceMs = 750;

/** Segmented-picker options, ordered slow -> fast for the control strip. */
export const CADENCE_OPTIONS: ReadonlyArray<{
  value: CadenceMs;
  label: string;
}> = [
  { value: 1200, label: 'Slow' },
  { value: 750, label: 'Default' },
  { value: 400, label: 'Fast' },
] as const;
