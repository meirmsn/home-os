// What: Unit tests for POST /api/card/[id]/checkin. Mocks supabase.rpc
//       (record_checkin) + supabase.from('cards') (404-vs-409 lookup) +
//       supabase.storage + supabase.from('card_photos'). Covers every
//       documented envelope: 200, 400, 401, 404, 409, 500.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const VALID_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const CHECKIN_ID = 'cccccccc-dddd-eeee-ffff-000000000000';

const {
  getUser,
  rpc,
  lookupMaybeSingle,
  storageUpload,
  cardPhotosInsert,
  sentryCapture,
  sentryMessage,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  lookupMaybeSingle: vi.fn(),
  storageUpload: vi.fn(),
  cardPhotosInsert: vi.fn(),
  sentryCapture: vi.fn(),
  sentryMessage: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from: (table: string) => {
      if (table === 'cards') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: lookupMaybeSingle,
            }),
          }),
        };
      }
      if (table === 'card_photos') {
        return {
          insert: cardPhotosInsert,
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: vi.fn() }) }) };
    },
    storage: {
      from: () => ({
        upload: storageUpload,
      }),
    },
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: sentryCapture,
  captureMessage: sentryMessage,
}));

import { POST } from './route';

/** Build a FormData-backed NextRequest mock. */
function mockFormDataRequest(
  fields: Record<string, string | File>
): NextRequest {
  return {
    formData: async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) {
        fd.append(k, v);
      }
      return fd;
    },
  } as unknown as NextRequest;
}

/** Build a NextRequest that fails on formData(). */
function mockBadFormDataRequest(): NextRequest {
  return {
    formData: async () => {
      throw new Error('not form data');
    },
  } as unknown as NextRequest;
}

/**
 *
 */
function paramsContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/** Create a mock File. */
function mockImageFile(name = 'photo.jpg', type = 'image/jpeg'): File {
  return new File(['pixels'], name, { type });
}

beforeEach(() => {
  getUser.mockReset();
  rpc.mockReset();
  lookupMaybeSingle.mockReset();
  storageUpload.mockReset();
  cardPhotosInsert.mockReset();
  sentryCapture.mockReset();
  sentryMessage.mockReset();

  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  storageUpload.mockResolvedValue({ error: null });
  cardPhotosInsert.mockResolvedValue({ error: null });
});

