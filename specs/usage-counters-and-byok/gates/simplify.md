## Gate 4: simplify

**Commit:** `bf8a931` (simplify: remove redundant res.status check in ByokKeyInput)

**Files reviewed (10 source files):**

| File                                                         | Verdict                 |
| ------------------------------------------------------------ | ----------------------- |
| `apps/web/app/(app)/_components/ByokKeyProvider.tsx`         | clean                   |
| `apps/web/app/(app)/cards/[id]/_components/AnswerThread.tsx` | clean                   |
| `apps/web/app/(app)/cards/[id]/_components/StartTriage.tsx`  | clean                   |
| `apps/web/app/(app)/layout.tsx`                              | clean                   |
| `apps/web/app/(app)/settings/_components/ByokKeyInput.tsx`   | 1 finding, fixed        |
| `apps/web/app/(app)/settings/_components/UsageBar.tsx`       | clean                   |
| `apps/web/app/(app)/settings/page.tsx`                       | clean                   |
| `apps/web/app/api/key-validate/route.ts`                     | clean                   |
| `apps/web/app/api/triage/answer/route.ts`                    | clean                   |
| `apps/web/app/api/triage/route.ts`                           | clean                   |
| `packages/core/src/supabase.types.ts`                        | auto-generated, skipped |

**Finding 1 (fixed):** `ByokKeyInput.tsx` line 52 had `!res.ok && res.status !== 200`. The second conjunct is redundant -- when `res.ok` is false, the status is already outside the 200-299 range, so `res.status !== 200` is always true. Simplified to `!res.ok`. Unit tests pass (753/753).

## Dismissals

- **BYOK key extraction pattern duplicated in `triage/route.ts` and `triage/answer/route.ts`:** 4 lines extracting `byok_key` from the request body. Extracting a shared helper for a 4-line inline pattern used in two tightly-scoped route handlers is over-abstraction -- the pattern is trivial, co-located with its consumer, and the two routes have different surrounding validation logic.
- **`retryAfterSeconds` helper duplicated in `triage/route.ts` and `triage/answer/route.ts`:** Pre-existing duplication from the prior PR (not introduced by this feature). Both are identical 4-line functions. A shared module could house this, but the function is stable, tiny, and co-located with its sole consumer in each file. Not worth extracting for a function this small.
- **`'TRIAGE_LIMIT_REACHED' as ErrorClass` cast in `AnswerThread.tsx` line 231:** The server returns a string literal not in the client-side `ErrorClass` union. The cast is intentional -- the error string crosses the client/server boundary and is compared before any union-typed code path touches it. Adding it to the `ErrorClass` union would be misleading since it is not an error class the client generates.
- **Inline SVG gear icon in `layout.tsx`:** Standard Heroicons path data inlined to avoid a dependency. No simplification opportunity.
