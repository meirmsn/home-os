// What: POST /api/card/[id]/checkin — record a check-in on a monitoring
//       card with optional notes + up to 3 photos (wide/zoom/detail).
//       Calls record_checkin RPC first, then uploads photos (RPC-first,
//       photos-after — inverse of close-flow per spec § Gotchas G1).
// Why:  The check-in event is the core signal (cadence clock reset);
//       photos are supplementary. An orphaned check-in row without
//       photos is still valuable.
// Does NOT: Fire PostHog events — <CheckInForm /> fires from client.

import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOTES_MAX = 500;

const PHOTO_SLOTS = ['photo_wide', 'photo_zoom', 'photo_detail'] as const;
const SLOT_NAMES: Record<(typeof PHOTO_SLOTS)[number], string> = {
  photo_wide: 'wide',
  photo_zoom: 'zoom',
  photo_detail: 'detail',
};

/** POST /api/card/[id]/checkin — see file header. */
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

  // 4. Validate notes.
  const rawNotes = formData.get('notes');
  let notes: string | null = null;
  if (rawNotes !== null && String(rawNotes).trim() !== '') {
    const trimmed = String(rawNotes).trim();
    if (trimmed.length > NOTES_MAX) {
      return NextResponse.json(
        {
          error: 'validation_failed',
          field: 'notes',
          reason: `must be ${NOTES_MAX} characters or fewer`,
        },
        { status: 400 }
      );
    }
    notes = trimmed;
  }

  // 5. Validate photo files (collect valid ones).
  const photos: { slot: string; file: File }[] = [];
  for (const fieldName of PHOTO_SLOTS) {
    const entry = formData.get(fieldName);
    if (entry instanceof File && entry.size > 0) {
      if (!entry.type.startsWith('image/')) {
        return NextResponse.json(
          {
            error: 'validation_failed',
            field: fieldName,
            reason: 'must be an image',
          },
          { status: 400 }
        );
      }
      photos.push({ slot: SLOT_NAMES[fieldName], file: entry });
    }
  }

  // 6. Call record_checkin RPC (RPC first, photos after — G1).
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'record_checkin',
    {
      p_user: user.id,
      p_card: id,
      p_notes: notes,
    }
  );

  if (rpcError) {
    const code = rpcError.code;
    const msg = rpcError.message ?? '';

    if (code === '42501' || msg.includes('forbidden')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (msg.includes('invalid_state')) {
      // Narrow re-read to distinguish 404 vs 409.
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
      tags: {
        route: 'POST /api/card/[id]/checkin',
        stage: 'record_checkin',
      },
      extra: { card_id: id, user_id: user.id },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  // 7. Extract checkin_id from RPC response.
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row) {
    Sentry.captureMessage('record_checkin returned no row', {
      level: 'warning',
      tags: { route: 'POST /api/card/[id]/checkin' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  const checkinId: string = row.checkin_id;

  // 8. Upload photos (after RPC — G1). Failures are Sentry-captured
  //    but do NOT block the check-in response.
  let photoCount = 0;
  for (const { slot, file } of photos) {
    const storagePath = `${user.id}/cards/${id}/touchpoints/${checkinId}/${slot}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('card-photos')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) {
      Sentry.captureException(uploadError, {
        tags: {
          route: 'POST /api/card/[id]/checkin',
          stage: 'storage_upload',
        },
        extra: { card_id: id, user_id: user.id, slot },
      });
      continue;
    }

    const { error: insertError } = await supabase.from('card_photos').insert({
      card_id: id,
      user_id: user.id,
      touchpoint_id: checkinId,
      touchpoint_type: 'checkin',
      slot,
      storage_path: storagePath,
    });
    if (insertError) {
      Sentry.captureException(insertError, {
        tags: {
          route: 'POST /api/card/[id]/checkin',
          stage: 'card_photos_insert',
        },
        extra: { card_id: id, user_id: user.id, slot },
      });
      continue;
    }

    photoCount++;
  }

  // 9. Return success.
  return NextResponse.json(
    {
      checkin_id: checkinId,
      card_id: row.card_id ?? id,
      next_check_at: row.next_check_at,
      photo_count: photoCount,
    },
    { status: 200 }
  );
}
