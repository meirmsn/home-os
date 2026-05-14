// What: Unit tests for POST /api/card. Mocks the supabase server client
//       so the test runs without a live stack. Covers: 401 (no user),
//       400 (validation), 201 happy path (with and without photo), 429
//       cap-hit (no Storage call, no Sentry capture), 500 (other Postgres
//       error -> Sentry called), 201 with photo_uploaded:false when the
//       Storage upload throws (card persists, eng-review § Rescue #1).
// Why:  Route is the single trust boundary for capture; the four branches
//       are the contract. Locking them with a mocked client makes the
//       suite hermetic.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const VALID_UUID = '11111111-2222-3333-4444-555555555555';

const { getUser, rpc, storageUpload, cardPhotosInsert, sentryCapture } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    rpc: vi.fn(),
    storageUpload: vi.fn(),
    cardPhotosInsert: vi.fn(),
    sentryCapture: vi.fn(),
  }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    storage: {
      from: () => ({ upload: storageUpload }),
    },
    from: () => ({ insert: cardPhotosInsert }),
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: sentryCapture,
}));

import { POST } from './route';

/** Build a mock NextRequest whose formData() resolves to the given fields. */
function mockRequest(fields: Record<string, string | File>): NextRequest {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value as Blob | string);
  }
  return {
    formData: async () => fd,
  } as unknown as NextRequest;
}

/** Default valid body fields. Tests override individual keys. */
function validFields(
  overrides: Record<string, string | File> = {}
): Record<string, string | File> {
  return {
    description: 'Kitchen sink dripping under the cabinet for two days.',
    system_tag: 'plumbing',
    room_tag: 'Kitchen',
    touchpoint_id: VALID_UUID,
    ...overrides,
  };
}

beforeEach(() => {
  getUser.mockReset();
  rpc.mockReset();
  storageUpload.mockReset();
  cardPhotosInsert.mockReset();
  sentryCapture.mockReset();
});

describe('POST /api/card', () => {
  it('returns 401 when getUser returns null', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(mockRequest(validFields()));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(rpc).not.toHaveBeenCalled();
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('returns 400 with field error when description is empty', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    const res = await POST(
      mockRequest(validFields({ description: '   \n\t  ' }))
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_failed');
    expect(body.fields.description).toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 400 when system_tag is not one of the 9 enum values', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    const res = await POST(
      mockRequest(validFields({ system_tag: 'not-a-tag' }))
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields.system_tag).toBeDefined();
  });

  it('returns 400 when room_tag exceeds 80 chars', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    const res = await POST(
      mockRequest(validFields({ room_tag: 'r'.repeat(81) }))
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields.room_tag).toBeDefined();
  });

  it('returns 400 when touchpoint_id is not a uuid', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    const res = await POST(
      mockRequest(validFields({ touchpoint_id: 'not-a-uuid' }))
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields.touchpoint_id).toBeDefined();
  });

  it('returns 201 with photo_uploaded:false when no photo is provided', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    rpc.mockResolvedValue({
      data: [{ card_id: 'card-1', card_count_after: 1 }],
      error: null,
    });
    const res = await POST(mockRequest(validFields()));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      card_id: 'card-1',
      card_count_after: 1,
      photo_uploaded: false,
    });
    expect(rpc).toHaveBeenCalledWith(
      'claim_card_slot',
      expect.objectContaining({
        p_user: 'u-1',
        p_system_tag: 'plumbing',
        p_room_tag: 'Kitchen',
      })
    );
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('derives p_user from getUser, NOT from the request body', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-real' } } });
    rpc.mockResolvedValue({
      data: [{ card_id: 'card-1', card_count_after: 1 }],
      error: null,
    });
    // Attempt to pass a foreign user_id in the body. The handler must
    // ignore it — defense in depth (§ Gotchas).
    await POST(
      mockRequest({
        ...validFields(),
        user_id: 'u-attacker',
        p_user: 'u-attacker',
      } as Record<string, string>)
    );
    expect(rpc).toHaveBeenCalledWith(
      'claim_card_slot',
      expect.objectContaining({ p_user: 'u-real' })
    );
  });

  it('returns 201 + uploads photo to the expected path + inserts card_photos row', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    rpc.mockResolvedValue({
      data: [{ card_id: 'card-99', card_count_after: 7 }],
      error: null,
    });
    storageUpload.mockResolvedValue({ error: null });
    cardPhotosInsert.mockResolvedValue({ error: null });
    const photo = new File([new Uint8Array([0xff, 0xd8])], 'photo.jpg', {
      type: 'image/jpeg',
    });
    const res = await POST(mockRequest(validFields({ photo })));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      card_id: 'card-99',
      card_count_after: 7,
      photo_uploaded: true,
    });
    expect(storageUpload).toHaveBeenCalledWith(
      `u-1/cards/card-99/touchpoints/${VALID_UUID}/wide.jpg`,
      photo,
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false })
    );
    expect(cardPhotosInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        card_id: 'card-99',
        user_id: 'u-1',
        touchpoint_id: VALID_UUID,
        touchpoint_type: 'primary',
        slot: 'wide',
        storage_path: `u-1/cards/card-99/touchpoints/${VALID_UUID}/wide.jpg`,
      })
    );
  });

  it('returns 201 with photo_uploaded:false when Storage upload fails (card persists)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    rpc.mockResolvedValue({
      data: [{ card_id: 'card-1', card_count_after: 1 }],
      error: null,
    });
    storageUpload.mockResolvedValue({
      error: { message: 'storage exploded', name: 'StorageError' },
    });
    const photo = new File([new Uint8Array([0xff])], 'p.jpg', {
      type: 'image/jpeg',
    });
    const res = await POST(mockRequest(validFields({ photo })));
    expect(res.status).toBe(201);
    expect((await res.json()).photo_uploaded).toBe(false);
    expect(cardPhotosInsert).not.toHaveBeenCalled();
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('returns 429 + resets_on on card_cap_reached and does NOT fire Storage or Sentry', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'card_cap_reached' },
    });
    const photo = new File([new Uint8Array([0xff])], 'p.jpg', {
      type: 'image/jpeg',
    });
    const res = await POST(mockRequest(validFields({ photo })));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('card_cap_reached');
    expect(body.resets_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(storageUpload).not.toHaveBeenCalled();
    expect(sentryCapture).not.toHaveBeenCalled();
  });

  it('returns 500 + Sentry capture on unexpected Postgres error', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'something else' },
    });
    const res = await POST(mockRequest(validFields()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server_error' });
    expect(sentryCapture).toHaveBeenCalled();
  });
});
