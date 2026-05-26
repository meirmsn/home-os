## Gate 6: /review

**Result**: pass

**Scope**: Migration 013 SQL, `POST /api/card/[id]/close` route, `CloseCardForm` client component, `ClosedView` + `BeforeAfterPhotos` server components, `page.tsx` closed-state wiring.

### Migration 013 SQL

| Check                           | Verdict | Detail                                                                                                                                                                                                                                                      |
| ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enum rename-recreate safety     | pass    | Correct 4-step dance: rename old, create new with `'close'` added, ALTER column USING text cast, DROP old. No function-dependency dance needed (verified: no functions reference `touchpoint_type` in return-type signatures). Consistent with 006a recipe. |
| `close_card` RPC auth guard     | pass    | `p_user IS DISTINCT FROM auth.uid()` check at top raises `42501 forbidden`. Correctly uses `IS DISTINCT FROM` (handles NULL safely).                                                                                                                        |
| `close_card` state guard        | pass    | WHERE clause includes `public.cards.state = 'planned'::public.card_state` — stricter than `commit_decide`'s `IN ('decide', 'planned')`. Correct for a terminal transition.                                                                                  |
| `close_card` search_path pin    | pass    | `set search_path = public, pg_catalog` — matches codebase convention (all other RPCs use `public, pg_catalog`).                                                                                                                                             |
| Column qualification in WHERE   | pass    | All WHERE refs fully qualified: `public.cards.id`, `public.cards.user_id`, `public.cards.state`.                                                                                                                                                            |
| RETURNING clause                | pass    | Returns `public.cards.id, public.cards.state, public.cards.closed_at` into local variables, then `return query select`. Correct pattern.                                                                                                                    |
| `updated_at = now()` redundancy | info    | The `cards_updated_at` BEFORE UPDATE trigger (migration 005) already sets `updated_at = now()`. The explicit SET is redundant but harmless — the trigger overwrites to the same value.                                                                      |
| Additive columns                | pass    | `actual_spend_cents int` + `spend_notes text`, both nullable, no CHECK constraint. Consistent with spec D1.                                                                                                                                                 |
| Rollback recipe                 | pass    | Commented in-file. Correct reverse order: drop function, drop columns, rename-recreate enum back to 3 values.                                                                                                                                               |

### POST /api/card/[id]/close route

| Check                              | Verdict | Detail                                                                                                                                                                |
| ---------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth gate                          | pass    | `supabase.auth.getUser()` → 401. First operation after client creation.                                                                                               |
| UUID validation                    | pass    | Regex test on `[id]` param before any DB call.                                                                                                                        |
| FormData parse                     | pass    | try/catch with 400 on failure.                                                                                                                                        |
| spend_amount_cents validation      | pass    | `parseInt(value, 10)` + `isNaN` check → 400. Empty/absent → null.                                                                                                     |
| spend_notes validation             | pass    | Trim + length check (>500 → 400). Empty/whitespace → null.                                                                                                            |
| Photo MIME validation              | pass    | `photo.type.startsWith('image/')` → 400 if not. Consistent with capture route.                                                                                        |
| Photo-first-state-second ordering  | pass    | Storage upload + card_photos INSERT before `close_card` RPC. Upload failure logs to Sentry but does NOT block the close. Correct per spec Gotcha #2.                  |
| Storage path construction          | pass    | `${user.id}/cards/${id}/touchpoints/${touchpointId}/wide.jpg` — UUID-based, server-generated `touchpointId`. No user-controlled path segments beyond validated UUIDs. |
| RPC error handling — forbidden     | pass    | `42501` or `msg.includes('forbidden')` → 401.                                                                                                                         |
| RPC error handling — invalid_state | pass    | Narrow re-read to distinguish 404 vs 409. Matches `/decide` route posture.                                                                                            |
| RPC error handling — unexpected    | pass    | Sentry capture + 500.                                                                                                                                                 |
| RPC empty data handling            | pass    | `Array.isArray(rpcData) ? rpcData[0] : rpcData` with null check → Sentry warning + 500.                                                                               |
| `dynamic = 'force-dynamic'`        | pass    | Exported at module level.                                                                                                                                             |

### CloseCardForm client component

