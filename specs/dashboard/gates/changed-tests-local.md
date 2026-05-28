## Gate 2f: changed-tests-local

**Result: pass**

**Runner:** `pnpm turbo run test:unit`
**Commit:** `f0b2c47` (feat/monitor-beta)
**Date:** 2026-05-27

### Changed test files (20 unit, 3 E2E)

| #   | File                                                                          | Result    |
| --- | ----------------------------------------------------------------------------- | --------- |
| 1   | `apps/web/app/(app)/_components/TriagePendingBadge.test.tsx`                  | pass (4)  |
| 2   | `apps/web/app/(app)/cards/[id]/_components/CadenceEditor.test.tsx`            | pass (5)  |
| 3   | `apps/web/app/(app)/cards/[id]/_components/ChangePathButton.test.tsx`         | pass (3)  |
| 4   | `apps/web/app/(app)/cards/[id]/_components/CheckInForm.test.tsx`              | pass (6)  |
| 5   | `apps/web/app/(app)/cards/[id]/_components/CheckInTimeline.test.tsx`          | pass (6)  |
| 6   | `apps/web/app/(app)/cards/[id]/_components/MonitorView.test.tsx`              | pass (10) |
| 7   | `apps/web/app/(app)/cards/[id]/_components/MonitorViewOpenedCapture.test.tsx` | pass (4)  |
| 8   | `apps/web/app/(app)/cards/[id]/page.test.tsx`                                 | pass (28) |
| 9   | `apps/web/app/(app)/home/_components/DashboardCard.test.tsx`                  | pass (8)  |
| 10  | `apps/web/app/(app)/home/_components/DashboardViewedCapture.test.tsx`         | pass (3)  |
| 11  | `apps/web/app/(app)/home/_components/EmptyState.test.tsx`                     | pass (3)  |
| 12  | `apps/web/app/(app)/home/_components/FilterBar.test.tsx`                      | pass (6)  |
| 13  | `apps/web/app/(app)/home/_components/WalkthroughMode.test.tsx`                | pass (9)  |
| 14  | `apps/web/app/(app)/home/_components/WalkthroughPrompt.test.tsx`              | pass (3)  |
| 15  | `apps/web/app/(app)/home/_lib/tier-cards.test.ts`                             | pass (25) |
| 16  | `apps/web/app/(app)/home/page.test.tsx`                                       | pass (4)  |
| 17  | `apps/web/app/(app)/layout.test.tsx`                                          | pass (4)  |
| 18  | `apps/web/app/api/card/[id]/cadence/_lib/parse-cadence-body.test.ts`          | pass (12) |
| 19  | `apps/web/app/api/card/[id]/cadence/route.test.ts`                            | pass (12) |
| 20  | `apps/web/app/api/card/[id]/checkin/route.test.ts`                            | pass (17) |

E2E specs (out of scope for `test:unit`, require running app + browser):

- `apps/web/e2e/auth-edge-cases.spec.ts`
- `apps/web/e2e/decide-state.spec.ts`
- `apps/web/e2e/magic-link.spec.ts`

### Full suite summary

| Package         | Files  | Tests   | Result   |
| --------------- | ------ | ------- | -------- |
| `@home-os/core` | 1      | 6       | pass     |
| `@home-os/ui`   | 2      | 20      | pass     |
| `@home-os/web`  | 89     | 893     | pass     |
| **Total**       | **92** | **919** | **pass** |

## Dismissals

None
