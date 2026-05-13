// What: Browser-side PostHog init. Lazily initialized once per session by
//       the <PostHogProvider> client component in app/layout.tsx.
// Why:  Centralized init keeps the .trim() defense + host config in one
//       place; provider mounts pull from this module so initialization
//       order is deterministic.
// Does NOT: Capture server-side events (no posthog-node here — add when a
//           Route Handler or Server Action needs to capture).

import posthog from 'posthog-js';

let initialized = false;

/** Initialize PostHog once per browser session. Safe to call from a
 *  client-component effect — subsequent calls are no-ops. */
export function initPostHog(): typeof posthog {
  if (initialized || typeof window === 'undefined') return posthog;
  const key = (process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '').trim();
  if (!key) return posthog;
  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    ui_host: 'https://us.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
  });
  initialized = true;
  return posthog;
}

export { posthog };
