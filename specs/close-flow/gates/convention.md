## Gate 11: convention

**Verdict: pass**

Checked the full diff (main...HEAD, 24 files, ~2750 lines added) against every
convention documented in CLAUDE.md.

### SQL conventions (CLAUDE.md section)

1. **SECURITY DEFINER + search_path pin** — `close_card` function at line 48-49
   of migration 013 uses `security definer set search_path = public, pg_catalog`.
   Matches the required pattern. Pass.

2. **RLS policies wrap auth.uid() in a subquery** — Migration 013 adds NO new
   RLS policies. The only `auth.uid()` usage is inside the `close_card` PL/pgSQL
   function body (`if p_user is distinct from auth.uid()`) — a procedural guard,
   not an RLS policy `using(...)` clause. This matches the existing pattern in
   migrations 007, 010, 011. Not subject to the subquery convention. Pass.

3. **Foreign key backing index** — Migration 013 adds two nullable scalar columns
   (`actual_spend_cents int`, `spend_notes text`) to `cards`. Neither is a
   foreign key. No new FKs introduced; no index requirement. Pass.

### Migration conventions

4. **ROLLBACK markers** — Present at lines 80-90 of migration 013. Covers
   function drop, column drops, and the reverse enum rename-recreate. Pass.

5. **Enum rename-recreate recipe** — `touchpoint_type` extended via the canonical
   rename-recreate dance (rename old, create new, alter column using cast, drop
   old). Matches the 006a recipe referenced in the migration header. Pass.

### Commit message conventions

6. **Conventional commit format** — All 11 commits on the branch use
   `feat(close-flow):`, `chore(close-flow):`, or `docs(close-flow):` prefixes.
   Consistent with conventional commits. Pass.

### Component conventions

7. **File header comments** — All new source files include `// What:`, `// Why:`,
   `// Does NOT:` headers: `route.ts`, `route.test.ts`, `CloseCardForm.tsx`,
   `CloseCardForm.test.tsx`, `ClosedView.tsx`, `ClosedView.test.tsx`,
   `BeforeAfterPhotos.tsx`, `BeforeAfterPhotos.test.tsx`, `close-flow.spec.ts`.
   Pass.

8. **Test file co-location** — All test files sit next to their source files
   (e.g. `CloseCardForm.test.tsx` alongside `CloseCardForm.tsx`; `route.test.ts`
   alongside `route.ts`). E2E spec lives in `e2e/`. Pass.

9. **data-testid attributes** — All new interactive/structural elements carry
   `data-testid` attributes (15 in CloseCardForm, 6 in ClosedView, 5 in
   BeforeAfterPhotos). Tests reference these IDs. Pass.

### Route conventions

10. **Error envelope shape** — `POST /api/card/[id]/close` returns the same
    envelope shapes as the existing `POST /api/card/[id]/decide`:
    - 400: `{ error: 'validation_failed', field, reason }`
    - 401: `{ error: 'unauthorized' }`
    - 404: `{ error: 'not_found' }` (via re-read after RPC invalid_state)
    - 409: `{ error: 'invalid_state' }`
    - 500: `{ error: 'server_error' }`
    - 200: `{ card_id, state, closed_at }`

    Matches the established pattern. Pass.

11. **Auth pattern** — `createClient()` + `getUser()` + early 401 return. Same
    as `/decide`. Pass.

### db:advisor

12. **pnpm db:advisor** — Could not run; local Supabase stack is not up
    (`ECONNREFUSED`). Manual audit of migration 013 found no violations (no bare
    auth.uid() in RLS, search_path pinned, no unindexed FKs). Non-blocking since
    the same lints were verified manually above and CI will run the advisor.

## Dismissals

- **db:advisor ECONNREFUSED**: Local Supabase stack unavailable in this session.
  Manual migration audit covers the same lint categories. CI pipeline runs
  `pnpm db:advisor` on push; any missed lint will surface there.

- **Pre-existing bare `auth.uid()` in RLS policies (migration 003)**: The
  subquery-wrapping convention applies to RLS policies. Migration 003 predates
  this branch and uses bare `auth.uid()` in all RLS `using(...)` clauses. This
  is a pre-existing condition, not introduced by close-flow. Out of scope.
