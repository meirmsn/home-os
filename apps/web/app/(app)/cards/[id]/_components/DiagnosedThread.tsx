// What: Server component that replaces <AnswerThread /> on
//       /cards/[id] once the card's `severity_confirmed=true`.
//       Renders the confirmed severity chip + final diagnosis text +
//       AI-proposed monitoring cadence ("Check back in N days") + a
//       closed-by-default `<details>` "How we diagnosed this"
//       collapsible listing every prior turn via <ConversationRow />.
// Why:  spec § Screens — the confirmed-state body is the durable
//       record of the AI's reasoning. The native `<details>` element
//       gives the user JS-free toggle behavior (works under hard
//       reloads, no client component needed). Render-by-tool-name
//       lives in <ConversationRow />.
// Does NOT: Allow the user to change the cadence (row #5 / monitor-
//           beta owns that). Doesn't allow the user to override the
//           contractor_tag (row #2 / decide-state owns that).
//           Doesn't fire PostHog events — the render itself is not a
//           tracked event.

import { ConversationRow, type ConversationRowData } from './ConversationRow';

type Severity = 'cosmetic' | 'monitor' | 'soon' | 'urgent';

/** Rows from triage_conversations relevant to the collapsible
 *  thread. */
export type DiagnosedThreadInputRow = ConversationRowData & {
  created_at: string;
};

/** Color treatment for the confirmed severity chip — mirrors the
 *  same four-tier palette `<SeverityChip>` uses in page.tsx for the
 *  provisional case. */
function severityChipClass(severity: Severity): {
  bg: string;
  text: string;
  label: string;
} {
  switch (severity) {
    case 'cosmetic':
      return {
        bg: 'bg-[var(--color-note)]/20',
        text: 'text-[var(--color-note)]',
        label: 'cosmetic',
      };
    case 'monitor':
      return {
        bg: 'bg-[var(--color-monitor)]/20',
        text: 'text-[var(--color-monitor)]',
        label: 'monitor',
      };
    case 'soon':
      return {
        bg: 'bg-[var(--color-watch)]/20',
        text: 'text-[var(--color-watch)]',
        label: 'soon',
      };
    case 'urgent':
      return {
        bg: 'bg-[var(--color-act-soon)]/20',
        text: 'text-[var(--color-act-soon)]',
        label: 'urgent',
      };
  }
}

/**
 * Render the confirmed-state body for a `diagnosed` +
 * `severity_confirmed=true` card.
 *
 * `rows` is the full triage_conversations thread (oldest-first); the
 * "How we diagnosed this" `<details>` element lists every prior turn
 * via <ConversationRow />.
 */
export function DiagnosedThread({
  severity,
  diagnosis,
  monitoringCadenceDays,
  rows,
}: {
  severity: Severity;
  diagnosis: string | null;
  monitoringCadenceDays: number | null;
  rows: DiagnosedThreadInputRow[];
}) {
  const { bg, text, label } = severityChipClass(severity);

  return (
    <section
      aria-label="Confirmed diagnosis"
      className="space-y-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5"
      data-testid="diagnosed-thread"
    >
      <span
        data-testid="severity-chip-confirmed"
        data-severity={severity}
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider ${bg} ${text}`}
      >
        {label}
      </span>

      {diagnosis && (
        <p
          data-testid="final-diagnosis"
          className="whitespace-pre-line text-sm text-[var(--color-text-primary-inverse)]"
        >
          {diagnosis}
        </p>
      )}

      {monitoringCadenceDays !== null && (
        <p
          data-testid="monitoring-cadence"
          className="text-sm text-[var(--color-text-secondary-inverse)]"
        >
          Check back in {monitoringCadenceDays}{' '}
          {monitoringCadenceDays === 1 ? 'day' : 'days'}{' '}
          <span className="text-xs">(AI-proposed)</span>
        </p>
      )}

      <details
        data-testid="how-we-diagnosed"
        className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-input)]/30 p-3"
      >
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary-inverse)]">
          How we diagnosed this
        </summary>
        <div className="mt-3 space-y-2" data-testid="how-we-diagnosed-rows">
          {rows.map((row) => (
            <ConversationRow
              key={`${row.role}-${row.round}-${row.created_at}`}
              row={row}
            />
          ))}
        </div>
      </details>
    </section>
  );
}
