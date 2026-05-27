// What: Unit tests for parseCadenceBody validator.

import { describe, expect, it } from 'vitest';
import { parseCadenceBody } from './parse-cadence-body';

describe('parseCadenceBody', () => {
  it('accepts a valid cadence_days integer', () => {
    const result = parseCadenceBody({ cadence_days: 14 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cadence_days).toBe(14);
    }
  });

  it('accepts cadence_days = 1 (min)', () => {
    const result = parseCadenceBody({ cadence_days: 1 });
    expect(result.ok).toBe(true);
  });

  it('accepts cadence_days = 365 (max)', () => {
    const result = parseCadenceBody({ cadence_days: 365 });
    expect(result.ok).toBe(true);
  });

  it('rejects non-object input', () => {
    const result = parseCadenceBody('not an object');
    expect(result.ok).toBe(false);
  });

  it('rejects missing cadence_days', () => {
    const result = parseCadenceBody({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('cadence_days');
    }
  });

  it('rejects non-number cadence_days', () => {
    const result = parseCadenceBody({ cadence_days: 'fourteen' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-integer cadence_days', () => {
    const result = parseCadenceBody({ cadence_days: 14.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('integer');
    }
  });

  it('rejects cadence_days < 1', () => {
    const result = parseCadenceBody({ cadence_days: 0 });
    expect(result.ok).toBe(false);
  });

  it('rejects cadence_days > 365', () => {
    const result = parseCadenceBody({ cadence_days: 366 });
    expect(result.ok).toBe(false);
  });

  it('rejects NaN', () => {
    const result = parseCadenceBody({ cadence_days: NaN });
    expect(result.ok).toBe(false);
  });

  it('rejects Infinity', () => {
    const result = parseCadenceBody({ cadence_days: Infinity });
    expect(result.ok).toBe(false);
  });

  it('tolerates extra fields', () => {
    const result = parseCadenceBody({ cadence_days: 14, extra: 'ignored' });
    expect(result.ok).toBe(true);
  });
});
