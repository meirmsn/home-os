// What: PATCH /api/card/[id]/estimate — user-edited override for the
//       DIY or Contractor cost estimate. Body
//       { path: 'diy' | 'contractor', estimate: <jsonb> | null }.
//       null = reset (UPDATE … SET <col>_override = NULL).
// Why:  spec § D4 / D6. Single source of truth per state — app
//       estimate vs user override are never merged. RLS-enforced
//       direct UPDATE on the override column under the user's context;
//       no SECURITY DEFINER RPC (no atomic invariant beyond the single
//       row UPDATE).
// Does NOT: Generate an estimate (the AI did at confirm_triage time).
//           Doesn't transition card state. Doesn't fire PostHog (the
//           client component fires decide_estimate_edited /
//           decide_estimate_reset).

import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { parseEstimateBody } from './_lib/parse-estimate-override';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** State values where override edits are accepted. */
const EDITABLE_STATES = ['decide', 'planned', 'monitoring'] as const;

/** PATCH /api/card/[id]/estimate — see file header. */
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

  const parsed = parseEstimateBody(rawBody);
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

  const column =
    parsed.value.path === 'diy'
      ? 'cost_estimate_diy_override'
      : 'cost_estimate_hire_override';
  const updatePayload: Record<string, unknown> = {
    [column]: parsed.value.estimate,
  };

  // RLS restricts visibility to the caller's own rows. The .in('state',
  // EDITABLE_STATES) makes the UPDATE race-safe + ensures we don't allow
  // edits on closed/dismissed cards.
  const { data: updated, error: updateError } = await supabase
    .from('cards')
    .update(updatePayload)
    .eq('id', id)
    .in('state', EDITABLE_STATES as unknown as string[])
    .select('id')
    .maybeSingle();

  if (updateError) {
    Sentry.captureException(updateError, {
      tags: { route: 'PATCH /api/card/[id]/estimate', stage: 'update' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  if (updated) {
    return NextResponse.json(
      {
        card_id: id,
        path: parsed.value.path,
        override_present: parsed.value.estimate !== null,
      },
      { status: 200 }
    );
  }

  // 404 vs 409: re-read narrow row to disambiguate.
  const { data: existing, error: lookupError } = await supabase
    .from('cards')
    .select('id, state')
    .eq('id', id)
    .maybeSingle();

  if (lookupError) {
    Sentry.captureException(lookupError, {
      tags: { route: 'PATCH /api/card/[id]/estimate', stage: 'lookup' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
}
