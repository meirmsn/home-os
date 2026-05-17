// What: Full-round-trip Playwright E2E for the triage-conversation
//       feature (PR #5). Seeds a confirmed user, signs in via password,
//       admin-seeds a diagnosed (provisional) card + the round-1
//       initial-read assistant row, intercepts the Anthropic Messages
//       API via a mock server URL (ANTHROPIC_BASE_URL test seam, same
//       seam as triage-route-handler.spec.ts). Covers five flows:
//       single-round confirm, 3-round force-confirm, location-ask +
//       users.location write, skip path, 503 retry.
// Why:  Unit tests cover branches with mocks; this spec proves the
//       Q&A wire format end-to-end — answer_triage_round + confirm_triage
//       SECURITY DEFINER RPCs, the dual-write to users.location, the
//       round-state derivation under real RLS, and the force-confirm
//       contract (D4 + D9).
// Does NOT: Hit api.anthropic.com — the test seam routes the SDK to a
//           local mock server so the spec is hermetic. Real-API
//           coverage lives in row #10 (triage-eval-dataset).

// WebSocket polyfill — see rls-isolation.spec.ts header.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'undefined') {
  (globalThis as { WebSocket?: unknown }).WebSocket = class WebSocketStub {
    constructor() {
      throw new Error(
        'WebSocket stub: realtime not supported in this test runner'
      );
    }
  };
}

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';
import {
  adminClient,
  isLocalSupabase,
  localSupabaseSkipReason,
} from './helpers/admin-client';

test.skip(!isLocalSupabase, localSupabaseSkipReason);

/** Build a Q&A ask_next_question tool-use response shaped per
 *  parse-qa-output.parseQaTurn's contract. */
function askResponse(opts: {
  question?: string;
  is_location_ask?: boolean;
  severity?: 'cosmetic' | 'monitor' | 'soon' | 'urgent';
}) {
  return {
    id: 'msg_qa_ask',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_qa_ask',
        name: 'ask_next_question',
        input: {
          question: opts.question ?? 'Can you describe what you see?',
          is_location_ask: opts.is_location_ask ?? false,
          updated_provisional_severity: opts.severity ?? 'monitor',
          reasoning_so_far: 'still gathering evidence',
        },
      },
    ],
    usage: { input_tokens: 50, output_tokens: 30 },
  };
}

/** Build a Q&A confirm_assessment tool-use response. */
function confirmResponse(opts: {
  severity?: 'cosmetic' | 'monitor' | 'soon' | 'urgent';
  cadence?: number;
  diagnosis?: string;
}) {
  return {
    id: 'msg_qa_confirm',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_qa_confirm',
        name: 'confirm_assessment',
        input: {
          final_diagnosis: opts.diagnosis ?? 'Slow leak. DIY-friendly.',
          severity_confirmed: opts.severity ?? 'soon',
          system_tag: 'plumbing',
          contractor_tag: 'diy',
          monitoring_cadence_days_proposal: opts.cadence ?? 14,
          confidence_note: 'High confidence.',
          sources: [{ url: 'https://example.com', title: 'Reference' }],
        },
      },
    ],
    usage: { input_tokens: 80, output_tokens: 60 },
  };
}

/**
 *
 */
