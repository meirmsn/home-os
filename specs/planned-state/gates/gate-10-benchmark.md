<!-- audited-at: d3a28cec2cb84f8b18ceddd43fce0a89a7b36363 -->

## Gate 10: /benchmark

**Outcome**: `blocked (n/a per scope: sandbox cannot launch the app; benchmark requires a running surface for the browse daemon. PR adds no perf-critical hot paths — single PATCH route + 4 server components + 1 client component, all sub-trivial; post-deploy p95 watch is the canonical signal)`

`/benchmark` measures page load, Core Web Vitals, and resource sizes by driving the browse daemon against a running app. Same sandbox blocker as Gates 8 + 9.

This PR's runtime additions:

- **Server**: one PATCH route (`/api/card/[id]/reminder`) — single-row UPDATE under user RLS. No N+1 query risk.
- **DB**: migration 012 adds one column + one partial index. Index is scoped to `state='planned' AND planned_reminder_date IS NOT NULL` (small + future-dashboard-friendly). Migration 008's default privileges already cover the column.
- **Client**: `<ReminderEditor />` is the only `'use client'` component added; native `<input type="date">` (no date-picker library); zero new bundle dependencies.
- **No hot paths**: card detail page already SELECTs the row; this PR adds one column to the existing SELECT (no extra round-trip). No new server-side data fetching layer; no new auth boundary.

Post-deploy p95 latency on the Vercel preview / production is the canonical signal — covered by the PR-body Manual-review checkbox.

### Dismissals

- **Bundle-size benchmark deferred** — no new client dependencies; the `<ReminderEditor />` component is ~140 lines of React + native input, no library imports. The build output diff would be sub-1KB if measurable; not worth the gate cycle in the sandbox.
- **Page-load benchmark deferred to post-deploy** — Vercel's edge runtime serves the route; CI preview deploy provides the canonical measurement surface. Phase 6 audit comment includes the post-deploy metrics checkbox for manual reviewer attestation.
