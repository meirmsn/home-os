// What: Unit tests for the edge middleware redirect rules (D6, D10).
//       Asserts the four redirect branches + the leave-alone paths +
//       the asset-matcher config + the stale-cookie throw -> anonymous
//       fallback (spec § Gotchas).
// Why:  Middleware is the single declarative enforcement surface for
//       auth gating. A regression that let an anon request through to
//       /home (or trapped an authed user on /login) would surface only
//       end-to-end; lock the contract here.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const { getUser } = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser },
  }),
}));

import { middleware, config } from './middleware';

/**
 *
 */
function mockRequest(pathname: string, search: string = ''): NextRequest {
  const url = `http://localhost:3000${pathname}${search}`;
  // Minimum shape the middleware reads. NextRequest is a Web Request
  // subclass; constructing the real thing requires the edge runtime
  // polyfill — a plain object with `url`, `nextUrl`, and `cookies` is
  // enough for the redirect-rule branches.
  return {
    url,
    nextUrl: { pathname, search },
    cookies: {
      getAll: () => [],
      set: () => undefined,
    },
  } as unknown as NextRequest;
}

describe('middleware — D6 redirect rules', () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  it('anonymous + /home -> 307 redirect to /login?next=/home', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await middleware(mockRequest('/home'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?next=%2Fhome'
    );
  });

  it('anonymous + /home/anything -> 307 redirect to /login?next=/home/anything', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await middleware(mockRequest('/home/anything'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?next=%2Fhome%2Fanything'
    );
  });

  it('anonymous + / (public landing) -> NOT redirected', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await middleware(mockRequest('/'));
    expect(response.headers.get('location')).toBe(null);
  });

  it('anonymous + /login -> NOT redirected (anon must reach /login)', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await middleware(mockRequest('/login'));
    expect(response.headers.get('location')).toBe(null);
  });

  it('authenticated + /login -> 307 redirect to /home', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'a@b.test' } },
    });
    const response = await middleware(mockRequest('/login'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/home');
  });

  it('authenticated + /home -> NOT redirected (allowed through)', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'a@b.test' } },
    });
    const response = await middleware(mockRequest('/home'));
    expect(response.headers.get('location')).toBe(null);
  });

  it('preserves the original query string on the next= param', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await middleware(mockRequest('/home', '?foo=bar'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?next=%2Fhome%3Ffoo%3Dbar'
    );
  });

  it('treats a stale-cookie getUser throw as anonymous (gated -> /login)', async () => {
    getUser.mockRejectedValue(new Error('stale cookie boot'));
    const response = await middleware(mockRequest('/home'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?next=%2Fhome'
    );
  });

  it('anonymous + /capture -> 307 redirect to /login?next=/capture', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await middleware(mockRequest('/capture'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?next=%2Fcapture'
    );
  });

  it('anonymous + /capture?cardId=<uuid> preserves the query string on next=', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await middleware(
      mockRequest('/capture', '?cardId=abc-123')
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?next=%2Fcapture%3FcardId%3Dabc-123'
    );
  });

  it('anonymous + /dismissed -> 307 redirect to /login?next=/dismissed', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await middleware(mockRequest('/dismissed'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?next=%2Fdismissed'
    );
  });

  it('authenticated + /capture -> NOT redirected (allowed through)', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'a@b.test' } },
    });
    const response = await middleware(mockRequest('/capture'));
    expect(response.headers.get('location')).toBe(null);
  });

  it('authenticated + /dismissed -> NOT redirected (allowed through)', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'a@b.test' } },
    });
    const response = await middleware(mockRequest('/dismissed'));
    expect(response.headers.get('location')).toBe(null);
  });

  it('matcher config excludes _next and asset paths', () => {
    // Single matcher, structural shape: the regex must skip _next/static,
    // _next/image, favicon.ico, and any *.svg/png/jpg/jpeg/gif/webp/ico.
    expect(Array.isArray(config.matcher)).toBe(true);
    const matcher = config.matcher[0] as string;
    expect(matcher).toContain('_next/static');
    expect(matcher).toContain('_next/image');
    expect(matcher).toContain('favicon.ico');
    expect(matcher).toContain('svg|png|jpg|jpeg|gif|webp|ico');
  });
});
