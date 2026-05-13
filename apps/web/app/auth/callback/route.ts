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
// Does NOT: Trust an arbitrary `next` value. Same-origin enforcement: any
//           `next` that isn't a same-origin relative path (must start with
//           "/" and not "//" — protocol-relative URLs would inherit
//           https://attacker.example/ from the magic-link host) falls back
//           to `/home`. Closes the open-redirect class: an attacker crafting
//           `?code=…&next=https://evil.example.com` cannot bounce the user
//           off the home-os origin after the PKCE exchange.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Next 16 may try to statically optimize a route handler that doesn't
// touch request-scoped state. This handler reads cookies (transitively
// via @supabase/ssr) — force dynamic to make the heuristic explicit
// (spec § Gotchas: "Route handlers must opt out of static rendering").
export const dynamic = 'force-dynamic';

/** Same-origin redirect target. Accept only paths that begin with `/` and
 *  are NOT protocol-relative (`//evil.example`) — anything else falls back
 *  to `/home`. Closes the open-redirect class flagged in /cso. */
function safeNext(raw: string | null): string {
  if (!raw) return '/home';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/home';
  return raw;
}

/** GET /auth/callback?code=<pkce-code>&next=<path> */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));

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
