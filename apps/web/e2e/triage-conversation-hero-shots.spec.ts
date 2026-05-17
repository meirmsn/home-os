// What: Phase 5.9 hero-shot capture spec for the triage-conversation
//       feature (PR #5). Seeds four representative card states
//       end-to-end via the admin client + signs in via the
//       password-helper pattern (same wiring as
//       triage-conversation.spec.ts), navigates to `/cards/<id>`, and
//       writes 16 PNGs total (4 states × 2 viewports × 2 destinations
//       under `specs/triage-conversation/{hero,screenshots}/`).
// Why:  Phase 5.9 needs durable visual evidence for the PR body's
//       Gates 3 / 9 / 13 (responsive + theme, happy-path walkthrough,
//       hero shots). The triage-conversation E2E spec proves the wire
//       format but only captures retain-on-failure traces — this spec
//       always writes the screenshots that the orchestrator embeds in
//       the PR body.
// Does NOT: Hit api.anthropic.com or the Q&A route — the fixtures are
//           admin-seeded directly into `cards` + `triage_conversations`
//           so the page server-renders the target state on first load.
//           Doesn't take light-theme shots — the app's default is dark
//           and Gate 3's review.md placeholder explicitly captured
//           dark-only.

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

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import {
  adminClient,
  isLocalSupabase,
  localSupabaseSkipReason,
} from './helpers/admin-client';

test.skip(!isLocalSupabase, localSupabaseSkipReason);

// Force Chromium for both viewports (the mobile project defaults to
// the iPhone 15 WebKit device descriptor; this spec doesn't need
// WebKit-specific behavior + the dev container only has Chromium
// installed). Also disable video so we don't need ffmpeg.
test.use({ browserName: 'chromium', video: 'off' });

// Hero screenshots are independent fixtures; this spec is not a
// trace-on-failure stress test. Disable retries so a stale-server
// glitch can't double-write the PNGs.
test.describe.configure({ mode: 'serial' });

const HERO_DIR = resolve(__dirname, '../../../specs/triage-conversation/hero');
const SCREENSHOTS_DIR = resolve(
  __dirname,
  '../../../specs/triage-conversation/screenshots'
);

mkdirSync(HERO_DIR, { recursive: true });
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

/** Tiny solid-color JPEG (~125 bytes) used as a placeholder for the
 *  card's `primary/wide` photo so the page's photo `<section>` renders
 *  with a real signed-URL `<img>` rather than the "No photo on this
 *  card." fallback. */
const PLACEHOLDER_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgI' +
    'CRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST' +
    '/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJC' +
    'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCAABAAEDASIAAhEBAxEB/' +
    '8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/' +
    '8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/' +
    '2gAMAwEAAhEDEQA/AL+AB//Z',
  'base64'
);

/** Initial-read assistant content stored in `triage_conversations.content`
 *  for the round-1 row. Shape matches what `record_initial_read` writes. */
function initialReadContent() {
  return JSON.stringify({
    summary:
      'Looks like a slow drip from the trap connection under the sink. ' +
      'Likely the slip nut has loosened over time — common, undramatic, ' +
      'DIY-friendly with a wrench.',
    severity_provisional: 'monitor',
    what_im_confident_about:
      'The staining pattern points to a single point of intrusion, not ' +
      'broader water damage.',
    what_i_need_to_know: [
      'How long have you been seeing the staining?',
      'Is the wood underneath soft to the touch?',
      'Has it spread since you first noticed it?',
    ],
    sources: [
      {
        url: 'https://www.familyhandyman.com/article/p-trap-leak/',
        title: 'Family Handyman — How to fix a P-trap leak',
      },
      {
        url: 'https://www.thisoldhouse.com/plumbing/21015018/under-sink-leaks',
        title: 'This Old House — Under-sink leak triage',
      },
    ],
    system_tag_proposed: 'plumbing',
    contractor_tag_proposed: 'diy',
  });
}

