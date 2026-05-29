// What: Dataset-integrity unit tests for dataset.json — count, id uniqueness +
//       format, enum membership (severity / path / system_tag), category
//       membership, per-category balance floor, and non-empty text fields.
// Why:  The dataset is the regression baseline; a malformed entry would silently
//       corrupt every accuracy run. These deterministic checks pin its shape in
//       CI (D6) with ZERO API calls.
// Does NOT: Import run.ts (would pull @anthropic-ai/sdk + invite a network call)
//           or score anything. Imports only types, the enum constants, and the
//           JSON itself.

import { describe, expect, it } from 'vitest';
import {
  SEVERITY_VALUES,
  SYSTEM_TAG_VALUES,
} from '@/app/api/triage/_lib/parse-tool-output';
import { CATEGORIES, type DatasetEntry } from './types';
import datasetJson from './dataset.json';

const dataset = datasetJson as DatasetEntry[];

describe('dataset.json integrity', () => {
  it('has exactly 75 entries', () => {
    expect(dataset.length).toBe(75);
  });

  it('has unique ids', () => {
    const ids = dataset.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every id matches /^[a-z]+-\\d{2}$/', () => {
    const re = /^[a-z]+-\d{2}$/;
    const bad = dataset.filter((e) => !re.test(e.id)).map((e) => e.id);
    expect(bad).toEqual([]);
  });

  it('every label_severity is a legal Severity', () => {
    const bad = dataset
      .filter(
        (e) =>
          !(SEVERITY_VALUES as readonly string[]).includes(e.label_severity)
      )
      .map((e) => e.id);
    expect(bad).toEqual([]);
  });

  it("every label_path is 'diy' or 'hire'", () => {
    const bad = dataset
      .filter((e) => e.label_path !== 'diy' && e.label_path !== 'hire')
      .map((e) => e.id);
    expect(bad).toEqual([]);
  });

  it('every label_system_tag is a legal SystemTag', () => {
    const bad = dataset
      .filter(
        (e) =>
          !(SYSTEM_TAG_VALUES as readonly string[]).includes(e.label_system_tag)
      )
      .map((e) => e.id);
    expect(bad).toEqual([]);
  });

  it('every category is one of the 9 CATEGORIES', () => {
    const bad = dataset
      .filter((e) => !(CATEGORIES as readonly string[]).includes(e.category))
      .map((e) => e.id);
    expect(bad).toEqual([]);
  });

  it('every description and rationale is a non-empty string', () => {
    const bad = dataset
      .filter(
        (e) =>
          typeof e.description !== 'string' ||
          e.description.trim().length === 0 ||
          typeof e.rationale !== 'string' ||
          e.rationale.trim().length === 0
      )
      .map((e) => e.id);
    expect(bad).toEqual([]);
  });

  it('has at least 7 entries per category (balance floor)', () => {
    const counts = new Map<string, number>();
    for (const e of dataset) {
      counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    }
    for (const category of CATEGORIES) {
      expect(counts.get(category) ?? 0).toBeGreaterThanOrEqual(7);
    }
  });
});
