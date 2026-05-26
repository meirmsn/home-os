// What: Unit tests for POST /api/key-validate. Mocks Supabase client
//       (auth, rpc), the Anthropic SDK constructor + messages.create,
//       and Sentry. Covers the full envelope matrix: auth, validation,
//       valid key, invalid key (401), out of credits (402), network
//       error, mark_byok_used called on success.
// Why:  The route is the trust boundary for BYOK key validation. Every
//       branch is locked here so the contract is hermetic.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const { getUser, rpc, anthropicCreateSpy, sentryCapture } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  anthropicCreateSpy: vi.fn(),
  sentryCapture: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
  }),
}));

// Mock the Anthropic SDK module. The constructor spy tracks apiKey; the
// create spy controls whether the probe succeeds or throws.
class MockAPIError extends Error {
  status: number;
  constructor(
    status: number,
    _err: unknown,
    message: string,
    _headers: unknown
  ) {
    super(message);
    this.status = status;
    this.name = 'APIError';
  }
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {
      // no-op
    }
    messages = { create: anthropicCreateSpy };
  },
  APIError: MockAPIError,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: sentryCapture,
}));

/**
 *
 */
function makeRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/key-validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

/**
 *
 */
function makeBadJsonRequest(): NextRequest {
  return new Request('http://localhost/api/key-validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'not-json',
  }) as unknown as NextRequest;
}

let POST: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  vi.resetModules();
  getUser.mockReset();
  rpc.mockReset();
  anthropicCreateSpy.mockReset();
  sentryCapture.mockReset();

  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  anthropicCreateSpy.mockResolvedValue({ id: 'msg_test', content: [] });
  rpc.mockResolvedValue({ error: null });

  const mod = await import('./route');
  POST = mod.POST;
});

describe('POST /api/key-validate', () => {
  it('returns 401 when unauthenticated', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makeRequest({ key: 'sk-ant-test' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('auth_required');
  });

  it('returns 400 for non-JSON body', async () => {
    const res = await POST(makeBadJsonRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_failed');
  });

  it('returns 400 for missing key', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_failed');
    expect(body.fields.key).toContain('non-empty');
  });

  it('returns 400 for empty key', async () => {
    const res = await POST(makeRequest({ key: '   ' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_failed');
  });

  it('returns 200 { valid: true } for a valid key', async () => {
    const res = await POST(makeRequest({ key: 'sk-ant-valid' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });

  it('calls mark_byok_used on success', async () => {
    await POST(makeRequest({ key: 'sk-ant-valid' }));
    expect(rpc).toHaveBeenCalledWith('mark_byok_used', { p_user: USER_ID });
  });

  it('returns 200 { error: "invalid_key" } on Anthropic 401', async () => {
    anthropicCreateSpy.mockRejectedValueOnce(
      new MockAPIError(401, null, 'Invalid API key', null)
    );
    const res = await POST(makeRequest({ key: 'sk-ant-bad' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBe('invalid_key');
  });

  it('returns 200 { error: "out_of_credits" } on Anthropic 402', async () => {
    anthropicCreateSpy.mockRejectedValueOnce(
      new MockAPIError(402, null, 'Insufficient credits', null)
    );
    const res = await POST(makeRequest({ key: 'sk-ant-nocredit' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBe('out_of_credits');
  });

  it('returns 500 on network / unknown Anthropic error', async () => {
    anthropicCreateSpy.mockRejectedValueOnce(new Error('network timeout'));
    const res = await POST(makeRequest({ key: 'sk-ant-timeout' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('server_error');
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('still returns valid:true when mark_byok_used fails', async () => {
    rpc.mockResolvedValueOnce({
      error: { code: '42501', message: 'forbidden' },
    });
    const res = await POST(makeRequest({ key: 'sk-ant-valid' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    // Sentry should have captured the RPC error
    expect(sentryCapture).toHaveBeenCalled();
  });
});
