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
import { computeQaRoundState } from '@/app/api/triage/_lib/round-state';
import {
  parseContractorExpansion,
  parseDiyExpansion,
  type ContractorExpansion,
  type DiyExpansion,
} from '@/app/api/triage/_lib/estimate-shapes';
import { StartTriage } from './_components/StartTriage';
import { AnswerThread } from './_components/AnswerThread';
import { DiagnosedThread } from './_components/DiagnosedThread';
import { QaThread } from './_components/QaThread';
import { ClosedView } from './_components/ClosedView';
import { DecideView } from './_components/DecideView';
import { PlannedView } from './_components/PlannedView';
import { MonitorView } from './_components/MonitorView';
import type { CheckInPhoto, CheckInEntry } from './_components/CheckInTimeline';
import { ReminderDueChip } from './_components/ReminderDueChip';

export const dynamic = 'force-dynamic';

type CardState =
  | 'capturing'
  | 'triaging'
  | 'diagnosed'
  | 'decide'
  | 'planned'
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
  severity_confirmed: boolean;
  contractor_tag: string | null;
  monitoring_cadence_days: number | null;
  chosen_path: 'diy' | 'contractor' | 'monitor' | null;
  cost_estimate_diy: unknown;
  cost_estimate_diy_override: unknown;
  cost_estimate_hire: unknown;
  cost_estimate_hire_override: unknown;
  /** Optional reminder date (PostgREST surfaces Postgres `date` as the
   *  ISO `'YYYY-MM-DD'` string shape). Null when no reminder is set. */
  planned_reminder_date: string | null;
  /** Timestamp of the last row update. Used as a proxy for
   *  planned_entered_at in the close-flow PostHog event (Gotcha #8). */
  updated_at: string;
  /** Actual spend in cents, recorded at close time. Null until closed. */
  actual_spend_cents: number | null;
  /** Free-text spend notes, recorded at close time. Null until closed. */
  spend_notes: string | null;
  /** Next check-in due date for monitoring-state cards. Null until
   *  card enters monitoring state. */
  next_check_at: string | null;
};

