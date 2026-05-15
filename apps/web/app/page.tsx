// What: Noscript-fallback surface for `/`. Middleware (apps/web/middleware.ts
//       rules 3 + 4, landing-redirect spec D1+D3+D4) redirects every
//       normal browser flow to /login (anon) or /home (auth) before this
//       page body is requested. Only non-following clients reach this
//       render — curl -I, scrapers, search-engine crawlers indexing /.
// Why:  Preserve SEO + accessibility for crawlers without leaving a
//       "coming soon" placeholder on the public web post-launch. One
//       short heading + one anchor to /login keeps the surface in brand
//       voice and gives non-following clients a discoverable entry.
// Does NOT: Render any client-side auth detection. Middleware is the
//           single declarative enforcement surface (spec § Gotchas:
//           a useEffect redirect would race middleware and flash this
//           body to normal browsers).

/** Static noscript-fallback anchor for clients that don't follow middleware redirects. */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-[var(--color-text-primary-inverse)]">
      <h1 className="text-2xl font-medium">home-os</h1>
      <a
        href="/login"
        className="text-base font-medium underline underline-offset-4"
      >
        Sign in
      </a>
    </main>
  );
}
