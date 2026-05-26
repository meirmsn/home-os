// What: POST /api/triage/answer route handler. Multi-round Q&A loop on
//       top of PR #19's initial-read flow. Authenticates the user,
//       validates the body, loads the card (must be diagnosed +
//       severity_confirmed=false), counts prior Q&A rounds, fetches
//       photos under RLS, calls Claude with both tools available
//       (ask_next_question + confirm_assessment) + web_search, parses
//       the tool_use block defensively, persists via the matching
//       SECURITY DEFINER RPC (answer_triage_round vs confirm_triage),
//       and surfaces the D10 envelope.
// Why:  Single trust boundary for the Q&A pipeline (spec § API
//       contracts). The two RPCs are the atomic state-transition seam;
//       the route never trusts a body-supplied user id (p_user always
//       derives from getUser().id). Force-confirm is server-side cap
//       on round 3 (D4) + skip path (D9) — robust to model
//       misbehavior. Parse failure / model defiance both surface as
//       502 with NO DB write so retries are clean (D10).
// Does NOT: Trust body-supplied user IDs. Doesn't fire PostHog
//           (server-side surface; spec § Gotchas #7). Doesn't increment
//           usage_counters.triage_session_count — row #9 owns that.

import { APIError as AnthropicAPIError } from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/nextjs';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callQaTurn, type QaMessage } from '../_lib/anthropic-qa';
import { fetchCardPhotosAsBase64 } from '../_lib/photos';
import { parseQaTurn } from '../_lib/parse-qa-output';
import { resolveQaSystemPrompt } from '../_lib/prompt-qa';
import { computeQaRoundState, type ThreadRow } from '../_lib/round-state';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Default retry-after surfaced on 503 (spec § API #10). */
const DEFAULT_RETRY_AFTER_S = 30;

/** Max chars accepted for a user answer (spec § API #2). */
const ANSWER_MAX_LEN = 2000;

/** Hard cap on non-location user Q&A rounds (D4). When qaUserCount
 *  >= QA_USER_ROUND_LIMIT at request time, the route forces
 *  confirm_assessment regardless of body.skip. */
const QA_USER_ROUND_LIMIT = 3;

type CardRow = {
  id: string;
  user_id: string;
  state:
    | 'capturing'
    | 'triaging'
    | 'diagnosed'
    | 'monitoring'
    | 'closed'
    | 'dismissed';
  severity_confirmed: boolean;
  initial_description: string | null;
  system_tag: string | null;
  room_tag: string | null;
};

type AnswerBody =
  | { card_id: string; answer: string }
  | { card_id: string; skip: true };

/** Read retry-after seconds from an Anthropic APIError; fall back to 30s. */
function retryAfterSeconds(err: AnthropicAPIError): number {
  const raw = err.headers?.get?.('retry-after');
  if (!raw) return DEFAULT_RETRY_AFTER_S;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETRY_AFTER_S;
}

/** Validate the incoming body. Returns either a typed body or a 400
 *  response. */
function validateBody(body: unknown):
  | { ok: true; value: AnswerBody }
  | {
      ok: false;
      response: NextResponse;
    } {
  if (!body || typeof body !== 'object') {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'validation_failed',
          fields: { card_id: 'Body must be a JSON object.' },
        },
        { status: 400 }
      ),
    };
  }

  const obj = body as Record<string, unknown>;
  const cardId = obj.card_id;
  if (typeof cardId !== 'string' || !UUID_RE.test(cardId)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'validation_failed',
          fields: { card_id: 'card_id must be a uuid.' },
        },
        { status: 400 }
      ),
    };
  }

  const hasAnswer = typeof obj.answer === 'string';
  const hasSkip = obj.skip === true;

  if (hasAnswer && hasSkip) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'validation_failed',
          fields: {
            answer: 'Provide exactly one of answer or skip.',
            skip: 'Provide exactly one of answer or skip.',
          },
        },
        { status: 400 }
      ),
    };
  }
  if (!hasAnswer && !hasSkip) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'validation_failed',
          fields: { answer: 'Provide an answer or set skip=true.' },
        },
        { status: 400 }
      ),
    };
  }

  if (hasAnswer) {
    const answer = obj.answer as string;
    if (answer.length === 0) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'validation_failed',
            fields: { answer: 'answer must be a non-empty string.' },
          },
          { status: 400 }
        ),
      };
    }
    if (answer.length > ANSWER_MAX_LEN) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'validation_failed',
            fields: {
              answer: `answer must be ≤ ${ANSWER_MAX_LEN} characters.`,
            },
          },
          { status: 400 }
        ),
      };
    }
    return { ok: true, value: { card_id: cardId, answer } };
  }

  return { ok: true, value: { card_id: cardId, skip: true } };
}

