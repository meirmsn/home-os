import { describe, expect, it } from 'vitest';
import { tierCards, todayIso, type DashboardCardRow } from './tier-cards';

/**
 *
 */
function makeCard(overrides: Partial<DashboardCardRow> = {}): DashboardCardRow {
  return {
    id: overrides.id ?? 'card-1',
    state: 'decide',
    title: 'Test card',
    initial_description: 'Description',
    severity: 'soon',
    severity_confirmed: true,
    system_tag: 'plumbing',
    room_tag: null,
    chosen_path: null,
    planned_reminder_date: null,
    next_check_at: null,
    monitoring_cadence_days: null,
    diagnosis: 'Some diagnosis',
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

const NOW = new Date('2026-05-27T12:00:00Z').getTime();

describe('todayIso', () => {
  it('returns YYYY-MM-DD for a given timestamp', () => {
    expect(todayIso(NOW)).toBe('2026-05-27');
  });
});

describe('tierCards', () => {
  describe('Tier 1: Act Soon', () => {
    it('includes decide + diagnosed cards with urgent/soon severity and severity_confirmed', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'decide',
          severity: 'urgent',
          severity_confirmed: true,
        }),
        makeCard({
          id: 'b',
          state: 'diagnosed',
          severity: 'soon',
          severity_confirmed: true,
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.tier1.map((c) => c.id)).toEqual(['a', 'b']);
    });

    it('excludes severity_confirmed=false', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'decide',
          severity: 'urgent',
          severity_confirmed: false,
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.tier1).toHaveLength(0);
    });

    it('excludes cosmetic and monitor severity', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'decide',
          severity: 'cosmetic',
          severity_confirmed: true,
        }),
        makeCard({
          id: 'b',
          state: 'decide',
          severity: 'monitor',
          severity_confirmed: true,
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.tier1).toHaveLength(0);
    });

    it('sorts urgent before soon, oldest created_at first within same severity', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'decide',
          severity: 'soon',
          severity_confirmed: true,
          created_at: '2026-05-01T00:00:00Z',
        }),
        makeCard({
          id: 'b',
          state: 'decide',
          severity: 'urgent',
          severity_confirmed: true,
          created_at: '2026-05-03T00:00:00Z',
        }),
        makeCard({
          id: 'c',
          state: 'decide',
          severity: 'urgent',
          severity_confirmed: true,
          created_at: '2026-05-02T00:00:00Z',
        }),
        makeCard({
          id: 'd',
          state: 'decide',
          severity: 'soon',
          severity_confirmed: true,
          created_at: '2026-05-04T00:00:00Z',
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.tier1.map((c) => c.id)).toEqual(['c', 'b', 'a', 'd']);
    });
  });

  describe('Tier 1: Reminder-due PLANNED', () => {
    it('includes planned cards where planned_reminder_date <= today', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
          planned_reminder_date: '2026-05-27',
        }),
        makeCard({
          id: 'b',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
          planned_reminder_date: '2026-05-26',
        }),
      ];
      const result = tierCards(cards, NOW);
      // Both should be in tier1 (reminder-due section)
      const tier1Ids = result.tier1.map((c) => c.id);
      expect(tier1Ids).toContain('a');
      expect(tier1Ids).toContain('b');
    });

    it('excludes future-dated reminders', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
          planned_reminder_date: '2026-05-28',
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.tier1).toHaveLength(0);
    });

    it('excludes null reminders', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
          planned_reminder_date: null,
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.tier1).toHaveLength(0);
    });

    it('sorts by planned_reminder_date asc', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
          planned_reminder_date: '2026-05-27',
        }),
        makeCard({
          id: 'b',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
          planned_reminder_date: '2026-05-25',
        }),
      ];
      const result = tierCards(cards, NOW);
      const reminderDue = result.tier1.filter((c) => c.state === 'planned');
      expect(reminderDue.map((c) => c.id)).toEqual(['b', 'a']);
    });
  });

  describe('Tier 1 ordering', () => {
    it('Act Soon cards appear before reminder-due PLANNED cards', () => {
      const cards = [
        makeCard({
          id: 'planned',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
          planned_reminder_date: '2026-05-20',
        }),
        makeCard({
          id: 'act-soon',
          state: 'decide',
          severity: 'urgent',
          severity_confirmed: true,
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.tier1.map((c) => c.id)).toEqual(['act-soon', 'planned']);
    });
  });

  describe('Tier 2: Overdue MONITOR', () => {
    it('includes monitoring cards where next_check_at < now', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'monitoring',
          severity: 'monitor',
          severity_confirmed: true,
          next_check_at: '2026-05-26T00:00:00Z',
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.tier2.map((c) => c.id)).toContain('a');
    });

    it('excludes fresh (not overdue) monitoring cards', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'monitoring',
          severity: 'monitor',
          severity_confirmed: true,
          next_check_at: '2026-05-28T00:00:00Z',
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.tier2).toHaveLength(0);
    });

    it('sorts by staleness desc (most overdue first)', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'monitoring',
          severity: 'monitor',
          severity_confirmed: true,
          next_check_at: '2026-05-25T00:00:00Z',
        }),
        makeCard({
          id: 'b',
          state: 'monitoring',
          severity: 'monitor',
          severity_confirmed: true,
          next_check_at: '2026-05-20T00:00:00Z',
        }),
      ];
      const result = tierCards(cards, NOW);
      const overdue = result.tier2.filter((c) => c.state === 'monitoring');
      expect(overdue.map((c) => c.id)).toEqual(['b', 'a']);
    });
  });

  describe('Tier 2: TRIAGE_PENDING', () => {
    it('includes capturing + triaging cards', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'capturing',
          severity: null,
          severity_confirmed: false,
        }),
        makeCard({
          id: 'b',
          state: 'triaging',
          severity: null,
          severity_confirmed: false,
        }),
      ];
      const result = tierCards(cards, NOW);
      const triagePending = result.tier2.filter(
        (c) => c.state === 'capturing' || c.state === 'triaging'
      );
      expect(triagePending).toHaveLength(2);
    });

    it('sorts by created_at desc (newest first)', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'capturing',
          severity: null,
          severity_confirmed: false,
          created_at: '2026-05-01T00:00:00Z',
        }),
        makeCard({
          id: 'b',
          state: 'capturing',
          severity: null,
          severity_confirmed: false,
          created_at: '2026-05-05T00:00:00Z',
        }),
      ];
      const result = tierCards(cards, NOW);
      const triagePending = result.tier2.filter(
        (c) => c.state === 'capturing' || c.state === 'triaging'
      );
      expect(triagePending.map((c) => c.id)).toEqual(['b', 'a']);
    });
  });

  describe('Tier 2 ordering', () => {
    it('overdue MONITOR before TRIAGE_PENDING', () => {
      const cards = [
        makeCard({
          id: 'triage',
          state: 'capturing',
          severity: null,
          severity_confirmed: false,
        }),
        makeCard({
          id: 'monitor',
          state: 'monitoring',
          severity: 'monitor',
          severity_confirmed: true,
          next_check_at: '2026-05-20T00:00:00Z',
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.tier2.map((c) => c.id)).toEqual(['monitor', 'triage']);
    });
  });

  describe('PLANNED tab', () => {
    it('includes all planned cards', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
          chosen_path: 'diy',
        }),
        makeCard({
          id: 'b',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
          chosen_path: 'contractor',
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.planned).toHaveLength(2);
    });

    it('groups DIY before Contractor', () => {
      const cards = [
        makeCard({
          id: 'c',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
          chosen_path: 'contractor',
        }),
        makeCard({
          id: 'd',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
          chosen_path: 'diy',
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.planned.map((c) => c.id)).toEqual(['d', 'c']);
    });

    it('sorts by planned_reminder_date asc nulls last, then updated_at desc', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
          chosen_path: 'diy',
          planned_reminder_date: null,
          updated_at: '2026-05-01T00:00:00Z',
        }),
        makeCard({
          id: 'b',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
          chosen_path: 'diy',
          planned_reminder_date: '2026-06-01',
          updated_at: '2026-05-02T00:00:00Z',
        }),
        makeCard({
          id: 'c',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
          chosen_path: 'diy',
          planned_reminder_date: null,
          updated_at: '2026-05-05T00:00:00Z',
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.planned.map((c) => c.id)).toEqual(['b', 'c', 'a']);
    });
  });

  describe('All tab', () => {
    it('excludes closed and dismissed', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'closed',
          severity: null,
          severity_confirmed: false,
        }),
        makeCard({
          id: 'b',
          state: 'dismissed',
          severity: null,
          severity_confirmed: false,
        }),
        makeCard({
          id: 'c',
          state: 'decide',
          severity: 'soon',
          severity_confirmed: true,
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.all).toHaveLength(1);
      expect(result.all[0]!.id).toBe('c');
    });

    it('includes all non-closed/dismissed states', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'decide',
          severity: 'soon',
          severity_confirmed: true,
        }),
        makeCard({
          id: 'b',
          state: 'monitoring',
          severity: 'monitor',
          severity_confirmed: true,
          next_check_at: '2026-06-01T00:00:00Z',
        }),
        makeCard({
          id: 'c',
          state: 'planned',
          severity: null,
          severity_confirmed: false,
        }),
        makeCard({
          id: 'd',
          state: 'capturing',
          severity: null,
          severity_confirmed: false,
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.all).toHaveLength(4);
    });
  });

  describe('overdueMonitor', () => {
    it('returns only monitoring cards where next_check_at < now', () => {
      const cards = [
        makeCard({
          id: 'overdue',
          state: 'monitoring',
          severity: 'monitor',
          severity_confirmed: true,
          next_check_at: '2026-05-20T00:00:00Z',
        }),
        makeCard({
          id: 'fresh',
          state: 'monitoring',
          severity: 'monitor',
          severity_confirmed: true,
          next_check_at: '2026-06-01T00:00:00Z',
        }),
        makeCard({
          id: 'other',
          state: 'decide',
          severity: 'soon',
          severity_confirmed: true,
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.overdueMonitor).toHaveLength(1);
      expect(result.overdueMonitor[0]!.id).toBe('overdue');
    });
  });

  describe('Edge cases', () => {
    it('card with null severity is excluded from Tier 1 Act Soon', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'decide',
          severity: null,
          severity_confirmed: true,
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.tier1).toHaveLength(0);
    });

    it('card with severity cosmetic in decide state is excluded from Tier 1', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'decide',
          severity: 'cosmetic',
          severity_confirmed: true,
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.tier1).toHaveLength(0);
      expect(result.all).toHaveLength(1);
    });

    it('monitoring card with null next_check_at is not treated as overdue', () => {
      const cards = [
        makeCard({
          id: 'a',
          state: 'monitoring',
          severity: 'monitor',
          severity_confirmed: true,
          next_check_at: null,
        }),
      ];
      const result = tierCards(cards, NOW);
      expect(result.tier2).toHaveLength(0);
      expect(result.overdueMonitor).toHaveLength(0);
    });
  });
});
