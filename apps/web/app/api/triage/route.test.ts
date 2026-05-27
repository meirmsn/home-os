// What: Unit tests for POST /api/triage. Mocks the Supabase server
//       client (auth/getUser, .from('cards'), .rpc) + the four _lib/*
//       helpers + the Anthropic APIError class.
// Why:  The route is the trust boundary for the AI initial-read
//       pipeline (auth, state classification, atomic transition, photo
//       trust boundary, model call, parse, persist, revert-on-error).
//       Locking every branch here makes the contract hermetic.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const VALID_UUID = '11111111-2222-3333-4444-555555555555';
const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const {
  getUser,
  cardMaybeSingle,
  cardUpdateChain,
  rpc,
  fetchPhotos,
  callInitialReadMock,
  parseInitialReadMock,
  sentryCapture,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  cardMaybeSingle: vi.fn(),
  cardUpdateChain: vi.fn(),
  rpc: vi.fn(),
  fetchPhotos: vi.fn(),
  callInitialReadMock: vi.fn(),
  parseInitialReadMock: vi.fn(),
  sentryCapture: vi.fn(),
}));

// Update chain: from('cards').update({state}).eq(...).eq(...).eq(...) — fully
// chainable; final await resolves via cardUpdateChain mock.
class ChainableUpdate {
  eq() {
    return this;
  }
  then<T>(onFulfilled: (v: { error: unknown }) => T): Promise<T> {
    return Promise.resolve(cardUpdateChain()).then(onFulfilled);
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from: () => ({
      // Read chain: from('cards').select(...).eq('id', ...).maybeSingle()
      select: () => ({
        eq: () => ({
          maybeSingle: cardMaybeSingle,
        }),
      }),
      update: () => new ChainableUpdate(),
    }),
  }),
}));

vi.mock('@/app/api/triage/_lib/photos', () => ({
  fetchCardPhotosAsBase64: fetchPhotos,
}));

vi.mock('@/app/api/triage/_lib/anthropic', () => ({
  callInitialRead: callInitialReadMock,
  DEFAULT_TRIAGE_MODEL: 'claude-sonnet-4-6',
}));

vi.mock('@/app/api/triage/_lib/parse-tool-output', () => ({
  parseInitialRead: parseInitialReadMock,
}));

vi.mock('@/app/api/triage/_lib/prompt', () => ({
  resolveSystemPrompt: () => 'SYS',
}));

// Mock the Anthropic SDK module's APIError so `err instanceof APIError`
// branches in the route work in tests. The factory must be self-contained
// because vi.mock is hoisted; declaring the class inline keeps it that way.
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropicAPIErrorInline extends Error {
    status: number;
    headers: { get: (k: string) => string | null };
    constructor(opts: { status: number; retryAfter?: string }) {
      super(`anthropic error ${opts.status}`);
      this.status = opts.status;
      const ra = opts.retryAfter ?? null;
      this.headers = { get: (k) => (k === 'retry-after' ? ra : null) };
    }
  }
  return { APIError: MockAnthropicAPIErrorInline };
});

// Re-import the same class symbol the route handler will compare with
// `instanceof`. Alias for convenient construction in test cases.
import { APIError as MockAnthropicAPIError } from '@anthropic-ai/sdk';

type AnthropicErrorCtor = new (opts: {
  status: number;
  retryAfter?: string;
}) => Error;

/** Build a mocked Anthropic APIError instance via the mocked-module class. */
function makeAnthropicError(opts: { status: number; retryAfter?: string }) {
  const Ctor = MockAnthropicAPIError as unknown as AnthropicErrorCtor;
  return new Ctor(opts);
}

vi.mock('@sentry/nextjs', () => ({
  captureException: sentryCapture,
}));

import { POST } from './route';

/** Build a mock NextRequest whose json() resolves to the given body. */
function mockRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

/** Build a card row in `capturing` state by default. */
function cardRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: VALID_UUID,
    user_id: USER_ID,
    state: 'capturing',
    initial_description: 'Leaky faucet.',
    system_tag: 'plumbing',
    room_tag: 'Kitchen',
    ...overrides,
  };
}

