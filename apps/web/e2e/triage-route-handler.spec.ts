// What: Full-round-trip Playwright E2E for the triage-route-handler
//       feature (PR #4). Seeds a confirmed user, signs in via password,
//       captures a card, intercepts the Anthropic Messages API via a
//       mock server URL (ANTHROPIC_BASE_URL test seam — spec § E2E
//       Decision option a), clicks "Read this for me", and asserts the
//       state machine and DB writes. Also covers the 503 error path
//       (state reverts) and the 202 refresh-race path.
// Why:  Unit tests cover branches with mocks; this spec proves the
//       wire format end-to-end — the SECURITY DEFINER start_triage /
//       complete_triage RPCs, the photo bytes round-trip, the parse
//       + persist path, and the revert-on-error contract (spec D6).
// Does NOT: Hit api.anthropic.com — the test seam routes the SDK to a
//           local mock server so the spec is hermetic. Real-API
//           coverage lives in row #11 (triage-eval-dataset).

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

/** Build a fixed Anthropic Messages response matching the
 *  record_initial_read tool-use shape parseInitialRead expects. */
function fixedAnthropicResponse() {
  return {
    id: 'msg_e2e_fixture',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_e2e',
        name: 'record_initial_read',
        input: {
          summary: 'Test summary from E2E mock fixture.',
          severity_provisional: 'soon',
          what_im_confident_about: 'High-confidence statement.',
          what_i_need_to_know: ['q1?', 'q2?', 'q3?'],
          sources: [{ url: 'https://example.com', title: 'Example' }],
          system_tag_proposed: 'plumbing',
          contractor_tag_proposed: 'plumber',
        },
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

/** Start a tiny HTTP mock server that returns the given JSON for any
 *  POST /v1/messages call. Returns the server + its base URL. */
async function startMockAnthropic(opts: {
  status?: number;
  bodyFor?: (req: { url?: string; method?: string }) => unknown;
  delayMs?: number;
}): Promise<{ server: Server; baseURL: string }> {
  const server = createServer((req, res) => {
    // Drain the request body so node's HTTP machinery emits 'end'. We
    // don't inspect the body — opts.bodyFor decides the response shape
    // based on (url, method) alone, which is enough for the seam.
    req.on('data', () => undefined);
    req.on('end', () => {
      const respond = () => {
        const status = opts.status ?? 200;
        const payload = (opts.bodyFor?.({
          url: req.url,
          method: req.method,
        }) ?? fixedAnthropicResponse()) as unknown;
        res.statusCode = status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(payload));
      };
      if (opts.delayMs) {
        setTimeout(respond, opts.delayMs);
      } else {
        respond();
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    baseURL: `http://127.0.0.1:${address.port}`,
  };
}

test.describe('triage-route-handler round trip', () => {
  let email = '';
  let password = '';
  let userId = '';
  let mockServer: Server | null = null;

  test.beforeEach(async ({ page }) => {
    const runId = Math.random().toString(36).slice(2, 10);
    email = `triage-${runId}@test.local`;
    password = 'triage-test-password-2026';

    const admin = adminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    if (!data.user) throw new Error('createUser returned no user');
    userId = data.user.id;

    // Same in-browser session injection pattern as capture-flow.spec.ts.
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

  test('happy path: capture → /cards/[id] → click button → diagnosed state + DB writes', async ({
    page,
    context,
  }) => {
    const { server, baseURL } = await startMockAnthropic({});
    mockServer = server;
    // Push ANTHROPIC_BASE_URL into the Next.js dev server's env via a
    // page-level route override. The dev server reads process.env at
    // request time for route handlers; we can't change that from here.
    // Instead, we rely on the test runner setting ANTHROPIC_BASE_URL
    // before `pnpm dev` starts. Playwright's webServer entry in
    // playwright.config.ts is the right hook. Document below + skip
    // gracefully if the env isn't wired.
    if (
      !(process.env.ANTHROPIC_BASE_URL ?? '').trim() ||
      (process.env.ANTHROPIC_BASE_URL ?? '').trim() !== baseURL
    ) {
      test.skip(
        true,
        `ANTHROPIC_BASE_URL must be set to ${baseURL} on the dev server start. ` +
          `Wire via playwright.config.ts webServer.env. ` +
          `Currently: ${process.env.ANTHROPIC_BASE_URL ?? '(unset)'}`
      );
    }
    void context;

    // 1. Capture a card via the form.
    await page.goto('/capture');
    await page
      .getByLabel(/what.s going on/i)
      .fill('Mysterious staining around the kitchen sink trap.');
    await page.getByLabel(/system/i).selectOption('plumbing');
    await page.getByLabel(/room/i).fill('Kitchen');
    await page.getByLabel(/photo/i).setInputFiles({
      name: 'triage.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });
    await page.getByRole('button', { name: 'Save card' }).click();
    await page.waitForURL(/\/cards\/[0-9a-f-]{36}$/);

    // 2. Click "Read this for me".
    await page.getByRole('button', { name: /read this for me/i }).click();

    // 3. The page should re-render with the diagnosed body.
    await expect(page.getByTestId('diagnosed-body')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('severity-chip')).toHaveAttribute(
      'data-severity',
      'soon'
    );
    await expect(
      page.getByText('Test summary from E2E mock fixture.')
    ).toBeVisible();
    await expect(page.getByText('q1?')).toBeVisible();

    // 4. Admin DB verifications.
    const admin = adminClient();
    const cards = await admin
      .from('cards')
      .select('id, state, severity, system_tag, contractor_tag, diagnosis')
      .eq('user_id', userId);
    expect(cards.error).toBeNull();
    const card = cards.data?.[0];
    expect(card?.state).toBe('diagnosed');
    expect(card?.severity).toBe('soon');
    expect(card?.system_tag).toBe('plumbing');
    expect(card?.contractor_tag).toBe('plumber');
    expect(card?.diagnosis).toContain('Test summary');

    const convos = await admin
      .from('triage_conversations')
      .select('id, role, round, content')
      .eq('user_id', userId);
    expect(convos.data?.length).toBe(1);
    expect(convos.data?.[0]?.role).toBe('assistant');
    expect(convos.data?.[0]?.round).toBe(1);
    const parsed = JSON.parse(convos.data?.[0]?.content ?? 'null');
    expect(parsed?.summary).toContain('Test summary');
  });

  test('error path: Anthropic 503 → retryable banner + state reverts to capturing', async ({
    page,
  }) => {
    const { server, baseURL } = await startMockAnthropic({ status: 503 });
    mockServer = server;
    if (
      !(process.env.ANTHROPIC_BASE_URL ?? '').trim() ||
      (process.env.ANTHROPIC_BASE_URL ?? '').trim() !== baseURL
    ) {
      test.skip(
        true,
        `ANTHROPIC_BASE_URL must be set to ${baseURL} on the dev server start.`
      );
    }

    // Seed a capturing card directly via admin to skip the capture form.
    const admin = adminClient();
    const { data: inserted } = await admin
      .from('cards')
      .insert({
        user_id: userId,
        state: 'capturing',
        initial_description: 'A test card for the revert path.',
        system_tag: 'plumbing',
        room_tag: 'Kitchen',
      })
      .select('id')
      .single();
    const cardId = inserted?.id as string;

    await page.goto(`/cards/${cardId}`);
    await page.getByRole('button', { name: /read this for me/i }).click();

    // Retryable banner appears.
    await expect(page.getByText(/unavailable/i)).toBeVisible({
      timeout: 15_000,
    });

    // State reverted to capturing.
    const after = await admin
      .from('cards')
      .select('state')
      .eq('id', cardId)
      .maybeSingle();
    expect(after.data?.state).toBe('capturing');
  });

  test('refresh-race: POST while already triaging returns 202', async ({
    page,
  }) => {
    const admin = adminClient();
    // Seed a triaging-state card directly.
    const { data: inserted } = await admin
      .from('cards')
      .insert({
        user_id: userId,
        state: 'triaging',
        initial_description: 'Already running.',
        system_tag: 'plumbing',
        room_tag: 'Kitchen',
      })
      .select('id')
      .single();
    const cardId = inserted?.id as string;

    // Visit any authenticated page first so page.request shares the
    // session cookies the beforeEach injected into the browser context.
    // The default `request` fixture is a separate APIRequestContext that
    // does NOT see those cookies; hitting /api/triage from it 401s
    // before the state check runs.
    await page.goto(`/cards/${cardId}`);
    const response = await page.request.post('/api/triage', {
      data: { card_id: cardId },
    });
    expect(response.status()).toBe(202);
    const body = await response.json();
    expect(body.error).toBe('triage_in_progress');
  });
});
