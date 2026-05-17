import { describe, it, expect } from 'vitest';
import {
  parseDiyExpansion,
  parseContractorExpansion,
  SKILL_LEVEL_VALUES,
} from './estimate-shapes';

const validDiy = () => ({
  skill_level: 'intermediate' as const,
  time_hours_min: 2,
  time_hours_max: 4,
  materials: [
    { name: 'PVC pipe 1/2"', cost_min: 8, cost_max: 12 },
    { name: 'Plumber tape', cost_min: 3, cost_max: 5 },
  ],
  tools: [
    {
      name: 'Pipe wrench',
      cost_min: 18,
      cost_max: 25,
      optional: false,
    },
    { name: 'Tubing cutter', cost_min: 12, cost_max: 22 },
  ],
  total_min: 45,
  total_max: 80,
  gotchas:
    'Watch for soldered joints near the shutoff — heat damage propagates further than it looks.',
  abort_condition:
    'Stop and call a plumber if the leak persists at the joint after the new seal sets.',
  steps: [
    'Shut off the main water valve.',
    'Drain the line.',
    'Cut and replace the damaged section.',
    'Open the valve and test.',
  ],
});

const validContractor = () => ({
  contractor_type: 'plumber' as const,
  cost_range_min: 250,
  cost_range_max: 600,
  questions_for_contractor: [
    'Will you need to open the wall behind the fixture?',
    'Is the repair warrantied for a year?',
  ],
  red_flags: [
    'Refuses to provide written quote.',
    'Pressures for cash payment.',
  ],
  good_completion:
    'Joint sealed cleanly with no drip after 24h pressure test. Old material removed.',
});

describe('parseDiyExpansion — valid inputs', () => {
  it('accepts a fully-specified DIY shape', () => {
    const r = parseDiyExpansion(validDiy());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.skill_level).toBe('intermediate');
      expect(r.value.materials).toHaveLength(2);
      expect(r.value.steps).toHaveLength(4);
    }
  });

  it('tolerates an extra unknown top-level field (forward-compat)', () => {
    const r = parseDiyExpansion({ ...validDiy(), future_field: 'whatever' });
    expect(r.ok).toBe(true);
  });

  it('accepts empty materials + tools arrays', () => {
    const r = parseDiyExpansion({
      ...validDiy(),
      materials: [],
      tools: [],
    });
    expect(r.ok).toBe(true);
  });

  it('accepts tools with optional flag omitted', () => {
    const tools = [{ name: 'screwdriver', cost_min: 0, cost_max: 10 }];
    const r = parseDiyExpansion({ ...validDiy(), tools });
    expect(r.ok).toBe(true);
  });

  it('accepts skill_level = beginner / intermediate / advanced', () => {
    for (const level of SKILL_LEVEL_VALUES) {
      const r = parseDiyExpansion({ ...validDiy(), skill_level: level });
      expect(r.ok).toBe(true);
    }
  });
});

