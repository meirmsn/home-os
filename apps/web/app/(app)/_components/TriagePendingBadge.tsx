import { createClient } from '@/lib/supabase/server';

/**
 *
 */
export async function TriagePendingBadge() {
  const supabase = await createClient();
  const { count } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .in('state', ['capturing', 'triaging']);

  const n = count ?? 0;
  if (n === 0) return null;

  return (
    <span
      data-testid="triage-pending-badge"
      className="text-xs text-[var(--color-text-secondary-inverse)]"
    >
      {n} {n === 1 ? 'capture' : 'captures'} queued for triage
    </span>
  );
}
