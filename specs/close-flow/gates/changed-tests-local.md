## Gate 2f: changed-tests-local

**Result: pass**

### Changed/added test files in the diff

| #   | File                                                                   | Status   | Tests | Result                                                                       |
| --- | ---------------------------------------------------------------------- | -------- | ----- | ---------------------------------------------------------------------------- |
| 1   | `apps/web/app/(app)/cards/[id]/_components/BeforeAfterPhotos.test.tsx` | new      | 6     | pass                                                                         |
| 2   | `apps/web/app/(app)/cards/[id]/_components/CloseCardForm.test.tsx`     | new      | 12    | pass                                                                         |
| 3   | `apps/web/app/(app)/cards/[id]/_components/ClosedView.test.tsx`        | new      | 15    | pass                                                                         |
| 4   | `apps/web/app/(app)/cards/[id]/_components/PlannedView.test.tsx`       | modified | 18    | pass                                                                         |
| 5   | `apps/web/app/(app)/cards/[id]/page.test.tsx`                          | modified | 28    | pass                                                                         |
| 6   | `apps/web/app/api/card/[id]/close/route.test.ts`                       | new      | 18    | pass                                                                         |
| 7   | `apps/web/e2e/close-flow.spec.ts`                                      | new      | n/a   | skipped (Playwright E2E — requires browser runtime, not runnable via vitest) |

### Vitest run

```
pnpm vitest run <6 unit test paths>
Test Files  6 passed (6)
      Tests  97 passed (97)
   Duration  1.69s
```

**6 files, 97 tests, 0 failures.**

The E2E spec (`close-flow.spec.ts`) is a Playwright test and cannot be run in this gate (requires a running app + browser). It will be exercised by CI.

## Dismissals

None
