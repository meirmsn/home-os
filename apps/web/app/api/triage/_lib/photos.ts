// What: Pure-fn helper that loads a card's photos from Storage under the
//       authenticated user's RLS context, base64-encodes them, and
//       returns the resulting Anthropic image-block payloads.
// Why:  spec § API contracts § POST /api/triage #6 — Claude needs the
//       raw bytes (signed URLs would leak to Anthropic + carry TTL
//       fragility; D4). Capped at the first 3 photos per card to bound
//       per-request payload size. Per-photo download failure is swallowed
//       silently with a Sentry breadcrumb — zero-photo Claude calls are
//       valid per eng-review § Edge Case #1.
// Does NOT: Use the service-role client (spec § Gotchas #4 — the user-
//           context client + Storage RLS is the trust boundary).
//           Doesn't convert non-JPEG bytes — the capture-flow only
//           writes wide.jpg, so we assert image/jpeg.

import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Anthropic image-block-shaped payload. */
export type Base64Image = {
  media_type: 'image/jpeg';
  data: string;
};

/** Max photos loaded per call. D4 cap. */
export const MAX_PHOTOS_PER_TRIAGE = 3;

/** Convert an ArrayBuffer/Blob-like value to a base64 string without the
 *  data: prefix. Uses Node's Buffer when available (route handlers run
 *  on Node), falls back to the platform `btoa` chunked encoder otherwise. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  // happy-dom / browser fallback. Chunk to avoid call-stack blowup.
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

type CardPhotoRow = {
  storage_path: string;
};

/**
 * Fetch up to MAX_PHOTOS_PER_TRIAGE photo blobs from the `card-photos`
 * bucket for the given (user, card) and base64-encode them. Returns an
 * array of `{media_type, data}` entries ordered oldest-first.
 *
 * The supplied `supabase` client MUST be the user-context server client
 * — Storage RLS scopes downloads by `auth.uid()` (spec § Gotchas #4).
 * Passing a service-role client would silently break that trust
 * boundary and is forbidden.
 */
export async function fetchCardPhotosAsBase64(
  supabase: SupabaseClient,
  userId: string,
  cardId: string
): Promise<Base64Image[]> {
  const { data, error } = await supabase
    .from('card_photos')
    .select('storage_path')
    .eq('user_id', userId)
    .eq('card_id', cardId)
    .order('created_at', { ascending: true })
    .limit(MAX_PHOTOS_PER_TRIAGE);

  if (error) {
    Sentry.captureException(error, {
      tags: {
        helper: 'fetchCardPhotosAsBase64',
        stage: 'card_photos_select',
      },
    });
    return [];
  }

  const rows = (data ?? []) as CardPhotoRow[];
  if (rows.length === 0) return [];

  const results: Base64Image[] = [];
  for (const row of rows) {
    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from('card-photos')
        .download(row.storage_path);
      if (downloadError || !blob) {
        Sentry.captureException(
          downloadError ?? new Error('storage.download returned no blob'),
          {
            tags: {
              helper: 'fetchCardPhotosAsBase64',
              stage: 'storage_download',
            },
          }
        );
        continue;
      }
      const arrayBuffer = await blob.arrayBuffer();
      results.push({
        media_type: 'image/jpeg',
        data: arrayBufferToBase64(arrayBuffer),
      });
    } catch (err) {
      Sentry.captureException(err, {
        tags: {
          helper: 'fetchCardPhotosAsBase64',
          stage: 'download_unexpected',
        },
      });
    }
  }

  return results;
}
