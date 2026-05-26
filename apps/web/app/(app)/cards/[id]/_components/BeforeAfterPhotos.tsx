// What: Server component rendering the before/after photo pair for closed
//       cards. Earliest touchpoint_type='primary' (before) and latest
//       touchpoint_type='close' (after). Side by side on desktop, stacked
//       on mobile.
// Why:  spec § D7 — automatic before/after record. The timestamped pair
//       is the durable evidence of the repair.
// Does NOT: Implement sync zoom, bounce mode, or slider — those are PR #6
//           (photo-comparison). This is a static side-by-side pair only.

/** UTC-ISO → human-readable short date (e.g. "May 15"). */
function shortDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export type PhotoSlot = {
  url: string;
  date: string;
};

export type BeforeAfterPhotosProps = {
  before: PhotoSlot | null;
  after: PhotoSlot | null;
};

/** Before/after photo pair — see file header. */
export function BeforeAfterPhotos(props: BeforeAfterPhotosProps) {
  return (
    <div
      data-testid="before-after-photos"
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
    >
      {/* Before slot */}
      <div
        data-testid="before-slot"
        className="overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]"
      >
        {props.before ? (
          <>
            <img
              src={props.before.url}
              alt="Before photo"
              className="h-auto w-full"
            />
            <p className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
              Before &middot; {shortDate(props.before.date)}
            </p>
          </>
        ) : (
          <p
            data-testid="before-placeholder"
            className="px-5 py-10 text-center text-sm text-[var(--color-text-secondary)]"
          >
            No capture photo
          </p>
        )}
      </div>

      {/* After slot */}
      <div
        data-testid="after-slot"
        className="overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]"
      >
        {props.after ? (
          <>
            <img
              src={props.after.url}
              alt="After photo"
              className="h-auto w-full"
            />
            <p className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
              After &middot; {shortDate(props.after.date)}
            </p>
          </>
        ) : (
          <p
            data-testid="after-placeholder"
            className="px-5 py-10 text-center text-sm text-[var(--color-text-secondary)]"
          >
            No finished photo
          </p>
        )}
      </div>
    </div>
  );
}
