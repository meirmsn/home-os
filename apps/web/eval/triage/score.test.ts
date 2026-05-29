// What: Deterministic unit tests for the triage-eval scoring math — exact /
//       adjacency severity, path derivation, path match, and the aggregate
//       report including threshold boundaries (inclusive `>=`).
// Why:  Scoring is the deterministic contract the operator harness trusts; it
//       must be pinned in CI (D6). These tests make ZERO real API calls.
// Does NOT: Import run.ts (that would pull @anthropic-ai/sdk and invite a
//           network call) or load dataset.json (that's dataset.test.ts).

import { describe, expect, it } from 'vitest';
import type { Severity } from '@/app/api/triage/_lib/parse-tool-output';
import { CONTRACTOR_TAG_VALUES } from '@/app/api/triage/_lib/parse-tool-output';
import type { Category, Path } from './types';
import {
  aggregate,
  DEFAULT_THRESHOLDS,
  pathFromContractorTag,
  pathMatch,
  SEVERITY_ORDINAL,
  severityAdjacent,
  severityExact,
  type EntryResult,
} from './score';

/** Build a fully-scored EntryResult helper for aggregate tests. */
function entry(
  partial: Partial<EntryResult> & {
    id: string;
    category: Category;
    label_severity: Severity;
    pred_severity: Severity | null;
    label_path: Path;
    pred_path: Path | null;
  }
): EntryResult {
  const severity_exact =
    partial.pred_severity != null &&
    severityExact(partial.pred_severity, partial.label_severity);
  const severity_adjacent =
    partial.pred_severity != null &&
    severityAdjacent(partial.pred_severity, partial.label_severity);
  const path_correct =
    partial.pred_path != null &&
    pathMatch(partial.pred_path, partial.label_path);
  return {
    label_system_tag: 'other',
    pred_system_tag: 'other',
    system_tag_correct: true,
    ok: partial.ok ?? true,
    severity_exact,
    severity_adjacent,
    path_correct,
    ...partial,
  } as EntryResult;
}

describe('severityExact', () => {
  it('true when equal, false when not', () => {
    expect(severityExact('soon', 'soon')).toBe(true);
    expect(severityExact('cosmetic', 'urgent')).toBe(false);
    expect(severityExact('monitor', 'soon')).toBe(false);
  });
});

describe('SEVERITY_ORDINAL', () => {
  it('orders cosmetic<monitor<soon<urgent with span 3', () => {
    expect(SEVERITY_ORDINAL.cosmetic).toBe(0);
    expect(SEVERITY_ORDINAL.monitor).toBe(1);
    expect(SEVERITY_ORDINAL.soon).toBe(2);
    expect(SEVERITY_ORDINAL.urgent).toBe(3);
    expect(SEVERITY_ORDINAL.urgent - SEVERITY_ORDINAL.cosmetic).toBe(3);
  });
});

describe('severityAdjacent', () => {
  it('true for exact and off-by-one pairs', () => {
    expect(severityAdjacent('soon', 'soon')).toBe(true); // exact
    expect(severityAdjacent('cosmetic', 'monitor')).toBe(true);
    expect(severityAdjacent('monitor', 'cosmetic')).toBe(true);
    expect(severityAdjacent('monitor', 'soon')).toBe(true);
    expect(severityAdjacent('soon', 'urgent')).toBe(true);
  });
  it('false for off-by-two and off-by-three', () => {
    expect(severityAdjacent('cosmetic', 'soon')).toBe(false);
    expect(severityAdjacent('monitor', 'urgent')).toBe(false);
    expect(severityAdjacent('cosmetic', 'urgent')).toBe(false);
    expect(severityAdjacent('urgent', 'cosmetic')).toBe(false);
  });
});

describe('pathFromContractorTag', () => {
  it("maps 'diy' to 'diy' and every other contractor tag to 'hire'", () => {
    expect(pathFromContractorTag('diy')).toBe('diy');
    for (const tag of CONTRACTOR_TAG_VALUES) {
      if (tag === 'diy') continue;
      expect(pathFromContractorTag(tag)).toBe('hire');
    }
    // unknown / unexpected tags also fall to hire (defensive)
    expect(pathFromContractorTag('something_else')).toBe('hire');
  });
});

describe('pathMatch', () => {
  it('covers the diy/hire matrix', () => {
    expect(pathMatch('diy', 'diy')).toBe(true);
    expect(pathMatch('hire', 'hire')).toBe(true);
    expect(pathMatch('diy', 'hire')).toBe(false);
    expect(pathMatch('hire', 'diy')).toBe(false);
  });
});