type ThreadRow = {
  created_at: string;
  round: number;
  role: 'user' | 'assistant';
  is_location_ask: boolean;
  tool_name: string | null;
  content: string;
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
  // Server component renders once — Date.now() is stable within a single request.
  const now = Date.now();
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
      'id, state, initial_description, system_tag, room_tag, created_at, closed_at, diagnosis, severity, severity_confirmed, contractor_tag, monitoring_cadence_days, chosen_path, cost_estimate_diy, cost_estimate_diy_override, cost_estimate_hire, cost_estimate_hire_override, planned_reminder_date, updated_at, actual_spend_cents, spend_notes, next_check_at'
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

  // Photo-comparison entry gate: count distinct photo-bearing touchpoints
  // (distinct touchpoint_id among card_photos). The "Compare photos" link
  // renders only when this is >= 2 (spec § Entry points + G6). Text-only
  // check-ins have no card_photos rows, so they never count — the rule
  // "only moments with >= 1 photo" falls out for free (spec G4). Cheap,
  // RLS-scoped; deduped in JS to avoid a distinct-count RPC. Only the
  // planned/monitoring/closed views render the link, so skip the query
  // entirely for the other states (no wasted round-trip).
  let photoTouchpointCount = 0;
  if (
    card.state === 'planned' ||
    card.state === 'monitoring' ||
    card.state === 'closed'
  ) {
    const { data: touchpointIdRows } = await supabase
      .from('card_photos')
      .select('touchpoint_id')
      .eq('card_id', id);
    photoTouchpointCount = new Set(
      (touchpointIdRows ?? []).map((r) => r.touchpoint_id)
    ).size;
  }

  // Pull the most-recent primary/wide photo (if any). Storage URL is
  // only retrieved via a signed URL because the bucket is private.
  const { data: photoRow } = await supabase
    .from('card_photos')
    .select('storage_path, created_at')
    .eq('card_id', id)
    .eq('touchpoint_type', 'primary')
    .eq('slot', 'wide')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let photoUrl: string | null = null;
  let beforePhotoDate: string | null = null;
  if (photoRow?.storage_path) {
    const { data: signed } = await supabase.storage
      .from('card-photos')
      .createSignedUrl(photoRow.storage_path, 60 * 10); // 10 minutes
    photoUrl = signed?.signedUrl ?? null;
    beforePhotoDate = photoRow.created_at ?? null;
  }

  // Close-photo queries: for closed cards, pull the latest
  // touchpoint_type='close' photo (the finished photo) for the
  // before/after pair. Signed URL TTL: 10 minutes (same as capture).
  let closePhotoUrl: string | null = null;
  let closePhotoDate: string | null = null;
  if (card.state === 'closed') {
    const { data: closePhotoRow } = await supabase
      .from('card_photos')
      .select('storage_path, created_at')
      .eq('card_id', id)
      .eq('touchpoint_type', 'close')
      .eq('slot', 'wide')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (closePhotoRow?.storage_path) {
      const { data: closeSigned } = await supabase.storage
        .from('card-photos')
        .createSignedUrl(closePhotoRow.storage_path, 60 * 10);
      closePhotoUrl = closeSigned?.signedUrl ?? null;
      closePhotoDate = closePhotoRow.created_at ?? null;
    }
  }

  // For diagnosed/decide/planned/closed cards, pull the FULL thread so the
  // page can render <QaThread /> + <AnswerThread /> + <DiagnosedThread />
  // + <DecideView />'s "How we diagnosed this" collapsible from
  // server-fetched data.
  let threadRows: ThreadRow[] = [];
  let assistantContent: AssistantContent | undefined;
  if (
    card.state === 'diagnosed' ||
    card.state === 'decide' ||
    card.state === 'planned' ||
    card.state === 'monitoring' ||
    card.state === 'closed'
  ) {
    const { data: convoRows } = await supabase
      .from('triage_conversations')
      .select('content, created_at, round, role, is_location_ask, tool_name')
      .eq('card_id', id)
      .order('created_at', { ascending: true });
    threadRows = (convoRows ?? []) as ThreadRow[];
    // Initial-read preview source: the round-1 assistant row.
    const initialReadRow = threadRows.find(
      (r) =>
        r.role === 'assistant' &&
        r.round === 1 &&
        (r.tool_name === 'record_initial_read' || r.tool_name === null)
    );
    if (initialReadRow?.content) {
      assistantContent = parseAssistantContent(initialReadRow.content);
    }
  }

  // Derived Q&A round state (qaUserCount + priorWasLocationAsk +
  // priorAssistantToolName). Drives the diagnosed-state body switch.
  const qaState = computeQaRoundState(threadRows);

  // Find the most-recent ask_next_question assistant row to render
  // as the active question above <AnswerThread />.
  type ParsedAsk = {
    question?: string;
    is_location_ask?: boolean;
  };
  let activeQuestion = '';
  let activeQuestionIsLocationAsk = false;
  if (qaState.priorAssistantToolName === 'ask_next_question') {
    const lastAsk = [...threadRows]
      .reverse()
      .find(
        (r) => r.role === 'assistant' && r.tool_name === 'ask_next_question'
      );
    if (lastAsk?.content) {
      try {
        const parsed = JSON.parse(lastAsk.content) as ParsedAsk;
        if (typeof parsed.question === 'string') {
          activeQuestion = parsed.question;
        }
        if (typeof parsed.is_location_ask === 'boolean') {
          activeQuestionIsLocationAsk = parsed.is_location_ask;
        }
      } catch {
        // Best-effort — server-side parse failure renders an empty
        // question; the user sees the textarea + Send anyway.
      }
    }
  } else if (
    qaState.priorAssistantToolName === 'record_initial_read' &&
    assistantContent?.what_i_need_to_know?.[0]
  ) {
    // Just-after-initial-read state: no ask_next_question row yet, so
    // the first "what I need to know" question seeds the active prompt.
    activeQuestion = assistantContent.what_i_need_to_know[0];
  }

  // Reminder-due derivation (spec § D3 + Gotcha #3). Strip clock-time
  // from both sides via UTC string slicing so the comparison is
  // lexicographic on `'YYYY-MM-DD'` strings — never on Date objects.
  // PostgREST returns Postgres `date` as the ISO string shape, so the
  // RHS is already in the right form. Never compare timestamps here;
  // `new Date('2026-05-17') >= new Date()` flakes around midnight UTC.
  //
  // Derived in TWO places by design: here (card detail page) AND
  // (when it ships) PR #4's dashboard query. Spec § D7 explicitly
  // rejected centralizing this in a SQL view — adding one now would
  // be dead infra with one consumer; the abstraction surfaces when
  // PR #4 has its own real query shape (joins, additional derived
  // columns). When PR #4 lands, audit both call sites are still in
  // lock-step. Universal pattern: `kit/docs/guide/date-handling.md
  // § Trap 2`.
  const todayIso = new Date(now).toISOString().slice(0, 10);
  const isReminderDue =
    card.state === 'planned' &&
    card.planned_reminder_date !== null &&
    card.planned_reminder_date <= todayIso;

  // Monitoring-state data: check-ins, check-in photos, reference photos,
  // overdue derivation, days-since-last-checkin. Only fetched when the
  // card is in monitoring state.
  const monitorCheckInEntries: CheckInEntry[] = [];
  let monitorReferencePhotos: CheckInPhoto[] = [];
  let monitorIsOverdue = false;
  let monitorDaysSinceLastCheckin: number | null = null;

  if (card.state === 'monitoring') {
    // Fetch check-ins for this card, ordered by created_at desc.
    const { data: checkInRows } = await supabase
      .from('check_ins')
      .select('id, created_at, notes')
      .eq('card_id', id)
      .order('created_at', { ascending: false });

    const checkIns = checkInRows ?? [];

    // For each check-in, fetch photos and generate signed URLs.
    for (const ci of checkIns) {
      const { data: ciPhotoRows } = await supabase
        .from('card_photos')
        .select('slot, storage_path')
        .eq('card_id', id)
        .eq('touchpoint_type', 'checkin')
        .eq('touchpoint_id', ci.id);

      const ciPhotos: CheckInPhoto[] = [];
      for (const pr of ciPhotoRows ?? []) {
        if (pr.storage_path) {
          const { data: ciSigned } = await supabase.storage
            .from('card-photos')
            .createSignedUrl(pr.storage_path, 60 * 10);
          if (ciSigned?.signedUrl) {
            ciPhotos.push({ slot: pr.slot, url: ciSigned.signedUrl });
          }
        }
      }
      monitorCheckInEntries.push({
        id: ci.id,
        createdAt: ci.created_at,
        notes: ci.notes,
        photos: ciPhotos,
      });
    }

    // Reference photos: last check-in photos, or capture photos as fallback (G7).
    if (
      monitorCheckInEntries.length > 0 &&
      monitorCheckInEntries[0]!.photos.length > 0
    ) {
      monitorReferencePhotos = monitorCheckInEntries[0]!.photos;
    } else {
      // Fallback to capture photos (touchpoint_type='primary').
      const { data: capturePhotoRows } = await supabase
        .from('card_photos')
        .select('slot, storage_path')
        .eq('card_id', id)
        .eq('touchpoint_type', 'primary');
      for (const pr of capturePhotoRows ?? []) {
        if (pr.storage_path) {
          const { data: capSigned } = await supabase.storage
            .from('card-photos')
            .createSignedUrl(pr.storage_path, 60 * 10);
          if (capSigned?.signedUrl) {
            monitorReferencePhotos.push({
              slot: pr.slot,
              url: capSigned.signedUrl,
            });
          }
        }
      }
    }

    // Overdue derivation (G4 — server time).
    monitorIsOverdue =
      card.next_check_at !== null &&
      new Date(card.next_check_at).getTime() <= now;

    // Days since last check-in.
    if (checkIns.length > 0) {
      const lastCheckinAt = new Date(checkIns[0]!.created_at);
      monitorDaysSinceLastCheckin = Math.floor(
        (now - lastCheckinAt.getTime()) / 86400000
      );
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
        {/* Calm-indigo "Revisit by [date]" chip — only when planned +
            past-or-today + reminder set. Future-dated reminders show no
            chip; the in-body <ReminderEditor /> subline carries those.
            Spec § D3 + § Screens header table. */}
        {isReminderDue && card.planned_reminder_date && (
          <div className="pt-1">
            <ReminderDueChip plannedReminderDate={card.planned_reminder_date} />
          </div>
        )}
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

      {card.state === 'diagnosed' && card.severity_confirmed === true && (
        <DiagnosedThread
          severity={card.severity ?? 'monitor'}
          diagnosis={card.diagnosis}
          monitoringCadenceDays={card.monitoring_cadence_days}
          rows={threadRows}
        />
      )}

      {card.state === 'diagnosed' && card.severity_confirmed === false && (
        <>
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
            {/* Show the "what I need to know" preview ONLY at qaUserCount=0
                (the AI hasn't started a Q&A yet). Once the user replies
                to the first question, the compact <QaThread /> renders
                instead. */}
            {qaState.qaUserCount === 0 &&
              assistantContent?.what_i_need_to_know &&
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
            {assistantContent?.sources &&
              assistantContent.sources.length > 0 && (
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

          {/* Compact "Conversation so far" thread appears only after at
              least one Q&A round has been answered (qaUserCount > 0 OR
              priorWasLocationAsk — the location-ask round doesn't count
              toward the budget but still has visible prior turns). */}
          {(qaState.qaUserCount > 0 || qaState.priorWasLocationAsk) && (
            <QaThread rows={threadRows} />
          )}

          <AnswerThread
            cardId={card.id}
            activeQuestion={activeQuestion}
            activeQuestionIsLocationAsk={activeQuestionIsLocationAsk}
            qaUserCount={qaState.qaUserCount}
            contractorTag={card.contractor_tag}
          />
        </>
      )}

      {card.state === 'decide' &&
        (() => {
          // Parse the four jsonb columns into typed expansions via the
          // shared estimate-shapes helpers. parse failures map to null
          // — the DECIDE view falls back to "Estimate unavailable" UI
          // rather than failing the page render.
          const diyParsed = card.cost_estimate_diy
            ? parseDiyExpansion(card.cost_estimate_diy)
            : null;
          const diyOverrideParsed = card.cost_estimate_diy_override
            ? parseDiyExpansion(card.cost_estimate_diy_override)
            : null;
          const contractorParsed = card.cost_estimate_hire
            ? parseContractorExpansion(card.cost_estimate_hire)
            : null;
          const contractorOverrideParsed = card.cost_estimate_hire_override
            ? parseContractorExpansion(card.cost_estimate_hire_override)
            : null;

          const diyEstimate: DiyExpansion | null =
            diyParsed && diyParsed.ok ? diyParsed.value : null;
          const diyOverride: DiyExpansion | null =
            diyOverrideParsed && diyOverrideParsed.ok
              ? diyOverrideParsed.value
              : null;
          const contractorEstimate: ContractorExpansion | null =
            contractorParsed && contractorParsed.ok
              ? contractorParsed.value
              : null;
          const contractorOverride: ContractorExpansion | null =
            contractorOverrideParsed && contractorOverrideParsed.ok
              ? contractorOverrideParsed.value
              : null;

          return (
            <DecideView
              cardId={card.id}
              diagnosis={card.diagnosis}
              severity={card.severity}
              diyEstimate={diyEstimate}
              diyOverride={diyOverride}
              contractorEstimate={contractorEstimate}
              contractorOverride={contractorOverride}
              monitoringCadenceDays={card.monitoring_cadence_days}
              thread={threadRows}
            />
          );
        })()}

      {card.state === 'planned' &&
        (() => {
          const diyParsed = card.cost_estimate_diy
            ? parseDiyExpansion(card.cost_estimate_diy)
            : null;
          const diyOverrideParsed = card.cost_estimate_diy_override
            ? parseDiyExpansion(card.cost_estimate_diy_override)
            : null;
          const contractorParsed = card.cost_estimate_hire
            ? parseContractorExpansion(card.cost_estimate_hire)
            : null;
          const contractorOverrideParsed = card.cost_estimate_hire_override
            ? parseContractorExpansion(card.cost_estimate_hire_override)
            : null;

          const diyEstimate: DiyExpansion | null =
            diyParsed && diyParsed.ok ? diyParsed.value : null;
          const diyOverride: DiyExpansion | null =
            diyOverrideParsed && diyOverrideParsed.ok
              ? diyOverrideParsed.value
              : null;
          const contractorEstimate: ContractorExpansion | null =
            contractorParsed && contractorParsed.ok
              ? contractorParsed.value
              : null;
          const contractorOverride: ContractorExpansion | null =
            contractorOverrideParsed && contractorOverrideParsed.ok
              ? contractorOverrideParsed.value
              : null;

          return (
            <PlannedView
              cardId={card.id}
              severity={card.severity}
              diagnosis={card.diagnosis}
              chosenPath={card.chosen_path}
              diyEstimate={diyEstimate}
              diyOverride={diyOverride}
              contractorEstimate={contractorEstimate}
              contractorOverride={contractorOverride}
              monitoringCadenceDays={card.monitoring_cadence_days}
              thread={threadRows}
              plannedReminderDate={card.planned_reminder_date}
              isReminderDue={isReminderDue}
              updatedAt={card.updated_at}
              photoTouchpointCount={photoTouchpointCount}
            />
          );
        })()}

      {card.state === 'monitoring' && (
        <MonitorView
          cardId={card.id}
          severity={card.severity}
          diagnosis={card.diagnosis}
          cadenceDays={card.monitoring_cadence_days ?? 30}
          isOverdue={monitorIsOverdue}
          nextCheckAt={card.next_check_at}
          daysSinceLastCheckin={monitorDaysSinceLastCheckin}
          checkIns={monitorCheckInEntries}
          referencePhotos={monitorReferencePhotos}
          thread={threadRows}
          photoTouchpointCount={photoTouchpointCount}
        />
      )}

      {card.state === 'closed' && (
        <ClosedView
          cardId={card.id}
          severity={card.severity}
          closedAt={card.closed_at}
          diagnosis={card.diagnosis}
          chosenPath={card.chosen_path}
          actualSpendCents={card.actual_spend_cents}
          spendNotes={card.spend_notes}
          before={
            photoUrl && beforePhotoDate
              ? { url: photoUrl, date: beforePhotoDate }
              : null
          }
          after={
            closePhotoUrl && closePhotoDate
              ? { url: closePhotoUrl, date: closePhotoDate }
              : null
          }
          thread={threadRows}
          photoTouchpointCount={photoTouchpointCount}
        />
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
