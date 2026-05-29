import { describe, expect, it } from 'vitest';
import { contractorTagLabel } from './contractor-tag-label';
import type { ContractorTag } from '@/app/api/triage/_lib/parse-tool-output';

describe('contractorTagLabel', () => {
  it('maps every non-diy tag to its expected label', () => {
    const cases: [ContractorTag, string][] = [
      ['handyman', 'Handyman'],
      ['plumber', 'Plumber'],
      ['electrician', 'Electrician'],
      ['hvac_tech', 'HVAC'],
      ['roofer', 'Roofer'],
      ['general_contractor', 'General Contractor'],
      ['specialist', 'Specialist'],
    ];
    for (const [tag, label] of cases) {
      expect(contractorTagLabel(tag)).toBe(label);
    }
  });

  it('falls back to the raw string for diy (excluded from view)', () => {
    expect(contractorTagLabel('diy')).toBe('diy');
  });

  it('falls back to the raw string for an unknown value', () => {
    expect(contractorTagLabel('mystery' as ContractorTag)).toBe('mystery');
  });
});
