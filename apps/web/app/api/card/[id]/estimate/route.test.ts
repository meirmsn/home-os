// What: Unit tests for PATCH /api/card/[id]/estimate. Mocks the
//       supabase user-context client's update + lookup chains so the
//       tests run without a live stack. Covers 200/400/401/404/409/500
//       envelopes, both paths, and the reset (null) path.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const VALID_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';

const validDiy = () => ({
  skill_level: 'intermediate' as const,
  time_hours_min: 1,
  time_hours_max: 2,
  materials: [{ name: 'kit', cost_min: 10, cost_max: 20 }],
  tools: [{ name: 'wrench', cost_min: 0, cost_max: 25 }],
  total_min: 10,
  total_max: 45,
  gotchas: 'note',
  abort_condition: 'note',
  steps: ['step1', 'step2'],
});

const validContractor = () => ({
  contractor_type: 'plumber' as const,
  cost_range_min: 100,
  cost_range_max: 300,
  questions_for_contractor: ['warrantied?'],
  red_flags: ['no quote'],
  good_completion: 'no drip',
});

const {
  getUser,
  updateMaybeSingle,
  lookupMaybeSingle,
  updateSpy,
  sentryCapture,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateMaybeSingle: vi.fn(),
  lookupMaybeSingle: vi.fn(),
  updateSpy: vi.fn(),
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
            eq: () => ({
              in: () => ({
                select: () => ({ maybeSingle: updateMaybeSingle }),
              }),
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

/**
 *
 */
function mockRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
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
  updateSpy.mockReset();
  sentryCapture.mockReset();

  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
});

describe('PATCH /api/card/[id]/estimate — happy paths', () => {
  it('writes DIY override and returns 200 + override_present=true', async () => {
    updateMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID },
      error: null,
    });
    const res = await PATCH(
      mockRequest({ path: 'diy', estimate: validDiy() }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe('diy');
    expect(body.override_present).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith({
      cost_estimate_diy_override: expect.objectContaining({
        skill_level: 'intermediate',
      }),
    });
  });

  it('writes Contractor override and returns 200', async () => {
    updateMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID },
      error: null,
    });
    const res = await PATCH(
      mockRequest({ path: 'contractor', estimate: validContractor() }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({
      cost_estimate_hire_override: expect.objectContaining({
        contractor_type: 'plumber',
      }),
    });
  });

  it('resets DIY override with estimate=null (200 + override_present=false)', async () => {
    updateMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID },
      error: null,
    });
    const res = await PATCH(
      mockRequest({ path: 'diy', estimate: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.override_present).toBe(false);
    expect(updateSpy).toHaveBeenCalledWith({
      cost_estimate_diy_override: null,
    });
  });
});

describe('PATCH /api/card/[id]/estimate — validation', () => {
  it('returns 400 on bad UUID', async () => {
    const res = await PATCH(
      mockRequest({ path: 'diy', estimate: null }),
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

  it('returns 400 when path is missing', async () => {
    const res = await PATCH(
      mockRequest({ estimate: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('path');
  });

  it('returns 400 when estimate field is missing entirely', async () => {
    const res = await PATCH(
      mockRequest({ path: 'diy' }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('estimate');
  });

  it('returns 400 on DIY estimate shape violation (field bubbles)', async () => {
    const res = await PATCH(
      mockRequest({
        path: 'diy',
        estimate: { ...validDiy(), skill_level: 'wizard' },
      }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.field).toBe('estimate.skill_level');
  });
});

describe('PATCH /api/card/[id]/estimate — auth + state', () => {
  it('returns 401 when no session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await PATCH(
      mockRequest({ path: 'diy', estimate: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when no row matches (not_found)', async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    lookupMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await PATCH(
      mockRequest({ path: 'diy', estimate: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not_found');
  });

  it('returns 409 when row exists in non-editable state (invalid_state)', async () => {
    updateMaybeSingle.mockResolvedValue({ data: null, error: null });
    lookupMaybeSingle.mockResolvedValue({
      data: { id: VALID_UUID, state: 'closed' },
      error: null,
    });
    const res = await PATCH(
      mockRequest({ path: 'diy', estimate: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('invalid_state');
  });

  it('returns 500 + Sentry on update error', async () => {
    updateMaybeSingle.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'oops' },
    });
    const res = await PATCH(
      mockRequest({ path: 'diy', estimate: null }),
      paramsContext(VALID_UUID)
    );
    expect(res.status).toBe(500);
    expect(sentryCapture).toHaveBeenCalled();
  });
});
