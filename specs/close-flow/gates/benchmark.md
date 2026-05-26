## Gate 10: benchmark

**Result**: blocked (local Supabase unavailable — card detail page requires auth; benchmark target unreachable)

### What was attempted

1. Dev server running at `http://localhost:3000` (Next.js 16.2.6 Turbopack).
2. Browse daemon launched, Chromium healthy.
3. Navigated to `http://localhost:3000/cards/test-id` — middleware redirected to `/login` (Supabase auth unavailable, port 54321 unreachable).
4. Cannot measure card detail page load time because the page is auth-gated and Supabase is not available.

### Partial metrics (login page, for reference only)

These are NOT the card detail page and do NOT constitute the benchmark baseline:

| Metric         | Login page (direct) | Login page (via /cards redirect) |
| -------------- | ------------------- | -------------------------------- |
| TTFB           | 50ms                | 35ms                             |
| DOM ready      | 117ms               | 97ms                             |
| Load           | 184ms               | 147ms                            |
| Console errors | 0                   | 0                                |

The redirect path is slightly faster (Turbopack cache warm). These numbers are healthy for a dev-mode login page but are not applicable to the card detail page which involves server-side Supabase queries, state machine rendering, and potentially image loading.

### Baseline status

No baseline established. First measurement of card detail page deferred to an environment with Supabase available (CI E2E or Vercel preview).

## Dismissals

None.
