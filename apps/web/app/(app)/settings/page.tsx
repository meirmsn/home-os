// What: Settings page — usage bar + BYOK key input. Server-rendered
//       usage data (reads usage_counters via user-context Supabase
//       client), client-interactive BYOK section.
// Why:  Spec D5 — surfaces the hidden 5/wk session cap with a clear
//       progress bar and lets power users add their own API key.
// Does NOT: Show profile editing, notification preferences, or theme
//           toggle — those are out of scope for v0.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { UsageBar } from './_components/UsageBar';
import { ByokKeyInput } from './_components/ByokKeyInput';

export const dynamic = 'force-dynamic';

/**
 * Compute the current Monday's date string (YYYY-MM-DD) in UTC.
 */
function currentMondayStr(): string {
  const now = new Date();
  const day = now.getUTCDay();
  // Monday is day 1; shift so Monday=0
  const diff = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff)
  );
  return monday.toISOString().slice(0, 10);
}

/**
 *
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Load usage data for the current week.
  const { data: usageRow } = await supabase
    .from('usage_counters')
    .select('triage_session_count, week_start')
    .eq('user_id', user.id)
    .maybeSingle();

  const monday = currentMondayStr();
  let count = 0;
  if (usageRow && usageRow.week_start === monday) {
    count = usageRow.triage_session_count ?? 0;
  }

  // Load byok_used flag from the users table.
  const { data: userRow } = await supabase
    .from('users')
    .select('byok_used')
    .eq('id', user.id)
    .maybeSingle();

  const byokUsed = userRow?.byok_used ?? false;

  return (
    <div className="mx-auto w-full max-w-lg space-y-8">
      <h1 className="text-lg font-semibold text-[var(--color-text-primary-inverse)]">
        Settings
      </h1>
      <UsageBar count={count} />
      <ByokKeyInput byokUsed={byokUsed} />
    </div>
  );
}
