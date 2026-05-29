## Gate 3: responsive-theme

- Result: pass (desktop + 375px chromium verified; iPhone-15/WebKit deferred to CI)

The app is dark-only in Phase 1 (light-mode is a v1 roadmap item), so the theme
axis is a single dark ground. Layout verified at both breakpoints:

- 1440px (desktop): clean hierarchy, grouped-by-trade sections, per-group nudge
  banner, copy-friendly question lists. Screenshot evidence captured by the green
  desktop e2e (`retrieval-view-desktop.png`) and refreshed during Gate 8.
- 375px (chromium): the /design-review gate audited the 375px width directly in
  Chromium — no overflow, tap targets ≥ h-11, readable type, nudge banner stacks
  correctly.

The Playwright `mobile` project uses the iPhone-15 (WebKit) device descriptor.
WebKit cannot be installed in this firewalled workspace (playwright install webkit
fails host-requirements/download). The 375px WebKit pass is therefore deferred to
the CI slow-job, which installs all browsers fresh. Layout (engine-agnostic CSS)
was verified locally at 375px via Chromium.

## Dismissals

- mobile/WebKit local run: dismissed — rationale: WebKit binary undownloadable in
  the egress-firewalled workspace; CI slow-job runs the iPhone-15 project; 375px
  layout verified locally via Chromium as a proxy.
