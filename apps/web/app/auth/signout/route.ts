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

/** POST /auth/signout — clears the session, 303-redirects to /login. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url), {
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
