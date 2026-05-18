// What: PATCH /api/card/[id]/reminder — user-set reminder date for a
//       planned card. Body { reminder_date: 'YYYY-MM-DD' | null }
//       (null = clear). RLS-enforced direct UPDATE; no SECURITY DEFINER
//       RPC (no atomic invariant beyond the single-row UPDATE).
// Why:  Spec D2. Mirrors the PATCH /estimate posture — data write, not
//       state transition. RLS enforces ownership; an explicit state
//       guard in the .update() WHERE clause enforces "planned-only" so
//       calls against decide/diagnosed/etc 409 instead of silently
//       no-op'ing (spec § Gotchas #4).
// Does NOT: Transition card state. Doesn't fire PostHog (the client
//           component fires planned_reminder_set / _cleared / _edited).
//           Doesn't validate past/future date semantics — D5 allows any
//           valid ISO calendar date.

import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { parseReminderBody } from './_lib/parse-reminder-body';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH /api/card/[id]/reminder — see file header. */
export async function PATCH(
  request: NextRequest,
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
    return NextResponse.json(
      { error: 'validation_failed', field: 'id' },
      { status: 400 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'validation_failed', field: 'body', reason: 'invalid JSON' },
      { status: 400 }
    );
  }

  const parsed = parseReminderBody(rawBody);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        field: parsed.field,
        reason: parsed.reason,
      },
      { status: 400 }
    );
  }

  // RLS restricts visibility to the caller's own rows. The .eq('state',
  // 'planned') makes the UPDATE race-safe + ensures we 409 on cards in
  // any other state (spec § Gotchas #4).
  const { data: updated, error: updateError } = await supabase
    .from('cards')
    .update({ planned_reminder_date: parsed.value.reminder_date })
    .eq('id', id)
    .eq('state', 'planned')
    .select('id, planned_reminder_date')
    .maybeSingle();

  if (updateError) {
    Sentry.captureException(updateError, {
      tags: { route: 'PATCH /api/card/[id]/reminder', stage: 'update' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  if (updated) {
    return NextResponse.json(
      {
        card_id: id,
        planned_reminder_date: updated.planned_reminder_date,
      },
      { status: 200 }
    );
  }

  // 404 vs 409: narrow re-read to disambiguate (matches PR #27's
  // /decide route posture). RLS prevents leaking other users' cards.
  const { data: existing, error: lookupError } = await supabase
    .from('cards')
    .select('id, state')
    .eq('id', id)
    .maybeSingle();

  if (lookupError) {
    Sentry.captureException(lookupError, {
      tags: { route: 'PATCH /api/card/[id]/reminder', stage: 'lookup' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
}
