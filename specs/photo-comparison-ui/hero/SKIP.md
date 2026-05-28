# Hero capture skipped

- Reason: Chromium unavailable (Playwright browser binary v1223 is firewall-blocked from the Chrome-for-Testing CDN in this sandbox; the authenticated compare screen also can't be seeded — admin auth API returns AuthRetryableFetchError, and the pre-existing e2e/magic-link.spec.ts likewise fails locally. Same root cause as the blocked design-review/qa/benchmark/responsive-theme gates. Live hero shots are available from the Vercel preview deploy for manual review.)
- Date: 2026-05-28T18:41:50Z
- SHA: e20405bc0fc8ecbb9796a225c6e4f17263cf8ea5
