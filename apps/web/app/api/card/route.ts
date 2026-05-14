// What: POST /api/card route handler. The capture-flow form's only HTTP
//       surface. Accepts multipart/form-data (description + system_tag +
//       room_tag + client-generated touchpoint_id + optional photo),
//       enforces the 20/wk card cap atomically via claim_card_slot, and
//       uploads the photo (if present) to Storage AFTER the cap claim
//       succeeds — never before.
// Why:  Single trust boundary for capture. Auth comes from the session
//       cookie via @supabase/ssr (defense in depth on top of middleware);
//       p_user is derived from getUser() server-side, never from request
//       body (spec § Gotchas). claim_card_slot is atomic so concurrent
//       submits cannot both squeeze past 19/20 (D3).
// Does NOT: Call /api/triage (D7 — cards land in `capturing` and stay
//           there until row #2 wires the transition). Doesn't trust the
//           client `touchpoint_id` for anything except the photo path —
//           the card_photos row references the same id by contract.
//           Doesn't sanitize description content; the textarea contract
//           is plain text and the CHECK constraint caps length at 2000.

import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { titleFromDescription } from './_lib/title-from-description';

export const dynamic = 'force-dynamic';

/** Enum values that the form's system_tag <select> may submit. Mirrors the
 *  Postgres `system_tag` enum from migration 001. */
const SYSTEM_TAGS = [
  'plumbing',
  'electrical',
  'hvac',
  'roof',
  'exterior',
  'interior',
  'appliance',
  'safety',
  'other',
] as const;

type SystemTag = (typeof SYSTEM_TAGS)[number];

const DESCRIPTION_MAX = 2000;
const ROOM_TAG_MAX = 80;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FieldErrors = Partial<
  Record<
    'description' | 'system_tag' | 'room_tag' | 'touchpoint_id' | 'photo',
    string
  >
>;

/** ISO-yyyy-mm-dd Monday-UTC of the week that contains `now`. */
function thisMondayUtcIso(now: Date = new Date()): string {
  // ISO weeks start on Monday. Date#getUTCDay returns 0 (Sun)..6 (Sat),
  // so the offset to Monday is (day === 0 ? 6 : day - 1).
  const day = now.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - offset);
  return monday.toISOString().slice(0, 10);
}

/** ISO-yyyy-mm-dd Monday-UTC for the NEXT week (i.e. when the cap resets). */
function nextMondayUtcIso(now: Date = new Date()): string {
  const monday = new Date(`${thisMondayUtcIso(now)}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return monday.toISOString().slice(0, 10);
}

/** Validate body fields. Returns null on success or a fields-error map. */
function validate(
  description: string,
  systemTag: string,
  roomTag: string,
  touchpointId: string,
  photo: File | null
): FieldErrors | null {
  const errors: FieldErrors = {};
  const trimmedDesc = description.trim();
  if (trimmedDesc.length === 0) {
    errors.description = 'Description is required.';
  } else if (trimmedDesc.length > DESCRIPTION_MAX) {
    errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
  }
  if (!SYSTEM_TAGS.includes(systemTag as SystemTag)) {
    errors.system_tag = 'Pick a system tag.';
  }
  const trimmedRoom = roomTag.trim();
  if (trimmedRoom.length === 0) {
    errors.room_tag = 'Room is required.';
  } else if (trimmedRoom.length > ROOM_TAG_MAX) {
    errors.room_tag = `Room must be ${ROOM_TAG_MAX} characters or fewer.`;
  }
  if (!UUID_RE.test(touchpointId)) {
    errors.touchpoint_id = 'Invalid touchpoint id.';
  }
  if (photo !== null && !photo.type.startsWith('image/')) {
    errors.photo = 'Photo must be an image.';
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

/** POST /api/card — see file header. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 1. Auth gate. getUser() reads the session cookie and validates with
  // Supabase; null user -> 401.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Parse multipart body. NextRequest.formData is the Web Fetch API.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'validation_failed', fields: { description: 'Invalid form.' } },
      { status: 400 }
    );
  }

  const description = String(formData.get('description') ?? '');
  const systemTag = String(formData.get('system_tag') ?? '');
  const roomTag = String(formData.get('room_tag') ?? '');
  const touchpointId = String(formData.get('touchpoint_id') ?? '');
  const photoEntry = formData.get('photo');
  const photo =
    photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;

  const fieldErrors = validate(
    description,
    systemTag,
    roomTag,
    touchpointId,
    photo
  );
  if (fieldErrors) {
    return NextResponse.json(
      { error: 'validation_failed', fields: fieldErrors },
      { status: 400 }
    );
  }

  // 3. Atomic cap claim + cards INSERT via the SECURITY DEFINER RPC (D3).
  // `p_user` is derived from getUser() — never from the body (§ Gotchas).
  const trimmedDesc = description.trim();
  const trimmedRoom = roomTag.trim();
  const title = titleFromDescription(trimmedDesc);
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'claim_card_slot',
    {
      p_user: user.id,
      p_title: title,
      p_description: trimmedDesc,
      p_system_tag: systemTag as SystemTag,
      p_room_tag: trimmedRoom,
    }
  );

  if (rpcError) {
    // P0001 + message `card_cap_reached` is the canonical cap-hit raise
    // from claim_card_slot. Any other P0001 (or any other code) is an
    // unexpected error — Sentry capture + 500.
    if (
      rpcError.code === 'P0001' &&
      rpcError.message?.includes('card_cap_reached')
    ) {
      return NextResponse.json(
        { error: 'card_cap_reached', resets_on: nextMondayUtcIso() },
        { status: 429 }
      );
    }
    Sentry.captureException(rpcError, {
      tags: { route: 'POST /api/card', stage: 'claim_card_slot' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  // RPC returns `setof record`; supabase-js wraps as an array.
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row?.card_id || typeof row.card_count_after !== 'number') {
    Sentry.captureException(new Error('claim_card_slot returned no row'), {
      tags: { route: 'POST /api/card', stage: 'rpc_empty' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
  const cardId = row.card_id;
  const cardCountAfter = row.card_count_after;

  // 4. Photo upload (optional). Happens AFTER the cap claim so a 429
  // path never writes to Storage (§ Gotchas, eng-review § Rescue #3).
  // Storage RLS scopes the leading path segment to auth.uid()::text,
  // so we MUST construct the path as `{user.id}/cards/{card_id}/...`.
  let photoUploaded = false;
  if (photo) {
    const storagePath = `${user.id}/cards/${cardId}/touchpoints/${touchpointId}/wide.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('card-photos')
      .upload(storagePath, photo, {
        contentType: photo.type,
        upsert: false,
      });
    if (uploadError) {
      Sentry.captureException(uploadError, {
        tags: { route: 'POST /api/card', stage: 'storage_upload' },
      });
    } else {
      const { error: insertError } = await supabase.from('card_photos').insert({
        card_id: cardId,
        user_id: user.id,
        touchpoint_id: touchpointId,
        touchpoint_type: 'primary',
        slot: 'wide',
        storage_path: storagePath,
      });
      if (insertError) {
        Sentry.captureException(insertError, {
          tags: { route: 'POST /api/card', stage: 'card_photos_insert' },
        });
      } else {
        photoUploaded = true;
      }
    }
  }

  return NextResponse.json(
    {
      card_id: cardId,
      card_count_after: cardCountAfter,
      photo_uploaded: photoUploaded,
    },
    { status: 201 }
  );
}
