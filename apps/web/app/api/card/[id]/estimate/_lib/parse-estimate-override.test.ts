import { describe, expect, it } from 'vitest';
import { parseEstimateBody } from './parse-estimate-override';

const validDiy = () => ({
  skill_level: 'intermediate' as const,
  time_hours_min: 1,
  time_hours_max: 2,
  materials: [{ name: 'kit', cost_min: 10, cost_max: 20 }],
  tools: [{ name: 'wrench', cost_min: 0, cost_max: 25 }],
  total_min: 10,
  total_max: 45,
  gotchas: 'short note',
  abort_condition: 'short note',
  steps: ['one', 'two'],
});

const validContractor = () => ({
  contractor_type: 'plumber' as const,
  cost_range_min: 100,
  cost_range_max: 300,
  questions_for_contractor: ['warrantied?'],
  red_flags: ['no quote'],
  good_completion: 'no drip',
});

describe('parseEstimateBody — valid', () => {
  it('accepts path=diy with full estimate', () => {
    const r = parseEstimateBody({ path: 'diy', estimate: validDiy() });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.path === 'diy') {
      expect(r.value.estimate?.skill_level).toBe('intermediate');
    }
  });

  it('accepts path=contractor with full estimate', () => {
    const r = parseEstimateBody({
      path: 'contractor',
      estimate: validContractor(),
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.path === 'contractor') {
      expect(r.value.estimate?.contractor_type).toBe('plumber');
    }
  });

  it('accepts path=diy with estimate=null (reset)', () => {
    const r = parseEstimateBody({ path: 'diy', estimate: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.estimate).toBeNull();
  });

  it('accepts path=contractor with estimate=null (reset)', () => {
    const r = parseEstimateBody({ path: 'contractor', estimate: null });
    expect(r.ok).toBe(true);
  });

  it('tolerates extra fields on body (forward-compat)', () => {
    const r = parseEstimateBody({
      path: 'diy',
      estimate: validDiy(),
      future_field: 'x',
    });
    expect(r.ok).toBe(true);
  });
});

describe('parseEstimateBody — rejection', () => {
  it('rejects non-object body', () => {
    expect(parseEstimateBody(null).ok).toBe(false);
    expect(parseEstimateBody('diy').ok).toBe(false);
  });

  it('rejects missing path', () => {
    const r = parseEstimateBody({ estimate: validDiy() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('path');
  });

  it('rejects unknown path', () => {
    const r = parseEstimateBody({ path: 'monitor', estimate: validDiy() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('path');
  });

  it('rejects missing estimate field entirely (must provide null explicitly)', () => {
    const r = parseEstimateBody({ path: 'diy' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('estimate');
  });

  it('rejects DIY estimate with bad skill_level (field path bubbles)', () => {
    const r = parseEstimateBody({
      path: 'diy',
      estimate: { ...validDiy(), skill_level: 'wizard' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('estimate.skill_level');
  });

  it('rejects DIY estimate with empty steps (field path bubbles)', () => {
    const r = parseEstimateBody({
      path: 'diy',
      estimate: { ...validDiy(), steps: [] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('estimate.steps');
  });

  it('rejects contractor estimate with bad contractor_type', () => {
    const r = parseEstimateBody({
      path: 'contractor',
      estimate: { ...validContractor(), contractor_type: 'wizard' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('estimate.contractor_type');
  });

  it('rejects when path says diy but estimate is contractor-shaped', () => {
    const r = parseEstimateBody({
      path: 'diy',
      estimate: validContractor(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field.startsWith('estimate.')).toBe(true);
  });
});
