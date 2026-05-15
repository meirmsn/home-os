// What: `/(app)/dismissed` server-rendered list of cards in
//       `state = 'dismissed'`, sorted `updated_at desc`. Each row mounts
//       the client-side <RestoreStrip /> that handles the inline confirm
//       + POST to /api/card/[id]/restore (D8).
// Why:  DISMISS is a first-class reversible state (ceo-review D3). This
//       page is the destination surface for restored cards — validates
//       the reversible lifecycle without depending on DECIDE / MONITOR
//       (deferred to rows #4 / #7).
// Does NOT: Provide a "dismiss-from-DECIDE" entry point — that lives on
//           DECIDE in row #4. Tests seed dismissed rows directly via the
//           admin client.

import { createClient } from '@/lib/supabase/server';
import { RestoreStrip } from './_components/RestoreStrip';

export const dynamic = 'force-dynamic';

type DismissedCard = {
  id: string;
  title: string | null;
  system_tag: string | null;
  updated_at: string;
};

/** `/(app)/dismissed` page — see file header. */
export default async function DismissedPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cards')
    .select('id, title, system_tag, updated_at')
    .eq('state', 'dismissed')
    .order('updated_at', { ascending: false });

  const cards = !error && data ? (data as DismissedCard[]) : [];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary-inverse)]">
          Dismissed
        </h1>
        <p className="text-sm text-[var(--color-text-secondary-inverse)]">
          Cards you set aside. Restoring brings them back to your active list.
        </p>
      </header>

      {cards.length === 0 ? (
        <p className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5 text-sm text-[var(--color-text-secondary-inverse)]">
          Nothing dismissed yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {cards.map((card) => (
            <li
              key={card.id}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-4"
              data-card-id={card.id}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-[var(--color-text-primary-inverse)]">
                  {card.title ?? 'Untitled card'}
                </h2>
                {card.system_tag && (
                  <span className="text-xs text-[var(--color-text-secondary-inverse)]">
                    {card.system_tag}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--color-text-secondary-inverse)]">
                Dismissed {formatDate(card.updated_at)}
              </p>
              <div className="pt-3">
                <RestoreStrip cardId={card.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** Compact date label. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
