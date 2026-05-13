// What: Sentry init for the Edge runtime (middleware, route handlers with
//       `export const runtime = 'edge'`). Loaded by instrumentation.ts when
//       NEXT_RUNTIME === 'edge'.
// Why:  Edge runtime has no Node APIs, so its Sentry transport differs from
//       the server bundle — same DSN, different SDK shape.

import * as Sentry from '@sentry/nextjs';

const dsn = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? '').trim();

Sentry.init({
  dsn,
  enabled: dsn.length > 0,
  tracesSampleRate: 0,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
