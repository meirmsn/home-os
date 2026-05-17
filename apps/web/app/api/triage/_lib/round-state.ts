// What: Pure-fn helper that, given the full `triage_conversations` thread
//       for a card, returns the derived round-state the Q&A route handler
//       needs: how many user replies have happened (excluding location
//       asks), what the next round number should be, whether the most-
//       recent assistant turn was a location-ask, and that assistant
//       row's `tool_name` for debugging / observability.
// Why:  Centralizes the round-counting rules (D4 + D6 + D7) into one
//       seam that's table-driven testable. Route handler asks "where
//       are we" once, branches on the result. Spec § API contracts
//       step 4 + § Files to create.
// Does NOT: Hit the database — the caller selects the rows. Doesn't
//           enforce the 3-round cap (that's a route-level check on
//           `qaUserCount >= 3`). Doesn't parse the assistant content
//           JSON (the `is_location_ask` flag lives on the row column,
//           not the JSON — spec § Gotchas #7).

/** Subset of triage_conversations columns the helper needs. Mirrors the
 *  shape PostgREST returns for `select`-narrowed rows. */
export type ThreadRow = {
  created_at: string;
  round: number;
  role: 'user' | 'assistant';
  is_location_ask: boolean;
  tool_name: string | null;
};

/** Derived state the route handler reads before the Anthropic call. */
export type QaRoundState = {
  /** Count of user reply rows where is_location_ask=false. Used to
   *  decide whether to force `confirm_assessment` (D4). Location asks
   *  do NOT count toward the budget. */
  qaUserCount: number;
  /** The round number to use when persisting the next pair of rows.
   *  After the initial-read assistant row (round=1), the first user
   *  reply lands on round=2. */
  nextRound: number;
  /** True when the most-recent assistant row's `is_location_ask=true`.
   *  The route handler uses this to decide whether to dual-write the
   *  current user answer into `users.location` (D6). */
  priorWasLocationAsk: boolean;
  /** Tool name on the most-recent assistant row (one of
   *  `record_initial_read | ask_next_question | confirm_assessment`,
   *  or null for legacy rows). Surfaced for observability + future
   *  branching. */
  priorAssistantToolName: string | null;
};

/** Compare two ISO-8601 timestamps as strings. ISO format sorts
 *  lexicographically, so string compare is correct without `Date`
 *  conversion. */
function byCreatedAtAsc(a: ThreadRow, b: ThreadRow): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

/**
 * Compute the Q&A round-state from a card's full triage_conversations
 * thread. The input rows can be in any order — the helper sorts
 * internally to be defensive against caller drift.
 *
 * Empty input is tolerated (returns the defensive defaults) although
 * the route handler should never call this on a thread missing the
 * initial-read row — `state='diagnosed'` requires it (spec § API
 * contracts step 4 narrative).
 */
export function computeQaRoundState(rows: ThreadRow[]): QaRoundState {
  if (rows.length === 0) {
    return {
      qaUserCount: 0,
      nextRound: 1,
      priorWasLocationAsk: false,
      priorAssistantToolName: null,
    };
  }

  const sorted = [...rows].sort(byCreatedAtAsc);

  // Count user reply rows where is_location_ask is false. D4: location
  // asks are free questions outside the 3-round budget.
  let qaUserCount = 0;
  for (const row of sorted) {
    if (row.role === 'user' && !row.is_location_ask) {
      qaUserCount += 1;
    }
  }

  // Find the most-recent assistant row to expose its tool_name +
  // location-ask flag. Scan backwards.
  let priorAssistantToolName: string | null = null;
  let priorWasLocationAsk = false;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const row = sorted[i];
    if (row && row.role === 'assistant') {
      priorAssistantToolName = row.tool_name;
      priorWasLocationAsk = row.is_location_ask;
      break;
    }
  }

  // Next round = max round seen + 1 (the user reply + the assistant
  // question both write into the next round number).
  let maxRound = 0;
  for (const row of sorted) {
    if (row.round > maxRound) maxRound = row.round;
  }
  const nextRound = maxRound + 1;

  return {
    qaUserCount,
    nextRound,
    priorWasLocationAsk,
    priorAssistantToolName,
  };
}