describe('parseDiyExpansion — rejection paths', () => {
  it('rejects non-object input', () => {
    const r = parseDiyExpansion('not an object');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('<root>');
  });

  it('rejects null', () => {
    const r = parseDiyExpansion(null);
    expect(r.ok).toBe(false);
  });

  it('rejects an unknown skill_level', () => {
    const r = parseDiyExpansion({ ...validDiy(), skill_level: 'expert' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('skill_level');
  });

  it('rejects time_hours_max < time_hours_min', () => {
    const r = parseDiyExpansion({
      ...validDiy(),
      time_hours_min: 5,
      time_hours_max: 2,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('time_hours_max');
  });

  it('rejects negative time_hours_min', () => {
    const r = parseDiyExpansion({ ...validDiy(), time_hours_min: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('time_hours_min');
  });

  it('rejects NaN cost_min in materials row', () => {
    const r = parseDiyExpansion({
      ...validDiy(),
      materials: [{ name: 'x', cost_min: NaN, cost_max: 5 }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('materials[0].cost_min');
  });

  it('rejects too many materials (cap 50)', () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      name: `m${i}`,
      cost_min: 1,
      cost_max: 2,
    }));
    const r = parseDiyExpansion({ ...validDiy(), materials: tooMany });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('materials');
  });

  it('rejects a tools row with cost_max < cost_min', () => {
    const r = parseDiyExpansion({
      ...validDiy(),
      tools: [{ name: 'wrench', cost_min: 50, cost_max: 10 }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('tools[0].cost_max');
  });

  it('rejects a tools row with non-boolean optional', () => {
    const r = parseDiyExpansion({
      ...validDiy(),
      tools: [
        {
          name: 'wrench',
          cost_min: 0,
          cost_max: 10,
          optional: 'maybe' as unknown,
        },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('tools[0].optional');
  });

  it('rejects total_max < total_min', () => {
    const r = parseDiyExpansion({
      ...validDiy(),
      total_min: 100,
      total_max: 50,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('total_max');
  });

  it('rejects missing gotchas', () => {
    const validCopy = { ...validDiy() } as Partial<ReturnType<typeof validDiy>>;
    delete validCopy.gotchas;
    const rest = validCopy;
    const r = parseDiyExpansion(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('gotchas');
  });

  it('rejects oversize gotchas (> 2000 chars)', () => {
    const r = parseDiyExpansion({
      ...validDiy(),
      gotchas: 'x'.repeat(2001),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('gotchas');
  });

  it('rejects an empty steps array', () => {
    const r = parseDiyExpansion({ ...validDiy(), steps: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('steps');
  });

  it('rejects non-string step entry', () => {
    const r = parseDiyExpansion({
      ...validDiy(),
      steps: ['a', 42 as unknown, 'b'],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('steps[1]');
  });
});

describe('parseContractorExpansion — valid inputs', () => {
  it('accepts a fully-specified Contractor shape', () => {
    const r = parseContractorExpansion(validContractor());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.contractor_type).toBe('plumber');
      expect(r.value.questions_for_contractor).toHaveLength(2);
    }
  });

  it('tolerates an extra unknown top-level field', () => {
    const r = parseContractorExpansion({
      ...validContractor(),
      future_field: 'x',
    });
    expect(r.ok).toBe(true);
  });

  it('accepts empty red_flags', () => {
    const r = parseContractorExpansion({
      ...validContractor(),
      red_flags: [],
    });
    expect(r.ok).toBe(true);
  });

  it('accepts contractor_type=diy (semantic check is elsewhere)', () => {
    const r = parseContractorExpansion({
      ...validContractor(),
      contractor_type: 'diy',
    });
    expect(r.ok).toBe(true);
  });
});

describe('parseContractorExpansion — rejection paths', () => {
  it('rejects non-object input', () => {
    expect(parseContractorExpansion(null).ok).toBe(false);
    expect(parseContractorExpansion([]).ok).toBe(false);
    expect(parseContractorExpansion(42).ok).toBe(false);
  });

  it('rejects unknown contractor_type', () => {
    const r = parseContractorExpansion({
      ...validContractor(),
      contractor_type: 'unknown',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('contractor_type');
  });

  it('rejects cost_range_max < cost_range_min', () => {
    const r = parseContractorExpansion({
      ...validContractor(),
      cost_range_min: 600,
      cost_range_max: 250,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('cost_range_max');
  });

  it('rejects an empty questions_for_contractor array', () => {
    const r = parseContractorExpansion({
      ...validContractor(),
      questions_for_contractor: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('questions_for_contractor');
  });

  it('rejects too many questions (cap 15)', () => {
    const tooMany = Array.from({ length: 16 }, (_, i) => `q${i}`);
    const r = parseContractorExpansion({
      ...validContractor(),
      questions_for_contractor: tooMany,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('questions_for_contractor');
  });

  it('rejects oversize question (> 500 chars)', () => {
    const r = parseContractorExpansion({
      ...validContractor(),
      questions_for_contractor: ['x'.repeat(501)],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('questions_for_contractor[0]');
  });

  it('rejects too many red_flags (cap 10)', () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `r${i}`);
    const r = parseContractorExpansion({
      ...validContractor(),
      red_flags: tooMany,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('red_flags');
  });

  it('rejects missing good_completion', () => {
    const validCopy = {
      ...validContractor(),
    } as Partial<ReturnType<typeof validContractor>>;
    delete validCopy.good_completion;
    const rest = validCopy;
    const r = parseContractorExpansion(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('good_completion');
  });
});
