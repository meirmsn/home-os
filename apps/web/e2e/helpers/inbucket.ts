// What: Tiny helper for fetching emails from the local Supabase mail relay
//       (Mailpit; previously Inbucket pre-CLI v2.x) and parsing the most
//       recent magic-link URL out of the message body. Canonical
//       implementation per kit/docs/guide/supabase-ssr-boilerplate.md §
//       Pattern 9 — adopt the same shape in any new mail-reading spec.
// Why: Magic-link, sign-up confirmation, forgot-password, and invite E2Es
//      need to follow the magic-link the way a real user would. Mailpit
//      exposes a JSON API that we poll until the message lands. The
//      regex + decode + rewrite layers handle the corner cases (PKCE vs
//      token-hash flow URL shapes, &amp; in href, bare /verify path on
//      some CLI versions) so callers don't re-discover them.
// Does NOT: Talk to hosted Supabase (email-template rendering happens on
//           Supabase's mail relay there; specs gate on the local stack
//           via isLocalSupabase() in helpers/admin-client.ts).
//
// Naming: file is `inbucket.ts` for historical reasons — Supabase CLI swapped
// inbucket for mailpit in v2.x and never updated the env var name (it still
// surfaces as INBUCKET_URL in `supabase status -o env`). The relay is mailpit;
// the helper name preserves the env-var naming for grep continuity.
//
// Port choice (home-os): home-os rebound the Supabase port set by +100 to
// dodge a lalista collision (see CLAUDE.md § Local Supabase ports), so
// mailpit lives at 54424 instead of the upstream default 54324. The
// devshop template uses 54324; projects that rebound need to update the
// MAILPIT_PORT constant below to match `supabase/config.toml` `[inbucket]
// port` (the upstream env-var name).

const MAILPIT_PORT = 54424;

/**
 * Derive mailpit's host from SUPABASE_URL so the helper works in both:
 *   - Workspace devcontainer (test SKIPS here — `isLocalSupabase()` only
 *     trues for 127.0.0.1/localhost shapes, not the workspace's
 *     `host.docker.internal` URL).
 *   - GitHub Actions slow-job: SUPABASE_URL=http://127.0.0.1:54421 (Supabase
 *     binds directly to the runner's localhost; mailpit listens on
 *     MAILPIT_PORT on the same host).
 */
function deriveMailpitBase(): string {
  const supabaseUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54421';
  try {
    const host = new URL(supabaseUrl).hostname;
    return `http://${host}:${MAILPIT_PORT}`;
  } catch {
    return `http://127.0.0.1:${MAILPIT_PORT}`;
  }
}

const MAILPIT_BASE = deriveMailpitBase();

/** Mailpit message summary shape (subset of fields we use). */
interface MailpitSummary {
  ID: string;
  From: { Name: string; Address: string };
  To: { Name: string; Address: string }[];
  Subject: string;
  Snippet: string;
  Created: string;
}

/** Mailpit list/search response envelope. */
interface MailpitListResponse {
  total: number;
  messages_count: number;
  start: number;
  messages: MailpitSummary[];
}

/** Mailpit message body shape (subset). */
interface MailpitMessage {
  HTML?: string;
  Text?: string;
}

/** Stable summary shape returned to callers — agnostic to the relay engine. */
export interface EmailSummary {
  id: string;
  subject: string;
  to: string;
  date: string;
}

/**
 * Wait until mailpit has at least `minCount` messages addressed to `address`,
 * then return the latest summary. Polls every 500ms up to the given timeout.
 *
 * Uses mailpit's search endpoint (`/api/v1/search?query=to:<addr>`) so
 * cross-test mailbox pollution from other parallel specs doesn't trip us up.
 */
export async function waitForLatestEmail(
  address: string,
  options: { minCount?: number; timeoutMs?: number } = {}
): Promise<EmailSummary> {
  const minCount = options.minCount ?? 1;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const start = Date.now();
  let lastErr: unknown = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(
        `${MAILPIT_BASE}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}&limit=50`
      );
      if (res.ok) {
        const data = (await res.json()) as MailpitListResponse;
        if (data.messages.length >= minCount) {
          // Mailpit returns newest first by default; pick `messages[0]`.
          const m = data.messages[0]!;
          return {
            id: m.ID,
            subject: m.Subject,
            to: m.To[0]?.Address ?? address,
            date: m.Created,
          };
        }
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `mailpit: no message for ${address} after ${timeoutMs}ms (expected at least ${minCount}; base=${MAILPIT_BASE}; lastErr=${lastErr instanceof Error ? lastErr.message : String(lastErr)})`
  );
}

