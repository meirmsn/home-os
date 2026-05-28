## Gate 9: /qa

- Result: blocked (browser tooling — see reason)

Browser-visual gate requires an authenticated headless-browser session viewing a card with 2+ photo-bearing touchpoints. This sandbox cannot stand up that session: (1) the Playwright browser binary (chromium v1223) is firewall-blocked from the Chrome-for-Testing CDN; (2) programmatic auth seeding fails (AuthRetryableFetchError from the admin API); (3) the pre-existing e2e/magic-link.spec.ts also fails locally — confirming the local authenticated-browser path is environmentally broken for ALL flows, not this feature. The gstack browse daemon (system Chromium) runs, but has no way to reach the authenticated compare screen here.

This gate is CI/preview-authoritative for this PR: the E2E spec exercises the
real compare-route rendering in CI (chromium+webkit installed), and the Vercel
preview deploy provides a live authenticated surface for manual visual review
(flagged in the PR Test plan).

## Dismissals

None
