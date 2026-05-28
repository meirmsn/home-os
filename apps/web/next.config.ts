// What: Next.js config for @home-os/web.
// Why: Transpile workspace TS packages so apps/web can import them with no
//      build step. Security headers below are the minimum production baseline
//      — `connect-src` is composed at runtime from env so the CSP picks up the
//      live Supabase project (prod) or local stack (dev) without a code change.
//      Wrapped with `withSentryConfig` to enable sourcemap upload at build
//      time (driven by SENTRY_AUTH_TOKEN — silently no-ops when the token
//      isn't set, e.g., local dev).

import { withSentryConfig } from '@sentry/nextjs';
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

/** Build CSP `img-src` from $NEXT_PUBLIC_SUPABASE_URL so signed Storage photos
 *  load. Prod Supabase is https (already covered by the broad `https:`), but
 *  the local stack serves Storage over http://host.docker.internal:<port> —
 *  add its exact origin so card photos render in local dev / browser QA.
 *  Prod is unchanged (its https origin is redundant with `https:`). */
function buildImgSrc(): string {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const sources = ["'self'", 'data:', 'blob:', 'https:'];
  if (supabaseUrl) sources.push(supabaseUrl);
  return sources.join(' ');
}

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://us-assets.i.posthog.com",
  "style-src 'self' 'unsafe-inline'",
  `img-src ${buildImgSrc()}`,
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

export default withSentryConfig(nextConfig, {
  // Org + project default to env-only — Sentry's `withSentryConfig` reads
  // SENTRY_ORG / SENTRY_PROJECT at build time when these aren't passed.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { disable: false },
});
