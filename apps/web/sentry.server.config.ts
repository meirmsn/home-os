// What: Sentry init for the Node/SSR runtime (App Router server components,
//       Route Handlers, Server Actions). Loaded by instrumentation.ts when
//       NEXT_RUNTIME === 'nodejs'.
// Why:  Server-side errors otherwise go uncaught when the request fails
//       before the client hydrates.

import * as Sentry from '@sentry/nextjs';

const dsn = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? '').trim();

Sentry.init({
  dsn,
  enabled: dsn.length > 0,
  tracesSampleRate: 0,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