/** Build the alternating user/assistant message thread we send to
 *  Claude. The initial-read assistant row + every subsequent Q&A pair
 *  is converted into a Q&A message. The current user reply is appended
 *  as the final user turn (or a skip prompt). */
function buildQaMessages(
  threadContents: Map<
    number,
    { user: string | null; assistant: string | null }
  >,
  card: CardRow,
  body: AnswerBody
): QaMessage[] {
  const messages: QaMessage[] = [];

  // First user message: photo context block (text only; image bytes
  // are passed separately via `images` and attached by the wrapper).
  const intro: string[] = [];
  if (card.room_tag) intro.push(`Room: ${card.room_tag}`);
  if (card.system_tag) intro.push(`System: ${card.system_tag}`);
  if (card.initial_description) {
    intro.push('');
    intro.push(card.initial_description.trim());
  }
  messages.push({ role: 'user', content: intro.join('\n') });

  // Append every prior round's pair (user reply then assistant
  // question), oldest first. Round 1 has only an assistant row (the
  // initial read) — we render it as an assistant turn.
  const sortedRounds = [...threadContents.entries()].sort(([a], [b]) => a - b);
  for (const [, pair] of sortedRounds) {
    if (pair.user !== null) {
      messages.push({ role: 'user', content: pair.user });
    }
    if (pair.assistant !== null) {
      messages.push({ role: 'assistant', content: pair.assistant });
    }
  }

  // Current user turn.
  if ('skip' in body) {
    messages.push({
      role: 'user',
      content:
        'I want your best assessment with the information you have now. Please call confirm_assessment.',
    });
  } else {
    messages.push({ role: 'user', content: body.answer });
  }

  return messages;
}

/** Aggregate triage_conversations rows into per-round (user, assistant)
 *  content pairs. Used by buildQaMessages to render the thread. */
function aggregateThreadByRound(rows: (ThreadRow & { content: string })[]) {
  const map = new Map<
    number,
    { user: string | null; assistant: string | null }
  >();
  for (const row of rows) {
    const slot = map.get(row.round) ?? { user: null, assistant: null };
    if (row.role === 'user') slot.user = row.content;
    if (row.role === 'assistant') slot.assistant = row.content;
    map.set(row.round, slot);
  }
  return map;
}

