// What: Pure helper that turns raw `card_photos` rows + a signed-URL map into
//       sorted comparison touchpoints. Groups rows by `touchpoint_id`, derives
//       each group's display date as `min(created_at)`, and builds a per-slot
//       URL map (wide/medium/closeup) from the rows whose storage_path signed.
// Why:  spec § Data model — the compare route's server component needs a
//       testable, DB-free transform between the PostgREST result and the
//       <PhotoComparison> props. Keeping it pure lets unit tests cover the
//       grouping, date derivation, and failed-sign drop without a stack.
// Does NOT: Fetch rows, sign URLs, or talk to Supabase — the route owns the
//           query + createSignedUrls; this only shapes already-fetched data.

import type { Database } from '@home-os/core';

type PhotoSlot = Database['public']['Enums']['photo_slot'];
type TouchpointType = Database['public']['Enums']['touchpoint_type'];

/** A single `card_photos` row as the compare route selects it. */
export type PhotoRow = {
  touchpoint_id: string;
  touchpoint_type: TouchpointType;
  slot: PhotoSlot;
  storage_path: string;
  created_at: string;
};

/** Signed URLs keyed by the slot they fill, for one touchpoint. Missing slots
 *  are `undefined` (the panel renders the missing-slot placeholder). */
export type ComparePhoto = {
  wide?: string;
  medium?: string;
  closeup?: string;
};

/** One photographed moment of a card: a `touchpoint_id` group with its display
 *  date, type hint, and per-slot signed URLs. */
export type CompareTouchpoint = {
  id: string;
  date: string;
  type: TouchpointType;
  photos: ComparePhoto;
};

/**
 * Group raw `card_photos` rows into sorted comparison touchpoints.
 *
 * @param rows - Photo rows for one card (any order). Each row's storage_path is
 *   looked up in `signedUrls`; rows whose path is absent from the map (failed to
 *   sign / dropped) are skipped, so an un-signable photo reads as a missing slot
 *   rather than blanking the whole group.
 * @param signedUrls - Map from `storage_path` to its signed URL. The route
 *   builds this from `createSignedUrls` (plural), dropping per-path error entries.
 * @returns Touchpoints sorted by display date ascending. Each touchpoint's date
 *   is `min(created_at)` across its rows (the moment the touchpoint began, not
 *   the last slot uploaded). Touchpoints whose every row failed to sign still
 *   appear (with an empty `photos` map) so the count reflects real moments.
 */
export function groupTouchpoints(
  rows: PhotoRow[],
  signedUrls: Map<string, string>
): CompareTouchpoint[] {
  const groups = new Map<string, PhotoRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.touchpoint_id);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(row.touchpoint_id, [row]);
    }
  }

  const touchpoints: CompareTouchpoint[] = [];
  for (const [id, groupRows] of groups) {
    let minDate = groupRows[0]!.created_at;
    const photos: ComparePhoto = {};
    for (const row of groupRows) {
      if (row.created_at < minDate) minDate = row.created_at;
      const url = signedUrls.get(row.storage_path);
      if (url) photos[row.slot] = url;
    }
    touchpoints.push({
      id,
      date: minDate,
      type: groupRows[0]!.touchpoint_type,
      photos,
    });
  }

  // Stable sort by display date ascending — earliest first so the default
  // pair (A = earliest, B = latest) falls out of the array ends.
  touchpoints.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return touchpoints;
}
