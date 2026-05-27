// What: Runtime validator for PATCH /api/card/[id]/cadence body shape.
//       Returns `{ ok: true, value } | { ok: false, field, reason }`.
//       Accepts `cadence_days` as an integer in [1, 365].
// Why:  Trust-boundary: validates the body before the RLS-enforced UPDATE.
//       Mirrors parse-reminder-body posture.
// Does NOT: Hit the database; pure-fn validator.

export type CadenceBody = {
  cadence_days: number;
};

export type CadenceBodyError = {
  ok: false;
  field: string;
  reason: string;
};

export type CadenceBodyResult =
  | { ok: true; value: CadenceBody }
  | CadenceBodyError;

/** Narrow `unknown` to a plain object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate the request body for PATCH /api/card/[id]/cadence.
 *
 * Required: `cadence_days` — integer in [1, 365] inclusive.
 * Extra fields tolerated (forward-compat).
 */
export function parseCadenceBody(input: unknown): CadenceBodyResult {
  if (!isObject(input)) {
    return { ok: false, field: '<root>', reason: 'not an object' };
  }

  if (!('cadence_days' in input)) {
    return {
      ok: false,
      field: 'cadence_days',
      reason: 'missing',
    };
  }

  const v = input.cadence_days;

  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return {
      ok: false,
      field: 'cadence_days',
      reason: 'must be a number',
    };
  }

  if (!Number.isInteger(v)) {
    return {
      ok: false,
      field: 'cadence_days',
      reason: 'must be an integer',
    };
  }

  if (v < 1 || v > 365) {
    return {
      ok: false,
      field: 'cadence_days',
      reason: 'must be between 1 and 365',
    };
  }

  return { ok: true, value: { cadence_days: v } };
}
