// What: Unit tests for POST /api/triage/answer. Mocks Supabase client
//       (auth, cards SELECT, triage_conversations SELECT, users
//       UPDATE, rpc), the four _lib/*-qa helpers, and the Anthropic
//       APIError class.
// Why:  The route is the trust boundary for the Q&A pipeline. Locking
//       every branch here (auth, validation, state classification,
//       round-counting, force-confirm, parse defense, RPC dispatch,
//       location dual-write, D10 envelope) makes the contract hermetic.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const VALID_UUID = '11111111-2222-3333-4444-555555555555';
const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const {
  getUser,
  cardMaybeSingle,
  threadOrder,
  usersUpdateChain,
  rpc,
  fetchPhotos,
  callQaTurnMock,
  parseQaTurnMock,
  computeQaRoundStateMock,
  sentryCapture,
  sentryMessage,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  cardMaybeSingle: vi.fn(),
  threadOrder: vi.fn(),
  usersUpdateChain: vi.fn(),
  rpc: vi.fn(),
  fetchPhotos: vi.fn(),
  callQaTurnMock: vi.fn(),
  parseQaTurnMock: vi.fn(),
  computeQaRoundStateMock: vi.fn(),
  sentryCapture: vi.fn(),
  sentryMessage: vi.fn(),
}));

// Users UPDATE chain: from('users').update({...}).eq('id', user.id)
class UsersUpdateChain {
  eq() {
    return this;
  }
  then<T>(onFulfilled: (v: { error: unknown }) => T): Promise<T> {
    return Promise.resolve(usersUpdateChain()).then(onFulfilled);
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from: (table: string) => {
      if (table === 'cards') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: cardMaybeSingle }),
          }),
        };
      }
      if (table === 'triage_conversations') {
        return {
          select: () => ({
            eq: () => ({ order: threadOrder }),
          }),
        };
      }
      if (table === 'users') {
        return {
          update: () => new UsersUpdateChain(),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

vi.mock('@/app/api/triage/_lib/photos', () => ({
  fetchCardPhotosAsBase64: fetchPhotos,
}));

vi.mock('@/app/api/triage/_lib/anthropic-qa', () => ({
  callQaTurn: callQaTurnMock,
}));

vi.mock('@/app/api/triage/_lib/parse-qa-output', () => ({
  parseQaTurn: parseQaTurnMock,
}));

vi.mock('@/app/api/triage/_lib/prompt-qa', () => ({
  resolveQaSystemPrompt: () => 'QA_SYS',
}));

vi.mock('@/app/api/triage/_lib/round-state', () => ({
  computeQaRoundState: computeQaRoundStateMock,
}));

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

import { APIError as MockAnthropicAPIError } from '@anthropic-ai/sdk';

type AnthropicErrorCtor = new (opts: {
  status: number;
  retryAfter?: string;
}) => Error;

/**
 *
 */
function makeAnthropicError(opts: { status: number; retryAfter?: string }) {
  const Ctor = MockAnthropicAPIError as unknown as AnthropicErrorCtor;
  return new Ctor(opts);
}

vi.mock('@sentry/nextjs', () => ({
  captureException: sentryCapture,
  captureMessage: sentryMessage,
}));

import { POST } from './route';

/**
 *
 */
function mockRequest(body: unknown, throwOnParse = false): NextRequest {
  return {
    json: async () => {
      if (throwOnParse) throw new Error('not json');
      return body;
    },
  } as unknown as NextRequest;
}

/**
 *
 */
function cardRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: VALID_UUID,
    user_id: USER_ID,
    state: 'diagnosed',
    severity_confirmed: false,
    initial_description: 'Leaky faucet.',
    system_tag: 'plumbing',
    room_tag: 'Kitchen',
    ...overrides,
  };
}

const VALID_ASK_PARSED = {
  ok: true as const,
  tool: 'ask_next_question' as const,
  value: {
    question: 'How long has it been visible?',
    is_location_ask: false,
    updated_provisional_severity: 'monitor',
    reasoning_so_far: 'mineral staining',
  },
};

// decide-state (PR N) — confirm_assessment now ships diy_expansion +
// contractor_expansion (the cost estimates that populate
// cards.cost_estimate_diy / cost_estimate_hire at confirmation time).
const VALID_DIY_EXPANSION = {
  skill_level: 'intermediate' as const,
  time_hours_min: 1,
  time_hours_max: 2,
  materials: [{ name: 'P-trap kit', cost_min: 12, cost_max: 18 }],
  tools: [{ name: 'Channel-locks', cost_min: 0, cost_max: 25 }],
  total_min: 12,
  total_max: 43,
  gotchas: 'PVC cracks if you over-tighten.',
  abort_condition: 'Stop if the tailpiece threads strip.',
  steps: [
    'Place bucket under trap.',
    'Loosen slip nuts.',
    'Replace and tighten.',
    'Run water and verify.',
  ],
};

