import { redirect } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { tierCards, todayIso, type DashboardCardRow } from './_lib/tier-cards';
import { EmptyState } from './_components/EmptyState';
import { DashboardShell } from './_components/DashboardShell';

export const dynamic = 'force-dynamic';

/**
 *
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Total card count for first-time empty detection
  const { count: totalCount } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true });

  if ((totalCount ?? 0) === 0) {
    return <EmptyState variant="first-time" />;
  }

  // Fetch all active cards
  const { data: cardRows, error: cardError } = await supabase
    .from('cards')
    .select(
      'id, state, title, initial_description, severity, severity_confirmed, system_tag, room_tag, chosen_path, planned_reminder_date, next_check_at, monitoring_cadence_days, diagnosis, created_at, updated_at'
    )
    .not('state', 'in', '(closed,dismissed)');

  if (cardError) {
    Sentry.captureException(new Error('cards SELECT errored on home page'), {
      tags: { surface: 'home', stage: 'cards_select' },
      extra: {
        user_id: user.id,
        error_message: cardError.message,
        error_code: cardError.code,
      },
    });
  }

  const cards = (cardRows ?? []) as DashboardCardRow[];
  const now = Date.now();
  const tiered = tierCards(cards, now);

  // Fetch photos for cards — batch query for latest primary/wide photo per card
  const photoMap: Record<string, string> = {};
  const cardIds = cards.map((c) => c.id);
  if (cardIds.length > 0) {
    const { data: photoRows, error: photoError } = await supabase
      .from('card_photos')
      .select('card_id, storage_path')
      .in('card_id', cardIds)
      .eq('touchpoint_type', 'primary')
      .eq('slot', 'wide')
      .order('created_at', { ascending: false });

    if (photoError) {
      Sentry.captureException(
        new Error('card_photos SELECT errored on home page'),
        {
          tags: { surface: 'home', stage: 'card_photos' },
          extra: { user_id: user.id },
        }
      );
    }

    // Take first photo per card (already ordered desc)
    const seen = new Set<string>();
    for (const row of photoRows ?? []) {
      if (seen.has(row.card_id)) continue;
      seen.add(row.card_id);
      if (row.storage_path) {
        const { data: signed } = await supabase.storage
          .from('card-photos')
          .createSignedUrl(row.storage_path, 60 * 10);
        if (signed?.signedUrl) {
          photoMap[row.card_id] = signed.signedUrl;
        }
      }
    }
  }

  // Derive computed values
  const today = todayIso(now);
  const hasReminderDue = tiered.planned.some(
    (c) => c.planned_reminder_date !== null && c.planned_reminder_date <= today
  );

  const triagePendingCount = cards.filter(
    (c) => c.state === 'capturing' || c.state === 'triaging'
  ).length;

  // Build walkthrough cards for overdue monitors
  const walkthroughCards = tiered.overdueMonitor.map((c) => ({
    id: c.id,
    title: c.title || c.initial_description,
    severity: c.severity,
    system_tag: c.system_tag,
    photoUrl: photoMap[c.id] ?? null,
    referencePhotos: [] as { slot: string; url: string }[],
    cadenceDays: c.monitoring_cadence_days ?? 30,
  }));

  return (
    <DashboardShell
      tier1={tiered.tier1}
      tier2={tiered.tier2}
      planned={tiered.planned}
      all={tiered.all}
      overdueMonitor={tiered.overdueMonitor}
      photoMap={photoMap}
      hasReminderDue={hasReminderDue}
      walkthroughCards={walkthroughCards}
      totalCards={cards.length}
      tier1Count={tiered.tier1.length}
      tier2Count={tiered.tier2.length}
      plannedCount={tiered.planned.length}
      triagePendingCount={triagePendingCount}
    />
  );
}