/** Q&A `ask_next_question` assistant content for a mid-Q&A fixture. */
function askContent(question: string, isLocationAsk = false) {
  return JSON.stringify({
    question,
    is_location_ask: isLocationAsk,
    updated_provisional_severity: 'monitor',
    reasoning_so_far:
      'The drip is intermittent and the wood appears dry — leaning toward ' +
      'a slip-nut tighten rather than a trap replacement.',
  });
}

/** Q&A `confirm_assessment` assistant content for the confirmed fixture. */
function confirmContent() {
  return JSON.stringify({
    final_diagnosis:
      'Loose slip nut on the P-trap. A 1/4-turn snug with channel-lock ' +
      'pliers should stop the drip. Re-check in 7 days; if it returns, ' +
      'replace the trap washer.',
    severity_confirmed: 'soon',
    system_tag: 'plumbing',
    contractor_tag: 'diy',
    monitoring_cadence_days_proposal: 7,
    confidence_note:
      'High confidence — the intermittent drip + dry wood + slip-fitting ' +
      'connection is the textbook signature.',
    sources: [
      {
        url: 'https://www.familyhandyman.com/article/p-trap-leak/',
        title: 'Family Handyman — How to fix a P-trap leak',
      },
    ],
  });
}

interface SeededFixture {
  userId: string;
  cardId: string;
  email: string;
  password: string;
}

/** Seed a user + card + thread rows + optional confirmed update. The
 *  `qaPairs` argument seeds `qaPairs` prior user/assistant pairs after
 *  the round-1 initial-read row. If `confirmAtRound` is set, an
 *  additional user reply + `confirm_assessment` assistant row are
 *  appended at that round and the card row is UPDATEd to
 *  `severity_confirmed=true` with the final diagnosis. */