const VALID_CONTRACTOR_EXPANSION = {
  contractor_type: 'plumber' as const,
  cost_range_min: 150,
  cost_range_max: 400,
  questions_for_contractor: ['Will the tailpiece be replaced?'],
  red_flags: ['No written quote.'],
  good_completion: 'No drip under load.',
};

const VALID_CONFIRM_PARSED = {
  ok: true as const,
  tool: 'confirm_assessment' as const,
  value: {
    final_diagnosis: 'Slow leak.',
    severity_confirmed: 'soon',
    system_tag: 'plumbing',
    contractor_tag: 'diy',
    monitoring_cadence_days_proposal: 14,
    confidence_note: 'high confidence',
    sources: [{ url: 'https://example.com', title: 'P-trap' }],
    diy_expansion: VALID_DIY_EXPANSION,
    contractor_expansion: VALID_CONTRACTOR_EXPANSION,
  },
};

beforeEach(() => {
  getUser.mockReset();
  cardMaybeSingle.mockReset();
  threadOrder.mockReset();
  usersUpdateChain.mockReset();
  rpc.mockReset();
  fetchPhotos.mockReset();
  callQaTurnMock.mockReset();
  parseQaTurnMock.mockReset();
  computeQaRoundStateMock.mockReset();
  sentryCapture.mockReset();
  sentryMessage.mockReset();

  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  cardMaybeSingle.mockResolvedValue({ data: cardRow(), error: null });
  threadOrder.mockResolvedValue({
    data: [
      {
        created_at: '2026-05-16T00:00:00.000Z',
        round: 1,
        role: 'assistant',
        is_location_ask: false,
        tool_name: 'record_initial_read',
        content: '{"summary":"init"}',
      },
    ],
    error: null,
  });
  usersUpdateChain.mockResolvedValue({ error: null });
  rpc.mockResolvedValue({ data: null, error: null });
  fetchPhotos.mockResolvedValue([]);
  callQaTurnMock.mockResolvedValue({
    id: 'msg_qa_1',
    content: [
      { type: 'tool_use', name: 'ask_next_question', input: { ok: true } },
    ],
  });
  parseQaTurnMock.mockReturnValue(VALID_ASK_PARSED);
  computeQaRoundStateMock.mockReturnValue({
    qaUserCount: 0,
    nextRound: 2,
    priorWasLocationAsk: false,
    priorAssistantToolName: 'record_initial_read',
  });
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
});

describe('POST /api/triage/answer — auth + validation', () => {
  it('returns 401 when getUser returns null', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'yes' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'auth_required' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 400 when body is not JSON', async () => {
    const res = await POST(mockRequest(null, true));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_failed');
  });

  it('returns 400 when card_id is not a uuid', async () => {
    const res = await POST(mockRequest({ card_id: 'not-a-uuid', answer: 'a' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields.card_id).toBeDefined();
  });

  it('returns 400 when both answer and skip are present', async () => {
    const res = await POST(
      mockRequest({ card_id: VALID_UUID, answer: 'yes', skip: true })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when neither answer nor skip is present', async () => {
    const res = await POST(mockRequest({ card_id: VALID_UUID }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when answer is an empty string', async () => {
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when answer is > 2000 chars', async () => {
    const res = await POST(
      mockRequest({ card_id: VALID_UUID, answer: 'a'.repeat(2001) })
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/triage/answer — card classification', () => {
  it('returns 404 when card row is missing', async () => {
    cardMaybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'card_not_found' });
  });

  it('returns 500 when card SELECT errors', async () => {
    cardMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'db down' },
    });
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
    expect(res.status).toBe(500);
    expect(sentryCapture).toHaveBeenCalled();
  });

  it.each(['capturing', 'triaging', 'monitoring', 'closed', 'dismissed'])(
    'returns 409 invalid_state when state=%s',
    async (state) => {
      cardMaybeSingle.mockResolvedValue({
        data: cardRow({ state }),
        error: null,
      });
      const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'invalid_state' });
    }
  );

  it('returns 409 already_confirmed when severity_confirmed=true', async () => {
    cardMaybeSingle.mockResolvedValue({
      data: cardRow({ severity_confirmed: true }),
      error: null,
    });
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_confirmed' });
  });
});