describe('POST /api/card/[id]/checkin — happy paths', () => {
  it('returns 200 — check-in with no notes or photos', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          checkin_id: CHECKIN_ID,
          card_id: VALID_UUID,
          next_check_at: '2026-06-10T12:00:00Z',
        },
      ],
      error: null,
    });
    const res = await POST(mockFormDataRequest({}), paramsContext(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkin_id).toBe(CHECKIN_ID);
    expect(body.card_id).toBe(VALID_UUID);
    expect(body.next_check_at).toBe('2026-06-10T12:00:00Z');
    expect(body.photo_count).toBe(0);
    expect(rpc).toHaveBeenCalledWith('record_checkin', {
      p_user: USER_ID,
      p_card: VALID_UUID,
      p_notes: null,
    });
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('returns 200 — check-in with notes', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          checkin_id: CHECKIN_ID,
          card_id: VALID_UUID,
          next_check_at: '2026-06-10T12:00:00Z',
        },
      ],
      error: null,
    });
    const res = await POST(
      mockFormDataRequest({ notes: 'Looking good' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('record_checkin', {
      p_user: USER_ID,
      p_card: VALID_UUID,
      p_notes: 'Looking good',
    });
  });

  it('returns 200 — check-in with 1 photo', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          checkin_id: CHECKIN_ID,
          card_id: VALID_UUID,
          next_check_at: '2026-06-10T12:00:00Z',
        },
      ],
      error: null,
    });
    const res = await POST(
      mockFormDataRequest({ photo_wide: mockImageFile() }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.photo_count).toBe(1);
    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(cardPhotosInsert).toHaveBeenCalledTimes(1);
    const insertCall = cardPhotosInsert.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(insertCall.touchpoint_type).toBe('checkin');
    expect(insertCall.slot).toBe('wide');
    expect(insertCall.touchpoint_id).toBe(CHECKIN_ID);
  });

  it('returns 200 — check-in with 3 photos', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          checkin_id: CHECKIN_ID,
          card_id: VALID_UUID,
          next_check_at: '2026-06-10T12:00:00Z',
        },
      ],
      error: null,
    });
    const res = await POST(
      mockFormDataRequest({
        photo_wide: mockImageFile('wide.jpg'),
        photo_zoom: mockImageFile('zoom.jpg'),
        photo_detail: mockImageFile('detail.jpg'),
      }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.photo_count).toBe(3);
    expect(storageUpload).toHaveBeenCalledTimes(3);
    expect(cardPhotosInsert).toHaveBeenCalledTimes(3);
  });

  it('returns 200 — check-in still succeeds when photo upload fails', async () => {
    storageUpload.mockResolvedValue({
      error: new Error('storage down'),
    });
    rpc.mockResolvedValue({
      data: [
        {
          checkin_id: CHECKIN_ID,
          card_id: VALID_UUID,
          next_check_at: '2026-06-10T12:00:00Z',
        },
      ],
      error: null,
    });
    const res = await POST(
      mockFormDataRequest({ photo_wide: mockImageFile() }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.photo_count).toBe(0);
    expect(sentryCapture).toHaveBeenCalled();
    expect(cardPhotosInsert).not.toHaveBeenCalled();
  });

  it('returns 200 — check-in still succeeds when card_photos INSERT fails', async () => {
    cardPhotosInsert.mockResolvedValue({
      error: new Error('insert failed'),
    });
    rpc.mockResolvedValue({
      data: [
        {
          checkin_id: CHECKIN_ID,
          card_id: VALID_UUID,
          next_check_at: '2026-06-10T12:00:00Z',
        },
      ],
      error: null,
    });
    const res = await POST(
      mockFormDataRequest({ photo_wide: mockImageFile() }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.photo_count).toBe(0);
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('trims notes and converts empty to null', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          checkin_id: CHECKIN_ID,
          card_id: VALID_UUID,
          next_check_at: '2026-06-10T12:00:00Z',
        },
      ],
      error: null,
    });
    const res = await POST(
      mockFormDataRequest({ notes: '   ' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('record_checkin', {
      p_user: USER_ID,
      p_card: VALID_UUID,
      p_notes: null,
    });
  });
});

describe('POST /api/card/[id]/checkin — validation 400s', () => {
  it('returns 400 when id is not a UUID', async () => {
    const res = await POST(
      mockFormDataRequest({}),
      paramsContext('not-a-uuid')
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_failed');
    expect(body.field).toBe('id');
  });

  it('returns 400 when body is not valid form data', async () => {
    const res = await POST(mockBadFormDataRequest(), paramsContext(VALID_UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_failed');
    expect(body.field).toBe('body');
  });

  it('returns 400 when notes exceed 500 chars', async () => {
    const res = await POST(
      mockFormDataRequest({ notes: 'x'.repeat(501) }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('notes');
  });

  it('returns 400 when photo is not an image MIME type', async () => {
    const badFile = new File(['data'], 'doc.pdf', {
      type: 'application/pdf',
    });
    const res = await POST(
      mockFormDataRequest({ photo_wide: badFile as unknown as File }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('photo_wide');
  });
});

describe('POST /api/card/[id]/checkin — auth + state', () => {
  it('returns 401 when no session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(mockFormDataRequest({}), paramsContext(VALID_UUID));
    expect(res.status).toBe(401);
  });

  it('returns 404 when RPC says invalid_state AND no row exists', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'invalid_state' },
    });
    lookupMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(mockFormDataRequest({}), paramsContext(VALID_UUID));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
  });

  it('returns 409 when RPC says invalid_state AND row exists (wrong state)', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'invalid_state' },
    });
    lookupMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID },
      error: null,
    });
    const res = await POST(mockFormDataRequest({}), paramsContext(VALID_UUID));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('invalid_state');
  });

  it('returns 401 when RPC raises forbidden', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'forbidden' },
    });
    const res = await POST(mockFormDataRequest({}), paramsContext(VALID_UUID));
    expect(res.status).toBe(401);
  });

  it('returns 500 + captures to Sentry on unexpected RPC error', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'something else' },
    });
    const res = await POST(mockFormDataRequest({}), paramsContext(VALID_UUID));
    expect(res.status).toBe(500);
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('returns 500 + captures warning when RPC returns empty data', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const res = await POST(mockFormDataRequest({}), paramsContext(VALID_UUID));
    expect(res.status).toBe(500);
    expect(sentryMessage).toHaveBeenCalled();
  });
});
