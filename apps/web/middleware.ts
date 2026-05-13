// What: Edge middleware that refreshes the Supabase session on every request.
// Why:  Without per-request session refresh, an expired access token leads
//       to silent 401s in route handlers. Trim env reads to dodge
//       trailing-whitespace SSR-500s (kit/docs/guide/supabase-ssr-boilerplate.md
//       § Pattern 1).
// Does NOT: Authorize routes — the matcher excludes static + image paths;
//           route-level auth is enforced in server components / actions.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieSetter = {
  name: string;
  value: string;
  options: CookieOptions;
};

/** Refresh session cookies on every non-asset request. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieSetter[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Triggers the session refresh side effect on getUser().
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    // Skip Next internals + any path with a file extension
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
