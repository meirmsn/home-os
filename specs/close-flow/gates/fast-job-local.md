## Gate 2d: fast-job-local

**Result: pass**

Ran `pnpm turbo run lint typecheck test:unit build` — all 10 tasks successful.

### Breakdown

| Package       | lint                        | typecheck     | test:unit                  | build |
| ------------- | --------------------------- | ------------- | -------------------------- | ----- |
| @home-os/core | pass (cached)               | pass (cached) | pass (6 tests)             | n/a   |
| @home-os/ui   | pass (cached)               | pass (cached) | pass (20 tests)            | n/a   |
| @home-os/web  | pass (5 warnings, 0 errors) | pass (cached) | pass (705 tests, 68 files) | pass  |

**Total: 10 tasks, 5 cached, 0 failures. Duration: 19.2s.**

### Lint warnings (pre-existing, not introduced by this branch)

All 5 warnings are `@next/next/no-img-element` — using `<img>` instead of `next/image`. Three of these are in files touched by this branch:

- `BeforeAfterPhotos.tsx` (2 warnings) — new file, uses `<img>` for Supabase storage URLs (acceptable per project convention for user-uploaded photos with signed URLs)
- `page.tsx` (1 warning) — pre-existing

Two are in files NOT touched by this branch (`CaptureForm.tsx`, `ComparisonPanels.tsx`).

### Build output

Next.js 16.2.6 (Turbopack) production build compiled successfully. All routes including `/api/card/[id]/close` and `/cards/[id]` are present.

## Dismissals

None
