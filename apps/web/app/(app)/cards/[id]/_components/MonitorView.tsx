// What: Server component for the MONITORING state body on /cards/[id].
//       Renders: severity chip + "Monitoring" chip + cadence display +
//       overdue indicator + check-in timeline + check-in form + cadence
//       editor + "Change path" action + "How we diagnosed this" collapsible.
// Why:  spec § D4 — replaces the one-line monitoring stub. Follows the
//       PlannedView/ClosedView server component composition pattern.
// Does NOT: Fetch data — receives all props from page.tsx.

import { severityChipClasses, type Severity } from './_severity-chip';
import { CheckInTimeline, type CheckInEntry } from './CheckInTimeline';
import { CheckInForm, type CheckInFormProps } from './CheckInForm';
import { CadenceEditor } from './CadenceEditor';
import { MonitorViewOpenedCapture } from './MonitorViewOpenedCapture';
import { ChangePathButton } from './ChangePathButton';
import { ConversationRow, type ConversationRowData } from './ConversationRow';

export type MonitorViewInputRow = ConversationRowData & {
  created_at: string;
};

export type MonitorViewProps = {
  cardId: string;
  severity: Severity | null;
  diagnosis: string | null;
  cadenceDays: number;
  isOverdue: boolean;
  nextCheckAt: string | null;
  daysSinceLastCheckin: number | null;
  checkIns: CheckInEntry[];
  referencePhotos: CheckInFormProps['referencePhotos'];
  thread: MonitorViewInputRow[];
};

/** MonitorView — see file header. */
export function MonitorView(props: MonitorViewProps) {
  const chip = props.severity ? severityChipClasses(props.severity) : null;

  return (
    <section data-testid="monitor-view" className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {chip && (
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${chip.bg} ${chip.text}`}
              data-testid="monitor-severity-chip"
            >
              {chip.label}
            </span>
          )}
          <span
            data-testid="monitoring-chip"
            className="inline-block rounded-full bg-[var(--color-monitor)]/20 px-3 py-1 text-xs font-medium text-[var(--color-monitor)]"
          >
            monitoring
          </span>
        </div>

        {props.isOverdue ? (
          <p
            data-testid="monitor-overdue"
            className="text-sm text-[var(--color-act-soon)]"
          >
            {props.daysSinceLastCheckin !== null
              ? `Overdue — last checked ${props.daysSinceLastCheckin} days ago`
              : 'Overdue — no check-ins yet'}
          </p>
        ) : (
          <p
            data-testid="monitor-cadence-display"
            className="text-sm text-[var(--color-text-secondary)]"
          >
            Check back every {props.cadenceDays} days
          </p>
        )}

        {props.diagnosis && (
          <p className="text-sm text-[var(--color-text-secondary)]">
            {props.diagnosis}
          </p>
        )}
      </header>

      <MonitorViewOpenedCapture
        cardId={props.cardId}
        daysSinceLastCheckin={props.daysSinceLastCheckin}
        isOverdue={props.isOverdue}
      />

      <CheckInTimeline entries={props.checkIns} />

      <CheckInForm
        cardId={props.cardId}
        isOverdue={props.isOverdue}
        referencePhotos={props.referencePhotos}
      />

      <CadenceEditor cardId={props.cardId} cadenceDays={props.cadenceDays} />

      <ChangePathButton cardId={props.cardId} />

      {props.thread.length > 0 && (
        <details className="mt-2" data-testid="monitor-how-we-diagnosed">
          <summary className="cursor-pointer text-sm text-[var(--color-text-secondary)]">
            How we diagnosed this
          </summary>
          <div className="mt-3 space-y-3">
            {props.thread.map((row, i) => (
              <ConversationRow key={i} row={row} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
