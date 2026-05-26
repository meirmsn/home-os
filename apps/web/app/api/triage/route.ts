// What: POST /api/triage route handler. Pulls a freshly-captured card,
//       atomically transitions state capturing → triaging, fetches the
//       photo bytes under user-context RLS, calls Claude with the
//       record_initial_read tool-use forcing, persists the result
//       atomically (cards UPDATE + triage_conversations INSERT +
//       state→diagnosed) via the complete_triage RPC. On any error
//       after start_triage, best-effort reverts state back to capturing.
// Why:  Single trust boundary for the AI initial-read pipeline. The
//       SECURITY DEFINER RPCs (start_triage, complete_triage) are the
//       atomic state-transition seam; the photo fetch uses the user-
//       context client + Storage RLS for the trust boundary (spec
//       § Gotchas #4). The model can refuse even with tool_choice
//       forcing — parseInitialRead is the LLM-response trust boundary
//       (§ Gotchas #2).
// Does NOT: Trust a body-supplied user id — p_user always derives from
//           getUser().id server-side (§ Gotchas #10). Doesn't fire
//           PostHog events — those live on the client surface
//           (<StartTriage />, § Gotchas #7). Doesn't run multi-round
//           Q&A; row #2 owns that.

import { APIError as AnthropicAPIError } from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/nextjs';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callInitialRead } from './_lib/anthropic';
import { fetchCardPhotosAsBase64 } from './_lib/photos';
import { parseInitialRead } from './_lib/parse-tool-output';
import { resolveSystemPrompt } from './_lib/prompt';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Default retry-after surfaced to clients on 503 path (spec § API #13). */
const DEFAULT_RETRY_AFTER_S = 30;

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
  initial_description: string | null;
  system_tag: string | null;
  room_tag: string | null;
};

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>;

/** Best-effort revert capturing-bound state when Anthropic / persist
 *  paths fail. Predicate-guarded on `state='triaging'` so concurrent
 *  completes don't trample. Sentry-captured separately when revert
 *  itself errors so observability catches stuck cards (spec § Gotchas
 *  #5). */
async function revertState(
  supabase: SupabaseClientLike,
  userId: string,
  cardId: string
) {
  const { error: revertError } = await supabase
    .from('cards')
    .update({ state: 'capturing' })
    .eq('id', cardId)
    .eq('user_id', userId)
    .eq('state', 'triaging');
  if (revertError) {
    Sentry.captureException(revertError, {
      tags: { route: 'POST /api/triage', stage: 'revert_state' },
    });
  }
}

/** Read the retry-after header (seconds) from the Anthropic SDK error.
 *  SDK 0.96.0 surfaces a Headers object; fall back to 30s when absent. */
function retryAfterSeconds(err: AnthropicAPIError): number {
  const raw = err.headers?.get?.('retry-after');
  if (!raw) return DEFAULT_RETRY_AFTER_S;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETRY_AFTER_S;
}

/** Compose the user text we send to Claude — description plus the
 *  room/system context the model needs to interpret the photo. */
function buildUserText(card: CardRow): string {
  const lines: string[] = [];
  if (card.room_tag) lines.push(`Room: ${card.room_tag}`);
  if (card.system_tag)
    lines.push(`System (homeowner-tagged): ${card.system_tag}`);
  if (card.initial_description) {
    lines.push('');
    lines.push(card.initial_description.trim());
  }
  return lines.join('\n');
}

