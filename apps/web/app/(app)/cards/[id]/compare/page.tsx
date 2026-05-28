// What: `/(app)/cards/[id]/compare` server route. Re-validates the card under
//       RLS, fetches its `card_photos` rows, groups them into touchpoints,
//       batch-signs every storage path via createSignedUrls (plural), gates on
//       >= 2 photo-bearing touchpoints, and renders the full-bleed
//       <PhotoComparison>.
// Why:  spec § D2/D5 — a dedicated sub-route keeps signed-URL generation
//       server-side + RLS-respecting and gives a real back-button target. The
//       route is the first plural-signing call site in the codebase.
// Does NOT: Own any interaction state (zoom / bounce / pickers) — that lives in
//           the client <PhotoComparison>. Doesn't cache signed URLs (10-min TTL).

import { notFound, redirect } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { groupTouchpoints, type PhotoRow } from './_lib/group-touchpoints';
import { PhotoComparison } from '../_components/PhotoComparison';

export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 minutes

/** Server-rendered compare route — see file header. */
export default async function ComparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/cards/${encodeURIComponent(id)}/compare`);
  }

  // Re-validate the card under RLS so a hand-typed /compare URL on a foreign /
  // missing card 404s the same way the detail page does.
  const { data: cardRow, error: cardError } = await supabase
    .from('cards')
    .select('id, title, initial_description, state')
    .eq('id', id)
    .maybeSingle();

  if (cardError) {
    Sentry.captureException(new Error('cards SELECT errored on compare page'), {
      tags: { surface: 'cards/[id]/compare', stage: 'card_select' },
      extra: {
        card_id: id,
        user_id: user.id,
        error_message: cardError.message,
        error_code: cardError.code,
        error_details: cardError.details,
      },
    });
    notFound();
  }
  if (!cardRow) notFound();

  const { data: photoRows } = await supabase
    .from('card_photos')
    .select('touchpoint_id, touchpoint_type, slot, storage_path, created_at')
    .eq('card_id', id)
    .order('created_at', { ascending: true });

  const rows = (photoRows ?? []) as PhotoRow[];

  // Batch-sign every distinct storage path in one call (plural API). A
  // per-path `error` on an entry means that photo couldn't be signed — we
  // simply omit it from the map, and groupTouchpoints treats it as a missing
  // slot rather than throwing (spec G2).
  const paths = [...new Set(rows.map((r) => r.storage_path))];
  const signedUrls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from('card-photos')
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    for (const entry of signed ?? []) {
      if (entry.error === null && entry.path && entry.signedUrl) {
        signedUrls.set(entry.path, entry.signedUrl);
      }
    }
  }

  const touchpoints = groupTouchpoints(rows, signedUrls);

  // Defense-in-depth gate (spec G6): the entry link is already gated on
  // >= 2, but a stale link / hand-typed URL on a < 2 card redirects back.
  if (touchpoints.length < 2) {
    redirect(`/cards/${id}`);
  }

  const issueName =
    cardRow.title?.trim() ||
    (cardRow.initial_description?.trim().slice(0, 80) ?? 'Untitled issue');

  return (
    <PhotoComparison
      cardId={id}
      issueName={issueName}
      cardState={cardRow.state}
      touchpoints={touchpoints}
    />
  );
}
