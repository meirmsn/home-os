// What: Server component that renders the compact "Conversation so far"
//       thread rendered between PR #19's initial-read preview and
//       <AnswerThread /> when the card is in the `diagnosed` +
//       `severity_confirmed=false` + `qaUserCount > 0` sub-state.
// Why:  spec § Screens § Sub-state matrix — the mid-Q&A surface
//       needs prior turns visible so the user can re-read context
//       before answering the active question. The compact thread is
//       distinct from <DiagnosedThread />'s full collapsible — this
//       one excludes the initial-read assistant row (it's already
//       shown above as the PR #19 preview) and stays inline rather
//       than collapsed.
// Does NOT: Render anything when there are no Q&A rounds yet — the
//           just-after-initial-read state shows the PR #19 preview
//           with no thread underneath.

import { ConversationRow, type ConversationRowData } from './ConversationRow';

/** Rows from triage_conversations relevant to the compact thread. */
export type QaThreadInputRow = ConversationRowData & {
  created_at: string;
};

/**
 * Render the compact "Conversation so far" thread.
 *
 * `rows` is the FULL triage_conversations thread for the card
 * (oldest-first, ordered by created_at ascending). The component
 * filters out the initial-read assistant row (round=1,
 * tool_name='record_initial_read') because that's already rendered as
 * the PR #19 preview above this surface in the page tree.
 *
 * Returns null when there are no Q&A rounds yet — the just-after-
 * initial-read state shows the PR #19 preview alone.
 */
export function QaThread({ rows }: { rows: QaThreadInputRow[] }) {
  // Filter to Q&A rows only — anything except the round-1 initial-read
  // assistant row.
  const qaRows = rows.filter(
    (r) =>
      !(
        r.round === 1 &&
        r.role === 'assistant' &&
        r.tool_name === 'record_initial_read'
      )
  );

  if (qaRows.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Conversation so far"
      className="space-y-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-5"
      data-testid="qa-thread"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary-inverse)]">
        Conversation so far
      </h2>
      <div className="space-y-2">
        {qaRows.map((row) => (
          <ConversationRow
            key={`${row.role}-${row.round}-${row.created_at}`}
            row={row}
          />
        ))}
      </div>
    </section>
  );
}
