// What: Tiny helper for Playwright E2E tests that need to read an email
//       delivered to the local Supabase stack's mail catcher (port 54424
//       per supabase/config.toml — the supabase CLI still calls the env
//       var INBUCKET_URL but the actual container is now Mailpit). Exposes
//       a single async function `latestMagicLink(email)` that polls the
//       Mailpit search API until a message arrives, fetches the latest
//       message body, and extracts the first /auth/callback URL from it.
// Why:  The magic-link Playwright spec needs to round-trip through the
//       real email channel. Mailpit is the SMTP catcher already wired
//       into the local stack — we read it via its HTTP API without bringing
//       up new infra. Mirrors the Pattern-3 convention from
//       apps/web/e2e/helpers/admin-client.ts (one canonical helper file
//       per surface; named export per public function).
// Does NOT: Authenticate against Mailpit (the local stack ships it
//           wide-open). Does NOT delete the message after reading —
//           tests should mint a fresh email per run via Date.now() so
//           recipients never collide.

// File name is `inbucket.ts` for backward-compat with the original helper
// the spec imports — the underlying API is Mailpit's. The supabase CLI's
// `status -o env` output exposes the URL under both `INBUCKET_URL` and
// `MAILPIT_URL` (same value); we hard-code 54424 here to match the
// CLAUDE.md § Local Supabase ports table.
const MAILPIT_BASE = 'http://127.0.0.1:54424';
const POLL_INTERVAL_MS = 250;
const POLL_TIMEOUT_MS = 10_000;

type MailpitMessageHeader = {
  ID: string;
  Subject?: string;
  Created?: string;
};

type MailpitSearchResponse = {
  messages?: MailpitMessageHeader[];
};

type MailpitMessageBody = {
  Text?: string;
  HTML?: string;
};

/** Sleep helper — Mailpit needs ~50-200ms between SMTP delivery and the
 *  REST API surfacing the message; we poll instead of guessing. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll Mailpit for the latest message addressed to `email`, then parse
 *  the first http(s)://.../auth/callback URL out of its body. Returns the
 *  parsed URL so callers can inspect query params before navigating. */
export async function latestMagicLink(email: string): Promise<URL> {
  // Mailpit search syntax: `to:<addr>` matches the recipient. `encodeURIComponent`
  // handles the `@` (otherwise the bare `@` in the query string can be parsed
  // ambiguously by some intermediaries; Mailpit itself accepts both).
  const searchUrl = `${MAILPIT_BASE}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`;

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let messages: MailpitMessageHeader[] = [];
  while (Date.now() < deadline) {
    const res = await fetch(searchUrl);
    if (res.ok) {
      const payload = (await res.json()) as MailpitSearchResponse;
      messages = payload.messages ?? [];
      if (messages.length > 0) break;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  if (messages.length === 0) {
    throw new Error(
      `latestMagicLink: no message arrived for ${email} within ${POLL_TIMEOUT_MS}ms`
    );
  }

  // Mailpit returns search results newest-first. Take messages[0] (most
  // recent) — opposite of the original Inbucket helper's `messages.length-1`.
  const latest = messages[0]!;
  const bodyRes = await fetch(`${MAILPIT_BASE}/api/v1/message/${latest.ID}`);
  if (!bodyRes.ok) {
    throw new Error(
      `latestMagicLink: failed to fetch message body (${bodyRes.status})`
    );
  }
  const payload = (await bodyRes.json()) as MailpitMessageBody;
  const text = payload.Text ?? payload.HTML ?? '';

  // Match the first http(s)://...//auth/callback URL. Supabase's default
  // magic-link template renders the link as a bare URL on its own line.
  const match = text.match(/https?:\/\/[^\s<>"']+\/auth\/callback[^\s<>"']*/);
  if (!match) {
    throw new Error(
      `latestMagicLink: no /auth/callback URL found in message for ${email}`
    );
  }
  return new URL(match[0]);
}
