// What: Runtime validator for PATCH /api/card/[id]/reminder body shape.
//       Returns `{ ok: true, value } | { ok: false, field, reason }`.
//       Accepts `reminder_date` as either an ISO `YYYY-MM-DD` string or
//       the literal `null` (clear).
// Why:  Trust-boundary: the body shape is the only thing standing
//       between an authenticated user and a direct UPDATE on
//       cards.planned_reminder_date. JS's permissive `new Date()` coerces
//       `'2026-13-45'` into a different valid date — strict regex +
//       round-trip-equals-input is the rejection point (spec § Gotchas
//       #1). Mirrors parse-decide-body / parse-estimate-override posture.
// Does NOT: Hit the database; pure-fn validator. Doesn't enforce state
//           guard (the route handler does that against the live row).

/** Strict ISO `YYYY-MM-DD` regex. Matches calendar-date shape only —
 *  no time-of-day, no timezone. Does NOT validate semantic legality
 *  (Feb 30 etc.); the Date round-trip below handles that. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ReminderBody = {
  reminder_date: string | null; // 'YYYY-MM-DD' or null (clear)
};

export type ReminderBodyError = {
  ok: false;
  field: string;
  reason: string;
};

export type ReminderBodyResult =
  | { ok: true; value: ReminderBody }
  | ReminderBodyError;

/** Narrow `unknown` to a plain object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Round-trip validation: parse the input ISO date in UTC, then format it
 * back. If the result diverges from the input, the input was a semantic
 * invalid (Feb 30, Apr 31, month 13, etc.). JS's permissive Date
 * constructor would otherwise silently coerce `'2026-13-45'` into
 * `'2027-01-14'`.
 */
function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  // Construct in UTC so the round-trip isn't dependent on the Node
  // process's local timezone.
  const parts = value.split('-');
  // parts[0..2] are guaranteed by ISO_DATE_RE; the satisfies-string
  // assertion below quiets noUncheckedIndexedAccess.
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return false;
  }
  // Date.UTC reflects calendar arithmetic — if (y, m-1, d) isn't a real
  // calendar date, it overflows and Date(UTC(...)).getUTCDate() / Month /
  // FullYear comes back with different values than the input.
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Validate the request body for PATCH /api/card/[id]/reminder.
 *
 * Required: `reminder_date`. Accepts either:
 *   - The literal `null` (clear the reminder), OR
 *   - A string matching `/^\d{4}-\d{2}-\d{2}$/` AND round-trips through
 *     `new Date(Date.UTC(...))` to the same calendar date.
 *
 * Extra fields tolerated (forward-compat).
 */
export function parseReminderBody(input: unknown): ReminderBodyResult {
  if (!isObject(input)) {
    return { ok: false, field: '<root>', reason: 'not an object' };
  }

  if (!('reminder_date' in input)) {
    return {
      ok: false,
      field: 'reminder_date',
      reason: 'missing (use null to clear)',
    };
  }

  const v = input.reminder_date;

  if (v === null) {
    return { ok: true, value: { reminder_date: null } };
  }

  if (typeof v !== 'string') {
    return {
      ok: false,
      field: 'reminder_date',
      reason: 'must be an ISO YYYY-MM-DD string or null',
    };
  }

  if (!ISO_DATE_RE.test(v)) {
    return {
      ok: false,
      field: 'reminder_date',
      reason: 'must match YYYY-MM-DD',
    };
  }

  if (!isValidIsoDate(v)) {
    return {
      ok: false,
      field: 'reminder_date',
      reason: 'not a valid calendar date',
    };
  }

  return { ok: true, value: { reminder_date: v } };
}
