// What: Pure helper that derives a card title from the first ~80 chars of
//       the user's description. Truncates to the last whitespace boundary
//       inside the 80-char window and suffixes with an ellipsis when the
//       source was longer than the cap.
// Why:  spec § API contracts § POST /api/card #3 — the form has no title
//       field (D13). The handler derives it deterministically so cards
//       always have a scannable label in lists.
// Does NOT: Strip or sanitize markdown — descriptions are plain text by
//           contract (D6 + the form's <textarea> input). Does not handle
//           grapheme-cluster width: we count UTF-16 code units (the JS
//           string length contract) so a 4-byte emoji counts as 2 — this
//           is documented + table-tested.

/** Cap below which we don't truncate or append an ellipsis. */
const TITLE_MAX = 80;
const ELLIPSIS = '…';

/**
 * Derive a card title from a freeform description.
 *
 * Returns an empty string when the input is empty or whitespace-only — the
 * caller (route handler) validates non-empty description before calling, so
 * this is a defensive default rather than a primary path.
 */
export function titleFromDescription(description: string): string {
  const trimmed = description.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length <= TITLE_MAX) return trimmed;

  // Window the first TITLE_MAX chars, then back off to the last whitespace
  // so we don't cut mid-word. If the window has no whitespace at all
  // (one long word), cut hard at TITLE_MAX.
  const window = trimmed.slice(0, TITLE_MAX);
  const lastSpace = window.lastIndexOf(' ');
  const head =
    lastSpace > 0 ? window.slice(0, lastSpace).trimEnd() : window.trimEnd();
  return `${head}${ELLIPSIS}`;
}