/** Fetch the full body for a given mailpit message. */
export async function fetchEmailBody(
  _address: string,
  id: string
): Promise<{ body?: { html?: string; text?: string } }> {
  const res = await fetch(`${MAILPIT_BASE}/api/v1/message/${id}`);
  if (!res.ok) {
    throw new Error(
      `mailpit: failed to fetch message ${id} (status ${res.status}; base=${MAILPIT_BASE})`
    );
  }
  const data = (await res.json()) as MailpitMessage;
  return { body: { html: data.HTML, text: data.Text } };
}

/**
 * Pull the magic-link URL out of an email body. The HTML body carries the
 * rendered template (anchor href); the text body carries the plain-text
 * link. Try HTML first, fall back to text.
 *
 * The link's path shape depends on Supabase's flow:
 *   - Token-hash flow (default `{{ .ConfirmationURL }}`):
 *     `{SiteURL}/auth/v1/verify?token=<hash>&type=<type>&redirect_to=<...>`
 *   - Direct PKCE flow: link points at redirect_to with `?code=<...>` appended.
 * Either is fine for E2E — `page.goto(link)` follows redirects — so the
 * regex matches both shapes plus the bare `?code=` / `?token=` forms.
 */
export function extractMagicLink(message: {
  body?: { html?: string; text?: string };
}): string {
  const html = message.body?.html ?? '';
  const text = message.body?.text ?? '';
  const re =
    /https?:\/\/[^\s"'<>]*(?:\/auth\/v1\/verify|\/verify|\/auth\/callback|[?&](?:code|token|token_hash)=)[^\s"'<>]*/i;
  const fromHtml = html.match(re)?.[0];
  if (fromHtml) return rewriteBareVerify(decodeHtmlEntities(fromHtml));
  const fromText = text.match(re)?.[0];
  if (fromText) return rewriteBareVerify(decodeHtmlEntities(fromText));
  throw new Error(
    `mailpit: no auth-flow URL found in email body (html=${html.slice(0, 400)}…, text=${text.slice(0, 400)}…)`
  );
}

/**
 * Some Supabase CLI versions render `{{ .ConfirmationURL }}` with a bare
 * `/verify?...` path on the auth host (`http://127.0.0.1:54321/verify?...`)
 * instead of the Kong-prefixed `/auth/v1/verify?...`. Hitting the bare path
 * directly returns 404 "no Route matched"; Kong only proxies `/auth/v1/*`.
 *
 * A real email client clicks the link as text — the browser follows the URL
 * verbatim, so this same 404 would happen for end users too. The "fix" is
 * upstream (Supabase needs to render the Kong-prefixed URL or the API
 * external URL needs to be configured to include the prefix). For tests,
 * we rewrite to the Kong path so the recovery flow exercises end-to-end.
 *
 * Production hosted Supabase doesn't have this issue (the API external URL
 * includes /auth/v1 by default).
 */
function rewriteBareVerify(url: string): string {
  // Match `http(s)://<host>:<port>/verify?...` where the path is exactly
  // `/verify` (bare; not `/auth/v1/verify` already). Insert `/auth/v1`.
  return url.replace(
    /^(https?:\/\/[^/]+)\/verify(\?|$)/,
    '$1/auth/v1/verify$2'
  );
}

/**
 * Decode the handful of HTML entities that show up in an `href` attribute.
 * Supabase's email template uses `{{ .ConfirmationURL }}` which renders into
 * an HTML-escaped `href`, so a URL like `?token=foo&type=recovery` becomes
 * `?token=foo&amp;type=recovery` in the rendered HTML. Passing that to
 * `page.goto` would treat `&amp;` as a literal query-string separator, so
 * the next param becomes `amp;type=recovery` and Supabase 400s with
 * "Verify requires a verification type." Decode here so callers get the
 * URL the user's mail client would actually follow.
 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Back-compat wrapper used by `magic-link.spec.ts`. Composes the three
 * primitives above into the one-shot "give me the magic link" signature
 * the existing spec was written against. New specs should prefer the
 * three-function API so they can assert subject/recipient before
 * extracting the link (useful for sign-up vs reset-password
 * discrimination). Returns a parsed URL — caller can `page.goto(url.toString())`.
 */
export async function latestMagicLink(email: string): Promise<URL> {
  const summary = await waitForLatestEmail(email, { timeoutMs: 10_000 });
  const message = await fetchEmailBody(email, summary.id);
  return new URL(extractMagicLink(message));
}