| Check                      | Verdict | Detail                                                                                                                                                      |
| -------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XSS / injection            | pass    | All user inputs rendered via React JSX (auto-escaped). Dollar input is `type="number"`. Notes textarea has `maxLength={500}`. No `dangerouslySetInnerHTML`. |
| Dollar-to-cents conversion | pass    | `Math.round(parseFloat(dollars) * 100)` — absorbs float dust per Gotcha #6. NaN/empty → field not appended (null on server).                                |
| Error state handling       | pass    | 409 → non-retryable banner + delayed refresh. 404 → same. 500/network → retryable banner. Form state preserved on retryable errors.                         |
| PostHog events             | pass    | `card_close_started` on every expand (no dedup — correct per Gotcha #9). `card_closed` after 200 with correct props including `days_in_planned`.            |
| Cancel behavior            | pass    | Clears dollars, notes, file input, fetchState. Re-expand shows clean form.                                                                                  |
| Submitting state           | pass    | Inputs disabled, submit shows "Closing...", cancel hidden. Prevents double-submit.                                                                          |

### ClosedView + BeforeAfterPhotos server components

| Check              | Verdict | Detail                                                                                                                                                                            |
| ------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spend formatting   | pass    | `(cents / 100).toFixed(2)` — always two decimal places per Gotcha #6.                                                                                                             |
| Null safety        | pass    | `severity=null` → no severity chip. `closedAt=null` → no date line. `actualSpendCents=null` → no spend section. `spendNotes=null` → no notes line. Thread empty → no collapsible. |
| Photo placeholders | pass    | Four states handled: both present, only before, only after, neither. Placeholder text for missing photos.                                                                         |
| Text rendering     | pass    | `spendNotes` and `diagnosis` rendered as JSX text children (auto-escaped). No XSS vector.                                                                                         |
| Responsive layout  | pass    | `grid grid-cols-1 md:grid-cols-2 gap-4` for before/after pair.                                                                                                                    |

### page.tsx changes

| Check                        | Verdict | Detail                                                                                                                                         |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| CardRow type extension       | pass    | `updated_at`, `actual_spend_cents`, `spend_notes` added with correct types.                                                                    |
| SELECT list                  | pass    | Three new columns added to the SELECT string.                                                                                                  |
| Close-photo query            | pass    | Scoped to `card.state === 'closed'` only — no extra DB calls for non-closed states. Orders `created_at DESC` for latest close photo.           |
| Signed URL security          | pass    | Same 10-minute TTL as capture photo. RLS ensures user can only access their own card's photos.                                                 |
| ClosedView prop threading    | pass    | All props correctly derived from card row and photo queries. `before` photo uses existing primary photo query; `after` uses close photo query. |
| Thread query extension       | pass    | `card.state === 'closed'` added to the thread-fetch condition. Correct — ClosedView renders "How we diagnosed this" collapsible.               |
| PlannedView `updatedAt` prop | pass    | `card.updated_at` threaded through.                                                                                                            |

### Cross-cutting

| Check                    | Verdict | Detail                                                                                                                                                              |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM trust boundaries     | pass    | No AI calls in the close flow. No LLM-generated content rendered without escaping.                                                                                  |
| SQL injection            | pass    | All DB interactions via Supabase client (parameterized). RPC uses typed parameters.                                                                                 |
| Conditional side effects | pass    | Photo upload failure does not block close (correct ordering). card_photos INSERT failure does not block close. Both captured to Sentry.                             |
| Error message leakage    | pass    | Route returns generic error codes (`unauthorized`, `validation_failed`, `invalid_state`, `not_found`, `server_error`). No stack traces or internal details exposed. |
| Type safety              | pass    | `supabase.types.ts` regenerated with `close_card` RPC, `'close'` enum value, and new card columns.                                                                  |

## Dismissals

**D1 (redundant `updated_at = now()` in RPC)**: The `close_card` RPC explicitly sets `updated_at = now()` in the UPDATE SET clause, but the `cards_updated_at` BEFORE UPDATE trigger (migration 005) already handles this. The explicit SET is harmless (trigger overwrites to the same `now()` value). Not worth changing — it documents intent and matches the `commit_decide` RPC pattern.

**D2 (primary photo query order is DESC not ASC)**: The spec says "earliest `touchpoint_type='primary'`" for the before photo, but `page.tsx` queries with `ascending: false` (latest). Pre-existing behavior (the query order was not changed by this PR, only `created_at` was added to the SELECT). In practice, there is one primary/wide photo per card. No functional impact.

**D3 (no server-side file size limit on photo)**: The route does not enforce a max photo file size server-side, relying on Supabase Storage bucket config. This is consistent with the existing `POST /api/card` capture route. Not a regression introduced by this PR.

**D4 (MIME type check is client-provided)**: `photo.type.startsWith('image/')` trusts the client-provided MIME type. Consistent with existing capture route. Storage bucket config provides defense-in-depth.