/** POST /api/triage/answer — see file header. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 1. Auth gate.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  // 2. Parse + validate body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: 'validation_failed',
        fields: { card_id: 'Body must be JSON.' },
      },
      { status: 400 }
    );
  }

  const validation = validateBody(body);
  if (!validation.ok) return validation.response;
  const parsedBody = validation.value;
  const { card_id: cardId } = parsedBody;

  // Extract optional BYOK key from body (spec D3 — key transit via
  // request body, never persisted).
  const byokKey =
    body && typeof body === 'object' && 'byok_key' in body
      ? (body as { byok_key: unknown }).byok_key
      : undefined;
  const hasByokKey = typeof byokKey === 'string' && byokKey.trim().length > 0;

  // 3. Load + state-classify the card under user-context RLS.
  const { data: cardRow, error: cardError } = await supabase
    .from('cards')
    .select(
      'id, user_id, state, severity_confirmed, initial_description, system_tag, room_tag'
    )
    .eq('id', cardId)
    .maybeSingle();

  if (cardError) {
    Sentry.captureException(cardError, {
      tags: { route: 'POST /api/triage/answer', stage: 'card_select' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  if (!cardRow) {
    return NextResponse.json({ error: 'card_not_found' }, { status: 404 });
  }

  const card = cardRow as CardRow;
  if (card.state !== 'diagnosed') {
    return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
  }
  if (card.severity_confirmed === true) {
    return NextResponse.json({ error: 'already_confirmed' }, { status: 409 });
  }

  // 4. Load full thread + compute round state.
  const { data: threadData, error: threadError } = await supabase
    .from('triage_conversations')
    .select('created_at, round, role, is_location_ask, tool_name, content')
    .eq('card_id', cardId)
    .order('created_at', { ascending: true });

  if (threadError) {
    Sentry.captureException(threadError, {
      tags: { route: 'POST /api/triage/answer', stage: 'thread_select' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  type ThreadRowWithContent = ThreadRow & { content: string };
  const threadRows = (threadData ?? []) as ThreadRowWithContent[];
  const roundState = computeQaRoundState(threadRows);
  const forceConfirm =
    roundState.qaUserCount >= QA_USER_ROUND_LIMIT ||
    ('skip' in parsedBody && parsedBody.skip === true);

  // 4b. Usage check (free tier only — spec D2). BYOK users bypass entirely.
  if (!hasByokKey) {
    const { data: usageRow, error: usageError } = await supabase
      .from('usage_counters')
      .select('triage_session_count, week_start')
      .eq('user_id', user.id)
      .maybeSingle();

    if (usageError) {
      Sentry.captureException(usageError, {
        tags: { route: 'POST /api/triage/answer', stage: 'usage_check' },
      });
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    // NULL row = first-time user = count 0 (under limit).
    // Week-rollover: if the row's week_start doesn't match current Monday,
    // the count is stale — treat as 0.
    const now = new Date();
    const currentMonday = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - ((now.getUTCDay() + 6) % 7)
      )
    );
    const mondayStr = currentMonday.toISOString().slice(0, 10);

    let currentCount = 0;
    if (usageRow && usageRow.week_start === mondayStr) {
      currentCount = usageRow.triage_session_count ?? 0;
    }

    if (currentCount >= 5) {
      // Compute next Monday UTC 00:00:00.
      const nextMonday = new Date(currentMonday);
      nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
      return NextResponse.json(
        {
          error: 'TRIAGE_LIMIT_REACHED',
          resets: nextMonday.toISOString(),
        },
        { status: 429 }
      );
    }
  }

  // 5. Load photo bytes via user-context client + Storage RLS.
  const images = await fetchCardPhotosAsBase64(supabase, user.id, cardId);

  // 6. Build the Anthropic call. Use BYOK key when present.
  const apiKey = hasByokKey
    ? byokKey.trim()
    : (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!apiKey) {
    Sentry.captureException(new Error('ANTHROPIC_API_KEY is unset'), {
      tags: { route: 'POST /api/triage/answer', stage: 'env_check' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  const model = (process.env.ANTHROPIC_MODEL ?? '').trim() || undefined;
  const baseURL = (process.env.ANTHROPIC_BASE_URL ?? '').trim() || undefined;
  const system = resolveQaSystemPrompt();
  const aggregated = aggregateThreadByRound(threadRows);
  const messages = buildQaMessages(aggregated, card, parsedBody);

  let response: Awaited<ReturnType<typeof callQaTurn>>;
  try {
    response = await callQaTurn({
      apiKey,
      model,
      baseURL,
      system,
      messages,
      images,
      forceConfirm,
    });
  } catch (err) {
    if (err instanceof AnthropicAPIError) {
      // BYOK-specific error responses (spec § error rescue map #6/#7).
      if (hasByokKey && err.status === 401) {
        return NextResponse.json({ error: 'byok_invalid' }, { status: 401 });
      }
      if (hasByokKey && err.status === 402) {
        return NextResponse.json(
          { error: 'byok_out_of_credits' },
          { status: 402 }
        );
      }
      if (err.status === 429) {
        return NextResponse.json(
          {
            error: 'triage_rate_limited',
            retry_after_s: retryAfterSeconds(err),
          },
          { status: 429 }
        );
      }
      Sentry.captureException(err, {
        tags: { route: 'POST /api/triage/answer', stage: 'anthropic_call' },
      });
      return NextResponse.json(
        { error: 'triage_unavailable', retry_after_s: DEFAULT_RETRY_AFTER_S },
        { status: 503 }
      );
    }
    Sentry.captureException(err, {
      tags: {
        route: 'POST /api/triage/answer',
        stage: 'anthropic_call_unknown',
      },
    });
    return NextResponse.json(
      { error: 'triage_unavailable', retry_after_s: DEFAULT_RETRY_AFTER_S },
      { status: 503 }
    );
  }

  // 7. Parse the tool_use block defensively.
  const parsed = parseQaTurn(response);
  if (!parsed.ok) {
    Sentry.captureException(
      new Error(`parseQaTurn failed: ${parsed.field} — ${parsed.reason}`),
      {
        tags: {
          route: 'POST /api/triage/answer',
          stage: 'parse_qa_output',
        },
        extra: {
          raw_response_id: (response as { id?: string })?.id,
          force_confirm: forceConfirm,
        },
      }
    );
    return NextResponse.json(
      { error: 'triage_invalid_output' },
      { status: 502 }
    );
  }

  // Spec § Gotchas #3: when forceConfirm=true, anything other than
  // confirm_assessment is the model defying the force. Treat as parse
  // failure (no DB write).
  if (forceConfirm && parsed.tool !== 'confirm_assessment') {
    Sentry.captureMessage(
      'Q&A force-confirm: model returned non-confirm tool',
      {
        level: 'warning',
        tags: {
          route: 'POST /api/triage/answer',
          stage: 'force_confirm_defied',
        },
        extra: {
          raw_response_id: (response as { id?: string })?.id,
          tool_returned: parsed.tool,
        },
      }
    );
    return NextResponse.json(
      { error: 'triage_invalid_output' },
      { status: 502 }
    );
  }

  // 8. Persist via the matching RPC.
  const assistantContent = JSON.stringify(parsed.value);

  if (parsed.tool === 'ask_next_question') {
    const userAnswer = 'answer' in parsedBody ? parsedBody.answer : '';
    const { error: rpcError } = await supabase.rpc('answer_triage_round', {
      p_user: user.id,
      p_card: cardId,
      p_user_answer: userAnswer,
      p_assistant_content: assistantContent,
      p_tool_name: 'ask_next_question',
      p_is_location_ask: parsed.value.is_location_ask,
      p_user_round: roundState.nextRound,
    });
    if (rpcError) {
      if (
        rpcError.code === 'P0001' &&
        rpcError.message?.includes('qa_invalid_state')
      ) {
        return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
      }
      Sentry.captureException(rpcError, {
        tags: {
          route: 'POST /api/triage/answer',
          stage: 'answer_triage_round',
        },
      });
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    // Dual-write to users.location when the prior turn was a location-ask
    // AND the user provided an answer (Send path; skip path skipped this
    // branch above because forceConfirm=true). spec D6 + Gotchas #5 —
    // failure here is tolerable (silent location-cache miss, the round
    // is already saved).
    if (
      roundState.priorWasLocationAsk &&
      'answer' in parsedBody &&
      parsedBody.answer
    ) {
      const { error: locError } = await supabase
        .from('users')
        .update({ location: parsedBody.answer })
        .eq('id', user.id);
      if (locError) {
        Sentry.captureMessage('users.location dual-write failed', {
          level: 'warning',
          tags: {
            route: 'POST /api/triage/answer',
            stage: 'location_dual_write',
          },
          extra: { user_id: user.id, card_id: cardId },
        });
      }
    }

    return NextResponse.json(
      {
        tool: 'ask_next_question',
        card_id: cardId,
        round_number: roundState.nextRound,
        question: parsed.value.question,
        is_location_ask: parsed.value.is_location_ask,
        updated_provisional_severity: parsed.value.updated_provisional_severity,
      },
      { status: 200 }
    );
  }

  // parsed.tool === 'confirm_assessment'
  const isSkip = 'skip' in parsedBody && parsedBody.skip === true;
  const userAnswerForConfirm =
    'answer' in parsedBody ? parsedBody.answer : null;
  const { error: confirmError } = await supabase.rpc('confirm_triage', {
    p_user: user.id,
    p_card: cardId,
    p_diagnosis: parsed.value.final_diagnosis,
    p_severity: parsed.value.severity_confirmed,
    p_system_tag: parsed.value.system_tag,
    p_contractor_tag: parsed.value.contractor_tag,
    p_monitoring_cadence_days: parsed.value.monitoring_cadence_days_proposal,
    p_assistant_content: assistantContent,
    p_user_round: roundState.nextRound,
    p_skip: isSkip,
    p_user_answer: userAnswerForConfirm,
    // decide-state (PR N) — RPC now persists the DIY + Contractor
    // expansions onto cards.cost_estimate_diy / cost_estimate_hire at
    // confirmation time (spec § D2). Validator at parse-qa-output.ts
    // already guarantees the locked shape; pass through as jsonb.
    p_diy_expansion: parsed.value.diy_expansion,
    p_contractor_expansion: parsed.value.contractor_expansion,
  });

  if (confirmError) {
    if (
      confirmError.code === 'P0001' &&
      confirmError.message?.includes('qa_invalid_state')
    ) {
      return NextResponse.json({ error: 'already_confirmed' }, { status: 409 });
    }
    Sentry.captureException(confirmError, {
      tags: {
        route: 'POST /api/triage/answer',
        stage: 'confirm_triage',
      },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  return NextResponse.json(
    {
      tool: 'confirm_assessment',
      card_id: cardId,
      severity_confirmed: parsed.value.severity_confirmed,
      monitoring_cadence_days: parsed.value.monitoring_cadence_days_proposal,
      was_forced: forceConfirm,
    },
    { status: 200 }
  );
}
