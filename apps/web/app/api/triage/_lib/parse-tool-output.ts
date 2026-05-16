// What: Runtime validator for the `record_initial_read` tool-use payload
//       returned by Claude. Hand-rolled (no zod dep added — the schema
//       is small + closed). Returns a discriminated union of
//       RecordInitialRead | ParseError so the route handler can branch
//       cleanly between happy-path persistence and 502 invalid_output.
// Why:  spec § Gotchas #2 — `tool_choice` forces tool, but the model can
//       still refuse or return malformed input. The type system cannot
//       enforce model behavior; runtime validation IS the trust boundary
//       for the LLM response (kit/docs/guide/conventions.md §
//       wrapper-boundaries.md applies).
// Does NOT: Throw — every shape error is returned as a ParseError so the
//           caller can decide whether to revert state + capture to
//           Sentry. Doesn't enforce min/max string lengths beyond the
//           1..3 `what_i_need_to_know` bound from D3.

/** Severity tiers per D3 (mirrors the Postgres `severity` enum). */
export const SEVERITY_VALUES = [
  'cosmetic',
  'monitor',
  'soon',
  'urgent',
] as const;

/** System tag enum (mirrors the Postgres `system_tag` enum). */
export const SYSTEM_TAG_VALUES = [
  'plumbing',
  'electrical',
  'hvac',
  'roof',
  'exterior',
  'interior',
  'appliance',
  'safety',
  'other',
] as const;

/** Contractor tag enum (mirrors the Postgres `contractor_tag` enum). */
export const CONTRACTOR_TAG_VALUES = [
  'diy',
  'handyman',
  'plumber',
  'electrician',
  'hvac_tech',
  'roofer',
  'general_contractor',
  'specialist',
] as const;

export type Severity = (typeof SEVERITY_VALUES)[number];
export type SystemTag = (typeof SYSTEM_TAG_VALUES)[number];
export type ContractorTag = (typeof CONTRACTOR_TAG_VALUES)[number];

export type RecordInitialRead = {
  summary: string;
  severity_provisional: Severity;
  what_im_confident_about: string;
  what_i_need_to_know: string[];
  sources: { url: string; title: string }[];
  system_tag_proposed: SystemTag;
  contractor_tag_proposed: ContractorTag;
};

export type ParseError = {
  ok: false;
  field: string;
  reason: string;
};

export type ParseResult = { ok: true; value: RecordInitialRead } | ParseError;

/** Narrow `unknown` to a plain object (records-only, not arrays/null). */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Narrow `unknown` to a non-empty string. Empty-string rejection is the
 *  common case for every text field in `record_initial_read`. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Validate the input from a `record_initial_read` tool_use block at
 * runtime. Returns `{ ok: true, value }` on success or a ParseError
 * describing the first violation found.
 *
 * Extra fields are tolerated (forward-compat) — we allowlist required
 * keys and ignore the rest.
 */
export function parseInitialRead(input: unknown): ParseResult {
  if (!isObject(input)) {
    return { ok: false, field: '<root>', reason: 'not an object' };
  }

  if (!isNonEmptyString(input.summary)) {
    return {
      ok: false,
      field: 'summary',
      reason: 'missing or empty string',
    };
  }

  if (
    typeof input.severity_provisional !== 'string' ||
    !(SEVERITY_VALUES as readonly string[]).includes(input.severity_provisional)
  ) {
    return {
      ok: false,
      field: 'severity_provisional',
      reason: `not one of ${SEVERITY_VALUES.join('|')}`,
    };
  }

  if (!isNonEmptyString(input.what_im_confident_about)) {
    return {
      ok: false,
      field: 'what_im_confident_about',
      reason: 'missing or empty string',
    };
  }

  if (!Array.isArray(input.what_i_need_to_know)) {
    return {
      ok: false,
      field: 'what_i_need_to_know',
      reason: 'not an array',
    };
  }
  if (
    input.what_i_need_to_know.length < 1 ||
    input.what_i_need_to_know.length > 3
  ) {
    return {
      ok: false,
      field: 'what_i_need_to_know',
      reason: 'length must be between 1 and 3 inclusive',
    };
  }
  for (let i = 0; i < input.what_i_need_to_know.length; i++) {
    const q = input.what_i_need_to_know[i];
    if (!isNonEmptyString(q)) {
      return {
        ok: false,
        field: `what_i_need_to_know[${i}]`,
        reason: 'not a non-empty string',
      };
    }
  }

  if (!Array.isArray(input.sources)) {
    return { ok: false, field: 'sources', reason: 'not an array' };
  }
  for (let i = 0; i < input.sources.length; i++) {
    const s = input.sources[i];
    if (!isObject(s)) {
      return {
        ok: false,
        field: `sources[${i}]`,
        reason: 'not an object',
      };
    }
    if (!isNonEmptyString(s.url)) {
      return {
        ok: false,
        field: `sources[${i}].url`,
        reason: 'missing or empty',
      };
    }
    if (!isNonEmptyString(s.title)) {
      return {
        ok: false,
        field: `sources[${i}].title`,
        reason: 'missing or empty',
      };
    }
  }

  if (
    typeof input.system_tag_proposed !== 'string' ||
    !(SYSTEM_TAG_VALUES as readonly string[]).includes(
      input.system_tag_proposed
    )
  ) {
    return {
      ok: false,
      field: 'system_tag_proposed',
      reason: `not one of ${SYSTEM_TAG_VALUES.join('|')}`,
    };
  }

  if (
    typeof input.contractor_tag_proposed !== 'string' ||
    !(CONTRACTOR_TAG_VALUES as readonly string[]).includes(
      input.contractor_tag_proposed
    )
  ) {
    return {
      ok: false,
      field: 'contractor_tag_proposed',
      reason: `not one of ${CONTRACTOR_TAG_VALUES.join('|')}`,
    };
  }

  return {
    ok: true,
    value: {
      summary: input.summary,
      severity_provisional: input.severity_provisional as Severity,
      what_im_confident_about: input.what_im_confident_about,
      what_i_need_to_know: input.what_i_need_to_know as string[],
      sources: input.sources as { url: string; title: string }[],
      system_tag_proposed: input.system_tag_proposed as SystemTag,
      contractor_tag_proposed: input.contractor_tag_proposed as ContractorTag,
    },
  };
}
