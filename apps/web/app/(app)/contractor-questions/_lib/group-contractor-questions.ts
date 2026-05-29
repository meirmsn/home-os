// What: Pure filter/group/nudge lib for the Contractor Questions retrieval
//       view. `groupContractorQuestions(rows, now)` filters cards to the
//       non-closed/dismissed, non-`diy`-tagged set whose effective
//       contractor expansion carries ≥1 question, groups them by
//       card-level `contractor_tag`, and derives a per-group ≥30-day
//       appointment nudge from the group's oldest card.
// Why:  spec § In scope + D2 + D3. Pure logic isolated from the route so
//       the filter/grouping + the calendar-date nudge boundary are unit-
//       testable with an injectable `now` (deterministic 29/30/31-day
//       tests). Mirrors the pure-fn list/group pattern of `tier-cards.ts`.
// Does NOT: Read the DB, render UI, or fire metrics. Does NOT group by the
//           granular `cost_estimate_hire.contractor_type` (CLAUDE.md
//           Gotcha #7 — group by the card-level routing tag). Does NOT
//           throw on invalid jsonb — an unparseable effective expansion
//           excludes the card.

import {
  parseContractorExpansion,
  type ContractorExpansion,
} from '@/app/api/triage/_lib/estimate-shapes';
import type { ContractorTag } from '@/app/api/triage/_lib/parse-tool-output';
import { contractorTagLabel } from './contractor-tag-label';

/** Nudge threshold (D3): a group whose oldest included card is this many
 *  whole days old (or older) shows the appointment nudge. Single source
 *  of truth so the threshold is tunable in one place + pinned by tests. */
export const NUDGE_AGE_DAYS = 30;

/** Card states excluded from the retrieval view (D2). */
const EXCLUDED_STATES = new Set(['closed', 'dismissed']);

/** The card columns this lib reads. Mirrors the page.tsx SELECT list. */
export type ContractorQuestionCardRow = {
  id: string;
  title: string | null;
  initial_description: string | null;
  state: string;
  contractor_tag: ContractorTag | null;
  chosen_path: string | null;
  cost_estimate_hire: unknown;
  cost_estimate_hire_override: unknown;
  created_at: string;
};

/** One card's contribution to a group. */
export type ContractorQuestionCard = {
  cardId: string;
  title: string;
  questions: string[];
  createdAt: string;
};

/** One contractor-type group of cards + its nudge derivation. */
export type ContractorQuestionGroup = {
  contractorType: ContractorTag;
  cards: ContractorQuestionCard[];
  questionCount: number;
  oldestCardDays: number;
  showNudge: boolean;
};

export type GroupContractorQuestionsResult = {
  groups: ContractorQuestionGroup[];
  totalQuestionCards: number;
};

/** UTC-slice a timestamp (epoch ms or ISO string) to YYYY-MM-DD for
 *  calendar-date comparison — never subtract raw Date objects (DST /
 *  timezone drift would make the 30-day boundary flap). Same recipe as
 *  `home/_lib/tier-cards.ts § todayIso` + the card-detail reminder-due
 *  derivation (kit/docs/guide/date-handling.md § Trap 2). */
function utcDateIso(value: number | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

/** Whole-day difference between two YYYY-MM-DD UTC date slices
 *  (`today` minus `then`). Both are midnight-UTC calendar dates, so the
 *  ms delta divides cleanly by a day with no DST drift. */
function wholeDaysBetween(todayIso: string, thenIso: string): number {
  const today = Date.parse(`${todayIso}T00:00:00.000Z`);
  const then = Date.parse(`${thenIso}T00:00:00.000Z`);
  return Math.round((today - then) / 86_400_000);
}

/** Resolve the effective contractor expansion (`override ?? base`) and
 *  validate it via the shared `parseContractorExpansion` boundary. Returns
 *  the parsed value or null (null/absent/invalid → card excluded). Reuses
 *  the canonical validator — does NOT inline a third shape check
 *  (CLAUDE.md "locked-jsonb-shape validation lives in TWO places"). */
function effectiveExpansion(
  row: ContractorQuestionCardRow
): ContractorExpansion | null {
  const raw = row.cost_estimate_hire_override ?? row.cost_estimate_hire;
  if (raw == null) return null;
  const parsed = parseContractorExpansion(raw);
  return parsed.ok ? parsed.value : null;
}

/**
 * Filter, group, and nudge-derive the user's cards for the Contractor
 * Questions view. `now` is injected (epoch ms) so the nudge boundary is
 * deterministic in tests. See spec § In scope for the contract.
 */
export function groupContractorQuestions(
  rows: ContractorQuestionCardRow[],
  now: number
): GroupContractorQuestionsResult {
  const todayIso = utcDateIso(now);

  // Filter (D2) + collect questions per kept card, bucketed by tag.
  const buckets = new Map<ContractorTag, ContractorQuestionCard[]>();

  for (const row of rows) {
    if (EXCLUDED_STATES.has(row.state)) continue;
    if (row.contractor_tag == null || row.contractor_tag === 'diy') continue;

    const expansion = effectiveExpansion(row);
    if (expansion === null) continue;
    if (expansion.questions_for_contractor.length < 1) continue;

    const card: ContractorQuestionCard = {
      cardId: row.id,
      title: row.title || row.initial_description || 'Untitled',
      questions: expansion.questions_for_contractor,
      createdAt: row.created_at,
    };

    const existing = buckets.get(row.contractor_tag);
    if (existing) {
      existing.push(card);
    } else {
      buckets.set(row.contractor_tag, [card]);
    }
  }

  let totalQuestionCards = 0;
  const groups: ContractorQuestionGroup[] = [];

  for (const [contractorType, cards] of buckets) {
    // Cards oldest-first — the card driving the nudge sorts to the top.
    cards.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const oldest = cards[0];
    // cards is non-empty by construction (only created via push above).
    const oldestCardDays =
      oldest === undefined
        ? 0
        : wholeDaysBetween(todayIso, utcDateIso(oldest.createdAt));

    const questionCount = cards.reduce((sum, c) => sum + c.questions.length, 0);

    totalQuestionCards += cards.length;
    groups.push({
      contractorType,
      cards,
      questionCount,
      oldestCardDays,
      showNudge: oldestCardDays >= NUDGE_AGE_DAYS,
    });
  }

  // Group ordering: alphabetical by display label (deterministic for
  // tests + snapshots). Tie-break on the raw tag for total stability.
  groups.sort((a, b) => {
    const cmp = contractorTagLabel(a.contractorType).localeCompare(
      contractorTagLabel(b.contractorType)
    );
    return cmp !== 0 ? cmp : a.contractorType.localeCompare(b.contractorType);
  });

  return { groups, totalQuestionCards };
}
