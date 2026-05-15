// What: `/(app)/capture` server-component shell. Mounts <CaptureForm />
//       when there's no `?cardId=`, or surfaces the non-blocking
//       "update flow ships in the next release" notice when cardId is
//       present (D4). The existing-card picker (rendered above the form
//       when "Update existing" is toggled) is a separate server
//       component lower in the tree.
// Why:  Page itself stays a server component so the static shell ships
//       no client JS beyond the form's own boundary. The cardId notice
//       is a thin server-side fallback for the deferred update path —
//       see D4 in the spec.
// Does NOT: Render the picker inline — the form's "Update existing"
//           toggle is a client-side switch that brings up the picker
//           server-side via Suspense/streaming if needed. v0 ships the
//           picker as a sibling server component only reachable on
//           explicit toggle; the page surface is just the form shell.

import Link from 'next/link';
import { CaptureForm } from './_components/CaptureForm';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ cardId?: string | string[] }>;

/** Capture page server shell — see file header. */
export default async function CapturePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const rawCardId = Array.isArray(params.cardId)
    ? params.cardId[0]
    : params.cardId;
  const cardId = typeof rawCardId === 'string' ? rawCardId : undefined;

  if (cardId) {
    return (
      <main className="mx-auto w-full max-w-2xl space-y-4 px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary-inverse)]">
          Update an existing card
        </h1>
        <p className="text-sm text-[var(--color-text-secondary-inverse)]">
          Updating existing cards ships in the next release — for now, please{' '}
          <Link
            href="/capture"
            className="text-[var(--color-text-accent)] underline-offset-2 hover:underline"
          >
            create a new card
          </Link>
          .
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary-inverse)]">
          Capture an issue
        </h1>
        <p className="text-sm text-[var(--color-text-secondary-inverse)]">
          What&rsquo;s going on? Add a photo if you&rsquo;ve got one.
        </p>
      </header>
      <CaptureForm />
    </main>
  );
}
