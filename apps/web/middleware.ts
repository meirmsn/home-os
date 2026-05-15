// What: Edge middleware. Two responsibilities:
//       1. Refresh the Supabase session on every non-asset request (the
//          getUser() call has a side effect that rotates the access /
//          refresh cookies via setAll).
//       2. Enforce D6 redirect rules:
//          - anonymous + path startsWith /home -> /login?next=<path>
//          - authenticated + path === /login   -> /home
//          - anonymous + path === /            -> /login   (landing-redirect rule 3)
//          - authenticated + path === /        -> /home    (landing-redirect rule 4)
//          /auth/* callback URLs and asset paths stay untouched. Public
//          /login stays untouched for anonymous users (otherwise they
//          could never sign in). The bare / surface now redirects in both
//          auth states; only non-following clients (curl -I, crawlers)
//          see page.tsx's noscript-fallback anchor.
// Why:  One enforcement surface, declarative redirects, no per-route
//       guards. Middleware reads cookies only — defense-in-depth lives
//       on the (app) layout (spec § Gotchas: tampered cookie can pass
//       middleware but fail the layout-side getUser()).
// Does NOT: Validate JWT signatures — that's Supabase's job on the wire.
//           getUser() may throw on a malformed/stale cookie; the catch
//           treats that as "anonymous" so a bad cookie can't bypass the
//           gated-path check (spec § Gotchas).

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieSetter = {
  name: string;
  value: string;
  options: CookieOptions;
};

// `(app)` route group is NOT a URL segment — gate by explicit URL prefixes
// (auth PR D6 gotcha). capture-flow PR #3 adds `/capture` + `/dismissed`;
// triage-route-handler PR #4 adds `/cards` (card detail surface).
const GATED_PREFIXES = ['/home', '/capture', '/dismissed', '/cards'];

/**
 *
 */
function isGated(pathname: string): boolean {
  return GATED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Refresh session cookies + enforce D6 redirect rules. */
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

  // Triggers the session refresh side effect on getUser(). Wrap in
  // try/catch so a malformed/stale cookie throw (spec § Gotchas) is
  // treated as "anonymous" rather than 500-ing the request.
  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  const { pathname, search } = request.nextUrl;

  // Rule 1: anonymous request to a gated path -> /login?next=<path>
  if (!user && isGated(pathname)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Rule 2: authenticated request to /login -> /home
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  // Rule 3: anonymous request to / -> /login (landing-redirect D1, D3).
  // No ?next= — / isn't a destination the user was trying to reach, and
  // adding ?next=/ would create a /login -> auth -> safeNext('/') -> /login
  // loop (spec § Gotchas).
  if (!user && pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Rule 4: authenticated request to / -> /home (landing-redirect D1, D4).
  if (user && pathname === '/') {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Skip Next internals + any path with a file extension
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
