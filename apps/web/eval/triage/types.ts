// What: Type definitions + category map for the triage eval dataset. Defines
//       the `DatasetEntry` shape (one labeled synthetic home-issue), the 9
//       contractor `CATEGORIES` the dataset is balanced across, the
//       DIY-vs-hire `Path` label, and the `categoryToSystemTag` default map.
// Why:  The dataset, scorer, and runner all need a single shared contract for
//       what one labeled entry looks like (spec § Data model, D4). Severity +
//       system-tag enums are re-used from the shipped triage `_lib` so the
//       labels can never drift from the model's actual output vocabulary.
// Does NOT: Score anything (score.ts) or load the dataset (run.ts). Pure types
//           + constants — no I/O, no runtime side-effects.

import type {
  Severity,
  SystemTag,
} from '../../app/api/triage/_lib/parse-tool-output';

/** The 9 contractor categories the dataset is balanced across (D4). */
export const CATEGORIES = [
  'HVAC',
  'Plumbing',
  'Electrical',
  'Structural',
  'Roof',
  'Pool',
  'Pest',
  'Landscaping',
  'General',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** DIY-vs-hire label + predicted path (D2). */
export type Path = 'diy' | 'hire';

/**
 * One labeled synthetic home-issue. `description` is the `userText` fed to the
 * model; the `label_*` fields are the human-reviewed ground truth (D8).
 */
export type DatasetEntry = {
  /** Unique, lowercase category-prefix + 2-digit index, e.g. "hvac-01". */
  id: string;
  category: Category;
  /** Synthetic homeowner issue text (the userText fed to the model). */
  description: string;
  /** ∈ SEVERITY_VALUES — the gated severity label. */
  label_severity: Severity;
  /** diy | hire — the gated path label. */
  label_path: Path;
  /** ∈ SYSTEM_TAG_VALUES — reported-only, NOT gated. */
  label_system_tag: SystemTag;
  /** One-line human justification for the labels (review aid, not scored). */
  rationale: string;
};

/**
 * Default `system_tag` per category — a labeling aid (spec § Data model). Single
 * value per category; per-entry deviations are allowed and noted in `rationale`
 * (so `dataset.test.ts` asserts each `label_system_tag` is a legal `SystemTag`,
 * not that it equals this default).
 */
export const categoryToSystemTag: Record<Category, SystemTag> = {
  HVAC: 'hvac',
  Plumbing: 'plumbing',
  Electrical: 'electrical',
  Structural: 'exterior',
  Roof: 'roof',
  Pool: 'other',
  Pest: 'other',
  Landscaping: 'exterior',
  General: 'other',
};
