// What: Unit tests for PATCH /api/card/[id]/reminder. Mocks the
//       supabase user-context client's update + lookup chains so the
//       tests run without a live stack. Covers 200/400/401/404/409/500
//       envelopes, set + clear paths, and the state guard's 404-vs-409
//       disambiguation.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const VALID_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';

const {
  getUser,
  updateMaybeSingle,
  lookupMaybeSingle,
  updateSpy,
  stateSpy,
  sentryCapture,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateMaybeSingle: vi.fn(),
  lookupMaybeSingle: vi.fn(),
  updateSpy: vi.fn(),
  stateSpy: vi.fn(),
  sentryCapture: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => {
      if (table !== 'cards') throw new Error('unexpected table');
      return {
        update: (payload: Record<string, unknown>) => {
          updateSpy(payload);
          return {
            eq: (col1: string, val1: unknown) => ({
              eq: (col2: string, val2: unknown) => {
                stateSpy({ col1, val1, col2, val2 });
                return {
                  select: () => ({ maybeSingle: updateMaybeSingle }),
                };
              },
            }),
          };
        },
        select: () => ({
          eq: () => ({ maybeSingle: lookupMaybeSingle }),
        }),
      };
    },
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: sentryCapture,
}));

import { PATCH } from './route';

/** Stub NextRequest with a `json()` returning the supplied body. */
function mockRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

/** Build the `context` arg shape Next 16 passes to route handlers. */
function paramsContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getUser.mockReset();
  updateMaybeSingle.mockReset();
  lookupMaybeSingle.mockReset();
  updateSpy.mockReset();
  stateSpy.mockReset();
  sentryCapture.mockReset();

  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
});

describe('PATCH /api/card/[id]/reminder — happy paths', () => {
  it('sets a future date and returns 200 with the persisted value', async () => {
    updateMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID, planned_reminder_date: '2026-06-15' },
      error: null,
    });
    const res = await PATCH(
      mockRequest({ reminder_date: '2026-06-15' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.card_id).toBe(VALID_UUID);
    expect(body.planned_reminder_date).toBe('2026-06-15');
    expect(updateSpy).toHaveBeenCalledWith({
      planned_reminder_date: '2026-06-15',
    });
    // The state guard is in the chain — only state='planned' rows update.
    expect(stateSpy.mock.calls[0]?.[0]).toMatchObject({
      col2: 'state',
      val2: 'planned',
    });
  });

  it('sets a past date and returns 200 (D5 allows past)', async () => {
    updateMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID, planned_reminder_date: '2020-01-01' },
      error: null,
    });
    const res = await PATCH(
      mockRequest({ reminder_date: '2020-01-01' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
  });

  it('clears (null) and returns 200 with planned_reminder_date=null', async () => {
    updateMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID, planned_reminder_date: null },
      error: null,
    });
    const res = await PATCH(
      mockRequest({ reminder_date: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.planned_reminder_date).toBe(null);
    expect(updateSpy).toHaveBeenCalledWith({ planned_reminder_date: null });
  });
});

describe('PATCH /api/card/[id]/reminder — validation', () => {
  it('returns 400 on bad UUID', async () => {
    const res = await PATCH(
      mockRequest({ reminder_date: '2026-06-15' }),
      paramsContext('not-a-uuid')
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('id');
  });

  it('returns 400 on invalid JSON', async () => {
    const res = await PATCH(
      {
        json: async () => {
          throw new Error('bad');
        },
      } as unknown as NextRequest,
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when reminder_date missing entirely', async () => {
    const res = await PATCH(mockRequest({}), paramsContext(VALID_UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('reminder_date');
  });

  it('returns 400 on malformed reminder_date (regex)', async () => {
    const res = await PATCH(
      mockRequest({ reminder_date: '06/15/2026' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('reminder_date');
  });

  it('returns 400 on semantic-invalid date (Feb 30)', async () => {
    const res = await PATCH(
      mockRequest({ reminder_date: '2026-02-30' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 on non-object body', async () => {
    const res = await PATCH(
      mockRequest('not an object'),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/card/[id]/reminder — auth + state', () => {
  it('returns 401 when no session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await PATCH(
      mockRequest({ reminder_date: '2026-06-15' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when no row matches and re-read finds nothing', async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    lookupMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await PATCH(
      mockRequest({ reminder_date: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
  });

  it('returns 409 when row exists in non-planned state — decide', async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    lookupMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID, state: 'decide' },
      error: null,
    });
    const res = await PATCH(
      mockRequest({ reminder_date: '2026-06-15' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('invalid_state');
  });

  it('returns 409 when row exists in monitoring state', async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    lookupMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID, state: 'monitoring' },
      error: null,
    });
    const res = await PATCH(
      mockRequest({ reminder_date: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(409);
  });

  it('returns 409 when row exists in closed state', async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    lookupMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID, state: 'closed' },
      error: null,
    });
    const res = await PATCH(
      mockRequest({ reminder_date: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(409);
  });

  it('returns 409 when row exists in dismissed state', async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    lookupMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID, state: 'dismissed' },
      error: null,
    });
    const res = await PATCH(
      mockRequest({ reminder_date: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(409);
  });

  it('returns 409 when row exists in diagnosed state', async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    lookupMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID, state: 'diagnosed' },
      error: null,
    });
    const res = await PATCH(
      mockRequest({ reminder_date: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(409);
  });

  it('returns 409 when row exists in capturing state', async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    lookupMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID, state: 'capturing' },
      error: null,
    });
    const res = await PATCH(
      mockRequest({ reminder_date: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(409);
  });

  it('returns 409 when row exists in triaging state', async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    lookupMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID, state: 'triaging' },
      error: null,
    });
    const res = await PATCH(
      mockRequest({ reminder_date: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(409);
  });

  it('returns 500 + Sentry on update error', async () => {
    updateMaybeSingle.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'oops' },
    });
    const res = await PATCH(
      mockRequest({ reminder_date: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(500);
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('returns 500 + Sentry on lookup error during 404-vs-409 disambig', async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    lookupMaybeSingle.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'lookup oops' },
    });
    const res = await PATCH(
      mockRequest({ reminder_date: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(500);
    expect(sentryCapture).toHaveBeenCalled();
  });
});
