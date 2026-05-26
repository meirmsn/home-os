## Gate 5: docs-and-tests-review

**Result**: pass (with low-severity notes)

**Commit range**: `main...HEAD` (15 commits, feature/close-flow)

---

### Test coverage audit

| New file                     | Has test file?                    | Test count  | Key behaviors covered                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BeforeAfterPhotos.tsx`      | `BeforeAfterPhotos.test.tsx`      | 6           | All 4 photo-present/absent combos, captions with dates, responsive grid classes (`md:grid-cols-2`)                                                                                                                                                                                                                                |
| `CloseCardForm.tsx`          | `CloseCardForm.test.tsx`          | 12          | Collapsed/expanded states, PostHog `card_close_started` / `card_closed` events, dollar-to-cents send, cancel clears fields, 200/409/404/500/network error handling, submit-in-flight state                                                                                                                                        |
| `ClosedView.tsx`             | `ClosedView.test.tsx`             | 15          | Severity chip, calm-green "Closed" chip, closed_at date, spend log with two-decimal formatting, spend-notes display, diagnosis text, photo pair delegation, "How we diagnosed this" collapsible, null-severity/null-closedAt guards                                                                                               |
| `route.ts` (close)           | `route.test.ts`                   | 18          | Auth 401, UUID 400, bad formData 400, non-numeric spend 400, notes >500 400, non-image MIME 400, happy paths (no-spend, with-spend, with-photo, with-all), photo-upload-failure tolerance, card_photos-insert-failure tolerance, spend_notes trim, 404-vs-409 narrow re-read, forbidden 42501, unexpected RPC 500, empty-data 500 |
| `PlannedView.tsx` (modified) | `PlannedView.test.tsx` (modified) | +4 new      | CloseCardForm mounts for diy/contractor/monitor, does NOT mount when chosenPath=null                                                                                                                                                                                                                                              |
| `page.tsx` (modified)        | `page.test.tsx` (modified)        | +1 modified | closed state renders `<ClosedView />` with severity + spend data                                                                                                                                                                                                                                                                  |
| `close-flow.spec.ts` (E2E)   | n/a (is the test)                 | 5           | Happy path with spend, minimal close, spend-only, state guard 409, cancel preserves state                                                                                                                                                                                                                                         |

**Verdict**: Every new component and route has a dedicated test file. Every new route has a test file. Total: 54 new unit/integration tests + 5 E2E cases.

### Behavior coverage check

| Behavior                               | Covered? | Where                                                                                                     |
| -------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| State guard (only `planned` can close) | Yes      | `route.test.ts` (409/404 tests), `close-flow.spec.ts` test 4                                              |
| Photo upload failure tolerance         | Yes      | `route.test.ts` ("still closes when upload fails", "still closes when INSERT fails")                      |
| Spend validation (cents conversion)    | Yes      | `CloseCardForm.test.tsx` (200 with spend sends FormData), `route.test.ts` (non-numeric 400, trim-to-null) |
| Before/after rendering (all 4 states)  | Yes      | `BeforeAfterPhotos.test.tsx` (both, before-only, after-only, neither)                                     |
| PostHog events fire correctly          | Yes      | `CloseCardForm.test.tsx` (card_close_started on expand, card_closed with properties on 200)               |
| Dollar formatting two-decimal          | Yes      | `ClosedView.test.tsx` ($5.00, $0.01, $85.50)                                                              |
| Diagnosis thread collapsible           | Yes      | `ClosedView.test.tsx` (present when thread non-empty, absent when empty)                                  |

### Documentation consistency audit

| Document             | Updated?  | Consistent with code? | Notes                                                                                                                                                                                                            |
| -------------------- | --------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`          | Yes       | Yes                   | Two new gotchas added: photo-first-state-second ordering, dollar-to-cents float trap. Both accurately describe code behavior.                                                                                    |
| `ARCHITECTURE.md`    | Yes       | Yes                   | Module map updated to list `/api/card/[id]/close` POST, `<ClosedView />`, `<BeforeAfterPhotos />`, `<CloseCardForm />`.                                                                                          |
| `apps/web/README.md` | Yes       | Yes                   | Route table, component table, E2E table all updated. Test counts match. Route description accurate re: multipart, photo-first ordering, envelope codes.                                                          |
| `supabase/README.md` | Yes       | Yes                   | Migration 013 row added. `close_card` RPC added to RPC table. `touchpoint_type` enum values corrected from `primary, monitoring, close` to `primary, context, closeup, close` (fixes a pre-existing inaccuracy). |
| `METRICS.md`         | Yes       | Yes                   | 4 new rows: `card_close_started`, `card_closed`, two Sentry entries. Properties match code exactly.                                                                                                              |
| `BUILD-LOG.md`       | Yes       | Yes                   | Entry added with correct commit count, gate summary.                                                                                                                                                             |
| `CHANGELOG.md`       | Yes (new) | Yes                   | v0.1.0.0 entry covers all shipped components.                                                                                                                                                                    |

### Findings

| #   | Severity | Finding                                                                                  | Detail                                                                                                                                                                     |
| --- | -------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | low      | `_severity-chip.ts` header comment does not list `<ClosedView />` as a consumer          | Line 3 lists "page.tsx + `<DiagnosedThread />` + `<DecideView />` + `<PlannedView />`" but `<ClosedView />` now also imports it. Cosmetic only -- no behavioral impact.    |
| 2   | low      | `CloseCardForm.tsx` empty JSDoc blocks on `handleExpand`, `handleCancel`, `handleSubmit` | Lines 40, 47, 62 have `/** * */` doc blocks with no content. Harmless but unusual -- all other handlers in the codebase either have a meaningful doc block or none at all. |
| 3   | low      | `apps/web/README.md` card detail test count says "28+ test cases"                        | The `+` is vague. The page.test.tsx file has ~30 cases now. Minor doc imprecision.                                                                                         |

---

## Dismissals

- **No missing test files**: every new component and route has a co-located test file. No dismissals needed.
- **E2E photo upload**: E2E test 1 was originally specced to include photo upload but the seed approach does not exercise Storage upload end-to-end (unit tests cover it via mocked Storage). This is acceptable -- the unit tests for `route.test.ts` thoroughly mock both upload success and failure paths, and E2E photo upload would require a running Storage service with real file I/O. No finding raised.
- **`ConversationRow` import in `ClosedView`**: `ClosedView` imports `ConversationRow` which is already tested separately. No redundant test needed in ClosedView for ConversationRow rendering.
