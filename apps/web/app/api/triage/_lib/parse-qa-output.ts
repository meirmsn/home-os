// What: Runtime validator for the Q&A turn's tool-use payload returned
//       by Claude. Branches on `block.name`: ask_next_question →
//       AskNextQuestion shape; confirm_assessment → ConfirmAssessment
//       shape. Returns a discriminated union of {ok:true, tool, value}
//       | {ok:false, ...} so the route handler can dispatch to the
//       right RPC (answer_triage_round vs confirm_triage) or 502
//       cleanly.
// Why:  spec § Gotchas #2 — even with `tool_choice: { type: 'auto' }`
//       and both tools defined, the model can return a `text` block
//       with no `tool_use`, a `tool_use` with the wrong name, or one
//       with malformed input. Spec § Gotchas #3 — force-confirm can
//       still produce a defiant `ask_next_question`. The type system
//       cannot enforce model behavior; this runtime validator IS the
//       LLM-response trust boundary.
// Does NOT: Throw — every shape error is returned as a ParseError so
//           the caller can decide whether to revert / 502 / capture.
//           Doesn't reach into web_search content blocks — we treat
//           the model's `sources` array as the canonical citation list.

import {
  CONTRACTOR_TAG_VALUES,
  SEVERITY_VALUES,
  SYSTEM_TAG_VALUES,
  type ContractorTag,
  type Severity,
  type SystemTag,
} from './parse-tool-output';

/** Shape of the ask_next_question tool input we expect from Claude. */
export type AskNextQuestion = {
  question: string;
  is_location_ask: boolean;
  updated_provisional_severity: Severity;
  reasoning_so_far: string;
};

/** Shape of the confirm_assessment tool input we expect from Claude. */
export type ConfirmAssessment = {
  final_diagnosis: string;
  severity_confirmed: Severity;
  system_tag: SystemTag;
  contractor_tag: ContractorTag;
  monitoring_cadence_days_proposal: number;
  confidence_note: string;
  sources: { url: string; title: string }[];
};

export type ParseError = {
  ok: false;
  field: string;
  reason: string;
};

export type ParseResult =
  | { ok: true; tool: 'ask_next_question'; value: AskNextQuestion }
  | { ok: true; tool: 'confirm_assessment'; value: ConfirmAssessment }
  | ParseError;

/** Anthropic Messages-API response content block. We only care about
 *  the `tool_use` variant; other types are ignored. */
type ContentBlock = {
  type: string;
  name?: string;
  input?: unknown;
};

/** Tool names we accept; anything else is a parse failure. */
export const QA_TOOL_NAMES = [
  'ask_next_question',
  'confirm_assessment',
] as const;
export type QaToolName = (typeof QA_TOOL_NAMES)[number];

/** Narrow `unknown` to a plain object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Narrow `unknown` to a non-empty string. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** Find the first tool_use block in a Messages response content array. */
function findToolUseBlock(content: unknown): ContentBlock | null {
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (
      isObject(block) &&
      block.type === 'tool_use' &&
      typeof block.name === 'string'
    ) {
      return block as ContentBlock;
    }
  }
  return null;
}

/** Validate the `ask_next_question` input shape. */
function parseAskNextQuestion(input: unknown): ParseResult {
  if (!isObject(input)) {
    return { ok: false, field: '<root>', reason: 'not an object' };
  }

  if (!isNonEmptyString(input.question)) {
    return {
      ok: false,
      field: 'question',
      reason: 'missing or empty string',
    };
  }

  if (typeof input.is_location_ask !== 'boolean') {
    return {
      ok: false,
      field: 'is_location_ask',
      reason: 'not a boolean',
    };
  }

  if (
    typeof input.updated_provisional_severity !== 'string' ||
    !(SEVERITY_VALUES as readonly string[]).includes(
      input.updated_provisional_severity
    )
  ) {
    return {
      ok: false,
      field: 'updated_provisional_severity',
      reason: `not one of ${SEVERITY_VALUES.join('|')}`,
    };
  }

  if (typeof input.reasoning_so_far !== 'string') {
    return {
      ok: false,
      field: 'reasoning_so_far',
      reason: 'not a string',
    };
  }

  return {
    ok: true,
    tool: 'ask_next_question',
    value: {
      question: input.question,
      is_location_ask: input.is_location_ask,
      updated_provisional_severity:
        input.updated_provisional_severity as Severity,
      reasoning_so_far: input.reasoning_so_far,
    },
  };
}

