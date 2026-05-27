// What: Unit tests for PATCH /api/card/[id]/cadence. Mocks supabase
//       .from('cards').update() + lookup re-read for 404-vs-409.
//       Covers every documented envelope: 200, 400, 401, 404, 409, 500.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const VALID_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';

const { getUser, updateMaybeSingle, lookupMaybeSingle, sentryCapture } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    updateMaybeSingle: vi.fn(),
    lookupMaybeSingle: vi.fn(),
    sentryCapture: vi.fn(),
  }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => {
      if (table === 'cards') {
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: updateMaybeSingle,
                }),
              }),
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: lookupMaybeSingle,
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: sentryCapture,
}));

import { PATCH } from './route';

/** Build a JSON-body NextRequest mock. */
function mockJsonRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

/** Build a NextRequest that fails on json(). */
function mockBadJsonRequest(): NextRequest {
  return {
    json: async () => {
      throw new Error('not json');
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
  updateMaybeSingle.mockReset();
  lookupMaybeSingle.mockReset();
  sentryCapture.mockReset();

  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
});

describe('PATCH /api/card/[id]/cadence — happy paths', () => {
  it('returns 200 with valid cadence', async () => {
    updateMaybeSingle.mockResolvedValue({
      data: {
        id: VALID_UUID,
        monitoring_cadence_days: 14,
        next_check_at: '2026-06-10T00:00:00Z',
      },
      error: null,
    });
    const res = await PATCH(
      mockJsonRequest({ cadence_days: 14 }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.card_id).toBe(VALID_UUID);
    expect(body.monitoring_cadence_days).toBe(14);
    expect(body.next_check_at).toBe('2026-06-10T00:00:00Z');
  });
});

describe('PATCH /api/card/[id]/cadence — validation 400s', () => {
  it('returns 400 when id is not a UUID', async () => {
    const res = await PATCH(
      mockJsonRequest({ cadence_days: 14 }),
      paramsContext('not-a-uuid')
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_failed');
    expect(body.field).toBe('id');
  });

  it('returns 400 when body is not valid JSON', async () => {
    const res = await PATCH(mockBadJsonRequest(), paramsContext(VALID_UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_failed');
    expect(body.field).toBe('body');
  });

  it('returns 400 when cadence_days < 1', async () => {
    const res = await PATCH(
      mockJsonRequest({ cadence_days: 0 }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('cadence_days');
  });

  it('returns 400 when cadence_days > 365', async () => {
    const res = await PATCH(
      mockJsonRequest({ cadence_days: 366 }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('cadence_days');
  });

  it('returns 400 when cadence_days is not an integer', async () => {
    const res = await PATCH(
      mockJsonRequest({ cadence_days: 14.5 }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('cadence_days');
  });

  it('returns 400 when cadence_days is missing', async () => {
    const res = await PATCH(mockJsonRequest({}), paramsContext(VALID_UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('cadence_days');
  });
});

describe('PATCH /api/card/[id]/cadence — auth + state', () => {
  it('returns 401 when no session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await PATCH(
      mockJsonRequest({ cadence_days: 14 }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when update returns null AND lookup returns null', async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    lookupMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await PATCH(
      mockJsonRequest({ cadence_days: 14 }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
  });

  it('returns 409 when update returns null AND lookup returns a row (wrong state)', async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    lookupMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID, state: 'planned' },
      error: null,
    });
    const res = await PATCH(
      mockJsonRequest({ cadence_days: 14 }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('invalid_state');
  });

  it('returns 500 + Sentry on update error', async () => {
    updateMaybeSingle.mockResolvedValue({
      data: null,
      error: { code: '42P01', message: 'table missing' },
    });
    const res = await PATCH(
      mockJsonRequest({ cadence_days: 14 }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(500);
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('returns 500 + Sentry on lookup error', async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    lookupMaybeSingle.mockResolvedValue({
      data: null,
      error: { code: '42P01', message: 'table missing' },
    });
    const res = await PATCH(
      mockJsonRequest({ cadence_days: 14 }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(500);
    expect(sentryCapture).toHaveBeenCalled();
  });
});
