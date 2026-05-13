'use client';

// What: Zero-output client component that fires PostHog's
//       sign_in_completed event exactly once per (user × session). Mounted
//       by (app)/layout.tsx with the server-derived user.id + email so the
//       capture inherits the identified distinct_id (D7).
// Why:  The (app) layout re-mounts on every authenticated navigation; an
//       unguarded posthog.capture there would fire once per page load.
//       Guarding off a sessionStorage key keyed on user.id makes a fresh
//       sign-in after sign-out re-fire correctly without explicit cleanup
//       on the signout path (spec § Gotchas).
// Does NOT: Render anything. Returns null after the effect runs.

import { useEffect } from 'react';
import { posthog } from '@/lib/posthog';

const STORAGE_PREFIX = 'home_os.sign_in_completed_fired:';

/**
 *
 */
export function SignInCompletedCapture({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `${STORAGE_PREFIX}${userId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      // Identify FIRST so the capture lands on the user's distinct_id,
      // not the pre-sign-in anonymous one (spec § Gotchas).
      posthog.identify(userId, { email });
      posthog.capture('sign_in_completed', { method: 'magic_link' });
      window.sessionStorage.setItem(key, '1');
    } catch {
      // sessionStorage can throw in strict cookie / private modes — failing
      // closed (no capture) is fine; the funnel under-counts but the app
      // keeps working.
    }
  }, [userId, email]);

  return null;
}
