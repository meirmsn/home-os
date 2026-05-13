// What: Sentry init for the browser bundle.
// Why:  Sentry's Next SDK auto-loads this file on `import` from the client.
//       Performance + Replay deferred until product traffic justifies it.
// Does NOT: Capture replay sessions (Replay integration omitted to keep the
//           bundle small until we know it's needed).

import * as Sentry from '@sentry/nextjs';

const dsn = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? '').trim();

Sentry.init({
  dsn,
  enabled: dsn.length > 0,
  tracesSampleRate: 0,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
});