async function seedFixture(opts: {
  fixtureKey: string;
  qaPairs: number;
  confirmAtRound: number | null;
}): Promise<SeededFixture> {
  const admin = adminClient();
  const runId = Math.random().toString(36).slice(2, 10);
  const email = `hero-${opts.fixtureKey}-${runId}@test.local`;
  const password = 'hero-shot-password-2026';

  const { data: userData, error: userError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (userError) throw userError;
  if (!userData.user) throw new Error('createUser returned no user');
  const userId = userData.user.id;

  const { data: cardInsert, error: cardError } = await admin
    .from('cards')
    .insert({
      user_id: userId,
      state: 'diagnosed',
      title: 'Slow drip under the kitchen sink',
      initial_description:
        'Noticed a dark ring of staining on the cabinet floor under the ' +
        'kitchen sink. Wood is dry now but the ring keeps coming back.',
      system_tag: 'plumbing',
      room_tag: 'Kitchen',
      severity: 'monitor',
      diagnosis: 'Initial read summary above.',
      contractor_tag: 'diy',
      severity_confirmed: false,
    })
    .select('id')
    .single();
  if (cardError) throw cardError;
  const cardId = cardInsert?.id as string;

  // Round 1: initial-read assistant row.
  const { error: initError } = await admin.from('triage_conversations').insert({
    card_id: cardId,
    user_id: userId,
    round: 1,
    role: 'assistant',
    content: initialReadContent(),
    tool_name: 'record_initial_read',
    is_location_ask: false,
  });
  if (initError) throw initError;

  // Prior Q&A rounds (rounds 2..2+qaPairs-1).
  const sampleAnswers = [
    'About a week. First noticed it Saturday morning while wiping down ' +
      'the cabinet.',
    'No, it feels solid. Just the visible ring on the surface.',
    "It hasn't grown since the second day — same ring shape.",
  ];
  const sampleQuestions = [
    'Is the wood under the staining soft to the touch when you press on it?',
    'Has the ring grown or moved since you first noticed it?',
    "What's your ZIP code so I can factor in your local water hardness?",
  ];
  for (let i = 0; i < opts.qaPairs; i++) {
    const round = 2 + i;
    const isLocation = false; // these fixtures don't include a location ask
    const userAnswer = sampleAnswers[i] ?? `user reply ${i + 1}`;
    const question = sampleQuestions[i] ?? `prior question ${i + 1}`;
    const { error: userRowError } = await admin
      .from('triage_conversations')
      .insert({
        card_id: cardId,
        user_id: userId,
        round,
        role: 'user',
        content: userAnswer,
        is_location_ask: isLocation,
        tool_name: null,
      });
    if (userRowError) throw userRowError;
    const { error: asstRowError } = await admin
      .from('triage_conversations')
      .insert({
        card_id: cardId,
        user_id: userId,
        round,
        role: 'assistant',
        content: askContent(question, isLocation),
        tool_name: 'ask_next_question',
        is_location_ask: isLocation,
      });
    if (asstRowError) throw asstRowError;
  }

  // Confirmed: append the final turn + UPDATE the card row.
  if (opts.confirmAtRound !== null) {
    const round = opts.confirmAtRound;
    const { error: userRowError } = await admin
      .from('triage_conversations')
      .insert({
        card_id: cardId,
        user_id: userId,
        round,
        role: 'user',
        content: 'That helps — what should I do next?',
        is_location_ask: false,
        tool_name: null,
      });
    if (userRowError) throw userRowError;
    const { error: asstRowError } = await admin
      .from('triage_conversations')
      .insert({
        card_id: cardId,
        user_id: userId,
        round,
        role: 'assistant',
        content: confirmContent(),
        tool_name: 'confirm_assessment',
        is_location_ask: false,
      });
    if (asstRowError) throw asstRowError;
    const { error: updateError } = await admin
      .from('cards')
      .update({
        severity_confirmed: true,
        severity: 'soon',
        system_tag: 'plumbing',
        contractor_tag: 'diy',
        diagnosis:
          'Loose slip nut on the P-trap. A 1/4-turn snug with channel-lock ' +
          'pliers should stop the drip. Re-check in 7 days; if it returns, ' +
          'replace the trap washer.',
        monitoring_cadence_days: 7,
      })
      .eq('id', cardId);
    if (updateError) throw updateError;
  }

  // Upload a placeholder JPEG into the `card-photos` bucket and insert
  // the matching `card_photos` row so the page renders a real photo.
  const touchpointId = crypto.randomUUID();
  const storagePath = `${userId}/cards/${cardId}/touchpoints/${touchpointId}/wide.jpg`;
  const { error: storageError } = await admin.storage
    .from('card-photos')
    .upload(storagePath, PLACEHOLDER_JPEG, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (storageError) throw storageError;
  const { error: photoRowError } = await admin.from('card_photos').insert({
    card_id: cardId,
    user_id: userId,
    touchpoint_id: touchpointId,
    touchpoint_type: 'primary',
    slot: 'wide',
    storage_path: storagePath,
  });
  if (photoRowError) throw photoRowError;

  return { userId, cardId, email, password };
}

/** Sign in via the password helper and write the auth cookie into the
 *  Playwright context. Mirrors the signin block in
 *  triage-conversation.spec.ts. */
async function signInAndAttachCookie(
  context: import('@playwright/test').BrowserContext,
  email: string,
  password: string
) {
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
  await context.addCookies([
    {
      name: `sb-${projectRef}-auth-token`,
      value: encodeURIComponent(cookieValue),
      url: 'http://127.0.0.1:3000',
      httpOnly: false,
      sameSite: 'Lax',
      expires: -1,
    },
  ]);
}

/** Pick the right viewport label for filenames based on the project name. */
function viewportLabel(projectName: string): '375' | '1440' {
  if (projectName === 'mobile') return '375';
  if (projectName === 'desktop') return '1440';
  throw new Error(`Unexpected project name: ${projectName}`);
}

/** Write a screenshot to both `hero/` and `screenshots/` so the PR
 *  body + the canonical manifest both have copies. The hero filename
 *  matches the task's spec; the screenshots filename matches the
 *  review.md Gate 3 manifest convention `<screen>-<vw>-dark.png`. */
async function captureHero(
  page: import('@playwright/test').Page,
  projectName: string,
  fixtureKey: string,
  screenName: string
) {
  const vw = viewportLabel(projectName);
  const heroPath = `${HERO_DIR}/${fixtureKey}-${vw}.png`;
  const manifestPath = `${SCREENSHOTS_DIR}/${screenName}-${vw}-dark.png`;
  await page.screenshot({ path: heroPath, fullPage: true });
  await page.screenshot({ path: manifestPath, fullPage: true });
}

test.describe('triage-conversation hero shots', () => {
  test('Fixture A — just-after-initial-read (diagnosed + qaUserCount=0)', async ({
    page,
    context,
  }, testInfo) => {
    const fixture = await seedFixture({
      fixtureKey: 'A',
      qaPairs: 0,
      confirmAtRound: null,
    });
    await signInAndAttachCookie(context, fixture.email, fixture.password);

    await page.goto(`/cards/${fixture.cardId}`);
    // Wait for the initial-read body + AnswerThread to render.
    await expect(page.getByTestId('diagnosed-body')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('answer-thread')).toBeVisible();
    await expect(page.getByTestId('what-i-need-to-know')).toBeVisible();

    await captureHero(
      page,
      testInfo.project.name,
      'just-after-initial-read',
      'just-after-initial-read'
    );

    // Teardown.
    const admin = adminClient();
    await admin.auth.admin.deleteUser(fixture.userId);
  });

  test('Fixture B — mid-qa-thread (diagnosed + qaUserCount=1)', async ({
    page,
    context,
  }, testInfo) => {
    const fixture = await seedFixture({
      fixtureKey: 'B',
      qaPairs: 1,
      confirmAtRound: null,
    });
    await signInAndAttachCookie(context, fixture.email, fixture.password);

    await page.goto(`/cards/${fixture.cardId}`);
    await expect(page.getByTestId('diagnosed-body')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('qa-thread')).toBeVisible();
    await expect(page.getByTestId('answer-thread')).toBeVisible();
    // Skip button only shows at round >= 1 (i.e. after at least one
    // user reply). qaPairs=1 here puts qaUserCount=1, so the Skip
    // button is rendered.
    await expect(page.getByTestId('answer-skip')).toBeVisible();

    await captureHero(
      page,
      testInfo.project.name,
      'mid-qa-thread',
      'mid-qa-thread'
    );

    const admin = adminClient();
    await admin.auth.admin.deleteUser(fixture.userId);
  });

  test('Fixture C — diagnosed-collapsed (severity_confirmed=true, details closed)', async ({
    page,
    context,
  }, testInfo) => {
    const fixture = await seedFixture({
      fixtureKey: 'C',
      qaPairs: 2,
      confirmAtRound: 4,
    });
    await signInAndAttachCookie(context, fixture.email, fixture.password);

    await page.goto(`/cards/${fixture.cardId}`);
    await expect(page.getByTestId('diagnosed-thread')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('severity-chip-confirmed')).toBeVisible();
    await expect(page.getByTestId('final-diagnosis')).toBeVisible();
    await expect(page.getByTestId('monitoring-cadence')).toBeVisible();
    // <details> is closed by default — assert the summary is visible
    // but the rows are not.
    await expect(page.getByText('How we diagnosed this')).toBeVisible();

    await captureHero(
      page,
      testInfo.project.name,
      'diagnosed-collapsed',
      'diagnosed-collapsed'
    );

    const admin = adminClient();
    await admin.auth.admin.deleteUser(fixture.userId);
  });

  test('Fixture D — diagnosed-expanded (severity_confirmed=true, details open)', async ({
    page,
    context,
  }, testInfo) => {
    const fixture = await seedFixture({
      fixtureKey: 'D',
      qaPairs: 2,
      confirmAtRound: 4,
    });
    await signInAndAttachCookie(context, fixture.email, fixture.password);

    await page.goto(`/cards/${fixture.cardId}`);
    await expect(page.getByTestId('diagnosed-thread')).toBeVisible({
      timeout: 15_000,
    });

    // Expand the <details> collapsible by clicking the summary.
    await page.getByText('How we diagnosed this').click();
    // Wait for the rows container to render.
    await expect(page.getByTestId('how-we-diagnosed-rows')).toBeVisible();

    await captureHero(
      page,
      testInfo.project.name,
      'diagnosed-expanded',
      'diagnosed-expanded'
    );

    const admin = adminClient();
    await admin.auth.admin.deleteUser(fixture.userId);
  });
});
