// What: Single triage_conversations row renderer. Dispatches on
//       (role, tool_name, is_location_ask) to render the right
//       header + body. Used by both <QaThread /> (compact mid-Q&A
//       thread) and <DiagnosedThread /> (the "How we diagnosed this"
//       collapsible).
// Why:  spec § Files to create + § Screens § Render-by-tool-name —
//       single dispatcher prevents the two consumers from drifting on
//       per-row UI. Forward-compat against future tool names: unknown
//       names fall back to a "Conversation row could not be parsed"
//       copy + a Sentry breadcrumb (no throw — drift surfaces as
//       observability, not a crash).
// Does NOT: Hit Sentry on every render — only the malformed-content
//           path captures. Doesn't itself fetch data — the parent
//           passes the row props in. Doesn't include the inline
//           controls (Send / Skip live in <AnswerThread />).

import * as Sentry from '@sentry/nextjs';
import { SEVERITY_VALUES } from '@/app/api/triage/_lib/parse-tool-output';

type Severity = (typeof SEVERITY_VALUES)[number];

/** Subset of the row columns the component reads. */
export type ConversationRowData = {
  role: 'user' | 'assistant';
  round: number;
  content: string;
  is_location_ask: boolean;
  tool_name: string | null;
};

/** Loose shape of a parsed assistant payload. We don't enforce strict
 *  validation at render time — `parse-qa-output` already gated writes;
 *  reads stay best-effort so a future tool drift doesn't crash the
 *  thread surface. */
type ParsedAssistantContent = {
  // record_initial_read shape
  summary?: string;
  // ask_next_question shape
  question?: string;
  updated_provisional_severity?: Severity;
  // confirm_assessment shape
  final_diagnosis?: string;
  severity_confirmed?: Severity;
};

/** Best-effort JSON.parse of an assistant row's `content` payload.
 *  Returns the parsed object or `null` on any failure — callers fall
 *  back to the "Conversation row could not be parsed" UI. */
function safeParse(content: string): ParsedAssistantContent | null {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as ParsedAssistantContent;
  } catch {
    return null;
  }
}

/** Fallback when content fails to parse OR tool_name is unknown.
 *  Renders a calm placeholder + drops a Sentry breadcrumb so we know
 *  it happened in production. */
function MalformedRow({
  reason,
  row,
}: {
  reason: 'unparseable_content' | 'unknown_tool_name';
  row: ConversationRowData;
}) {
  // Breadcrumb (not exception) so the surface stays observable without
  // alerting on what is — by design — a forward-compat fall-through.
  if (typeof window === 'undefined') {
    Sentry.captureMessage('ConversationRow fallback', {
      level: 'warning',
      tags: { surface: 'ConversationRow', reason },
      extra: { tool_name: row.tool_name, role: row.role, round: row.round },
    });
  }
  return (
    <div
      data-testid="conversation-row-fallback"
      className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-3 text-sm text-[var(--color-text-secondary-inverse)]"
    >
      Conversation row could not be parsed.
    </div>
  );
}

/** User reply row. Carries the "Location" tag when this was a
 *  location-ask answer. */
function UserRow({ row }: { row: ConversationRowData }) {
  return (
    <div
      data-testid="conversation-row-user"
      data-round={row.round}
      className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-3"
    >
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary-inverse)]">
          Your reply (round {row.round})
        </h3>
        {row.is_location_ask && (
          <span
            data-testid="location-tag"
            className="rounded-full bg-[var(--color-surface-input)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-primary-inverse)]"
          >
            Location
          </span>
        )}
      </div>
      <p className="mt-2 whitespace-pre-line text-sm text-[var(--color-text-primary-inverse)]">
        {row.content}
      </p>
    </div>
  );
}

/** Assistant row — branches on tool_name. */
function AssistantRow({ row }: { row: ConversationRowData }) {
  if (!row.tool_name) {
    return <MalformedRow reason="unknown_tool_name" row={row} />;
  }
  const parsed = safeParse(row.content);
  if (!parsed) {
    return <MalformedRow reason="unparseable_content" row={row} />;
  }

  if (row.tool_name === 'record_initial_read') {
    return (
      <div
        data-testid="conversation-row-initial-read"
        data-round={row.round}
        className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-3"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary-inverse)]">
          Initial read
        </h3>
        {parsed.summary && (
          <p className="mt-2 whitespace-pre-line text-sm text-[var(--color-text-primary-inverse)]">
            {parsed.summary}
          </p>
        )}
      </div>
    );
  }

  if (row.tool_name === 'ask_next_question') {
    return (
      <div
        data-testid="conversation-row-question"
        data-round={row.round}
        className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-3"
      >
        <div className="flex items-baseline gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary-inverse)]">
            Question {row.round}
          </h3>
          {row.is_location_ask && (
            <span
              data-testid="location-tag"
              className="rounded-full bg-[var(--color-surface-input)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-primary-inverse)]"
            >
              Location
            </span>
          )}
        </div>
        {parsed.question && (
          <p className="mt-2 whitespace-pre-line text-sm text-[var(--color-text-primary-inverse)]">
            {parsed.question}
          </p>
        )}
      </div>
    );
  }

  if (row.tool_name === 'confirm_assessment') {
    return (
      <div
        data-testid="conversation-row-confirmed"
        data-round={row.round}
        className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-3"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary-inverse)]">
          Confirmed
        </h3>
        {parsed.final_diagnosis && (
          <p className="mt-2 whitespace-pre-line text-sm text-[var(--color-text-primary-inverse)]">
            {parsed.final_diagnosis}
          </p>
        )}
      </div>
    );
  }

  return <MalformedRow reason="unknown_tool_name" row={row} />;
}

/**
 * Render one triage_conversations row. Dispatches:
 *   - role=user → "Your reply (round N)" + content; location tag when is_location_ask=true.
 *   - role=assistant + tool_name=record_initial_read → "Initial read" + summary.
 *   - role=assistant + tool_name=ask_next_question → "Question N" + question.
 *   - role=assistant + tool_name=confirm_assessment → "Confirmed" + final_diagnosis.
 *   - role=assistant + unknown/missing tool_name → fallback "Conversation row could not be parsed."
 *   - assistant row whose content JSON fails to parse → fallback (same copy).
 */
export function ConversationRow({ row }: { row: ConversationRowData }) {
  if (row.role === 'user') {
    return <UserRow row={row} />;
  }
  return <AssistantRow row={row} />;
}