describe('POST /api/triage/answer — ask_next_question happy path', () => {
  it('calls answer_triage_round with nextRound, non-location, ask_next_question and returns 200', async () => {
    const res = await POST(
      mockRequest({ card_id: VALID_UUID, answer: 'two weeks' })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tool).toBe('ask_next_question');
    expect(body.card_id).toBe(VALID_UUID);
    expect(body.round_number).toBe(2);
    expect(body.question).toBe('How long has it been visible?');
    expect(body.is_location_ask).toBe(false);
    expect(body.updated_provisional_severity).toBe('monitor');

    expect(rpc).toHaveBeenCalledWith(
      'answer_triage_round',
      expect.objectContaining({
        p_user: USER_ID,
        p_card: VALID_UUID,
        p_user_answer: 'two weeks',
        p_tool_name: 'ask_next_question',
        p_is_location_ask: false,
        p_user_round: 2,
      })
    );
  });

  it('derives p_user from getUser().id, never from the body', async () => {
    // Inject a malicious body with a fake p_user field. Route should
    // not pass it through — the RPC call always uses USER_ID.
    await POST(
      mockRequest({
        card_id: VALID_UUID,
        answer: 'a',
        // Body fields the route does not honor:
        p_user: 'malicious-user-id',
        user_id: 'malicious-user-id',
      })
    );
    expect(rpc).toHaveBeenCalledWith(
      'answer_triage_round',
      expect.objectContaining({ p_user: USER_ID })
    );
  });
});

describe('POST /api/triage/answer — confirm_assessment happy path', () => {
  beforeEach(() => {
    callQaTurnMock.mockResolvedValue({
      id: 'msg_qa_confirm',
      content: [
        {
          type: 'tool_use',
          name: 'confirm_assessment',
          input: { ok: true },
        },
      ],
    });
    parseQaTurnMock.mockReturnValue(VALID_CONFIRM_PARSED);
  });

  it('calls confirm_triage RPC and returns 200 with was_forced=false', async () => {
    const res = await POST(
      mockRequest({ card_id: VALID_UUID, answer: 'fine' })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tool).toBe('confirm_assessment');
    expect(body.severity_confirmed).toBe('soon');
    expect(body.monitoring_cadence_days).toBe(14);
    expect(body.was_forced).toBe(false);
    expect(rpc).toHaveBeenCalledWith(
      'confirm_triage',
      expect.objectContaining({
        p_user: USER_ID,
        p_card: VALID_UUID,
        p_diagnosis: 'Slow leak.',
        p_severity: 'soon',
        p_skip: false,
        p_user_answer: 'fine',
        // decide-state (PR N) — expansions forwarded to the RPC
        p_diy_expansion: VALID_DIY_EXPANSION,
        p_contractor_expansion: VALID_CONTRACTOR_EXPANSION,
      })
    );
  });

  it('forwards diy_expansion + contractor_expansion verbatim from the parsed tool output', async () => {
    await POST(mockRequest({ card_id: VALID_UUID, answer: 'fine' }));
    const lastCall = rpc.mock.calls.find(
      (call: unknown[]) => call[0] === 'confirm_triage'
    );
    expect(lastCall).toBeDefined();
    const args = (lastCall as unknown[])[1] as Record<string, unknown>;
    expect(args.p_diy_expansion).toEqual(VALID_DIY_EXPANSION);
    expect(args.p_contractor_expansion).toEqual(VALID_CONTRACTOR_EXPANSION);
  });
});

describe('POST /api/triage/answer — force-confirm on round 3 cap', () => {
  beforeEach(() => {
    computeQaRoundStateMock.mockReturnValue({
      qaUserCount: 3,
      nextRound: 5,
      priorWasLocationAsk: false,
      priorAssistantToolName: 'ask_next_question',
    });
    callQaTurnMock.mockResolvedValue({
      id: 'msg_qa_forced',
      content: [
        {
          type: 'tool_use',
          name: 'confirm_assessment',
          input: { ok: true },
        },
      ],
    });
    parseQaTurnMock.mockReturnValue(VALID_CONFIRM_PARSED);
  });

  it('passes forceConfirm=true to callQaTurn and returns was_forced=true', async () => {
    const res = await POST(
      mockRequest({ card_id: VALID_UUID, answer: 'final' })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.was_forced).toBe(true);
    expect(callQaTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ forceConfirm: true })
    );
  });
});

describe('POST /api/triage/answer — force-confirm on skip', () => {
  beforeEach(() => {
    callQaTurnMock.mockResolvedValue({
      id: 'msg_qa_skip',
      content: [
        {
          type: 'tool_use',
          name: 'confirm_assessment',
          input: { ok: true },
        },
      ],
    });
    parseQaTurnMock.mockReturnValue(VALID_CONFIRM_PARSED);
  });

  it('passes forceConfirm=true to callQaTurn on skip path', async () => {
    const res = await POST(mockRequest({ card_id: VALID_UUID, skip: true }));
    expect(res.status).toBe(200);
    expect(callQaTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ forceConfirm: true })
    );
    // confirm_triage called with p_skip=true and p_user_answer=null
    expect(rpc).toHaveBeenCalledWith(
      'confirm_triage',
      expect.objectContaining({ p_skip: true, p_user_answer: null })
    );
    const body = await res.json();
    expect(body.was_forced).toBe(true);
  });
});

