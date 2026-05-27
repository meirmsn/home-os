export type CardState =
  | 'capturing'
  | 'triaging'
  | 'diagnosed'
  | 'decide'
  | 'planned'
  | 'monitoring'
  | 'closed'
  | 'dismissed';

export type Severity = 'cosmetic' | 'monitor' | 'soon' | 'urgent';

export type DashboardCardRow = {
  id: string;
  state: CardState;
  title: string | null;
  initial_description: string | null;
  severity: Severity | null;
  severity_confirmed: boolean;
  system_tag: string | null;
  room_tag: string | null;
  chosen_path: 'diy' | 'contractor' | 'monitor' | null;
  planned_reminder_date: string | null;
  next_check_at: string | null;
  monitoring_cadence_days: number | null;
  diagnosis: string | null;
  created_at: string;
  updated_at: string;
};

export type TieredCards = {
  tier1: DashboardCardRow[];
  tier2: DashboardCardRow[];
  planned: DashboardCardRow[];
  all: DashboardCardRow[];
  overdueMonitor: DashboardCardRow[];
};

/** UTC-slice a timestamp to YYYY-MM-DD for calendar-date comparison.
 *  Same pattern as card detail page — never compare Date objects. */
export function todayIso(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

const SEVERITY_ORDER: Record<string, number> = {
  urgent: 0,
  soon: 1,
  monitor: 2,
  cosmetic: 3,
};

const STATE_PRIORITY: Record<string, number> = {
  decide: 0,
  diagnosed: 1,
  monitoring: 2,
  planned: 3,
  capturing: 4,
  triaging: 5,
};

/**
 *
 */
export function tierCards(cards: DashboardCardRow[], now: number): TieredCards {
  const today = todayIso(now);

  // Tier 1: Act Soon
  const tier1ActSoon = cards
    .filter(
      (c) =>
        (c.state === 'decide' || c.state === 'diagnosed') &&
        c.severity_confirmed === true &&
        c.severity !== null &&
        (c.severity === 'urgent' || c.severity === 'soon')
    )
    .sort((a, b) => {
      const sa = SEVERITY_ORDER[a.severity!] ?? 99;
      const sb = SEVERITY_ORDER[b.severity!] ?? 99;
      if (sa !== sb) return sa - sb;
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

  // Tier 1: Reminder-due PLANNED
  const tier1ReminderDue = cards
    .filter(
      (c) =>
        c.state === 'planned' &&
        c.planned_reminder_date !== null &&
        c.planned_reminder_date <= today
    )
    .sort((a, b) => {
      return a.planned_reminder_date!.localeCompare(b.planned_reminder_date!);
    });

  const tier1 = [...tier1ActSoon, ...tier1ReminderDue];

  // Tier 2: Overdue MONITOR
  const overdueMonitor = cards
    .filter(
      (c) =>
        c.state === 'monitoring' &&
        c.next_check_at !== null &&
        new Date(c.next_check_at).getTime() < now
    )
    .sort((a, b) => {
      const stalenessA = now - new Date(a.next_check_at!).getTime();
      const stalenessB = now - new Date(b.next_check_at!).getTime();
      return stalenessB - stalenessA;
    });

  // Tier 2: TRIAGE_PENDING
  const triagePending = cards
    .filter((c) => c.state === 'capturing' || c.state === 'triaging')
    .sort((a, b) => {
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

  const tier2 = [...overdueMonitor, ...triagePending];

  // PLANNED tab: all planned cards, DIY before Contractor
  const planned = cards
    .filter((c) => c.state === 'planned')
    .sort((a, b) => {
      const pathOrder = (p: string | null) =>
        p === 'diy' ? 0 : p === 'contractor' ? 1 : 2;
      const pa = pathOrder(a.chosen_path);
      const pb = pathOrder(b.chosen_path);
      if (pa !== pb) return pa - pb;
      // Within group: planned_reminder_date asc nulls last
      const ra = a.planned_reminder_date;
      const rb = b.planned_reminder_date;
      if (ra !== null && rb !== null) return ra.localeCompare(rb);
      if (ra !== null && rb === null) return -1;
      if (ra === null && rb !== null) return 1;
      // Both null: updated_at desc
      return (
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    });

  // All tab: exclude closed and dismissed
  const all = cards
    .filter((c) => c.state !== 'closed' && c.state !== 'dismissed')
    .sort((a, b) => {
      const pa = STATE_PRIORITY[a.state] ?? 99;
      const pb = STATE_PRIORITY[b.state] ?? 99;
      if (pa !== pb) return pa - pb;
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

  return { tier1, tier2, planned, all, overdueMonitor };
}
