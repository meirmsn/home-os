// What: `/(app)/cards/[id]` server-rendered card detail page. Owns the
//       state-machine UI for a single card: capturing renders the
//       "Read this for me" CTA; triaging renders the reading skeleton;
//       diagnosed renders summary / severity chip / "what I need to
//       know" / sources; monitoring/closed/dismissed render row-#-deferred
//       stubs (spec § Screens — D5).
// Why:  Endpoint /api/triage needs a consumer to QA + ship. /cards/[id]
//       becomes the home base for row #2's Q&A UI — answer-input dialog
//       slots in below the diagnosed preview without page replacement.
//       Server-rendered initial paint avoids a stale-state flash; the
//       only client boundary is <StartTriage /> on the capturing body.
// Does NOT: Render the answer-input UI for row #2's Q&A. Doesn't poll
//           or stream — triaging-state refreshes happen via the
//           StartTriage button's router.refresh() (spec § Render
//           conditions table). Doesn't show the contractor_tag — row
//           #3 owns the decide-state surface.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { StartTriage } from './_components/StartTriage';

export const dynamic = 'force-dynamic';

type CardState =
  | 'capturing'
  | 'triaging'
  | 'diagnosed'
  | 'monitoring'
  | 'closed'
  | 'dismissed';

type CardRow = {
  id: string;
  state: CardState;
  initial_description: string | null;
  system_tag: string | null;
  room_tag: string | null;
  created_at: string;
  closed_at: string | null;
  diagnosis: string | null;
  severity: 'cosmetic' | 'monitor' | 'soon' | 'urgent' | null;
};

type AssistantContent = {
  summary?: string;
  severity_provisional?: 'cosmetic' | 'monitor' | 'soon' | 'urgent';
  what_im_confident_about?: string;
  what_i_need_to_know?: string[];
  sources?: { url: string; title: string }[];
  system_tag_proposed?: string;
  contractor_tag_proposed?: string;
};

/** UTC-ISO → human-readable short date (e.g. "Wed, May 15"). */
function humanDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Map a severity tier to a Tailwind/CSS-var color class for the chip.
 *  Mirrors packages/ui/src/tokens.ts severity palette + the urgent
 *  treatment (text-danger). */
function severityChipClass(severity: NonNullable<CardRow['severity']>): {
  bg: string;
  text: string;
  label: string;
} {
  switch (severity) {
    case 'cosmetic':
      return {
        bg: 'bg-[var(--color-note)]/20',
        text: 'text-[var(--color-note)]',
        label: 'cosmetic',
      };
    case 'monitor':
      return {
        bg: 'bg-[var(--color-monitor)]/20',
        text: 'text-[var(--color-monitor)]',
        label: 'monitor',
      };
    case 'soon':
      return {
        bg: 'bg-[var(--color-watch)]/20',
        text: 'text-[var(--color-watch)]',
        label: 'soon',
      };
    case 'urgent':
      return {
        bg: 'bg-[var(--color-act-soon)]/20',
        text: 'text-[var(--color-act-soon)]',
        label: 'urgent',
      };
  }
}

/** Parse the assistant_content JSON blob from triage_conversations. Returns
 *  undefined on parse failure (defense — the route's parser asserts shape
 *  at write time, but reads are best-effort). */
