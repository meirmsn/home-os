## Gate 2d: fast-job-local

- Result: pass-with-note (build deferred to CI — documented environmental constraint)

Local run of the fast CI job (`pnpm turbo run lint typecheck test:unit build`):

- lint: pass (0 errors, 14 pre-existing `<img>` warnings in unrelated files; 0 in new code)
- typecheck: pass (tsc --noEmit clean)
- test:unit: pass (991 passed / 103 files, incl. 19 new tests)
- build: BLOCKED LOCALLY — `next/font/google` Inter fetch to fonts.googleapis.com
  fails behind the workspace egress firewall.

Build note: the font import is in pre-existing `apps/web/app/layout.tsx`
(untouched by this diff — verified `git diff --name-only` shows no font/layout
files). This is a tracked, accepted constraint: `TODOS.md § firewall-google-fonts`
documents that local builds cannot fetch Google Fonts through the egress firewall
and that **CI is the canonical build-verification surface** (CI runs
`pnpm turbo run ... build` at ci.yml:50 outside the firewall). Every prior PR
shipped under this same condition. Build is verified at Phase 5 CI watch — NOT
a code defect, NOT a silent skip.

## Dismissals

- build (local): dismissed — environmental firewall block on Google Fonts,
  rationale: pre-existing infra (layout.tsx), tracked at TODOS.md §
  firewall-google-fonts, CI is the canonical build surface and runs build.
