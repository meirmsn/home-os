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

/** Build a redirect URL anchored on the request's actual Host header rather
 *  than `request.url`'s host. Next.js 16's `request.url` normalizes the
 *  hostname to whatever Next is configured for (defaults to `localhost`),
 *  even when the request came in on `127.0.0.1` — so
 *  `new URL('/home', request.url)` would emit `http://localhost:3000/home`
 *  while @supabase/ssr's setAll set its cookies on `127.0.0.1`. The browser
 *  would not cross-send those cookies after the redirect and middleware
 *  would bounce the user back to `/login?next=/home`. Pulling host from the
 *  request header keeps cookies and the redirect origin aligned.
 *
 *  Security: `safeNext` already locks the path to a same-origin relative
 *  URL. An attacker spoofing the Host header would only redirect back to
 *  themselves; they can't escalate this into a cross-origin redirect.
 */
function sameOriginUrl(request: NextRequest, path: string): string {
  const host =
    request.headers.get('host') ?? new URL(request.url).host;
  const proto =
    request.headers.get('x-forwarded-proto') ??
    new URL(request.url).protocol.replace(':', '');
  return `${proto}://${host}${path}`;
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
      sameOriginUrl(request, '/login?error=callback_failed'),
      { status: 303 }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      sameOriginUrl(request, '/login?error=callback_failed'),
      { status: 303 }
    );
  }

  return NextResponse.redirect(sameOriginUrl(request, next), { status: 303 });
}
