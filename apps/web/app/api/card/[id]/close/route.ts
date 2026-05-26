// What: POST /api/card/[id]/close — close a planned card with optional
//       spend log + optional finished photo. Multipart/form-data body.
//       Photo upload BEFORE RPC call (photo-first, state-second per spec
//       § Gotchas #2). If photo upload fails, card still closes; Sentry
//       captures the upload failure.
// Why:  Terminal state transition PLANNED → CLOSED. Mirrors POST /api/card
//       multipart posture for photo uploads. close_card RPC enforces the
//       state guard atomically.
// Does NOT: Fire PostHog events — <CloseCardForm /> fires from client.
//           Doesn't validate spend as non-negative — D1 allows any integer.

import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SPEND_NOTES_MAX = 500;

/** POST /api/card/[id]/close — see file header. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  // 1. Auth gate.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. UUID validation on [id] param.
  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: 'validation_failed', field: 'id', reason: 'invalid UUID' },
      { status: 400 }
    );
  }

  // 3. Parse formData.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        error: 'validation_failed',
        field: 'body',
        reason: 'invalid form data',
      },
      { status: 400 }
    );
  }

  // 4. Validate fields.
  const rawSpend = formData.get('spend_amount_cents');
  let spendCents: number | null = null;
  if (rawSpend !== null && rawSpend !== '') {
    const parsed = parseInt(String(rawSpend), 10);
    if (isNaN(parsed)) {
      return NextResponse.json(
        {
          error: 'validation_failed',
          field: 'spend_amount_cents',
          reason: 'must be a number',
        },
        { status: 400 }
      );
    }
    spendCents = parsed;
  }

  const rawNotes = formData.get('spend_notes');
  let spendNotes: string | null = null;
  if (rawNotes !== null && String(rawNotes).trim() !== '') {
    const trimmed = String(rawNotes).trim();
    if (trimmed.length > SPEND_NOTES_MAX) {
      return NextResponse.json(
        {
          error: 'validation_failed',
          field: 'spend_notes',
          reason: `must be ${SPEND_NOTES_MAX} characters or fewer`,
        },
        { status: 400 }
      );
    }
    spendNotes = trimmed;
  }

  const photoEntry = formData.get('photo');
  const photo =
    photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;
  if (photo && !photo.type.startsWith('image/')) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        field: 'photo',
        reason: 'must be an image',
      },
      { status: 400 }
    );
  }

  // 5. Photo upload (if present) — BEFORE the RPC call.
  //    Upload failure does NOT block the close transition.
  if (photo) {
    const touchpointId = crypto.randomUUID();
    const storagePath = `${user.id}/cards/${id}/touchpoints/${touchpointId}/wide.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('card-photos')
      .upload(storagePath, photo, {
        contentType: photo.type,
        upsert: false,
      });
    if (uploadError) {
      Sentry.captureException(uploadError, {
        tags: { route: 'POST /api/card/[id]/close', stage: 'storage_upload' },
        extra: { card_id: id, user_id: user.id },
      });
    } else {
      const { error: insertError } = await supabase.from('card_photos').insert({
        card_id: id,
        user_id: user.id,
        touchpoint_id: touchpointId,
        touchpoint_type: 'close',
        slot: 'wide',
        storage_path: storagePath,
      });
      if (insertError) {
        Sentry.captureException(insertError, {
          tags: {
            route: 'POST /api/card/[id]/close',
            stage: 'card_photos_insert',
          },
          extra: { card_id: id, user_id: user.id },
        });
      }
    }
  }

  // 6. Call close_card RPC.
  const { data: rpcData, error: rpcError } = await supabase.rpc('close_card', {
    p_user: user.id,
    p_card: id,
    p_spend_cents: spendCents,
    p_spend_notes: spendNotes,
  });

  if (rpcError) {
    const code = rpcError.code;
    const msg = rpcError.message ?? '';

    if (code === '42501' || msg.includes('forbidden')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (msg.includes('invalid_state')) {
      // Narrow re-read to distinguish 404 vs 409 (same posture as /decide).
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
      tags: { route: 'POST /api/card/[id]/close', stage: 'close_card' },
      extra: { card_id: id, user_id: user.id },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  // 7. Return success.
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row) {
    Sentry.captureMessage('close_card returned no row', {
      level: 'warning',
      tags: { route: 'POST /api/card/[id]/close' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  return NextResponse.json(
    {
      card_id: row.card_id ?? id,
      state: row.new_state,
      closed_at: row.closed_at,
    },
    { status: 200 }
  );
}
