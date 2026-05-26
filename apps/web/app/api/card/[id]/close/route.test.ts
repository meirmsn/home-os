// What: Unit tests for POST /api/card/[id]/close. Mocks supabase.rpc
//       (close_card) + supabase.from('cards') (404-vs-409 lookup) +
//       supabase.storage + supabase.from('card_photos'). Covers every
//       documented envelope: 200, 400, 401, 404, 409, 500.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const VALID_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';

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

describe('POST /api/card/[id]/close — happy paths', () => {
  it('returns 200 — close without spend or photo', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          card_id: VALID_UUID,
          new_state: 'closed',
          closed_at: '2026-05-26T12:00:00Z',
        },
      ],
      error: null,
    });
    const res = await POST(mockFormDataRequest({}), paramsContext(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('closed');
    expect(body.card_id).toBe(VALID_UUID);
    expect(body.closed_at).toBe('2026-05-26T12:00:00Z');
    expect(rpc).toHaveBeenCalledWith('close_card', {
      p_user: USER_ID,
      p_card: VALID_UUID,
      p_spend_cents: null,
      p_spend_notes: null,
    });
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('returns 200 — close with spend_amount_cents + spend_notes', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          card_id: VALID_UUID,
          new_state: 'closed',
          closed_at: '2026-05-26T12:00:00Z',
        },
      ],
      error: null,
    });
    const res = await POST(
      mockFormDataRequest({
        spend_amount_cents: '8550',
        spend_notes: 'Fixed the leak myself',
      }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('close_card', {
      p_user: USER_ID,
      p_card: VALID_UUID,
      p_spend_cents: 8550,
      p_spend_notes: 'Fixed the leak myself',
    });
  });

  it('returns 200 — close with photo (mocked Storage)', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          card_id: VALID_UUID,
          new_state: 'closed',
          closed_at: '2026-05-26T12:00:00Z',
        },
      ],
      error: null,
    });
    const res = await POST(
      mockFormDataRequest({ photo: mockImageFile() }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(cardPhotosInsert).toHaveBeenCalledTimes(1);
    const insertCall = cardPhotosInsert.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(insertCall.touchpoint_type).toBe('close');
    expect(insertCall.slot).toBe('wide');
    expect(insertCall.card_id).toBe(VALID_UUID);
    expect(insertCall.user_id).toBe(USER_ID);
  });

  it('returns 200 — close with all three fields', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          card_id: VALID_UUID,
          new_state: 'closed',
          closed_at: '2026-05-26T12:00:00Z',
        },
      ],
      error: null,
    });
    const res = await POST(
      mockFormDataRequest({
        spend_amount_cents: '4200',
        spend_notes: 'Parts and labor',
        photo: mockImageFile(),
      }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('close_card', {
      p_user: USER_ID,
      p_card: VALID_UUID,
      p_spend_cents: 4200,
      p_spend_notes: 'Parts and labor',
    });
    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(cardPhotosInsert).toHaveBeenCalledTimes(1);
  });

  it('still closes the card when photo upload fails (photo-first, state-second)', async () => {
    storageUpload.mockResolvedValue({
      error: new Error('storage down'),
    });
    rpc.mockResolvedValue({
      data: [
        {
          card_id: VALID_UUID,
          new_state: 'closed',
          closed_at: '2026-05-26T12:00:00Z',
        },
      ],
      error: null,
    });
    const res = await POST(
      mockFormDataRequest({ photo: mockImageFile() }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    expect(sentryCapture).toHaveBeenCalled();
    expect(cardPhotosInsert).not.toHaveBeenCalled();
  });

  it('still closes the card when card_photos INSERT fails', async () => {
    cardPhotosInsert.mockResolvedValue({
      error: new Error('insert failed'),
    });
    rpc.mockResolvedValue({
      data: [
        {
          card_id: VALID_UUID,
          new_state: 'closed',
          closed_at: '2026-05-26T12:00:00Z',
        },
      ],
      error: null,
    });
    const res = await POST(
      mockFormDataRequest({ photo: mockImageFile() }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('trims spend_notes and converts empty to null', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          card_id: VALID_UUID,
          new_state: 'closed',
          closed_at: '2026-05-26T12:00:00Z',
        },
      ],
      error: null,
    });
    const res = await POST(
      mockFormDataRequest({ spend_notes: '   ' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('close_card', {
      p_user: USER_ID,
      p_card: VALID_UUID,
      p_spend_cents: null,
      p_spend_notes: null,
    });
  });
});

describe('POST /api/card/[id]/close — validation 400s', () => {
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

  it('returns 400 when spend_amount_cents is non-numeric', async () => {
    const res = await POST(
      mockFormDataRequest({ spend_amount_cents: 'abc' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('spend_amount_cents');
  });

  it('returns 400 when spend_notes exceeds 500 chars', async () => {
    const res = await POST(
      mockFormDataRequest({ spend_notes: 'x'.repeat(501) }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('spend_notes');
  });

  it('returns 400 when photo is not an image MIME type', async () => {
    const badFile = new File(['data'], 'doc.pdf', {
      type: 'application/pdf',
    });
    const res = await POST(
      mockFormDataRequest({ photo: badFile as unknown as File }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('photo');
  });
});

describe('POST /api/card/[id]/close — auth + state', () => {
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