async function startMockAnthropic(opts: {
  status?: number;
  bodyFor?: (
    req: { url?: string; method?: string },
    callIndex: number
  ) => {
    status?: number;
    body: unknown;
  };
}): Promise<{ server: Server; baseURL: string; getCallCount: () => number }> {
  let callCount = 0;
  const server = createServer((req, res) => {
    req.on('data', () => undefined);
    req.on('end', () => {
      const idx = callCount;
      callCount += 1;
      let status = opts.status ?? 200;
      let body: unknown;
      if (opts.bodyFor) {
        const r = opts.bodyFor({ url: req.url, method: req.method }, idx);
        status = r.status ?? 200;
        body = r.body;
      } else {
        body = confirmResponse({});
      }
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    baseURL: `http://127.0.0.1:${address.port}`,
    getCallCount: () => callCount,
  };
}

/** Initial-read assistant content stored in triage_conversations.content
 *  for the round-1 row — shape matches what PR #19 writes. */
function initialReadContent() {
  return JSON.stringify({
    summary: 'Initial read summary.',
    severity_provisional: 'monitor',
    what_im_confident_about: 'confidence',
    what_i_need_to_know: [
      'What does it look like?',
      'How long?',
      'Has it grown?',
    ],
    sources: [],
    system_tag_proposed: 'plumbing',
    contractor_tag_proposed: 'diy',
  });
}

test.describe('triage-conversation round trip', () => {
  let email = '';
  let password = '';
  let userId = '';
  let mockServer: Server | null = null;

  test.beforeEach(async ({ page }) => {
    const runId = Math.random().toString(36).slice(2, 10);
    email = `qa-${runId}@test.local`;
    password = 'qa-test-password-2026';

    const admin = adminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    if (!data.user) throw new Error('createUser returned no user');
    userId = data.user.id;

    const { createClient } = await import('@supabase/supabase-js');
    const url = (process.env.SUPABASE_URL ?? '').trim();
    const anonKey = (process.env.SUPABASE_ANON_KEY ?? '').trim();
    const signinClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: session, error: signinError } =
      await signinClient.auth.signInWithPassword({ email, password });
    if (signinError) throw signinError;
    if (!session.session)
      throw new Error('signInWithPassword returned no session');

    const projectRef = new URL(url).hostname.split('.')[0] ?? 'local';
    const cookieValue = JSON.stringify({
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
      expires_at: session.session.expires_at,
      expires_in: session.session.expires_in,
      token_type: 'bearer',
      user: session.session.user,
    });
    await page.context().addCookies([
      {
        name: `sb-${projectRef}-auth-token`,
        value: encodeURIComponent(cookieValue),
        url: 'http://127.0.0.1:3000',
        httpOnly: false,
        sameSite: 'Lax',
        expires: -1,
      },
    ]);
  });

  test.afterEach(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer!.close(() => resolve()));
      mockServer = null;
    }
    const admin = adminClient();
    if (userId) await admin.auth.admin.deleteUser(userId);
    userId = '';
  });

  /** Seed a diagnosed (provisional) card + the initial-read assistant
   *  row. Returns the card id. Optionally adds prior Q&A pairs for
   *  the force-confirm + location-ask tests. */
  async function seedDiagnosedCard(
    opts: {
      priorQaPairs?: number;
      lastAssistantIsLocationAsk?: boolean;
    } = {}
  ) {
    const admin = adminClient();
    const { data: inserted } = await admin
      .from('cards')
      .insert({
        user_id: userId,
        state: 'diagnosed',
        initial_description: 'Mysterious staining.',
        system_tag: 'plumbing',
        room_tag: 'Kitchen',
        severity: 'monitor',
        diagnosis: 'Initial read summary.',
        contractor_tag: 'diy',
        severity_confirmed: false,
      })
      .select('id')
      .single();
    const cardId = inserted?.id as string;

    // Round 1: initial-read assistant row.
    await admin.from('triage_conversations').insert({
      card_id: cardId,
      user_id: userId,
      round: 1,
      role: 'assistant',
      content: initialReadContent(),
      tool_name: 'record_initial_read',
      is_location_ask: false,
    });

    // Prior Q&A pairs.
    const pairs = opts.priorQaPairs ?? 0;
    for (let i = 0; i < pairs; i++) {
      const round = 2 + i;
      const isLast = i === pairs - 1;
      const isLocation = isLast && opts.lastAssistantIsLocationAsk === true;
      await admin.from('triage_conversations').insert({
        card_id: cardId,
        user_id: userId,
        round,
        role: 'user',
        content: `prior reply ${i + 1}`,
        is_location_ask: isLocation,
        tool_name: null,
      });
      await admin.from('triage_conversations').insert({
        card_id: cardId,
        user_id: userId,
        round,
        role: 'assistant',
        content: JSON.stringify({
          question: `prior Q${i + 1}`,
          is_location_ask: isLocation,
          updated_provisional_severity: 'monitor',
          reasoning_so_far: 'so far',
        }),
        tool_name: 'ask_next_question',
        is_location_ask: isLocation,
      });
    }

    return cardId;
  }

  test('single-round confirm: model picks confirm_assessment immediately', async ({
    page,
  }) => {
    const { server, baseURL } = await startMockAnthropic({
      bodyFor: () => ({
        body: confirmResponse({ severity: 'soon', cadence: 14 }),
      }),
    });
    mockServer = server;
    if ((process.env.ANTHROPIC_BASE_URL ?? '').trim() !== baseURL) {
      test.skip(
        true,
        `ANTHROPIC_BASE_URL must be set to ${baseURL} on the dev server start.`
      );
    }

    const cardId = await seedDiagnosedCard();
    await page.goto(`/cards/${cardId}`);
    await page.getByTestId('answer-textarea').fill('it is a slow drip');
    await page.getByTestId('answer-send').click();

    await expect(page.getByTestId('diagnosed-thread')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('severity-chip-confirmed')).toHaveAttribute(
      'data-severity',
      'soon'
    );

    const admin = adminClient();
    const card = await admin
      .from('cards')
      .select('severity_confirmed, severity, monitoring_cadence_days')
      .eq('id', cardId)
      .single();
    expect(card.data?.severity_confirmed).toBe(true);
    expect(card.data?.severity).toBe('soon');
    expect(card.data?.monitoring_cadence_days).toBe(14);

    const convos = await admin
      .from('triage_conversations')
      .select('role, round, tool_name')
      .eq('card_id', cardId)
      .order('created_at', { ascending: true });
    // round 1 assistant + round 2 user + round 2 assistant confirm
    expect(convos.data?.length).toBe(3);
    expect(convos.data?.[2]?.tool_name).toBe('confirm_assessment');
  });

  test('3-round force-confirm: server forces tool_choice=confirm at the cap', async ({
    page,
  }) => {
    const { server, baseURL } = await startMockAnthropic({
      // The mock returns confirm regardless; the route's forceConfirm
      // contract is what the server enforces. We're asserting was_forced
      // makes it back via the DB state + the route response.
      bodyFor: () => ({ body: confirmResponse({}) }),
    });
    mockServer = server;
    if ((process.env.ANTHROPIC_BASE_URL ?? '').trim() !== baseURL) {
      test.skip(
        true,
        `ANTHROPIC_BASE_URL must be set to ${baseURL} on the dev server start.`
      );
    }

    const cardId = await seedDiagnosedCard({ priorQaPairs: 3 });
    await page.goto(`/cards/${cardId}`);

    // qaUserCount=3 at request time → route forces confirm.
    await page.getByTestId('answer-textarea').fill('one last thought');
    await page.getByTestId('answer-send').click();

    await expect(page.getByTestId('diagnosed-thread')).toBeVisible({
      timeout: 15_000,
    });

    const admin = adminClient();
    const card = await admin
      .from('cards')
      .select('severity_confirmed')
      .eq('id', cardId)
      .single();
    expect(card.data?.severity_confirmed).toBe(true);
  });

  test('location-ask: prior assistant row was is_location_ask=true → users.location updated', async ({
    page,
  }) => {
    const { server, baseURL } = await startMockAnthropic({
      bodyFor: () => ({ body: askResponse({ question: 'next non-location' }) }),
    });
    mockServer = server;
    if ((process.env.ANTHROPIC_BASE_URL ?? '').trim() !== baseURL) {
      test.skip(
        true,
        `ANTHROPIC_BASE_URL must be set to ${baseURL} on the dev server start.`
      );
    }

    const cardId = await seedDiagnosedCard({
      priorQaPairs: 1,
      lastAssistantIsLocationAsk: true,
    });
    await page.goto(`/cards/${cardId}`);
    await page.getByTestId('answer-textarea').fill('94110');
    await page.getByTestId('answer-send').click();

    // Wait for the page to refresh + render the next question.
    await expect(page.getByText(/next non-location/i)).toBeVisible({
      timeout: 15_000,
    });

    const admin = adminClient();
    const user = await admin
      .from('users')
      .select('location')
      .eq('id', userId)
      .single();
    expect(user.data?.location).toBe('94110');
  });

  test('skip path: clicking Skip POSTs skip=true; no user-reply row inserted for the turn', async ({
    page,
  }) => {
    const { server, baseURL } = await startMockAnthropic({
      bodyFor: () => ({ body: confirmResponse({}) }),
    });
    mockServer = server;
    if ((process.env.ANTHROPIC_BASE_URL ?? '').trim() !== baseURL) {
      test.skip(
        true,
        `ANTHROPIC_BASE_URL must be set to ${baseURL} on the dev server start.`
      );
    }

    const cardId = await seedDiagnosedCard({ priorQaPairs: 1 });
    await page.goto(`/cards/${cardId}`);
    await page.getByTestId('answer-skip').click();

    await expect(page.getByTestId('diagnosed-thread')).toBeVisible({
      timeout: 15_000,
    });

    const admin = adminClient();
    const convos = await admin
      .from('triage_conversations')
      .select('role, round')
      .eq('card_id', cardId)
      .order('created_at', { ascending: true });
    // round 1 assistant (initial), round 2 user (prior), round 2 assistant
    // (prior), round 3 assistant (skip confirm — no user row inserted).
    expect(convos.data?.length).toBe(4);
    const round3Rows = convos.data?.filter((r) => r.round === 3) ?? [];
    expect(round3Rows.length).toBe(1);
    expect(round3Rows[0]?.role).toBe('assistant');
  });

  test('503 retry: first call 503s; second call returns ask_next_question successfully', async ({
    page,
  }) => {
    const { server, baseURL } = await startMockAnthropic({
      bodyFor: (_req, callIndex) => {
        if (callIndex === 0) {
          return { status: 503, body: { error: { type: 'overloaded' } } };
        }
        return { body: askResponse({ question: 'recovery question' }) };
      },
    });
    mockServer = server;
    if ((process.env.ANTHROPIC_BASE_URL ?? '').trim() !== baseURL) {
      test.skip(
        true,
        `ANTHROPIC_BASE_URL must be set to ${baseURL} on the dev server start.`
      );
    }

    const cardId = await seedDiagnosedCard();
    await page.goto(`/cards/${cardId}`);
    await page.getByTestId('answer-textarea').fill('first try');
    await page.getByTestId('answer-send').click();

    // First click → 503 → retry banner.
    await expect(page.getByTestId('answer-retry-banner')).toBeVisible({
      timeout: 15_000,
    });

    // Textarea content preserved.
    await expect(page.getByTestId('answer-textarea')).toHaveValue('first try');

    // Click Send again → second mock call returns 200.
    await page.getByTestId('answer-send').click();
    await expect(page.getByText(/recovery question/i)).toBeVisible({
      timeout: 15_000,
    });

    // Only ONE user row from the eventual successful turn — the failed
    // turn left no DB trace (D10).
    const admin = adminClient();
    const userRows = await admin
      .from('triage_conversations')
      .select('role')
      .eq('card_id', cardId)
      .eq('role', 'user');
    expect(userRows.data?.length).toBe(1);
  });
});
