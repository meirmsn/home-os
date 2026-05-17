// What: Runtime validator for PATCH /api/card/[id]/estimate body shape.
//       Re-uses the shared shape helpers from
//       `apps/web/app/api/triage/_lib/estimate-shapes.ts` so a single
//       contract governs both LLM-output (confirm_assessment expansion
//       fields) AND user PATCH input (spec § Gotchas #8).
// Why:  The override columns (cost_estimate_diy_override,
//       cost_estimate_hire_override) store the same jsonb shape as
//       their non-override siblings. A drift between the two
//       validators would let bad LLM output pass user-side or vice
//       versa — both trust boundaries point at the same module.
// Does NOT: Hit the database; pure-fn validator. Doesn't enforce RLS
//           (route handler delegates to supabase user-context client).

import {
  parseContractorExpansion,
  parseDiyExpansion,
  type ContractorExpansion,
  type DiyExpansion,
} from '@/app/api/triage/_lib/estimate-shapes';

export const ESTIMATE_PATH_VALUES = ['diy', 'contractor'] as const;
export type EstimatePath = (typeof ESTIMATE_PATH_VALUES)[number];

/** Body shape — `estimate` is the override jsonb (or null = reset). */
export type EstimateBody =
  | { path: 'diy'; estimate: DiyExpansion | null }
  | { path: 'contractor'; estimate: ContractorExpansion | null };

export type EstimateBodyError = {
  ok: false;
  field: string;
  reason: string;
};

export type EstimateBodyResult =
  | { ok: true; value: EstimateBody }
  | EstimateBodyError;

/** Narrow `unknown` to a plain object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate the PATCH /api/card/[id]/estimate body. The `estimate` field
 * can be `null` (reset to app estimate) or a full DIY/contractor
 * expansion jsonb matching the locked shape from spec § D3.
 */
export function parseEstimateBody(input: unknown): EstimateBodyResult {
  if (!isObject(input)) {
    return { ok: false, field: '<root>', reason: 'not an object' };
  }

  if (
    typeof input.path !== 'string' ||
    !(ESTIMATE_PATH_VALUES as readonly string[]).includes(input.path)
  ) {
    return {
      ok: false,
      field: 'path',
      reason: `must be one of ${ESTIMATE_PATH_VALUES.join('|')}`,
    };
  }
  const path = input.path as EstimatePath;

  if (!('estimate' in input)) {
    return {
      ok: false,
      field: 'estimate',
      reason: 'missing (use null to reset)',
    };
  }

  if (input.estimate === null) {
    return { ok: true, value: { path, estimate: null } };
  }

  if (path === 'diy') {
    const r = parseDiyExpansion(input.estimate);
    if (!r.ok) {
      return {
        ok: false,
        field: `estimate.${r.field}`,
        reason: r.reason,
      };
    }
    return { ok: true, value: { path: 'diy', estimate: r.value } };
  }
  // path === 'contractor'
  const r = parseContractorExpansion(input.estimate);
  if (!r.ok) {
    return {
      ok: false,
      field: `estimate.${r.field}`,
      reason: r.reason,
    };
  }
  return { ok: true, value: { path: 'contractor', estimate: r.value } };
}
