// What: Maps a card-level `contractor_tag` enum value to its human-
//       readable display label for the Contractor Questions view
//       (e.g. `hvac_tech` → "HVAC", `general_contractor` → "General
//       Contractor").
// Why:  spec § In scope — no label map exists today. The view + group
//       headers + nudge copy need a presentable trade name, and group
//       ordering is alphabetical-by-label, so the label is also a sort
//       key in the grouping lib.
// Does NOT: Carry a `diy` entry — `diy` cards are excluded from the view
//           (D2). Returns the raw tag string as a safe fallback for
//           `diy` or any unknown value rather than throwing.

import type { ContractorTag } from '@/app/api/triage/_lib/parse-tool-output';

/** `contractor_tag` → display label. `diy` intentionally absent (excluded
 *  from the view by D2); unknown/`diy` fall through to the raw string. */
const LABELS: Partial<Record<ContractorTag, string>> = {
  handyman: 'Handyman',
  plumber: 'Plumber',
  electrician: 'Electrician',
  hvac_tech: 'HVAC',
  roofer: 'Roofer',
  general_contractor: 'General Contractor',
  specialist: 'Specialist',
};

/**
 * Display label for a contractor tag. Falls back to the raw tag string
 * for `diy` / unknown values (defensive — `diy` is filtered upstream).
 */
export function contractorTagLabel(tag: ContractorTag): string {
  return LABELS[tag] ?? tag;
}