describe('aggregate', () => {
  it('computes per-category and overall rates as fractions', () => {
    const results: EntryResult[] = [
      entry({
        id: 'hvac-01',
        category: 'HVAC',
        label_severity: 'soon',
        pred_severity: 'soon', // exact
        label_path: 'hire',
        pred_path: 'hire', // correct
      }),
      entry({
        id: 'hvac-02',
        category: 'HVAC',
        label_severity: 'monitor',
        pred_severity: 'soon', // adjacent, not exact
        label_path: 'diy',
        pred_path: 'hire', // wrong
      }),
    ];
    const report = aggregate(results, DEFAULT_THRESHOLDS);
    const hvac = report.perCategory.find((c) => c.category === 'HVAC');
    expect(hvac?.n).toBe(2);
    expect(hvac?.severityExactRate).toBeCloseTo(0.5);
    expect(hvac?.severityAdjacentRate).toBeCloseTo(1.0); // both within one
    expect(hvac?.pathAccuracy).toBeCloseTo(0.5);
    expect(report.overall.n).toBe(2);
    expect(report.overall.severityExactRate).toBeCloseTo(0.5);
    expect(report.overall.pathAccuracy).toBeCloseTo(0.5);
    expect(report.overall.errors).toBe(0);
  });

  it('counts an ok:false entry in the denominator as a miss', () => {
    const results: EntryResult[] = [
      entry({
        id: 'plumbing-01',
        category: 'Plumbing',
        label_severity: 'urgent',
        pred_severity: 'urgent',
        label_path: 'hire',
        pred_path: 'hire',
      }),
      // error entry: pred null, all *_correct false, counted as miss
      {
        id: 'plumbing-02',
        category: 'Plumbing',
        ok: false,
        label_severity: 'monitor',
        pred_severity: null,
        severity_exact: false,
        severity_adjacent: false,
        label_path: 'diy',
        pred_path: null,
        path_correct: false,
        label_system_tag: 'plumbing',
        pred_system_tag: null,
        system_tag_correct: false,
        error: 'boom',
      },
    ];
    const report = aggregate(results, DEFAULT_THRESHOLDS);
    expect(report.overall.n).toBe(2);
    expect(report.overall.errors).toBe(1);
    // 1 of 2 exact → 0.5, the error counts against the denominator
    expect(report.overall.severityExactRate).toBeCloseTo(0.5);
    expect(report.overall.pathAccuracy).toBeCloseTo(0.5);
  });

  it('returns zero rates for an empty result set without dividing by zero', () => {
    const report = aggregate([], DEFAULT_THRESHOLDS);
    expect(report.overall.n).toBe(0);
    expect(report.overall.severityExactRate).toBe(0);
    expect(report.overall.pathAccuracy).toBe(0);
    expect(report.perCategory).toHaveLength(0);
  });
});

describe('aggregate threshold boundaries', () => {
  /** Build N entries, the first `exactHits` severity-exact and the first
   *  `pathHits` path-correct; all in one category. */
  function bulk(n: number, exactHits: number, pathHits: number): EntryResult[] {
    const out: EntryResult[] = [];
    for (let i = 0; i < n; i++) {
      const exact = i < exactHits;
      const pathOk = i < pathHits;
      out.push(
        entry({
          id: `hvac-${String(i).padStart(2, '0')}`,
          category: 'HVAC',
          label_severity: 'soon',
          pred_severity: exact ? 'soon' : 'cosmetic', // cosmetic is off-by-two
          label_path: 'hire',
          pred_path: pathOk ? 'hire' : 'diy',
        })
      );
    }
    return out;
  }

  it('passes exactly on the 0.70 / 0.85 boundary (inclusive >=)', () => {
    // 10 entries: 7 severity-exact = 0.70, 9 path-correct ... need 0.85.
    // Use 20 entries so both land exactly: 14/20 = 0.70, 17/20 = 0.85.
    const results = bulk(20, 14, 17);
    const report = aggregate(results, DEFAULT_THRESHOLDS);
    expect(report.overall.severityExactRate).toBeCloseTo(0.7);
    expect(report.overall.pathAccuracy).toBeCloseTo(0.85);
    expect(report.passed).toBe(true);
  });

  it('fails when severity is one miss below 0.70 (path clears)', () => {
    // 20 entries: 13/20 = 0.65 severity, 17/20 = 0.85 path.
    const results = bulk(20, 13, 17);
    const report = aggregate(results, DEFAULT_THRESHOLDS);
    expect(report.overall.severityExactRate).toBeLessThan(0.7);
    expect(report.overall.pathAccuracy).toBeCloseTo(0.85);
    expect(report.passed).toBe(false);
  });

  it('fails when path is one miss below 0.85 (severity clears)', () => {
    // 20 entries: 14/20 = 0.70 severity, 16/20 = 0.80 path.
    const results = bulk(20, 14, 16);
    const report = aggregate(results, DEFAULT_THRESHOLDS);
    expect(report.overall.severityExactRate).toBeCloseTo(0.7);
    expect(report.overall.pathAccuracy).toBeLessThan(0.85);
    expect(report.passed).toBe(false);
  });

  it('requires BOTH gated metrics — clearing severity but failing path is a fail', () => {
    const results = bulk(20, 20, 0); // perfect severity, zero path
    const report = aggregate(results, DEFAULT_THRESHOLDS);
    expect(report.overall.severityExactRate).toBeCloseTo(1.0);
    expect(report.overall.pathAccuracy).toBeCloseTo(0.0);
    expect(report.passed).toBe(false);
  });

  it('honors custom thresholds', () => {
    const results = bulk(10, 5, 5); // 0.5 / 0.5
    const report = aggregate(results, { severityExact: 0.5, path: 0.5 });
    expect(report.passed).toBe(true);
    const stricter = aggregate(results, { severityExact: 0.6, path: 0.5 });
    expect(stricter.passed).toBe(false);
  });
});

describe('DEFAULT_THRESHOLDS', () => {
  it('matches the D7 floor', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ severityExact: 0.7, path: 0.85 });
  });
});
