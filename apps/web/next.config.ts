// What: Next.js config for @home-os/web.
// Why: Transpile workspace TS packages so apps/web can import them with no
//      build step. Security headers below are the minimum production baseline
//      — `connect-src` is composed at runtime from env so the CSP picks up the
//      live Supabase project (prod) or local stack (dev) without a code change.
// Does NOT: Configure Sentry sourcemap upload (that wraps this config via
//           @sentry/nextjs's withSentryConfig in a later commit).

import type { NextConfig } from 'next';

/** Build CSP `connect-src` from $NEXT_PUBLIC_SUPABASE_URL.
 *  Includes the parsed origin plus its ws(s) variant so Realtime works in
 *  both http→ws (local stack) and https→wss (prod) shapes — see
 *  kit/docs/guide/supabase-ssr-boilerplate.md § Pattern 2. */
function buildConnectSrc(): string {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const posthogHost = 'https://us.i.posthog.com';
  const sentryHost = 'https://*.ingest.sentry.io';
  const sources = ["'self'", posthogHost, sentryHost];
  if (supabaseUrl) {
    sources.push(supabaseUrl);
    // http→ws, https→wss
    sources.push(supabaseUrl.replace(/^http(s?):\/\//, 'ws$1://'));
  }
  return sources.join(' ');
}

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://us-assets.i.posthog.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  `connect-src ${buildConnectSrc()}`,
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=()',
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ['@home-os/core', '@home-os/ui'],
  reactStrictMode: true,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
