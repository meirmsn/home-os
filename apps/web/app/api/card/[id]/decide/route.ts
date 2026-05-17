// What: POST /api/card/[id]/decide — path-commitment endpoint for the
//       DECIDE state. Body { path: 'diy' | 'contractor' | 'monitor' |
//       'dismiss' | 'decide', monitoring_cadence_days?: number }.
//       Calls the commit_decide SECURITY DEFINER RPC; atomic state
//       transition + chosen_path write.
// Why:  Mirrors the claim_card_slot / start_triage / confirm_triage
//       posture — one RPC per write-cluster, internal auth.uid() guard
//       (defense-in-depth on top of RLS). The RPC's predicate-guard on
//       state IN ('decide', 'planned') makes "Change decision" from
//       PlannedView work without a separate endpoint (spec § D5 + §
//       Gotchas #5).
// Does NOT: Generate cost estimates (confirm_triage already wrote
//           cost_estimate_* at confirmation time — see spec § D2).
//           Doesn't fire PostHog (the client component fires
//           decide_path_chosen + decide_path_changed; this route is a
//           plain RPC pass-through).

import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { parseDecideBody } from './_lib/parse-decide-body';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/card/[id]/decide — see file header. */
export async function POST(
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

  const parsed = parseDecideBody(rawBody);
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

  // p_user always derives from getUser() per spec § Gotchas (defense
  // in depth on top of the RPC's internal auth.uid() guard).
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'commit_decide',
    {
      p_user: user.id,
      p_card: id,
      p_path: parsed.value.path,
      p_cadence: parsed.value.monitoring_cadence_days,
    }
  );

  if (rpcError) {
    // RPC raises:
    //   'forbidden' / 42501 — p_user != auth.uid() (shouldn't happen
    //     since we derive p_user from getUser; surface as 401 anyway).
    //   'invalid_path' / 22023 — defensive; parse layer should have
    //     caught it but the RPC double-checks.
    //   'cadence_required' / P0001 — monitor without cadence.
    //   'invalid_state' / P0001 — card not in ('decide','planned').
    const code = rpcError.code;
    const msg = rpcError.message ?? '';

    if (code === '42501' || msg.includes('forbidden')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (code === '22023' || msg.includes('invalid_path')) {
      return NextResponse.json(
        { error: 'validation_failed', field: 'path' },
        { status: 400 }
      );
    }
    if (msg.includes('cadence_required')) {
      return NextResponse.json(
        {
          error: 'validation_failed',
          field: 'monitoring_cadence_days',
          reason: 'required when path=monitor',
        },
        { status: 400 }
      );
    }
    if (msg.includes('invalid_state')) {
      // Either the card doesn't exist for this user OR it's in a state
      // outside ('decide','planned'). The RPC can't distinguish — we
      // re-read the row to choose 404 vs 409.
      const { data: existing } = await supabase
        .from('cards')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (!existing) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
    }

    Sentry.captureException(rpcError, {
      tags: { route: 'POST /api/card/[id]/decide', stage: 'commit_decide' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  // commit_decide returns table(card_id, new_state, new_chosen_path).
  // PostgREST surfaces it as an array of rows.
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row) {
    Sentry.captureMessage('commit_decide returned no row', {
      level: 'warning',
      tags: { route: 'POST /api/card/[id]/decide' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  return NextResponse.json(
    {
      card_id: row.card_id ?? id,
      state: row.new_state,
      chosen_path: row.new_chosen_path,
    },
    { status: 200 }
  );
}
