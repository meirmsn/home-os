// What: PATCH /api/card/[id]/cadence — adjust monitoring_cadence_days on
//       a monitoring-state card. JSON body { cadence_days: number }.
//       RLS-enforced direct UPDATE; no SECURITY DEFINER RPC (single-row
//       UPDATE, no multi-table atomicity needed).
// Why:  Spec D3. Mirrors the PATCH /reminder posture — data write, not
//       state transition. RLS enforces ownership; an explicit state
//       guard in the .update() WHERE clause enforces "monitoring-only".
// Does NOT: Fire PostHog events — <CadenceEditor /> fires from client.

import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { parseCadenceBody } from './_lib/parse-cadence-body';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH /api/card/[id]/cadence — see file header. */
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
      { error: 'validation_failed', field: 'id', reason: 'invalid UUID' },
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

  const parsed = parseCadenceBody(rawBody);
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

  const cadenceDays = parsed.value.cadence_days;
  const nextCheckAt = new Date(
    Date.now() + cadenceDays * 86400000
  ).toISOString();

  // RLS restricts visibility to the caller's own rows. The .eq('state',
  // 'monitoring') makes the UPDATE race-safe + ensures we 409 on cards in
  // any other state.
  const { data: updated, error: updateError } = await supabase
    .from('cards')
    .update({
      monitoring_cadence_days: cadenceDays,
      next_check_at: nextCheckAt,
    })
    .eq('id', id)
    .eq('state', 'monitoring')
    .select('id, monitoring_cadence_days, next_check_at')
    .maybeSingle();

  if (updateError) {
    Sentry.captureException(updateError, {
      tags: { route: 'PATCH /api/card/[id]/cadence', stage: 'update' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  if (updated) {
    return NextResponse.json(
      {
        card_id: id,
        monitoring_cadence_days: updated.monitoring_cadence_days,
        next_check_at: updated.next_check_at,
      },
      { status: 200 }
    );
  }

  // 404 vs 409: narrow re-read to disambiguate.
  const { data: existing, error: lookupError } = await supabase
    .from('cards')
    .select('id, state')
    .eq('id', id)
    .maybeSingle();

  if (lookupError) {
    Sentry.captureException(lookupError, {
      tags: { route: 'PATCH /api/card/[id]/cadence', stage: 'lookup' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
}
