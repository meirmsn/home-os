// What: Unit tests for the /auth/callback PKCE-exchange route handler.
//       Covers the success path (303 -> `next` default `/home`), the
//       custom `next` path, the exchange-error path (303 -> /login?error=
//       callback_failed), and the missing-`code` defensive branch (D10).
// Why:  Route handler is a thin glue layer over `exchangeCodeForSession`;
//       the four branches are exhaustively asserted with a mocked server
//       Supabase client so no live stack is required.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const { exchangeCodeForSession } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession },
  }),
}));

import { GET } from './route';

/**
 *
 */
function mockRequest(url: string): NextRequest {
  // The route only reads `request.url`. A plain object with that field
  // satisfies the NextRequest contract used here without dragging in the
  // real NextRequest constructor (which needs an edge-runtime polyfill).
  return { url } as unknown as NextRequest;
}

describe('/auth/callback GET', () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
  });

  it('303-redirects to `next` (custom) on a successful exchange', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(
      mockRequest('http://localhost:3000/auth/callback?code=abc&next=/home')
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3000/home');
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('303-redirects to `/home` (default) when `next` is omitted', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(
      mockRequest('http://localhost:3000/auth/callback?code=abc')
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3000/home');
  });

  it('303-redirects to /login?error=callback_failed on exchange error', async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: { message: 'invalid request: code expired', status: 400 },
    });
    const response = await GET(
      mockRequest('http://localhost:3000/auth/callback?code=stale')
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?error=callback_failed'
    );
  });

  it('303-redirects to /login?error=callback_failed when `code` is missing', async () => {
    const response = await GET(
      mockRequest('http://localhost:3000/auth/callback')
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?error=callback_failed'
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('refuses an absolute-URL `next` (open-redirect defense) — falls back to /home', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(
      mockRequest(
        'http://localhost:3000/auth/callback?code=abc&next=https%3A%2F%2Fevil.example.com%2Fphish'
      )
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3000/home');
  });

  it('refuses a protocol-relative `next` (//evil.example) — falls back to /home', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(
      mockRequest(
        'http://localhost:3000/auth/callback?code=abc&next=%2F%2Fevil.example.com%2Fphish'
      )
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3000/home');
  });

  it('refuses a non-/-prefixed `next` (e.g. "javascript:alert(1)") — falls back to /home', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(
      mockRequest(
        'http://localhost:3000/auth/callback?code=abc&next=javascript%3Aalert(1)'
      )
    );
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3000/home');
  });
});
