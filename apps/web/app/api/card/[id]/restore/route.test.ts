// What: Unit tests for POST /api/card/[id]/restore. Mocks the Supabase
//       server client's `.from('cards').update(...)` + `.select(...)`
//       chains so the tests run without a live stack. Covers 401, 400,
//       200 happy path, 404 (card not found), 409 (exists but not
//       dismissed), 500 (unexpected DB error → Sentry capture).
// Why:  Route is the only mutation surface for the restore flow; lock
//       the five branches against regression.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const VALID_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const { getUser, fromMock, sentryCapture } = vi.hoisted(() => ({
  getUser: vi.fn(),
  fromMock: vi.fn(),
  sentryCapture: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: fromMock,
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: sentryCapture,
}));

import { POST } from './route';

/** Build mock + helpers. */
function mockRequest(): NextRequest {
  return {} as unknown as NextRequest;
}

/**
 *
 */
function paramsContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/** Helper that constructs the update-chain mock for the happy path. */
function chainUpdate(updateResult: {
  data: unknown;
  error: unknown;
}): ReturnType<typeof vi.fn> {
  const maybeSingle = vi.fn().mockResolvedValue(updateResult);
  const select = vi.fn().mockReturnValue({ maybeSingle });
  const eqState = vi.fn().mockReturnValue({ select });
  const eqId = vi.fn().mockReturnValue({ eq: eqState });
  const update = vi.fn().mockReturnValue({ eq: eqId });
  return update;
}

/** Helper that constructs the select-chain mock used for the 404/409 lookup. */
function chainLookup(lookupResult: {
  data: unknown;
  error: unknown;
}): ReturnType<typeof vi.fn> {
  const maybeSingle = vi.fn().mockResolvedValue(lookupResult);
  const eqId = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq: eqId });
  return select;
}

beforeEach(() => {
  getUser.mockReset();
  fromMock.mockReset();
  sentryCapture.mockReset();
});

describe('POST /api/card/[id]/restore', () => {
  it('returns 401 when getUser returns null', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(mockRequest(), paramsContext(VALID_UUID));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns 400 when id is not a uuid', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    const res = await POST(mockRequest(), paramsContext('not-a-uuid'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'validation_failed' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns 200 + card_id on the happy path (update returns a row)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    const update = chainUpdate({ data: { id: VALID_UUID }, error: null });
    fromMock.mockReturnValue({ update });
    const res = await POST(mockRequest(), paramsContext(VALID_UUID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ card_id: VALID_UUID });
    expect(fromMock).toHaveBeenCalledWith('cards');
    expect(update).toHaveBeenCalledWith({ state: 'capturing' });
  });

  it('returns 404 when the lookup finds no row (card not found / not visible)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    const update = chainUpdate({ data: null, error: null });
    const select = chainLookup({ data: null, error: null });
    fromMock.mockReturnValueOnce({ update }).mockReturnValueOnce({ select });
    const res = await POST(mockRequest(), paramsContext(VALID_UUID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('returns 409 when the card exists but is not in dismissed state', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    const update = chainUpdate({ data: null, error: null });
    const select = chainLookup({
      data: { id: VALID_UUID, state: 'capturing' },
      error: null,
    });
    fromMock.mockReturnValueOnce({ update }).mockReturnValueOnce({ select });
    const res = await POST(mockRequest(), paramsContext(VALID_UUID));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'invalid_state' });
  });

  it('returns 500 + Sentry capture on unexpected update error', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    const update = chainUpdate({
      data: null,
      error: { code: 'XX000', message: 'db exploded' },
    });
    fromMock.mockReturnValue({ update });
    const res = await POST(mockRequest(), paramsContext(VALID_UUID));
    expect(res.status).toBe(500);
    expect(sentryCapture).toHaveBeenCalled();
  });
});
