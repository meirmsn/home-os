// What: PKCE callback route handler. Reads `?code` (+ optional `?next`) from
//       the magic-link redirect URL, exchanges the PKCE code for a session
//       via @supabase/ssr's server client (which writes the session
//       cookies through `setAll`), then 303-redirects to `next` (default
//       `/home`). Error path 303-redirects to `/login?error=callback_failed`.
// Why:  Magic-link sign-in lands here after the user clicks the email link.
//       PKCE is the @supabase/ssr default + cookie-safe for SSR (D4). The
//       303 status keeps the cookie writes from setAll on the SAME response
//       the browser sees — using Next-side `redirect()` from
//       `next/navigation` here would throw a NEXT_REDIRECT signal that
//       Next's intercept layer can reorder or drop the cookies (spec §
//       Gotchas, D4).
// Does NOT: Validate the `next` value beyond accepting it as a string — the
//           only callers are the Supabase server (controlled by us) and
//           the /login form (hard-coded `/home`).

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Next 16 may try to statically optimize a route handler that doesn't
// touch request-scoped state. This handler reads cookies (transitively
// via @supabase/ssr) — force dynamic to make the heuristic explicit
// (spec § Gotchas: "Route handlers must opt out of static rendering").
export const dynamic = 'force-dynamic';

/** GET /auth/callback?code=<pkce-code>&next=<path> */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/home';

  // Defensive — never call exchangeCodeForSession(undefined). A magic-link
  // URL with a missing `code` is malformed; surface it as callback_failed.
  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=callback_failed', request.url),
      { status: 303 }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL('/login?error=callback_failed', request.url),
      { status: 303 }
    );
  }

  return NextResponse.redirect(new URL(next, request.url), { status: 303 });
}