describe('POST /api/triage/answer — location dual-write', () => {
  beforeEach(() => {
    computeQaRoundStateMock.mockReturnValue({
      qaUserCount: 0,
      nextRound: 2,
      priorWasLocationAsk: true,
      priorAssistantToolName: 'ask_next_question',
    });
  });

  it('updates users.location when prior turn was a location-ask + answer provided', async () => {
    const res = await POST(
      mockRequest({ card_id: VALID_UUID, answer: '94110' })
    );
    expect(res.status).toBe(200);
    expect(usersUpdateChain).toHaveBeenCalledTimes(1);
  });

  it('returns 200 + Sentry warning when the location UPDATE fails', async () => {
    usersUpdateChain.mockResolvedValue({ error: { message: 'denied' } });
    const res = await POST(
      mockRequest({ card_id: VALID_UUID, answer: '94110' })
    );
    expect(res.status).toBe(200);
    expect(sentryMessage).toHaveBeenCalled();
  });

  it('does NOT update users.location when prior turn was NOT a location-ask', async () => {
    computeQaRoundStateMock.mockReturnValue({
      qaUserCount: 1,
      nextRound: 3,
      priorWasLocationAsk: false,
      priorAssistantToolName: 'ask_next_question',
    });
    await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
    expect(usersUpdateChain).not.toHaveBeenCalled();
  });
});

describe('POST /api/triage/answer — RPC race + parse failures', () => {
  it('returns 409 invalid_state when answer_triage_round raises P0001', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'qa_invalid_state' },
    });
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'invalid_state' });
  });

  it('returns 409 already_confirmed when confirm_triage raises P0001', async () => {
    callQaTurnMock.mockResolvedValue({
      id: 'msg_qa_2',
      content: [
        {
          type: 'tool_use',
          name: 'confirm_assessment',
          input: { ok: true },
        },
      ],
    });
    parseQaTurnMock.mockReturnValue(VALID_CONFIRM_PARSED);
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'qa_invalid_state' },
    });
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_confirmed' });
  });

  it('returns 500 + Sentry on other RPC errors', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '23502', message: 'not null violation' },
    });
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
    expect(res.status).toBe(500);
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('returns 502 + no DB write when parseQaTurn returns ParseError', async () => {
    parseQaTurnMock.mockReturnValue({
      ok: false,
      field: 'question',
      reason: 'missing',
    });
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'triage_invalid_output' });
    expect(rpc).not.toHaveBeenCalled();
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('returns 502 + no DB write when forceConfirm=true but model returned ask_next_question', async () => {
    computeQaRoundStateMock.mockReturnValue({
      qaUserCount: 3,
      nextRound: 5,
      priorWasLocationAsk: false,
      priorAssistantToolName: 'ask_next_question',
    });
    // Model defies the force — returns ask_next_question.
    parseQaTurnMock.mockReturnValue(VALID_ASK_PARSED);
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
    expect(res.status).toBe(502);
    expect(rpc).not.toHaveBeenCalled();
    expect(sentryMessage).toHaveBeenCalled();
  });
});

describe('POST /api/triage/answer — Anthropic transport errors', () => {
  it('returns 429 + retry_after_s on Anthropic 429', async () => {
    callQaTurnMock.mockRejectedValue(
      makeAnthropicError({ status: 429, retryAfter: '12' })
    );
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('triage_rate_limited');
    expect(body.retry_after_s).toBe(12);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns 503 + Sentry on Anthropic 5xx', async () => {
    callQaTurnMock.mockRejectedValue(makeAnthropicError({ status: 503 }));
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('triage_unavailable');
    expect(body.retry_after_s).toBe(30);
    expect(rpc).not.toHaveBeenCalled();
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('returns 503 on unknown / network throw', async () => {
    callQaTurnMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
    expect(res.status).toBe(503);
    expect(sentryCapture).toHaveBeenCalled();
  });
});

describe('POST /api/triage/answer — env checks', () => {
  it('returns 500 when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
    expect(res.status).toBe(500);
    expect(sentryCapture).toHaveBeenCalled();
  });

  it('returns 500 when ANTHROPIC_API_KEY is whitespace-only', async () => {
    process.env.ANTHROPIC_API_KEY = '   ';
    const res = await POST(mockRequest({ card_id: VALID_UUID, answer: 'a' }));
    expect(res.status).toBe(500);
  });
});
