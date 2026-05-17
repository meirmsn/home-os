// What: Unit tests for POST /api/card/[id]/decide. Mocks supabase.rpc
//       (commit_decide) + supabase.from('cards') (the 404-vs-409 lookup
//       on invalid_state). Covers every documented envelope: 200 happy
//       paths (each path), 400 (validation), 401, 404, 409, 500.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const VALID_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';

const { getUser, rpc, lookupMaybeSingle, sentryCapture, sentryMessage } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    rpc: vi.fn(),
    lookupMaybeSingle: vi.fn(),
    sentryCapture: vi.fn(),
    sentryMessage: vi.fn(),
  }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: lookupMaybeSingle,
        }),
      }),
    }),
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: sentryCapture,
  captureMessage: sentryMessage,
}));

import { POST } from './route';

/**
 *
 */
function mockRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

/**
 *
 */
function mockRequestRaw(): NextRequest {
  return {
    json: async () => {
      throw new Error('not JSON');
    },
  } as unknown as NextRequest;
}

/**
 *
 */
function paramsContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getUser.mockReset();
  rpc.mockReset();
  lookupMaybeSingle.mockReset();
  sentryCapture.mockReset();
  sentryMessage.mockReset();

  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
});

describe('POST /api/card/[id]/decide — happy paths', () => {
  it.each(['diy', 'contractor'] as const)(
    'returns 200 + planned for path=%s',
    async (path) => {
      rpc.mockResolvedValue({
        data: [
          {
            card_id: VALID_UUID,
            new_state: 'planned',
            new_chosen_path: path,
          },
        ],
        error: null,
      });
      const res = await POST(mockRequest({ path }), paramsContext(VALID_UUID));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.state).toBe('planned');
      expect(body.chosen_path).toBe(path);
      expect(rpc).toHaveBeenCalledWith('commit_decide', {
        p_user: USER_ID,
        p_card: VALID_UUID,
        p_path: path,
        p_cadence: null,
      });
    }
  );

  it('returns 200 + monitoring for path=monitor with cadence', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          card_id: VALID_UUID,
          new_state: 'monitoring',
          new_chosen_path: 'monitor',
        },
      ],
      error: null,
    });
    const res = await POST(
      mockRequest({ path: 'monitor', monitoring_cadence_days: 30 }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('commit_decide', {
      p_user: USER_ID,
      p_card: VALID_UUID,
      p_path: 'monitor',
      p_cadence: 30,
    });
  });

  it('returns 200 + dismissed for path=dismiss', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          card_id: VALID_UUID,
          new_state: 'dismissed',
          new_chosen_path: null,
        },
      ],
      error: null,
    });
    const res = await POST(
      mockRequest({ path: 'dismiss' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('dismissed');
    expect(body.chosen_path).toBeNull();
  });

  it('returns 200 + decide for path=decide (re-open from planned)', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          card_id: VALID_UUID,
          new_state: 'decide',
          new_chosen_path: null,
        },
      ],
      error: null,
    });
    const res = await POST(
      mockRequest({ path: 'decide' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('decide');
  });
});

describe('POST /api/card/[id]/decide — validation 400s', () => {
  it('returns 400 when id is not a UUID', async () => {
    const res = await POST(
      mockRequest({ path: 'diy' }),
      paramsContext('not-a-uuid')
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_failed');
    expect(body.field).toBe('id');
  });

  it('returns 400 when body is invalid JSON', async () => {
    const res = await POST(mockRequestRaw(), paramsContext(VALID_UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_failed');
    expect(body.field).toBe('body');
  });

  it('returns 400 when path is missing', async () => {
    const res = await POST(mockRequest({}), paramsContext(VALID_UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('path');
  });

  it('returns 400 when path is unknown', async () => {
    const res = await POST(
      mockRequest({ path: 'wizard' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('path');
  });

  it('returns 400 when path=monitor but cadence missing', async () => {
    const res = await POST(
      mockRequest({ path: 'monitor' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('monitoring_cadence_days');
  });
});

describe('POST /api/card/[id]/decide — auth + state', () => {
  it('returns 401 when no session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(
      mockRequest({ path: 'diy' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when RPC says invalid_state AND no row exists', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'invalid_state' },
    });
    lookupMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(
      mockRequest({ path: 'diy' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
  });

  it('returns 409 when RPC says invalid_state AND row exists in wrong state', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'invalid_state' },
    });
    lookupMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID },
      error: null,
    });
    const res = await POST(
      mockRequest({ path: 'diy' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('invalid_state');
  });

  it('returns 401 when RPC raises forbidden', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'forbidden' },
    });
    const res = await POST(
      mockRequest({ path: 'diy' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when RPC raises invalid_path defensively', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'invalid_path' },
    });
    const res = await POST(
      mockRequest({ path: 'diy' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('path');
  });

  it('returns 400 when RPC raises cadence_required', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'cadence_required' },
    });
    const res = await POST(
      mockRequest({ path: 'monitor', monitoring_cadence_days: 30 }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('monitoring_cadence_days');
  });

  it('returns 500 + captures to Sentry on unexpected RPC error', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'something else' },
    });
    const res = await POST(
      mockRequest({ path: 'diy' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(500);
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('returns 500 + captures warning when RPC returns empty data', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const res = await POST(
      mockRequest({ path: 'diy' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(500);
    expect(sentryMessage).toHaveBeenCalled();
  });
});
