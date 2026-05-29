## Gate 2b: rls-coverage

- Result: n/a (no new RLS surface)

This PR adds no migrations, no new tables, no new RPCs, and no new RLS policies
(see preflight: TOUCHES_MIGRATIONS empty, TOUCHES_FUNCTIONS empty). The new
`/contractor-questions/page.tsx` reads `cards` through the RLS-scoped
user-context server client (`@/lib/supabase/server`), identical to the existing
home/cards pages — owner-scoped SELECT enforced by the existing `cards` RLS
policy. No coverage gap introduced.

## Dismissals

None