function parseAssistantContent(content: string): AssistantContent | undefined {
  try {
    const parsed = JSON.parse(content);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as AssistantContent)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Server-rendered card detail page — see file header. */
export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Explicit auth check in the page — the (app) layout also runs getUser()
  // and redirects to /login, but layout + page server components render in
  // parallel. If this page's SELECT loses the RLS context (returning empty),
  // we'd throw notFound() before the layout's redirect throws — producing
  // a confusing 404 instead of a /login bounce. Anchoring the auth check
  // here too removes the race.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/cards/${encodeURIComponent(id)}`);
  }

  const { data: cardRow, error: cardError } = await supabase
    .from('cards')
    .select(
      'id, state, initial_description, system_tag, room_tag, created_at, closed_at, diagnosis, severity'
    )
    .eq('id', id)
    .maybeSingle();

  if (cardError) {
    // PostgREST returned an error — column drift, RLS misconfig, or stale
    // schema cache. Capture with full context before falling through to
    // 404 so the next occurrence is debuggable.
    Sentry.captureException(new Error('cards SELECT errored on detail page'), {
      tags: { surface: 'cards/[id]', stage: 'card_select' },
      extra: {
        card_id: id,
        user_id: user.id,
        error_message: cardError.message,
        error_code: cardError.code,
        error_details: cardError.details,
      },
    });
    notFound();
  }

  if (!cardRow) {
    // Row missing under the user's RLS context. Either the card genuinely
    // doesn't exist, it belongs to another user, or the user's auth
    // context didn't propagate into the SELECT (the suspected cause of the
    // post-capture 404 reported in production). Capture so we can tell
    // these cases apart on the next hit — D7's posture still applies:
    // never leak existence to the *user*, just to our telemetry.
    Sentry.captureMessage('cards SELECT returned no row on detail page', {
      level: 'warning',
      tags: { surface: 'cards/[id]', stage: 'card_missing' },
      extra: { card_id: id, user_id: user.id },
    });
    notFound();
  }

  const card = cardRow as CardRow;

  // Pull the most-recent primary/wide photo (if any). Storage URL is
  // only retrieved via a signed URL because the bucket is private.
  const { data: photoRow } = await supabase
    .from('card_photos')
    .select('storage_path')
    .eq('card_id', id)
    .eq('touchpoint_type', 'primary')
    .eq('slot', 'wide')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let photoUrl: string | null = null;
  if (photoRow?.storage_path) {
    const { data: signed } = await supabase.storage
      .from('card-photos')
      .createSignedUrl(photoRow.storage_path, 60 * 10); // 10 minutes
    photoUrl = signed?.signedUrl ?? null;
  }

  // For diagnosed cards, pull the most-recent assistant row to extract
  // the "what I need to know" + sources for the preview.
  let assistantContent: AssistantContent | undefined;
  if (card.state === 'diagnosed') {
    const { data: convoRow } = await supabase
      .from('triage_conversations')
      .select('content')
      .eq('card_id', id)
      .eq('role', 'assistant')
      .order('round', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (convoRow?.content) {
      assistantContent = parseAssistantContent(convoRow.content);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <header className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-[var(--color-text-secondary-inverse)]">
          {card.room_tag && (
            <span data-testid="room-tag" className="font-medium">
              {card.room_tag}
            </span>
          )}
          {card.system_tag && (
            <span
              data-testid="system-tag-chip"
              className="rounded-full bg-[var(--color-surface-input)] px-2 py-0.5 font-medium text-[var(--color-text-primary-inverse)]"
            >
              {card.system_tag}
            </span>
          )}
          <span data-testid="created-at">
            Captured {humanDate(card.created_at)}
          </span>
        </div>
      </header>

      <section
        aria-label="Photo"
        className="overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]"
      >
        {photoUrl ? (
          <img src={photoUrl} alt="Captured photo" className="h-auto w-full" />
        ) : (
          <p className="px-5 py-10 text-center text-sm text-[var(--color-text-secondary-inverse)]">
            No photo on this card.
          </p>
        )}
      </section>

      {card.initial_description && (
        <section
          aria-label="Description"
          className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5"
        >
          <p className="whitespace-pre-line text-sm text-[var(--color-text-primary-inverse)]">
            {card.initial_description}
          </p>
        </section>
      )}

      {card.state === 'capturing' && (
        <section aria-label="Triage trigger">
          <StartTriage
            cardId={card.id}
            systemTag={card.system_tag ?? 'other'}
          />
        </section>
      )}

      {card.state === 'triaging' && (
        <section
          aria-label="Triaging"
          className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5"
          data-testid="triaging-skeleton"
        >
          <p className="text-sm text-[var(--color-text-secondary-inverse)]">
            Reading your capture…
          </p>
          <div
            aria-hidden
            className="mt-3 space-y-2 [&>div]:h-3 [&>div]:rounded [&>div]:bg-[var(--color-surface-input)]"
          >
            <div className="w-3/4" />
            <div className="w-full" />
            <div className="w-5/6" />
          </div>
        </section>
      )}

      {card.state === 'diagnosed' && (
        <section
          aria-label="Initial read"
          className="space-y-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5"
          data-testid="diagnosed-body"
        >
          {card.severity && <SeverityChip severity={card.severity} />}
          {card.diagnosis && (
            <p className="whitespace-pre-line text-sm text-[var(--color-text-primary-inverse)]">
              {card.diagnosis}
            </p>
          )}
          {assistantContent?.what_i_need_to_know &&
            assistantContent.what_i_need_to_know.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary-inverse)]">
                  What I need to know
                </h2>
                <ul
                  className="list-inside list-disc space-y-1 text-sm text-[var(--color-text-primary-inverse)]"
                  data-testid="what-i-need-to-know"
                >
                  {assistantContent.what_i_need_to_know.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          {assistantContent?.sources && assistantContent.sources.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary-inverse)]">
                Sources
              </h2>
              <ol
                className="space-y-1 text-xs text-[var(--color-text-secondary-inverse)]"
                data-testid="sources"
              >
                {assistantContent.sources.map((s, i) => (
                  <li key={i}>
                    [{i + 1}]{' '}
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-text-primary-inverse)] underline-offset-2 hover:underline"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {card.state === 'monitoring' && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5 text-sm text-[var(--color-text-secondary-inverse)]">
          Monitoring view ships in <code>monitor-beta</code>.
        </section>
      )}

      {card.state === 'closed' && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5 text-sm text-[var(--color-text-secondary-inverse)]">
          Card closed
          {card.closed_at ? <> on {humanDate(card.closed_at)}</> : null}.
        </section>
      )}

      {card.state === 'dismissed' && (
        <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5 text-sm text-[var(--color-text-secondary-inverse)]">
          This card was dismissed. Restore it from{' '}
          <Link
            href="/dismissed"
            className="text-[var(--color-text-primary-inverse)] underline-offset-2 hover:underline"
          >
            /dismissed
          </Link>{' '}
          to reactivate.
        </section>
      )}
    </main>
  );
}

/** Severity-tier chip. Color treatment mirrors the four-tier palette
 *  from packages/ui/src/tokens.ts. */
function SeverityChip({
  severity,
}: {
  severity: NonNullable<CardRow['severity']>;
}) {
  const { bg, text, label } = severityChipClass(severity);
  return (
    <span
      data-testid="severity-chip"
      data-severity={severity}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider ${bg} ${text}`}
    >
      {label}
    </span>
  );
}
