// What: Tiny helper for Playwright E2E tests that need to read an email
//       delivered to the local Supabase stack's Inbucket (port 54424 per
//       CLAUDE.md § Local Supabase ports). Exposes a single async function
//       `latestMagicLink(email)` that polls Inbucket's REST API until a
//       message arrives, fetches the latest message body, and extracts
//       the first /auth/callback URL from it.
// Why:  The magic-link Playwright spec needs to round-trip through the
//       real email channel — Inbucket is the SMTP catcher already wired
//       into the local stack, so we read it via HTTP without bringing
//       up any new infra. Mirrors the Pattern-3 convention from
//       apps/web/e2e/helpers/admin-client.ts (one canonical helper file
//       per surface; named export per public function).
// Does NOT: Authenticate against Inbucket (the local stack ships it
//           wide-open). Does NOT delete the message after reading —
//           tests should mint a fresh email per run via Date.now() so
//           mailboxes never collide.

const INBUCKET_BASE = 'http://127.0.0.1:54424';
const POLL_INTERVAL_MS = 250;
const POLL_TIMEOUT_MS = 10_000;

type InbucketMessageHeader = {
  id: string;
  from?: string;
  subject?: string;
  date?: string;
};

type InbucketMessageBody = {
  body?: { text?: string; html?: string };
};

/** Sleep helper — Inbucket needs ~50-200ms between SMTP delivery and the
 *  REST API surfacing the message; we poll instead of guessing. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll Inbucket for the latest message addressed to `email`, then parse
 *  the first http(s)://.../auth/callback URL out of its body. Returns the
 *  parsed URL so callers can inspect query params before navigating. */
export async function latestMagicLink(email: string): Promise<URL> {
  // Inbucket addresses messages by mailbox-name = local-part of the email
  // (no @domain). Stripping the @ avoids URL-encoding gymnastics.
  const mailbox = email.split('@')[0];
  if (!mailbox) {
    throw new Error(`latestMagicLink: invalid email ${JSON.stringify(email)}`);
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let messages: InbucketMessageHeader[] = [];
  while (Date.now() < deadline) {
    const res = await fetch(`${INBUCKET_BASE}/api/v1/mailbox/${mailbox}`);
    if (res.ok) {
      messages = (await res.json()) as InbucketMessageHeader[];
      if (messages.length > 0) break;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  if (messages.length === 0) {
    throw new Error(
      `latestMagicLink: no message arrived for ${email} within ${POLL_TIMEOUT_MS}ms`
    );
  }

  const latest = messages[messages.length - 1]!;
  const bodyRes = await fetch(
    `${INBUCKET_BASE}/api/v1/mailbox/${mailbox}/${latest.id}`
  );
  if (!bodyRes.ok) {
    throw new Error(
      `latestMagicLink: failed to fetch message body (${bodyRes.status})`
    );
  }
  const payload = (await bodyRes.json()) as InbucketMessageBody;
  const text = payload.body?.text ?? payload.body?.html ?? '';

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
