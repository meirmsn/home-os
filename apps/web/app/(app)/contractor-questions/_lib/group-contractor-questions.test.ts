import { describe, expect, it } from 'vitest';
import {
  groupContractorQuestions,
  NUDGE_AGE_DAYS,
  type ContractorQuestionCardRow,
} from './group-contractor-questions';

/** A valid ContractorExpansion jsonb with the given questions. */
function expansion(questions: string[], contractor_type = 'plumber') {
  return {
    contractor_type,
    cost_range_min: 100,
    cost_range_max: 300,
    questions_for_contractor: questions,
    red_flags: ['No written quote.'],
    good_completion: 'No drip after a 24h pressure test.',
  };
}

/** Build a card row with sane defaults; override per test. */
function card(
  over: Partial<ContractorQuestionCardRow> = {}
): ContractorQuestionCardRow {
  return {
    id: over.id ?? 'card-1',
    title: over.title ?? 'Leaky faucet',
    initial_description: over.initial_description ?? null,
    state: over.state ?? 'decide',
    contractor_tag: over.contractor_tag ?? 'plumber',
    chosen_path: over.chosen_path ?? null,
    cost_estimate_hire:
      'cost_estimate_hire' in over
        ? over.cost_estimate_hire
        : expansion(['Q1?']),
    cost_estimate_hire_override:
      'cost_estimate_hire_override' in over
        ? over.cost_estimate_hire_override
        : null,
    created_at: over.created_at ?? '2026-05-01T12:00:00.000Z',
  };
}

// Fixed "now" — 2026-06-01 (UTC) for deterministic age math.
const NOW = Date.parse('2026-06-01T08:00:00.000Z');

describe('groupContractorQuestions', () => {
  it('case 1: empty input → empty result', () => {
    expect(groupContractorQuestions([], NOW)).toEqual({
      groups: [],
      totalQuestionCards: 0,
    });
  });

  it('case 2: all-excluded cards → empty result', () => {
    const rows = [
      card({ id: 'closed', state: 'closed' }),
      card({ id: 'dismissed', state: 'dismissed' }),
      card({ id: 'diy', contractor_tag: 'diy' }),
      card({ id: 'no-questions', cost_estimate_hire: expansion([]) }),
      card({
        id: 'null-expansion',
        cost_estimate_hire: null,
        cost_estimate_hire_override: null,
      }),
    ];
    expect(groupContractorQuestions(rows, NOW)).toEqual({
      groups: [],
      totalQuestionCards: 0,
    });
  });

  it('case 3: single group, multiple cards, oldest-first', () => {
    const rows = [
      card({
        id: 'newer',
        contractor_tag: 'plumber',
        created_at: '2026-05-20T00:00:00.000Z',
        cost_estimate_hire: expansion(['A?', 'B?']),
      }),
      card({
        id: 'older',
        contractor_tag: 'plumber',
        created_at: '2026-05-10T00:00:00.000Z',
        cost_estimate_hire: expansion(['C?']),
      }),
    ];
    const { groups, totalQuestionCards } = groupContractorQuestions(rows, NOW);
    expect(groups).toHaveLength(1);
    const g = groups[0]!;
    expect(g.contractorType).toBe('plumber');
    expect(g.cards.map((c) => c.cardId)).toEqual(['older', 'newer']);
    expect(g.questionCount).toBe(3);
    expect(totalQuestionCards).toBe(2);
  });

  it('case 4: multiple groups, alphabetical-by-label ordering', () => {
    const rows = [
      card({ id: 'p', contractor_tag: 'plumber' }),
      card({ id: 'e', contractor_tag: 'electrician' }),
      card({ id: 'h', contractor_tag: 'hvac_tech' }),
    ];
    const { groups } = groupContractorQuestions(rows, NOW);
    // Labels: Electrician, HVAC, Plumber → alphabetical.
    expect(groups.map((g) => g.contractorType)).toEqual([
      'electrician',
      'hvac_tech',
      'plumber',
    ]);
  });

  it('case 5: override wins over base when present', () => {
    const rows = [
      // both present — override wins
      card({
        id: 'both',
        cost_estimate_hire: expansion(['BASE-Q?']),
        cost_estimate_hire_override: expansion(['OVERRIDE-Q?']),
      }),
      // only base
      card({
        id: 'base-only',
        contractor_tag: 'electrician',
        cost_estimate_hire: expansion(['BASE-ONLY-Q?'], 'electrician'),
        cost_estimate_hire_override: null,
      }),
    ];
    const { groups } = groupContractorQuestions(rows, NOW);
    const plumber = groups.find((g) => g.contractorType === 'plumber')!;
    expect(plumber.cards[0]!.questions).toEqual(['OVERRIDE-Q?']);
    const electrician = groups.find((g) => g.contractorType === 'electrician')!;
    expect(electrician.cards[0]!.questions).toEqual(['BASE-ONLY-Q?']);
  });

  it('case 6: nudge boundary at 29/30/31 days', () => {
    // NOW = 2026-06-01. UTC-sliced created_at dates:
    //   29 days → 2026-05-03, 30 → 2026-05-02, 31 → 2026-05-01
    const at = (iso: string, tag: string) =>
      card({
        id: iso,
        contractor_tag: tag as ContractorQuestionCardRow['contractor_tag'],
        created_at: `${iso}T00:00:00.000Z`,
        cost_estimate_hire: expansion(['Q?'], tag),
      });
    const rows = [
      at('2026-05-03', 'plumber'), // 29 days
      at('2026-05-02', 'electrician'), // 30 days
      at('2026-05-01', 'roofer'), // 31 days
    ];
    const { groups } = groupContractorQuestions(rows, NOW);
    const byTag = (t: string) => groups.find((g) => g.contractorType === t)!;
    expect(byTag('plumber').oldestCardDays).toBe(29);
    expect(byTag('plumber').showNudge).toBe(false);
    expect(byTag('electrician').oldestCardDays).toBe(NUDGE_AGE_DAYS);
    expect(byTag('electrician').showNudge).toBe(true);
    expect(byTag('roofer').oldestCardDays).toBe(31);
    expect(byTag('roofer').showNudge).toBe(true);
  });

  it('case 7: invalid jsonb is excluded, not thrown', () => {
    const rows = [
      // missing questions_for_contractor → parse fails
      card({
        id: 'bad',
        cost_estimate_hire: { contractor_type: 'plumber', cost_range_min: 1 },
        cost_estimate_hire_override: null,
      }),
      // valid card alongside so we know the bad one is just dropped
      card({
        id: 'good',
        contractor_tag: 'roofer',
        cost_estimate_hire: expansion(['Q?'], 'roofer'),
      }),
    ];
    const { groups, totalQuestionCards } = groupContractorQuestions(rows, NOW);
    expect(totalQuestionCards).toBe(1);
    expect(groups.map((g) => g.contractorType)).toEqual(['roofer']);
  });
});
