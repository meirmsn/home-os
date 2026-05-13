// What: Browser-side Supabase client factory for App Router client components.
// Why:  Centralizes env var reads with the canonical `.trim()` defense —
//       trailing whitespace from a copy-paste fat-finger in
//       .env.local / Vercel UI otherwise 500s SSR routes silently
//       (kit/docs/guide/supabase-ssr-boilerplate.md § Pattern 1).
// Does NOT: Manage session state (Supabase Auth Helpers do that), or call
//           the URL guard for prod-vs-test (the package/core guard runs
//           inside createClient — wired via @home-os/core).

import { createBrowserClient } from '@supabase/ssr';

/** Build a per-request browser client. Trim env reads so trailing
 *  whitespace never reaches Supabase URL parsing. */
export function createClient() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  return createBrowserClient(url, key);
}
