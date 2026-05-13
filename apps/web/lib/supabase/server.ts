// What: Server-side Supabase client factory for App Router server components,
//       route handlers, and server actions.
// Why:  Reads cookies via Next.js's async cookies() API and applies the
//       canonical `.trim()` defense on every env var read
//       (kit/docs/guide/supabase-ssr-boilerplate.md § Pattern 1).
// Does NOT: Throw on cookie set/remove failures in server components — Next
//           14+ allows cookie reads but disallows writes from RSCs; the
//           try/catch is required.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieSetter = {
  name: string;
  value: string;
  options: CookieOptions;
};

/** Build a per-request server client backed by the cookie store. */
export async function createClient() {
  const cookieStore = await cookies();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieSetter[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Reads-only context (Server Component) — middleware refreshes
          // sessions; this branch is the expected fallthrough.
        }
      },
    },
  });
}
