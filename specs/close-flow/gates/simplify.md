## Gate 4: /simplify

**Result: pass**

Reviewed the full diff from main (24 files, ~2750 lines added) for unnecessary complexity, dead code, duplicated logic, and over-abstractions.

### Review areas

1. **Dead code**: None found. No unused imports, unreachable branches, or commented-out code.

2. **Duplicated logic**:
   - `UUID_RE` regex is defined identically in `close/route.ts` and four other route handlers (`decide`, `reminder`, `estimate`, `restore`). This is a pre-existing pattern across ALL route handlers -- the close route follows the established convention. Extracting it would be a cross-feature refactor (5+ files), not scoped to this PR.
   - RPC error-handling pattern (42501 check, `invalid_state` re-read for 404-vs-409 disambiguation) mirrors `decide/route.ts`. Both have sufficiently different error branches that a shared abstraction would obscure more than it helps. The close route follows the established project convention.
   - `shortDate()` in `BeforeAfterPhotos.tsx` and `humanDate()` in `ClosedView.tsx` both format ISO dates but produce intentionally different formats ("May 15" vs "Mon, May 26") for different UI contexts. Not duplication.

3. **Unnecessary abstractions**: None found. Components are appropriately scoped:
   - `BeforeAfterPhotos` -- standalone, reusable for future photo-comparison features.
   - `CloseCardForm` -- encapsulates expand/collapse + form submission + PostHog events.
   - `ClosedView` -- server component composing chips + photos + spend + diagnosis.
   - `close_card` RPC -- follows the single-RPC-per-write-cluster project pattern.

4. **Empty JSDoc blocks in CloseCardForm.tsx**: Three handler functions (`handleExpand`, `handleCancel`, `handleSubmit`) have empty `/** */` scaffolding. Attempted removal, but the project's Prettier configuration re-inserts them during the pre-commit lint-staged hook. The formatter enforces this pattern; not actionable.

5. **Migration SQL**: Clean. Single enum rename-recreate + two additive columns + one SECURITY DEFINER RPC with `search_path` pin. ROLLBACK block present.

6. **Component prop threading**: `updatedAt` threads from `page.tsx` through `PlannedView` to `CloseCardForm` for the `days_in_planned` PostHog property. This is the minimal path; no intermediate abstraction warranted.

### Fixes applied

None. No fixable simplifications found.

### Post-fix verification

N/A -- no changes made.

## Dismissals

None
