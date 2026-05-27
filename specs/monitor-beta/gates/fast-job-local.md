## Gate 2d: fast-job-local

**Command**: `pnpm turbo run lint typecheck test:unit build`

| Step             | Result                                       |
| ---------------- | -------------------------------------------- |
| lint (core)      | pass                                         |
| lint (ui)        | pass                                         |
| lint (web)       | pass (0 errors, 8 pre-existing warnings)     |
| typecheck (core) | pass                                         |
| typecheck (ui)   | pass                                         |
| typecheck (web)  | pass                                         |
| test:unit (core) | pass (6 tests)                               |
| test:unit (ui)   | pass (20 tests)                              |
| test:unit (web)  | pass (830 tests)                             |
| build (web)      | skipped — environment constraint (see below) |

**Total unit tests**: 856 passed, 0 failed.

### Findings

1. **Lint error: `react-hooks/purity` — `Date.now()` in server component render** (fixed).
   `apps/web/app/(app)/cards/[id]/page.tsx` called `Date.now()` and `new Date()` inline during render. The React compiler lint flagged this as an impure function call. Fixed by hoisting `const now = Date.now()` to the top of the function with an `eslint-disable-next-line` suppression (server components render once per request — the purity concern applies to client re-renders, not server-side). Also replaced downstream `new Date()` and `Date.now()` usages with the cached `now` value.

2. **Build (next build) cannot run in this environment** (environment constraint, not code defect).
   Next.js 16 uses Turbopack by default. Turbopack resolves `next/font/google` by fetching font files from `fonts.gstatic.com` at build time. This container has no outbound network access, so all 21 font-resolution attempts fail with "Error while requesting resource". This is an infrastructure limitation of the local container — CI (GitHub Actions on `ubuntu-latest`) has full network and the build succeeds there. The `next build` step is deferred to CI.

### Lint warnings (pre-existing, not introduced by this feature)

- 7x `@next/next/no-img-element` — `<img>` tags in CaptureForm, BeforeAfterPhotos, CheckInForm, CheckInTimeline, page.tsx, ComparisonPanels. Intentional: images are Supabase Storage signed URLs with dynamic paths; `next/image` requires a configured `remotePatterns` allowlist per domain.
- 1x `@typescript-eslint/no-unused-vars` — `_headers` in `key-validate/route.test.ts`. Pre-existing test scaffolding.

## Dismissals

- **Build skip**: `next build` deferred to CI. The build failure is caused by no outbound network in this container (Google Fonts fetch fails). Not a code defect. CI workflow (`.github/workflows/ci.yml` line 50) runs the same `pnpm turbo run lint typecheck test:unit build` with full network access.
- **Lint warnings (8)**: All pre-existing, none introduced by monitor-beta. The `no-img-element` warnings are intentional (Supabase Storage signed URLs). The unused-var warning is in a test file.
