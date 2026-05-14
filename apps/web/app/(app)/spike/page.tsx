// What: /spike landing page (operator-only). Server component that
//       renders a short orientation paragraph, two internal links to the
//       camera + comparison sub-pages, and a reminder block about the
//       `RESULTS-PENDING` gate on `.gstack/pwa-spike-result.md` (D1, D7).
// Why:  The PWA spike (PR #11) needs an obvious entry point for the
//       operator to walk on real iPhone Safari. The landing page exists
//       so the operator types one URL and sees what's here + what gate
//       to flip before merging.
// Does NOT: Link from `/home` or any other production surface — D1
//           forbids any production link. Reachable only by typing the
//           URL after sign-in.

import Link from 'next/link';

// Page reads no request state itself, but parent layout pulls
// `supabase.auth.getUser()` on every request. Mark dynamic to keep the
// shared auth-protected shell out of Next 16's static path.
export const dynamic = 'force-dynamic';

/** Operator-only landing for the `/spike/*` validation surfaces. */
export default function SpikeLandingPage() {
  return (
    <section className="mx-auto w-full max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary-inverse)]">
          PWA spike
        </h1>
        <p className="text-sm text-[var(--color-text-secondary-inverse)]">
          Three pages under <code>/spike/*</code> test iOS Safari camera +
          Storage + sync zoom + bounce mode. After exercising each on a real
          iPhone, fill <code>.gstack/pwa-spike-result.md</code> and flip{' '}
          <code>RESULTS-PENDING: yes → no</code> before merging the PR.
        </p>
      </header>

      <nav aria-label="Spike sub-pages" className="space-y-3">
        <Link
          href="/spike/camera"
          className="block rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-background-raised)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary-inverse)] hover:bg-[var(--color-surface-raised)]"
        >
          → /spike/camera — dual-path camera capture + Storage upload
        </Link>
        <Link
          href="/spike/comparison"
          className="block rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-background-raised)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary-inverse)] hover:bg-[var(--color-surface-raised)]"
        >
          → /spike/comparison — sync zoom + bounce mode (1200 / 750 / 400 ms)
        </Link>
      </nav>

      <aside
        role="note"
        className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-background-raised)] p-4 text-xs text-[var(--color-text-secondary-inverse)]"
      >
        <strong className="text-[var(--color-text-primary-inverse)]">
          Result-doc gate:
        </strong>{' '}
        <code>.gstack/pwa-spike-result.md</code> must show{' '}
        <code>RESULTS-PENDING: no</code> before merge. Phase 6 audit refuses to
        pass until then.
      </aside>
    </section>
  );
}