/** Validate the `confirm_assessment` input shape. */
function parseConfirmAssessment(input: unknown): ParseResult {
  if (!isObject(input)) {
    return { ok: false, field: '<root>', reason: 'not an object' };
  }

  if (!isNonEmptyString(input.final_diagnosis)) {
    return {
      ok: false,
      field: 'final_diagnosis',
      reason: 'missing or empty string',
    };
  }

  if (
    typeof input.severity_confirmed !== 'string' ||
    !(SEVERITY_VALUES as readonly string[]).includes(input.severity_confirmed)
  ) {
    return {
      ok: false,
      field: 'severity_confirmed',
      reason: `not one of ${SEVERITY_VALUES.join('|')}`,
    };
  }

  if (
    typeof input.system_tag !== 'string' ||
    !(SYSTEM_TAG_VALUES as readonly string[]).includes(input.system_tag)
  ) {
    return {
      ok: false,
      field: 'system_tag',
      reason: `not one of ${SYSTEM_TAG_VALUES.join('|')}`,
    };
  }

  if (
    typeof input.contractor_tag !== 'string' ||
    !(CONTRACTOR_TAG_VALUES as readonly string[]).includes(input.contractor_tag)
  ) {
    return {
      ok: false,
      field: 'contractor_tag',
      reason: `not one of ${CONTRACTOR_TAG_VALUES.join('|')}`,
    };
  }

  if (
    typeof input.monitoring_cadence_days_proposal !== 'number' ||
    !Number.isInteger(input.monitoring_cadence_days_proposal) ||
    input.monitoring_cadence_days_proposal <= 0
  ) {
    return {
      ok: false,
      field: 'monitoring_cadence_days_proposal',
      reason: 'must be a positive integer',
    };
  }

  if (typeof input.confidence_note !== 'string') {
    return {
      ok: false,
      field: 'confidence_note',
      reason: 'not a string',
    };
  }

  if (!Array.isArray(input.sources)) {
    return { ok: false, field: 'sources', reason: 'not an array' };
  }
  if (input.sources.length > 5) {
    return {
      ok: false,
      field: 'sources',
      reason: 'too many sources (max 5)',
    };
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

  return {
    ok: true,
    tool: 'confirm_assessment',
    value: {
      final_diagnosis: input.final_diagnosis,
      severity_confirmed: input.severity_confirmed as Severity,
      system_tag: input.system_tag as SystemTag,
      contractor_tag: input.contractor_tag as ContractorTag,
      monitoring_cadence_days_proposal:
        input.monitoring_cadence_days_proposal as number,
      confidence_note: input.confidence_note,
      sources: input.sources as { url: string; title: string }[],
    },
  };
}

/**
 * Parse a Q&A turn's Anthropic Messages-API response: find the first
 * `tool_use` block, branch on its `name`, validate the matching shape.
 *
 * The caller passes the full `response` returned by the SDK so that
 * future extension (cite blocks, web_search result blocks) can be
 * supported without changing the call signature.
 */
export function parseQaTurn(response: { content?: unknown }): ParseResult {
  const block = findToolUseBlock(response?.content);
  if (!block) {
    return {
      ok: false,
      field: 'content',
      reason: 'no tool_use block found',
    };
  }

  if (block.name === 'ask_next_question') {
    return parseAskNextQuestion(block.input);
  }
  if (block.name === 'confirm_assessment') {
    return parseConfirmAssessment(block.input);
  }
  return {
    ok: false,
    field: 'tool_use.name',
    reason: `unknown tool name "${block.name}"`,
  };
}
