// What: Runtime validators for the DIY + Contractor expansion jsonb
//       shapes that ship on `cards.cost_estimate_diy` and
//       `cards.cost_estimate_hire` (and their `_override` siblings).
//       Two entry points: `parseDiyExpansion(input)` and
//       `parseContractorExpansion(input)`, each returning
//       `{ ok: true, value } | { ok: false, field, reason }`.
// Why:  spec § Gotchas #8 — the SAME shape is validated in two places:
//       (a) at LLM-output time in `_lib/parse-qa-output.ts`'s
//           `parseConfirmAssessment` branch (the confirm_assessment
//           tool's `diy_expansion` + `contractor_expansion` fields),
//       (b) at user-PATCH time in
//           `apps/web/app/api/cards/[id]/estimate/_lib/parse-estimate-override.ts`.
//       Factoring the per-field validators into one module keeps the
//       LLM trust boundary and the user trust boundary in lock-step.
//       A shape drift in one place would silently let the other accept
//       rejected shapes; this file is the canonical contract.
// Does NOT: Coerce numbers from strings. Doesn't normalize whitespace.
//           Doesn't enforce semantic invariants beyond what spec § D3
//           pins (e.g., total_max >= total_min is enforced; "totals
//           must equal sum of materials + tools" is NOT — the AI can
//           round, and forcing equality would 502 valid responses).

import { CONTRACTOR_TAG_VALUES, type ContractorTag } from './parse-tool-output';

/** Locked DIY-expansion jsonb shape — spec § D3. */
export type DiyExpansion = {
  skill_level: 'beginner' | 'intermediate' | 'advanced';
  time_hours_min: number;
  time_hours_max: number;
  materials: { name: string; cost_min: number; cost_max: number }[];
  tools: {
    name: string;
    cost_min: number;
    cost_max: number;
    optional?: boolean;
  }[];
  total_min: number;
  total_max: number;
  gotchas: string;
  abort_condition: string;
  steps: string[];
};

/** Locked Contractor-expansion jsonb shape — spec § D3. */
export type ContractorExpansion = {
  contractor_type: ContractorTag;
  cost_range_min: number;
  cost_range_max: number;
  questions_for_contractor: string[];
  red_flags: string[];
  good_completion: string;
};

/** Allowed skill_level enum values (locked at validator time). */
export const SKILL_LEVEL_VALUES = [
  'beginner',
  'intermediate',
  'advanced',
] as const;
export type SkillLevel = (typeof SKILL_LEVEL_VALUES)[number];

/** Caps from spec § D3 — keep aligned with the field-by-field limits
 *  in the route + validator tests. */
const MATERIALS_MAX = 50;
const TOOLS_MAX = 30;
const STEPS_MAX = 30;
const STEP_LEN_MAX = 500;
const QUESTIONS_MAX = 15;
const QUESTION_LEN_MAX = 500;
const RED_FLAGS_MAX = 10;
const RED_FLAG_LEN_MAX = 500;
const TEXT_LEN_MAX = 2000;

export type EstimateShapeError = {
  ok: false;
  field: string;
  reason: string;
};

export type DiyParseResult =
  | { ok: true; value: DiyExpansion }
  | EstimateShapeError;

export type ContractorParseResult =
  | { ok: true; value: ContractorExpansion }
  | EstimateShapeError;

/** Narrow `unknown` to a plain object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Narrow `unknown` to a non-empty string with optional length cap. */
function isNonEmptyString(v: unknown, max?: number): v is string {
  if (typeof v !== 'string' || v.length === 0) return false;
  if (max !== undefined && v.length > max) return false;
  return true;
}

