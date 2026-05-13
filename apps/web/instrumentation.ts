// What: Next.js instrumentation hook — wires Sentry into the server + edge
//       runtimes at boot. Next auto-calls `register()` once per process.
// Why:  The Next 15+ pattern replaces `sentry.{server,edge}.config.ts`'s
//       implicit loading; without this file, server errors silently miss
//       Sentry capture.

import * as Sentry from '@sentry/nextjs';

/**
 *
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
