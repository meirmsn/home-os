// What: Runtime validator for POST /api/card/[id]/decide body shape.
//       Returns a discriminated union `{ ok: true, value } | { ok:
//       false, field, reason }`.
// Why:  Trust-boundary: the body shape is the only thing standing
//       between an authenticated user and the `commit_decide` RPC.
//       Mirrors `_lib/estimate-shapes.ts`'s contract — strict on
//       required fields, tolerant of extra unknown ones (forward-compat).
// Does NOT: Forward auth (caller derives p_user from supabase.auth).
//           Doesn't enforce RPC-side invariants (predicate-guards on
//           state IN ('decide','planned') live in the RPC).

/** Allowed values for the `path` field. Mirrors the RPC's enum check. */
export const DECIDE_PATH_VALUES = [
  'diy',
  'contractor',
  'monitor',
  'dismiss',
  'decide',
] as const;
export type DecidePath = (typeof DECIDE_PATH_VALUES)[number];

export type DecideBody = {
  path: DecidePath;
  monitoring_cadence_days: number | null;
};

export type DecideBodyError = {
  ok: false;
  field: string;
  reason: string;
};

export type DecideBodyResult =
  | { ok: true; value: DecideBody }
  | DecideBodyError;

/** Narrow `unknown` to a plain object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Inclusive cadence bounds. Mirrors `<MonitorCadencePicker />`'s
 *  `CADENCE_MIN` / `CADENCE_MAX` so the client picker and the server
 *  trust-boundary agree on the legal range. A scripted client (or a
 *  future surface that bypasses the picker) cannot ship an out-of-band
 *  cadence past this validator. */
export const CADENCE_MIN_DAYS = 7;
export const CADENCE_MAX_DAYS = 365;

/**
 * Validate the request body for POST /api/card/[id]/decide.
 *
 * Required: `path` (one of the five enum values).
 * Conditionally required: `monitoring_cadence_days` when
 *   `path === 'monitor'`. When present (on any path), it must be an
 *   integer in the inclusive range [CADENCE_MIN_DAYS, CADENCE_MAX_DAYS]
 *   — same bounds the picker UI clamps to. The server enforces the
 *   range too because the picker's clamping is client-side and a
 *   scripted POST can ship anything.
 */
export function parseDecideBody(input: unknown): DecideBodyResult {
  if (!isObject(input)) {
    return { ok: false, field: '<root>', reason: 'not an object' };
  }

  if (
    typeof input.path !== 'string' ||
    !(DECIDE_PATH_VALUES as readonly string[]).includes(input.path)
  ) {
    return {
      ok: false,
      field: 'path',
      reason: `must be one of ${DECIDE_PATH_VALUES.join('|')}`,
    };
  }
  const path = input.path as DecidePath;

  let cadence: number | null = null;
  if (
    input.monitoring_cadence_days !== undefined &&
    input.monitoring_cadence_days !== null
  ) {
    const c = input.monitoring_cadence_days;
    if (
      typeof c !== 'number' ||
      !Number.isFinite(c) ||
      !Number.isInteger(c) ||
      c <= 0
    ) {
      return {
        ok: false,
        field: 'monitoring_cadence_days',
        reason: 'must be a positive integer',
      };
    }
    if (c < CADENCE_MIN_DAYS || c > CADENCE_MAX_DAYS) {
      return {
        ok: false,
        field: 'monitoring_cadence_days',
        reason: `must be between ${CADENCE_MIN_DAYS} and ${CADENCE_MAX_DAYS} days`,
      };
    }
    cadence = c;
  }

  if (path === 'monitor' && cadence === null) {
    return {
      ok: false,
      field: 'monitoring_cadence_days',
      reason: 'required when path=monitor',
    };
  }

  return { ok: true, value: { path, monitoring_cadence_days: cadence } };
}
