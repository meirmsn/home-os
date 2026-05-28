// What: Pure scoring functions for the triage eval — exact/adjacency severity
//       match, DIY-vs-hire path derivation + match, and `aggregate` which folds
//       per-entry results into a per-category + overall ScoreReport with a
//       pass/fail gate (D2, D3, D7).
// Why:  This is the deterministic contract the operator harness trusts and CI
//       pins (D6). No I/O, no network — scoring math only, so it unit-tests
//       cleanly with zero API calls.
// Does NOT: Call the model (run.ts owns that), load the dataset, or print the
//           report. Errors are passed in as `ok: false` EntryResults and counted
//           as misses in the denominator — never silently dropped.

import type {
  Severity,
  SystemTag,
} from '@/app/api/triage/_lib/parse-tool-output';
import type { Category, Path } from './types';
import { CATEGORIES } from './types';

/**
 * Model's prediction for one entry, derived from a parsed RecordInitialRead.
 */
export type Prediction = {
  severity_provisional: Severity;
  /** 'diy' iff contractor_tag_proposed === 'diy', else 'hire'. */
  path: Path;
};

/** Severity ordinal for adjacency math: cosmetic<monitor<soon<urgent. */
export const SEVERITY_ORDINAL: Record<Severity, number> = {
  cosmetic: 0,
  monitor: 1,
  soon: 2,
  urgent: 3,
};

/** True iff predicted severity === label severity. */
export function severityExact(pred: Severity, label: Severity): boolean {
  return pred === label;
}

/** True iff |ordinal(pred) - ordinal(label)| <= 1 (includes exact). */
export function severityAdjacent(pred: Severity, label: Severity): boolean {
  return Math.abs(SEVERITY_ORDINAL[pred] - SEVERITY_ORDINAL[label]) <= 1;
}

/** True iff predicted path === label path. */
export function pathMatch(pred: Path, label: Path): boolean {
  return pred === label;
}

/** Derive the DIY-vs-hire path from the parsed contractor tag (D2):
 *  'diy' → 'diy', every other (or unknown) tag → 'hire'. */
export function pathFromContractorTag(tag: string): Path {
  return tag === 'diy' ? 'diy' : 'hire';
}

/** Per-entry scored result (one row of the report). */
export type EntryResult = {
  id: string;
  category: Category;
  /** false ⇒ this entry was an API/parse error (counts as a miss). */
  ok: boolean;
  label_severity: Severity;
  pred_severity: Severity | null;
  severity_exact: boolean;
  severity_adjacent: boolean;
  label_path: Path;
  pred_path: Path | null;
  path_correct: boolean;
  label_system_tag: SystemTag;
  pred_system_tag: SystemTag | null;
  system_tag_correct: boolean;
  /** present iff ok === false. */
  error?: string;
};

export type Thresholds = { severityExact: number; path: number };

/** D7 ship floor. */
export const DEFAULT_THRESHOLDS: Thresholds = {
  severityExact: 0.7,
  path: 0.85,
};

export type CategoryStats = {
  category: Category;
  n: number;
  severityExactRate: number;
  severityAdjacentRate: number;
  pathAccuracy: number;
  /** reported-only. */
  systemTagAccuracy: number;
};

export type ScoreReport = {
  perCategory: CategoryStats[];
  overall: {
    n: number;
    /** entries that failed API/parse (counted as misses). */
    errors: number;
    severityExactRate: number;
    severityAdjacentRate: number;
    pathAccuracy: number;
    /** reported-only. */
    systemTagAccuracy: number;
  };
  thresholds: Thresholds;
  /** overall.severityExactRate >= t.severityExact && overall.pathAccuracy >= t.path. */
  passed: boolean;
};

/** Safe division — returns 0 for an empty denominator (no NaN). */
function rate(hits: number, n: number): number {
  return n === 0 ? 0 : hits / n;
}

/** Fold a slice of results into the four rates. */
function statsFor(results: EntryResult[]): {
  n: number;
  severityExactRate: number;
  severityAdjacentRate: number;
  pathAccuracy: number;
  systemTagAccuracy: number;
} {
  const n = results.length;
  let exact = 0;
  let adjacent = 0;
  let path = 0;
  let sys = 0;
  for (const r of results) {
    if (r.severity_exact) exact++;
    if (r.severity_adjacent) adjacent++;
    if (r.path_correct) path++;
    if (r.system_tag_correct) sys++;
  }
  return {
    n,
    severityExactRate: rate(exact, n),
    severityAdjacentRate: rate(adjacent, n),
    pathAccuracy: rate(path, n),
    systemTagAccuracy: rate(sys, n),
  };
}

/**
 * Aggregate EntryResult[] into a ScoreReport given thresholds. Pure; errors
 * (`ok: false`) count toward the denominator as misses, never silently
 * dropped. Per-category rows appear only for categories that have results,
 * in the canonical CATEGORIES order.
 */
export function aggregate(
  results: EntryResult[],
  thresholds: Thresholds
): ScoreReport {
  const perCategory: CategoryStats[] = [];
  for (const category of CATEGORIES) {
    const slice = results.filter((r) => r.category === category);
    if (slice.length === 0) continue;
    const s = statsFor(slice);
    perCategory.push({ category, ...s });
  }

  const all = statsFor(results);
  const errors = results.filter((r) => !r.ok).length;

  const passed =
    all.severityExactRate >= thresholds.severityExact &&
    all.pathAccuracy >= thresholds.path;

  return {
    perCategory,
    overall: { ...all, errors },
    thresholds,
    passed,
  };
}
