// What: POST-only sign-out route handler. Calls supabase.auth.signOut()
//       (which clears the auth cookies via @supabase/ssr's setAll) and
//       303-redirects to /login. Non-POST methods return 405 Method Not
//       Allowed with an `Allow: POST` header.
// Why:  Sign-out via a <form method="post"> from the (app) header (D11)
//       is same-origin CSRF-safe and works without JS — GET sign-out
//       would be CSRF-exploitable via image tags. POST-only matches that
//       constraint. 303 keeps the cookie clears + Location header on the
//       same response (mirrors /auth/callback; spec § Gotchas).
// Does NOT: Fire a PostHog event — D7 explicitly drops a sign_out event
//           (low signal pre-launch).

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Route handlers that touch cookies should opt out of static rendering —
// see spec § Gotchas "Route handlers must opt out of static rendering".
export const dynamic = 'force-dynamic';

/** Build a same-origin redirect URL anchored on the request's Host header
 *  rather than `request.url`'s host. Next.js 16 normalizes `request.url`
 *  to whatever Next is configured for (defaults to localhost), even when
 *  the client connects via 127.0.0.1 — so `new URL('/login', request.url)`
 *  would emit `http://localhost:3000/login` while the form was submitted
 *  from `http://127.0.0.1:3000/home`. The cross-origin redirect then fails
 *  the page's CSP `form-action 'self'` check and the browser silently
 *  aborts the navigation, leaving the user stuck on /home with no error.
 *  Pulling host from the request header keeps the redirect on the same
 *  origin the form was posted from. Mirror of /auth/callback's helper. */
function sameOriginUrl(request: NextRequest, path: string): string {
  const host =
    request.headers.get('host') ?? new URL(request.url).host;
  const proto =
    request.headers.get('x-forwarded-proto') ??
    new URL(request.url).protocol.replace(':', '');
  return `${proto}://${host}${path}`;
}

/** POST /auth/signout — clears the session, 303-redirects to /login. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(sameOriginUrl(request, '/login'), {
    status: 303,
  });
}

/** Generic 405 emitter shared by every non-POST method handler. */
function methodNotAllowed() {
  return new Response(null, {
    status: 405,
    headers: { Allow: 'POST' },
  });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
