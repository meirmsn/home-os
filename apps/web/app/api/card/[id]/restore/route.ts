// What: POST /api/card/[id]/restore route handler. Flips a card's state
//       from 'dismissed' back to 'capturing' so it re-enters the active
//       lifecycle from the homeowner's perspective.
// Why:  DISMISS is a first-class reversible state (ceo-review D3). The
//       /(app)/dismissed list calls this endpoint from its RestoreStrip
//       inline-confirm. Defense-in-depth on top of the RLS user_id
//       predicate: we additionally `.eq('state', 'dismissed')` so the
//       UPDATE races cleanly with concurrent edits (a card moved out of
//       dismissed by another tab won't get flipped twice).
// Does NOT: Consume a card-cap slot (D8 — no new row inserted) or a
//           triage-session quota (D8 — none exist in v0; the wording
//           lives in row #11 when that quota ships). Does not fire a
//           PostHog event (D9 limits the capture-flow event set to
//           three; restore-event coverage will land if monitor-beta /
//           decide-state need it).

import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/card/[id]/restore — see file header. */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  }

  // RLS already restricts visibility to the caller's own rows; the .eq on
  // state makes the UPDATE idempotent + race-safe.
  const { data: updated, error: updateError } = await supabase
    .from('cards')
    .update({ state: 'capturing' })
    .eq('id', id)
    .eq('state', 'dismissed')
    .select('id')
    .maybeSingle();

  if (updateError) {
    Sentry.captureException(updateError, {
      tags: { route: 'POST /api/card/[id]/restore', stage: 'update' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  if (updated) {
    return NextResponse.json({ card_id: id }, { status: 200 });
  }

  // No row matched the (id, state='dismissed') predicate. Distinguish 404
  // (card doesn't exist / isn't visible via RLS) from 409 (exists but is
  // in a non-dismissed state) with a second narrow read.
  const { data: existing, error: lookupError } = await supabase
    .from('cards')
    .select('id, state')
    .eq('id', id)
    .maybeSingle();

  if (lookupError) {
    Sentry.captureException(lookupError, {
      tags: { route: 'POST /api/card/[id]/restore', stage: 'lookup' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
}
