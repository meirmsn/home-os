// What: POST /api/key-validate route handler. Auth-gated BYOK key
//       validation via a minimal Anthropic API call. On success, marks
//       the user's byok_used flag via the mark_byok_used RPC.
// Why:  Spec D4 — validates BYOK keys before the user relies on them
//       in triage. The key never touches DB/cookies/localStorage.
// Does NOT: Store the key. Rate-limit (auth gate + Anthropic call
//           provide backpressure). The key is garbage-collected after
//           the response.

import Anthropic, { APIError as AnthropicAPIError } from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/nextjs';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Max key length — defense in depth. */
const KEY_MAX_LEN = 200;

/** POST /api/key-validate — see file header. */
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
        fields: { key: 'Body must be JSON.' },
      },
      { status: 400 }
    );
  }

  const key =
    body && typeof body === 'object' && 'key' in body
      ? (body as { key: unknown }).key
      : undefined;

  if (typeof key !== 'string' || key.trim().length === 0) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        fields: { key: 'key must be a non-empty string.' },
      },
      { status: 400 }
    );
  }

  const trimmedKey = key.trim();
  if (trimmedKey.length > KEY_MAX_LEN) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        fields: { key: `key must be ≤ ${KEY_MAX_LEN} characters.` },
      },
      { status: 400 }
    );
  }

  // 3. Minimal Anthropic API call to validate the key.
  const client = new Anthropic({
    apiKey: trimmedKey,
    timeout: 15_000,
  });

  try {
    await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    });
  } catch (err) {
    if (err instanceof AnthropicAPIError) {
      if (err.status === 401) {
        return NextResponse.json({ error: 'invalid_key' }, { status: 200 });
      }
      if (err.status === 402) {
        return NextResponse.json({ error: 'out_of_credits' }, { status: 200 });
      }
    }
    // Other Anthropic error / network throw.
    Sentry.captureException(err, {
      tags: { route: 'POST /api/key-validate', stage: 'anthropic_probe' },
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  // 4. Success — mark byok_used on the user row (idempotent).
  const { error: rpcError } = await supabase.rpc('mark_byok_used', {
    p_user: user.id,
  });
  if (rpcError) {
    // Non-fatal — the key is still valid; we just didn't flip the flag.
    Sentry.captureException(rpcError, {
      tags: { route: 'POST /api/key-validate', stage: 'mark_byok_used' },
    });
  }

  return NextResponse.json({ valid: true }, { status: 200 });
}