/** Validate a `>= 0` finite number. Negatives + NaN + Infinity fail. */
function isNonNegativeNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/** Validate a `{ name, cost_min, cost_max }` row used by materials + tools. */
function parseLineItem(
  row: unknown,
  fieldPrefix: string,
  acceptOptionalFlag: boolean
):
  | {
      ok: true;
      value: DiyExpansion['materials'][number] | DiyExpansion['tools'][number];
    }
  | EstimateShapeError {
  if (!isObject(row)) {
    return { ok: false, field: fieldPrefix, reason: 'not an object' };
  }
  if (!isNonEmptyString(row.name, TEXT_LEN_MAX)) {
    return {
      ok: false,
      field: `${fieldPrefix}.name`,
      reason: 'missing, empty, or too long',
    };
  }
  if (!isNonNegativeNumber(row.cost_min)) {
    return {
      ok: false,
      field: `${fieldPrefix}.cost_min`,
      reason: 'must be a non-negative finite number',
    };
  }
  if (!isNonNegativeNumber(row.cost_max)) {
    return {
      ok: false,
      field: `${fieldPrefix}.cost_max`,
      reason: 'must be a non-negative finite number',
    };
  }
  if (row.cost_max < row.cost_min) {
    return {
      ok: false,
      field: `${fieldPrefix}.cost_max`,
      reason: 'must be >= cost_min',
    };
  }
  if (acceptOptionalFlag && row.optional !== undefined) {
    if (typeof row.optional !== 'boolean') {
      return {
        ok: false,
        field: `${fieldPrefix}.optional`,
        reason: 'not a boolean',
      };
    }
    return {
      ok: true,
      value: {
        name: row.name,
        cost_min: row.cost_min,
        cost_max: row.cost_max,
        optional: row.optional,
      },
    };
  }
  return {
    ok: true,
    value: {
      name: row.name,
      cost_min: row.cost_min,
      cost_max: row.cost_max,
    },
  };
}

/**
 * Validate a DIY-expansion jsonb shape. Strict per spec § D3; tolerant
 * of extra unknown fields (forward-compat for future AI tool additions).
 */
export function parseDiyExpansion(input: unknown): DiyParseResult {
  if (!isObject(input)) {
    return { ok: false, field: '<root>', reason: 'not an object' };
  }

  if (
    typeof input.skill_level !== 'string' ||
    !(SKILL_LEVEL_VALUES as readonly string[]).includes(input.skill_level)
  ) {
    return {
      ok: false,
      field: 'skill_level',
      reason: `not one of ${SKILL_LEVEL_VALUES.join('|')}`,
    };
  }

  if (!isNonNegativeNumber(input.time_hours_min)) {
    return {
      ok: false,
      field: 'time_hours_min',
      reason: 'must be a non-negative finite number',
    };
  }
  if (!isNonNegativeNumber(input.time_hours_max)) {
    return {
      ok: false,
      field: 'time_hours_max',
      reason: 'must be a non-negative finite number',
    };
  }
  if (input.time_hours_max < input.time_hours_min) {
    return {
      ok: false,
      field: 'time_hours_max',
      reason: 'must be >= time_hours_min',
    };
  }

  if (!Array.isArray(input.materials)) {
    return { ok: false, field: 'materials', reason: 'not an array' };
  }
  if (input.materials.length > MATERIALS_MAX) {
    return {
      ok: false,
      field: 'materials',
      reason: `too many entries (max ${MATERIALS_MAX})`,
    };
  }
  const materials: DiyExpansion['materials'] = [];
  for (let i = 0; i < input.materials.length; i++) {
    const r = parseLineItem(input.materials[i], `materials[${i}]`, false);
    if (!r.ok) return r;
    materials.push(r.value as DiyExpansion['materials'][number]);
  }

  if (!Array.isArray(input.tools)) {
    return { ok: false, field: 'tools', reason: 'not an array' };
  }
  if (input.tools.length > TOOLS_MAX) {
    return {
      ok: false,
      field: 'tools',
      reason: `too many entries (max ${TOOLS_MAX})`,
    };
  }
  const tools: DiyExpansion['tools'] = [];
  for (let i = 0; i < input.tools.length; i++) {
    const r = parseLineItem(input.tools[i], `tools[${i}]`, true);
    if (!r.ok) return r;
    tools.push(r.value as DiyExpansion['tools'][number]);
  }

  if (!isNonNegativeNumber(input.total_min)) {
    return {
      ok: false,
      field: 'total_min',
      reason: 'must be a non-negative finite number',
    };
  }
  if (!isNonNegativeNumber(input.total_max)) {
    return {
      ok: false,
      field: 'total_max',
      reason: 'must be a non-negative finite number',
    };
  }
  if (input.total_max < input.total_min) {
    return {
      ok: false,
      field: 'total_max',
      reason: 'must be >= total_min',
    };
  }

  if (!isNonEmptyString(input.gotchas, TEXT_LEN_MAX)) {
    return {
      ok: false,
      field: 'gotchas',
      reason: 'missing, empty, or too long',
    };
  }
  if (!isNonEmptyString(input.abort_condition, TEXT_LEN_MAX)) {
    return {
      ok: false,
      field: 'abort_condition',
      reason: 'missing, empty, or too long',
    };
  }

  if (!Array.isArray(input.steps)) {
    return { ok: false, field: 'steps', reason: 'not an array' };
  }
  if (input.steps.length < 1 || input.steps.length > STEPS_MAX) {
    return {
      ok: false,
      field: 'steps',
      reason: `must have 1..${STEPS_MAX} entries`,
    };
  }
  const steps: string[] = [];
  for (let i = 0; i < input.steps.length; i++) {
    if (!isNonEmptyString(input.steps[i], STEP_LEN_MAX)) {
      return {
        ok: false,
        field: `steps[${i}]`,
        reason: `must be a non-empty string ≤ ${STEP_LEN_MAX} chars`,
      };
    }
    steps.push(input.steps[i] as string);
  }

  return {
    ok: true,
    value: {
      skill_level: input.skill_level as SkillLevel,
      time_hours_min: input.time_hours_min as number,
      time_hours_max: input.time_hours_max as number,
      materials,
      tools,
      total_min: input.total_min as number,
      total_max: input.total_max as number,
      gotchas: input.gotchas as string,
      abort_condition: input.abort_condition as string,
      steps,
    },
  };
}

