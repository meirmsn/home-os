// What: Server component for the CLOSED state body on /cards/[id].
//       Renders: severity chip + calm-green "Closed" chip + closed_at date
//       + before/after photo pair + spend log + "How we diagnosed this"
//       collapsible.
// Why:  spec § D6 — replaces the current one-line stub. The before/after
//       pair is the hero of the closed state.
// Does NOT: Implement re-open from closed (CLOSED is terminal in v0).

import { BeforeAfterPhotos, type PhotoSlot } from './BeforeAfterPhotos';
import { ComparePhotosLink } from './ComparePhotosLink';
import { ConversationRow, type ConversationRowData } from './ConversationRow';
import { severityChipClasses, type Severity } from './_severity-chip';

export type ClosedViewInputRow = ConversationRowData & {
  created_at: string;
};

export type ClosedViewProps = {
  cardId: string;
  severity: Severity | null;
  closedAt: string | null;
  diagnosis: string | null;
  chosenPath: 'diy' | 'contractor' | 'monitor' | null;
  actualSpendCents: number | null;
  spendNotes: string | null;
  before: PhotoSlot | null;
  after: PhotoSlot | null;
  thread: ClosedViewInputRow[];
  /** Distinct photo-bearing touchpoint count — gates the "Compare photos"
   *  link (spec § Entry points). Computed in page.tsx. */
  photoTouchpointCount: number;
};

/** UTC-ISO → human-readable date (e.g. "Mon, May 26"). */
function humanDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Format cents as $XX.XX (Gotcha #6 — always shows two decimal places). */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Closed-state body — see file header. */
export function ClosedView(props: ClosedViewProps) {
  const chip = props.severity ? severityChipClasses(props.severity) : null;

  return (
    <section data-testid="closed-view" className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {chip && (
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${chip.bg} ${chip.text}`}
              data-testid="closed-severity-chip"
            >
              {chip.label}
            </span>
          )}
          <span
            data-testid="closed-chip"
            className="inline-block rounded-full bg-[var(--color-note)]/20 px-3 py-1 text-xs font-medium text-[var(--color-note)]"
          >
            closed
          </span>
        </div>
        {props.closedAt && (
          <p
            data-testid="closed-date"
            className="text-sm text-[var(--color-text-secondary)]"
          >
            Closed on {humanDate(props.closedAt)}
          </p>
        )}
        {props.diagnosis && (
          <p className="text-sm text-[var(--color-text-secondary)]">
            {props.diagnosis}
          </p>
        )}
      </header>

      <BeforeAfterPhotos before={props.before} after={props.after} />

      <ComparePhotosLink
        cardId={props.cardId}
        photoTouchpointCount={props.photoTouchpointCount}
      />

      {props.actualSpendCents !== null && (
        <div
          data-testid="closed-spend"
          className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-4"
        >
          <p className="text-sm font-medium text-[var(--color-text-primary-inverse)]">
            You spent: {formatCents(props.actualSpendCents)}
          </p>
          {props.spendNotes && (
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {props.spendNotes}
            </p>
          )}
        </div>
      )}

      {props.thread.length > 0 && (
        <details className="mt-2" data-testid="closed-how-we-diagnosed">
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
