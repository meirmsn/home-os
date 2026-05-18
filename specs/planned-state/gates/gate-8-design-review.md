<!-- audited-at: d3a28cec2cb84f8b18ceddd43fce0a89a7b36363 -->

## Gate 8: /design-review

**Outcome**: `blocked (n/a per scope: sandbox cannot launch the app — next/font Google Fonts fetch unreachable + Playwright binaries undownloadable; Phase 5.9 will refresh captures against the Vercel preview URL; project is dark-only so light-mode is project-level n/a)`

`/design-review` requires a running web app (to navigate to the surface) + Playwright (to capture before/after screenshots + interactive checks). This sandbox blocks both:

- `apps/web/app/layout.tsx` uses `next/font/google` for Inter; `pnpm dev` fails the font fetch (`EHOSTUNREACH fonts.googleapis.com`). Same root cause as Gate fast-job-local's build step.
- `/home/node/.cache/ms-playwright/` is empty; `pnpm exec playwright install chromium` fails on `EHOSTUNREACH playwright.download.prss.microsoft.com`. A symlink workaround to system Chromium hits the same ffmpeg-binary fetch wall.

Surfaces added by this PR: 4 new UI components (`<ReminderEditor />`, `<ReminderDueChip />`, `<BeforeCloseSummary />`, `<PlannedView />` extension) all mount inside the existing `/cards/[id]` route. Visual audit deferred to Phase 5.9 against the Vercel preview, then carried forward into the Phase 6 audit-comment Evidence section.

Project is dark-only (per `apps/web/app/globals.css` + `apps/web/app/layout.tsx` — no `prefers-color-scheme` switching, no light tokens, light-mode is an explicit `PRODUCT-ROADMAP.md` deferral). Light-mode captures are project-level n/a, matching the decide-state PR #28 precedent.

### Dismissals

- **All four viewport×theme combos deferred to Phase 5.9** — rationale: sandbox structurally blocked from running the app. Phase 5.9 captures fresh screenshots against the Vercel preview URL once CI lands, before the audit comment fires. Same pattern Gate 3 (responsive-theme) and decide-state PR #28 used.