/**
 * Validate a Contractor-expansion jsonb shape. Strict per spec § D3.
 * `contractor_type` accepts any `contractor_tag` enum value (including
 * `'diy'`) — the validator doesn't enforce the "hire only" semantic,
 * since `cards.contractor_tag` carries that signal already (spec
 * § Gotchas #7: contractor_type ≠ contractor_tag).
 */
export function parseContractorExpansion(
  input: unknown
): ContractorParseResult {
  if (!isObject(input)) {
    return { ok: false, field: '<root>', reason: 'not an object' };
  }

  if (
    typeof input.contractor_type !== 'string' ||
    !(CONTRACTOR_TAG_VALUES as readonly string[]).includes(
      input.contractor_type
    )
  ) {
    return {
      ok: false,
      field: 'contractor_type',
      reason: `not one of ${CONTRACTOR_TAG_VALUES.join('|')}`,
    };
  }

  if (!isNonNegativeNumber(input.cost_range_min)) {
    return {
      ok: false,
      field: 'cost_range_min',
      reason: 'must be a non-negative finite number',
    };
  }
  if (!isNonNegativeNumber(input.cost_range_max)) {
    return {
      ok: false,
      field: 'cost_range_max',
      reason: 'must be a non-negative finite number',
    };
  }
  if (input.cost_range_max < input.cost_range_min) {
    return {
      ok: false,
      field: 'cost_range_max',
      reason: 'must be >= cost_range_min',
    };
  }

  if (!Array.isArray(input.questions_for_contractor)) {
    return {
      ok: false,
      field: 'questions_for_contractor',
      reason: 'not an array',
    };
  }
  if (
    input.questions_for_contractor.length < 1 ||
    input.questions_for_contractor.length > QUESTIONS_MAX
  ) {
    return {
      ok: false,
      field: 'questions_for_contractor',
      reason: `must have 1..${QUESTIONS_MAX} entries`,
    };
  }
  const questions: string[] = [];
  for (let i = 0; i < input.questions_for_contractor.length; i++) {
    const q = input.questions_for_contractor[i];
    if (!isNonEmptyString(q, QUESTION_LEN_MAX)) {
      return {
        ok: false,
        field: `questions_for_contractor[${i}]`,
        reason: `must be a non-empty string ≤ ${QUESTION_LEN_MAX} chars`,
      };
    }
    questions.push(q);
  }

  if (!Array.isArray(input.red_flags)) {
    return { ok: false, field: 'red_flags', reason: 'not an array' };
  }
  if (input.red_flags.length > RED_FLAGS_MAX) {
    return {
      ok: false,
      field: 'red_flags',
      reason: `too many entries (max ${RED_FLAGS_MAX})`,
    };
  }
  const redFlags: string[] = [];
  for (let i = 0; i < input.red_flags.length; i++) {
    const r = input.red_flags[i];
    if (!isNonEmptyString(r, RED_FLAG_LEN_MAX)) {
      return {
        ok: false,
        field: `red_flags[${i}]`,
        reason: `must be a non-empty string ≤ ${RED_FLAG_LEN_MAX} chars`,
      };
    }
    redFlags.push(r);
  }

  if (!isNonEmptyString(input.good_completion, TEXT_LEN_MAX)) {
    return {
      ok: false,
      field: 'good_completion',
      reason: 'missing, empty, or too long',
    };
  }

  return {
    ok: true,
    value: {
      contractor_type: input.contractor_type as ContractorTag,
      cost_range_min: input.cost_range_min as number,
      cost_range_max: input.cost_range_max as number,
      questions_for_contractor: questions,
      red_flags: redFlags,
      good_completion: input.good_completion as string,
    },
  };
}