beforeEach(() => {
  getUser.mockReset();
  cardMaybeSingle.mockReset();
  cardUpdateChain.mockReset();
  rpc.mockReset();
  fetchPhotos.mockReset();
  callInitialReadMock.mockReset();
  parseInitialReadMock.mockReset();
  sentryCapture.mockReset();

  // Defaults that the happy-path test relies on.
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  cardMaybeSingle.mockResolvedValue({ data: cardRow(), error: null });
  cardUpdateChain.mockResolvedValue({ error: null });
  rpc.mockResolvedValue({ data: null, error: null });
  fetchPhotos.mockResolvedValue([]);
  callInitialReadMock.mockResolvedValue({
    id: 'msg_1',
    content: [
      {
        type: 'tool_use',
        name: 'record_initial_read',
        input: { ok: true },
      },
    ],
  });
  parseInitialReadMock.mockReturnValue({
    ok: true,
    value: {
      summary: 'A test summary.',
      severity_provisional: 'soon',
      what_im_confident_about: 'confident',
      what_i_need_to_know: ['q1', 'q2', 'q3'],
      sources: [{ url: 'https://example.com', title: 'Example' }],
      system_tag_proposed: 'plumbing',
      contractor_tag_proposed: 'plumber',
    },
  });
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
});

describe('POST /api/triage', () => {
  it('returns 401 auth_required when getUser returns null', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'auth_required' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 400 when body is not JSON', async () => {
    const req = {
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_failed');
    expect(body.fields.card_id).toBeDefined();
  });

  it('returns 400 when card_id is missing', async () => {
    const res = await POST(mockRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_failed');
  });

  it('returns 400 when card_id is not a uuid', async () => {
    const res = await POST(mockRequest({ card_id: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation_failed');
  });

  it('returns 404 when the card row select returns no row', async () => {
    cardMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('card_not_found');
  });

  it('returns 500 when the card row select errors', async () => {
    cardMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'rls' },
    });
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('server_error');
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('returns 202 triage_in_progress when card state is triaging', async () => {
    cardMaybeSingle.mockResolvedValue({
      data: cardRow({ state: 'triaging' }),
      error: null,
    });
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(202);
    expect((await res.json()).error).toBe('triage_in_progress');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 409 already_triaged when card state is diagnosed', async () => {
    cardMaybeSingle.mockResolvedValue({
      data: cardRow({ state: 'diagnosed' }),
      error: null,
    });
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('already_triaged');
  });

  it.each(['monitoring', 'closed', 'dismissed'])(
    'returns 409 invalid_state when card state is %s',
    async (state) => {
      cardMaybeSingle.mockResolvedValue({
        data: cardRow({ state }),
        error: null,
      });
      const res = await POST(mockRequest({ card_id: VALID_UUID }));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('invalid_state');
    }
  );

  it('returns 409 invalid_state when start_triage raises P0001 (race)', async () => {
    rpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'start_triage') {
        return {
          data: null,
          error: {
            code: 'P0001',
            message: 'triage_invalid_state',
          },
        };
      }
      return { data: null, error: null };
    });
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('invalid_state');
    expect(sentryCapture).not.toHaveBeenCalled();
  });

  it('returns 500 + Sentry when start_triage errors with any other code', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'forbidden' },
    });
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(500);
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('happy path: 200 with severity + questions; all RPCs receive user.id as p_user', async () => {
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      card_id: VALID_UUID,
      severity_provisional: 'soon',
      what_i_need_to_know: ['q1', 'q2', 'q3'],
    });
    // Both RPCs receive p_user === user.id (never from body).
    const startCall = rpc.mock.calls.find((c) => c[0] === 'start_triage');
    const completeCall = rpc.mock.calls.find((c) => c[0] === 'complete_triage');
    expect(startCall?.[1].p_user).toBe(USER_ID);
    expect(completeCall?.[1].p_user).toBe(USER_ID);
    expect(completeCall?.[1].p_card).toBe(VALID_UUID);
    expect(completeCall?.[1].p_diagnosis).toBe('A test summary.');
    expect(completeCall?.[1].p_severity_provisional).toBe('soon');
    expect(completeCall?.[1].p_system_tag).toBe('plumbing');
    expect(completeCall?.[1].p_contractor_tag).toBe('plumber');
    expect(typeof completeCall?.[1].p_assistant_content).toBe('string');
    // The assistant content is the JSON-serialized full payload.
    const parsedContent = JSON.parse(completeCall?.[1].p_assistant_content);
    expect(parsedContent.summary).toBe('A test summary.');
    expect(parsedContent.sources).toEqual([
      { url: 'https://example.com', title: 'Example' },
    ]);
  });

  it('photos: passes fetched images to callInitialRead', async () => {
    const images = [{ media_type: 'image/jpeg', data: 'AAA=' }];
    fetchPhotos.mockResolvedValue(images);
    await POST(mockRequest({ card_id: VALID_UUID }));
    expect(fetchPhotos).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      VALID_UUID
    );
    expect(callInitialReadMock).toHaveBeenCalledTimes(1);
    expect(callInitialReadMock.mock.calls[0]?.[0].images).toEqual(images);
  });

  it('returns 502 triage_invalid_output + reverts state when parse fails', async () => {
    parseInitialReadMock.mockReturnValue({
      ok: false,
      field: 'severity_provisional',
      reason: 'bad',
    });
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('triage_invalid_output');
    expect(cardUpdateChain).toHaveBeenCalled();
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('returns 502 + reverts when no record_initial_read tool_use block exists', async () => {
    callInitialReadMock.mockResolvedValue({
      id: 'msg_x',
      content: [{ type: 'text', text: 'I refuse.' }],
    });
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('triage_invalid_output');
    expect(cardUpdateChain).toHaveBeenCalled();
    // parseInitialRead is never called when the tool block is missing.
    expect(parseInitialReadMock).not.toHaveBeenCalled();
  });

  it('returns 429 triage_rate_limited + retry_after_s on Anthropic 429', async () => {
    callInitialReadMock.mockRejectedValue(
      makeAnthropicError({ status: 429, retryAfter: '47' })
    );
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('triage_rate_limited');
    expect(body.retry_after_s).toBe(47);
    expect(cardUpdateChain).toHaveBeenCalled();
    // No Sentry capture on 429 (expected backpressure).
    expect(sentryCapture).not.toHaveBeenCalled();
  });

  it('falls back retry_after_s=30 when 429 has no retry-after header', async () => {
    callInitialReadMock.mockRejectedValue(makeAnthropicError({ status: 429 }));
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    const body = await res.json();
    expect(body.retry_after_s).toBe(30);
  });

  it('returns 503 + Sentry on Anthropic 5xx', async () => {
    callInitialReadMock.mockRejectedValue(makeAnthropicError({ status: 503 }));
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('triage_unavailable');
    expect(cardUpdateChain).toHaveBeenCalled();
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('returns 503 + Sentry on a non-Anthropic-typed error (network / timeout)', async () => {
    callInitialReadMock.mockRejectedValue(new Error('ECONNRESET'));
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('triage_unavailable');
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('captures double Sentry when revert itself fails after an upstream error', async () => {
    callInitialReadMock.mockRejectedValue(makeAnthropicError({ status: 500 }));
    cardUpdateChain.mockResolvedValue({ error: { message: 'revert failed' } });
    await POST(mockRequest({ card_id: VALID_UUID }));
    // One Sentry call for the upstream error + one for the revert failure.
    expect(sentryCapture).toHaveBeenCalledTimes(2);
  });

  it('returns 500 + reverts when complete_triage RPC errors', async () => {
    rpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'complete_triage') {
        return { data: null, error: { code: 'XXXXX', message: 'boom' } };
      }
      return { data: null, error: null };
    });
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(500);
    expect(cardUpdateChain).toHaveBeenCalled();
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('returns 500 + reverts when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(500);
    expect(sentryCapture).toHaveBeenCalled();
    // Restore so subsequent tests aren't affected.
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  });
});

describe('POST /api/triage — BYOK key handling', () => {
  it('uses byok_key for the Anthropic call when present', async () => {
    await POST(mockRequest({ card_id: VALID_UUID, byok_key: 'sk-ant-user' }));
    expect(callInitialReadMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-ant-user' })
    );
  });

  it('returns 401 byok_invalid when Anthropic returns 401 with BYOK key', async () => {
    callInitialReadMock.mockRejectedValue(makeAnthropicError({ status: 401 }));
    const res = await POST(
      mockRequest({ card_id: VALID_UUID, byok_key: 'sk-ant-bad' })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('byok_invalid');
    expect(cardUpdateChain).toHaveBeenCalled(); // state reverted
  });

  it('returns 402 byok_out_of_credits when Anthropic returns 402 with BYOK key', async () => {
    callInitialReadMock.mockRejectedValue(makeAnthropicError({ status: 402 }));
    const res = await POST(
      mockRequest({ card_id: VALID_UUID, byok_key: 'sk-ant-nocredit' })
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe('byok_out_of_credits');
  });

  it('falls back to server key when byok_key is absent', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-server';
    await POST(mockRequest({ card_id: VALID_UUID }));
    expect(callInitialReadMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-ant-server' })
    );
  });
});
