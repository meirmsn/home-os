// What: Unit tests for the /auth/signout POST route handler. Asserts that
//       POST calls supabase.auth.signOut once and 303-redirects to /login,
//       and that GET (and any other non-POST method) returns 405 with
//       Allow: POST without touching signOut (D10).
// Why:  The handler is tiny but its CSRF posture depends on POST-only —
//       a regression that allowed GET sign-out would be exploitable via
//       image tags. Lock the contract.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const { signOut } = vi.hoisted(() => ({
  signOut: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { signOut },
  }),
}));

import { POST, GET } from './route';

/**
 *
 */
function mockRequest(url: string): NextRequest {
  return { url } as unknown as NextRequest;
}

describe('/auth/signout', () => {
  beforeEach(() => {
    signOut.mockReset();
    signOut.mockResolvedValue({ error: null });
  });

  it('POST: signs out and 303-redirects to /login', async () => {
    const response = await POST(
      mockRequest('http://localhost:3000/auth/signout')
    );
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login'
    );
  });

  it('GET: returns 405 with Allow: POST and does NOT call signOut', async () => {
    const response = GET();
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(signOut).not.toHaveBeenCalled();
  });
});