/** POST /api/triage — see file header. */
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

  const cardId =
    body && typeof body === 'object' && 'card_id' in body
      ? (body as { card_id: unknown }).card_id
      : undefined;
  if (typeof cardId !== 'string' || !UUID_RE.test(cardId)) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        fields: { card_id: 'card_id must be a uuid.' },
      },
      { status: 400 }
    );
  }

  // Extract optional BYOK key from body (spec D3 — key transit via
  // request body, never persisted).
  const byokKey =
    body && typeof body === 'object' && 'byok_key' in body
      ? (body as { byok_key: unknown }).byok_key
      : undefined;
  const hasByokKey = typeof byokKey === 'string' && byokKey.trim().length > 0;

  // 3. Load + state-classify the card (RLS scopes visibility).
  const { data: cardRow, error: cardError } = await supabase
    .from('cards')
    .select('id, user_id, state, initial_description, system_tag, room_tag')
    .eq('id', cardId)
    .maybeSingle();

  if (cardError) {
    Sentry.captureException(cardError, {
      tags: { route: 'POST /api/triage', stage: 'card_select' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  if (!cardRow) {
    return NextResponse.json({ error: 'card_not_found' }, { status: 404 });
  }

  const card = cardRow as CardRow;
  switch (card.state) {
    case 'triaging':
      return NextResponse.json(
        { error: 'triage_in_progress' },
        { status: 202 }
      );
    case 'diagnosed':
      return NextResponse.json({ error: 'already_triaged' }, { status: 409 });
    case 'monitoring':
    case 'closed':
    case 'dismissed':
      return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
    case 'capturing':
      break;
  }

  // 4. Atomic capturing → triaging via SECURITY DEFINER RPC.
  const { error: startError } = await supabase.rpc('start_triage', {
    p_user: user.id,
    p_card: cardId,
  });
  if (startError) {
    if (
      startError.code === 'P0001' &&
      startError.message?.includes('triage_invalid_state')
    ) {
      // Race: someone else moved it.
      return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
    }
    Sentry.captureException(startError, {
      tags: { route: 'POST /api/triage', stage: 'start_triage' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  // 5. PostHog `triage_initial_read_started` fires from the client (D10
  //    / spec § Gotchas #7). Server-side surface has no PostHog init.

  // 6. Load photo bytes via the user-context client + Storage RLS.
  const images = await fetchCardPhotosAsBase64(supabase, user.id, cardId);

  // 7. Call Claude. Use BYOK key when present, fall back to server key.
  const apiKey = hasByokKey
    ? byokKey.trim()
    : (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!apiKey) {
    Sentry.captureException(new Error('ANTHROPIC_API_KEY is unset'), {
      tags: { route: 'POST /api/triage', stage: 'env_check' },
    });
    await revertState(supabase, user.id, cardId);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  const model = (process.env.ANTHROPIC_MODEL ?? '').trim() || undefined;
  const baseURL = (process.env.ANTHROPIC_BASE_URL ?? '').trim() || undefined;
  const system = resolveSystemPrompt();
  const userText = buildUserText(card);

  let response: Awaited<ReturnType<typeof callInitialRead>>;
  try {
    response = await callInitialRead({
      apiKey,
      model,
      baseURL,
      system,
      userText,
      images,
    });
  } catch (err) {
    // Map Anthropic SDK errors to D9 envelope shape.
    await revertState(supabase, user.id, cardId);
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
        tags: { route: 'POST /api/triage', stage: 'anthropic_call' },
      });
      return NextResponse.json(
        {
          error: 'triage_unavailable',
          retry_after_s: DEFAULT_RETRY_AFTER_S,
        },
        { status: 503 }
      );
    }
    // Network error / timeout / unknown — treat as unavailable.
    Sentry.captureException(err, {
      tags: { route: 'POST /api/triage', stage: 'anthropic_call_unknown' },
    });
    return NextResponse.json(
      {
        error: 'triage_unavailable',
        retry_after_s: DEFAULT_RETRY_AFTER_S,
      },
      { status: 503 }
    );
  }

  // 8. Find the record_initial_read tool_use block and parse it.
  const content = Array.isArray(response?.content) ? response.content : [];
  type ContentBlock = { type: string; name?: string; input?: unknown };
  const toolBlock = (content as ContentBlock[]).find(
    (b) => b.type === 'tool_use' && b.name === 'record_initial_read'
  );

  if (!toolBlock) {
    Sentry.captureException(
      new Error('record_initial_read tool_use block not found in response'),
      {
        tags: {
          route: 'POST /api/triage',
          stage: 'tool_block_missing',
        },
        extra: { raw_response_id: (response as { id?: string })?.id },
      }
    );
    await revertState(supabase, user.id, cardId);
    return NextResponse.json(
      { error: 'triage_invalid_output' },
      { status: 502 }
    );
  }

  const parsed = parseInitialRead(toolBlock.input);
  if (!parsed.ok) {
    Sentry.captureException(
      new Error(`parseInitialRead failed: ${parsed.field} — ${parsed.reason}`),
      {
        tags: {
          route: 'POST /api/triage',
          stage: 'parse_tool_output',
        },
        extra: { raw_response_id: (response as { id?: string })?.id },
      }
    );
    await revertState(supabase, user.id, cardId);
    return NextResponse.json(
      { error: 'triage_invalid_output' },
      { status: 502 }
    );
  }

  // 9. Persist via complete_triage. The assistant content is the full
  //    JSON-serialized payload (spec § Gotchas #6 — payload IS the
  //    audit trail).
  const assistantContent = JSON.stringify(parsed.value);
  const { error: completeError } = await supabase.rpc('complete_triage', {
    p_user: user.id,
    p_card: cardId,
    p_diagnosis: parsed.value.summary,
    p_severity_provisional: parsed.value.severity_provisional,
    p_system_tag: parsed.value.system_tag_proposed,
    p_contractor_tag: parsed.value.contractor_tag_proposed,
    p_assistant_content: assistantContent,
  });
  if (completeError) {
    Sentry.captureException(completeError, {
      tags: { route: 'POST /api/triage', stage: 'complete_triage' },
    });
    await revertState(supabase, user.id, cardId);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  // 10. Success.
  return NextResponse.json(
    {
      card_id: cardId,
      severity_provisional: parsed.value.severity_provisional,
      what_i_need_to_know: parsed.value.what_i_need_to_know,
    },
    { status: 200 }
  );
}
