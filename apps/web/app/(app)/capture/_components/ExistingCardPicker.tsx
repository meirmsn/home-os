// What: Server component that lists the signed-in user's non-`closed`,
//       non-`dismissed` cards (D4). Sorted by `updated_at desc`. Renders
//       a search input above the list when count > 5. Each row links to
//       `/capture?cardId=<id>`. RLS already scopes the SELECT to the
//       caller's rows, so the SQL has no `eq('user_id', …)` clause.
// Why:  D4 mandates the picker UI ship fully exercised in this PR even
//       though the post-pick submit defers to `monitor-beta` (row #7).
// Does NOT: Take a `userId` prop — the SSR client + RLS handles that.
//           Does not include `closed` / `dismissed` rows (those are off-
//           topic for the "update an existing card" intent). Doesn't
//           implement the > 5 search filter client-side; the search input
//           is a static native filter for v0 (full client-side filtering
//           ships when row #7 wires the submit path).

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

/** Card-row shape rendered by the picker. */
type PickerCard = {
  id: string;
  title: string | null;
  system_tag: string | null;
  updated_at: string;
};

/**
 * Server-component renderer of the existing-card picker (D4).
 *
 * Defaults to silent failure if Supabase is unreachable — empty state
 * copy renders instead of throwing into the user's face. Errors are
 * caught and the state collapses to "no eligible cards" so the form
 * remains usable.
 */
export async function ExistingCardPicker() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cards')
    .select('id, title, system_tag, updated_at')
    .not('state', 'in', '(closed,dismissed)')
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error || !data) {
    return <EmptyState />;
  }

  const cards = data as PickerCard[];
  if (cards.length === 0) {
    return <EmptyState />;
  }

  return (
    <section
      aria-label="Existing cards"
      className="space-y-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-4"
    >
      {cards.length > 5 && (
        <input
          type="search"
          name="picker-search"
          placeholder="Search by title…"
          className="block w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-surface-input)] px-3 py-2 text-sm text-[var(--color-text-primary-inverse)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
        />
      )}
      <ul className="divide-y divide-[var(--color-border-subtle)]">
        {cards.map((card) => (
          <li key={card.id}>
            <Link
              href={`/capture?cardId=${card.id}`}
              className="flex items-center justify-between gap-3 py-3 text-sm text-[var(--color-text-primary-inverse)] hover:bg-[var(--color-surface-input)]"
            >
              <span className="flex-1 truncate">
                {card.title ?? 'Untitled card'}
              </span>
              {card.system_tag && (
                <span className="text-xs text-[var(--color-text-secondary-inverse)]">
                  {card.system_tag}
                </span>
              )}
              <span className="text-xs text-[var(--color-text-secondary-inverse)]">
                {formatDate(card.updated_at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Empty state for the picker — no eligible cards. */
function EmptyState() {
  return (
    <section
      aria-label="Existing cards"
      className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-4 text-sm text-[var(--color-text-secondary-inverse)]"
    >
      No active cards yet. Capture a new issue below.
    </section>
  );
}

/** Compact relative-ish date label — ISO short form. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
