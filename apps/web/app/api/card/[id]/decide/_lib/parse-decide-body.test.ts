import { describe, expect, it } from 'vitest';
import { parseDecideBody } from './parse-decide-body';

describe('parseDecideBody — valid', () => {
  it.each(['diy', 'contractor', 'dismiss', 'decide'] as const)(
    'accepts path=%s without monitoring_cadence_days',
    (path) => {
      const r = parseDecideBody({ path });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.path).toBe(path);
        expect(r.value.monitoring_cadence_days).toBeNull();
      }
    }
  );

  it('accepts path=monitor with a positive integer cadence', () => {
    const r = parseDecideBody({ path: 'monitor', monitoring_cadence_days: 30 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.path).toBe('monitor');
      expect(r.value.monitoring_cadence_days).toBe(30);
    }
  });

  it('tolerates extra unknown fields (forward-compat)', () => {
    const r = parseDecideBody({ path: 'diy', future_field: 'ignored' });
    expect(r.ok).toBe(true);
  });

  it('accepts an explicit null cadence on non-monitor paths', () => {
    const r = parseDecideBody({ path: 'diy', monitoring_cadence_days: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.monitoring_cadence_days).toBeNull();
  });
});

describe('parseDecideBody — rejection', () => {
  it('rejects non-object input', () => {
    expect(parseDecideBody(null).ok).toBe(false);
    expect(parseDecideBody('diy').ok).toBe(false);
    expect(parseDecideBody([]).ok).toBe(false);
  });

  it('rejects missing path', () => {
    const r = parseDecideBody({ monitoring_cadence_days: 14 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('path');
  });

  it('rejects unknown path value', () => {
    const r = parseDecideBody({ path: 'wizard' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('path');
  });

  it('rejects path=monitor without cadence', () => {
    const r = parseDecideBody({ path: 'monitor' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('monitoring_cadence_days');
  });

  it('rejects negative cadence', () => {
    const r = parseDecideBody({
      path: 'monitor',
      monitoring_cadence_days: -1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('monitoring_cadence_days');
  });

  it('rejects non-integer cadence', () => {
    const r = parseDecideBody({
      path: 'monitor',
      monitoring_cadence_days: 30.5,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('monitoring_cadence_days');
  });

  it('rejects string cadence', () => {
    const r = parseDecideBody({
      path: 'monitor',
      monitoring_cadence_days: '30',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('monitoring_cadence_days');
  });

  it('rejects zero cadence', () => {
    const r = parseDecideBody({
      path: 'monitor',
      monitoring_cadence_days: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('monitoring_cadence_days');
  });
});
