// What: Server component rendering the chronological list of past
//       check-ins with photos. Most recent entry expanded; older
//       entries collapsed via <details>.
// Why:  spec § Screens — MonitorView body section 1.
// Does NOT: Fetch data — receives check-in entries as props.

export type CheckInPhoto = {
  slot: string;
  url: string;
};

export type CheckInEntry = {
  id: string;
  createdAt: string;
  notes: string | null;
  photos: CheckInPhoto[];
};

export type CheckInTimelineProps = {
  entries: CheckInEntry[];
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

/** Single check-in entry card (shared between expanded and collapsed). */
function CheckInCard({ entry }: { entry: CheckInEntry }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--color-text-secondary)]">
        {humanDate(entry.createdAt)}
      </p>
      {entry.notes && (
        <p className="whitespace-pre-line text-sm text-[var(--color-text-primary-inverse)]">
          {entry.notes}
        </p>
      )}
      {entry.photos.length > 0 && (
        <div className="flex gap-2">
          {entry.photos.map((photo) => (
            <img
              key={photo.slot}
              src={photo.url}
              alt={`Check-in ${photo.slot}`}
              className="h-20 w-20 rounded border border-[var(--color-border-subtle)] object-cover"
              data-testid={`checkin-photo-${photo.slot}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Check-in timeline — see file header. */
export function CheckInTimeline({ entries }: CheckInTimelineProps) {
  if (entries.length === 0) {
    return (
      <div
        data-testid="checkin-timeline-empty"
        className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5 text-sm text-[var(--color-text-secondary)]"
      >
        No check-ins yet.
      </div>
    );
  }

  return (
    <div data-testid="checkin-timeline" className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
        Check-in history
      </h3>
      {entries.map((entry, i) => {
        // Most recent entry (index 0) is expanded; older entries collapsed.
        if (i === 0) {
          return (
            <div
              key={entry.id}
              data-testid="checkin-entry-expanded"
              className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-4"
            >
              <CheckInCard entry={entry} />
            </div>
          );
        }
        return (
          <details
            key={entry.id}
            data-testid="checkin-entry-collapsed"
            className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]"
          >
            <summary className="cursor-pointer p-4 text-xs text-[var(--color-text-secondary)]">
              {humanDate(entry.createdAt)}
              {entry.notes && (
                <span className="ml-2 text-[var(--color-text-primary-inverse)]">
                  — {entry.notes.slice(0, 60)}
                  {entry.notes.length > 60 ? '…' : ''}
                </span>
              )}
            </summary>
            <div className="px-4 pb-4">
              <CheckInCard entry={entry} />
            </div>
          </details>
        );
      })}
    </div>
  );
}
