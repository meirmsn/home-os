'use client';

// What: Client-component bootstrap that initializes PostHog on first mount.
// Why:  PostHog requires a window context; this provider isolates the init
//       to the client boundary so the rest of app/layout.tsx can stay a
//       server component.

import { useEffect } from 'react';
import { initPostHog } from '@/lib/posthog';

/**
 *
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);
  return <>{children}</>;
}
