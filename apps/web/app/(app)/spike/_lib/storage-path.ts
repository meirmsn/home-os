// What: Compute the Storage path for a spike upload — pure function.
//       `spikePath(userId, slot, now)` returns
//       "{user_id}/spike/{ISO-with-colons-stripped}-{slot}.jpg" per D3.
// Why:  The leading `{user_id}` segment is what the existing
//       `card-photos` RLS policy
//       `(storage.foldername(name))[1] = auth.uid()::text` checks. Format
//       drift here = silent RLS rejections. Pinning the format string in
//       a unit test catches typos before they ship.
// Does NOT: Read auth state or call Storage. The caller passes
//           `auth.uid()` from a `useSession()`-equivalent hook.

export type SpikeSlot = 'A' | 'B';

/** Build the Storage path for a spike upload.
 *
 *  Path shape (D3): `{user_id}/spike/{ISO-no-colons}-{slot}.jpg`
 *  Example: `7e2a-.../spike/2026-05-13T18-30-45Z-A.jpg`
 *
 *  ISO timestamps use UTC and strip colons because Supabase Storage
 *  filenames can technically contain `:` but it's URL-encoded in
 *  signed URLs and shows up as `%3A` in dashboard browse — annoying.
 *  Strip for hygiene.
 *
 *  Throws on empty userId or out-of-set slot — these are programmer
 *  errors, not user-input issues. */
export function spikePath(userId: string, slot: SpikeSlot, now: Date): string {
  if (!userId) {
    throw new Error('spikePath: userId must be non-empty');
  }
  if (slot !== 'A' && slot !== 'B') {
    throw new Error(`spikePath: slot must be "A" or "B" (got "${slot}")`);
  }
  // toISOString → "2026-05-13T18:30:45.000Z"
  // strip ms + colons → "2026-05-13T18-30-45Z"
  const iso = now
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:/g, '-');
  return `${userId}/spike/${iso}-${slot}.jpg`;
}
