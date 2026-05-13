'use client';

// What: /spike/camera dual-path camera test surface (D2). Two side-by-
//       side panels:
//         - Path A: <input type="file" accept="image/*" capture="environment">
//         - Path B: navigator.mediaDevices.getUserMedia({ video: { ... } })
//       Each panel surfaces inline measured pixel dimensions + byte size
//       + upload status (storage path / error chip) after the user
//       captures.
// Why:  The spike's core unknown — does iOS Safari deliver full sensor
//       resolution via the two API paths, and does Storage upload of
//       the resulting JPEGs through the existing card-photos bucket +
//       RLS gate work end-to-end. Findings recorded in
//       .gstack/pwa-spike-result.md.
// Does NOT: Validate JPEG content, transcode HEIC, or queue uploads for
//           offline. Online-only spike (§ Offline behavior). Production
//           capture flow lives in a separate PR (capture-flow).

import { useState } from 'react';
import { CameraPathA } from '../_components/CameraPathA';
import { CameraPathB } from '../_components/CameraPathB';
import { createClient } from '@/lib/supabase/client';

/** /spike/camera — dual-path camera surface. Inherits auth from (app)
 *  layout. */
export default function SpikeCameraPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userIdError, setUserIdError] = useState<string | null>(null);

  // Pull the signed-in user id once on first interaction so the upload
  // helper can stamp the {auth.uid()}/spike/ path prefix. Layout already
  // guarantees auth — this is just a getter, not a guard.
  /**
   *
   */
  async function ensureUserId(): Promise<string | null> {
    if (userId) return userId;
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      setUserIdError(error?.message ?? 'No signed-in user');
      return null;
    }
    setUserId(data.user.id);
    return data.user.id;
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary-inverse)]">
          Spike — camera
        </h1>
        <p className="text-sm text-[var(--color-text-secondary-inverse)]">
          Two test surfaces. Capture once on each, observe inline dimensions +
          byte size + Storage upload result. Record findings in{' '}
          <code>.gstack/pwa-spike-result.md</code>.
        </p>
      </header>

      {userIdError && (
        <p
          role="alert"
          className="rounded-md border border-[var(--color-act-soon)] bg-[var(--color-background-raised)] px-3 py-2 text-sm text-[var(--color-act-soon)]"
        >
          Could not read signed-in user: {userIdError}. Reload and try again.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <CameraPathA ensureUserId={ensureUserId} />
        <CameraPathB ensureUserId={ensureUserId} />
      </div>
    </section>
  );
}
