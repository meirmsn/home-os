<!-- gate: /benchmark (Gate 10) — performance, UI PR -->
<!-- feature: contractor-question-retrieval -->
<!-- branch: feat/contractor-question-retrieval @ 477903a -->
<!-- date: 2026-05-28 -->

## Gate 10: /benchmark

**Verdict: PASS (new baseline established; no regressions, no anti-patterns).**

New, read-only, server-rendered route `/contractor-questions` with **no prior
baseline** (`.gstack/benchmark-reports/baselines/` held only `decide-state.json`

- `planned-state.json`). Realistic outcome was "establish a baseline," not
  "compare against prior" — confirmed.

### What was measured (browse daemon, dev server)

The route is auth-gated. `page.tsx` calls `supabase.auth.getUser()` and
`redirect('/login')` when no user, so an unauthenticated browse-daemon hit
**server-redirects to `/login`** before the view renders. Seeding an authed
session in the daemon was out of scope per the gate brief (do not fight auth),
so the measured numbers are the **redirect-target (`/login`) smoke baseline**,
not the populated view. The auth-redirect path itself is verified working.

Browse-daemon required a one-time Playwright Chromium symlink fix (daemon pinned
to build 1208, installed build was 1223) — symlinked `chromium-1208` /
`chromium_headless_shell-1208` → `-1223`. This is the documented pre-ship
preflight step for the browse daemon; noted as an operational learning.

Smoke baseline (`GET /contractor-questions` → 307 → `/login`, **dev server**,
unminified + on-demand compiled — directional only, NOT prod):

| Metric               | Value      | Note                                  |
| -------------------- | ---------- | ------------------------------------- |
| curl redirect (cold) | 445 ms     | first dev-compile of the route module |
| curl redirect (warm) | 43 ms      | route compiled                        |
| `/` redirect         | 5 ms / 307 | → `/login`                            |
| TTFB (login landing) | 28 ms      | browse daemon nav timing              |
| domInteractive       | 133 ms     |                                       |
| load                 | 307 ms     |                                       |
| total requests       | 23         | login page                            |
| total transfer       | ~1.07 MB   | **dev** unminified JS chunks + HMR    |
| JS bytes             | ~1.06 MB   | dev-mode; not representative of prod  |
| CSS bytes            | 0          | inlined in dev                        |

The ~1 MB JS / 23 requests are **dev-server artifacts** (unminified chunks, HMR
client, React refresh). They are not a finding and not a prod signal — defer the
real populated-route page-load + Core-Web-Vitals metric to CI/prod against a
seeded authed session (the E2E `contractor-questions.spec.ts` already exercises
the populated view at 375px + 1440px).

### Static perf assessment of the new code (the load-bearing part)

- **`page.tsx`** — server component. Exactly **one** RLS-scoped `cards` SELECT
  (`id, title, initial_description, state, contractor_tag, chosen_path,
cost_estimate_hire, cost_estimate_hire_override, created_at`), no joins, no
  per-row follow-up query. **No N+1.** `force-dynamic` (correct for an
  auth-scoped read; no stale ISR). Error path: Sentry-capture + `data ?? []`
  fall-through, never a 500. No signed-URL loop (no photos on this route),
  unlike the dashboard's per-card `createSignedUrl` fan-out.
- **`group-contractor-questions.ts`** — pure, in-memory. One filter pass to
  bucket by tag, one `localeCompare` sort per group's cards, one final group
  sort by label. Work is bounded by the user's own card count (RLS-scoped,
  realistically tens). `parseContractorExpansion` runs once per kept card. **No
  unbounded loops, no quadratic blowup.** Calendar math is O(1) UTC-slice per
  group.
- **Client JS** — the view (`ContractorQuestionsView`) is a **server**
  component. Only three small `'use client'` leaves ship to the browser:
  `ContractorAppointmentNudge`, `ContractorQuestionsViewOpenedCapture`, and
  their `posthog-js` import. `posthog-js` is **already a global app dependency**
  (loaded by `decide`/`monitor` capture components) — **zero net new bundle
  weight**, no new npm deps (spec § Dependencies: "No new npm packages" —
  confirmed).
- **No images** added by this route; no fonts; no new CSS bundle.

### Findings by severity

| Severity | Finding |
| -------- | ------- |
| Critical | none    |
| High     | none    |
| Medium   | none    |
| Low      | none    |

No perf anti-patterns (N+1, unbounded loop, large client bundle, blocking
third-party) were found — as the brief predicted there should be none.

### Baseline note

No machine-readable baseline JSON was written for `/contractor-questions`
because a meaningful page-load baseline requires a seeded authed session that
renders the populated view; the unauthenticated path only ever reaches
`/login`. The populated-view baseline should be captured in CI/prod (or via the
existing Playwright seed) when an authed session is available. This gate
establishes the **qualitative** baseline: single bounded query, pure render,
no new client weight.

## Dismissals

- **~1 MB JS / 23 requests on the measured page** — dismissed as a finding. (a)
  It is the `/login` landing page, not the contractor-questions view (auth
  redirect); (b) it is dev-server unminified output with HMR/React-refresh, not
  a production bundle. Not representative; real bundle weight is a CI/prod
  signal.
- **Populated-route page-load / LCP / FCP not measured** — deferred (not
  dismissed) to CI/prod with a seeded authed session, per the gate brief's
  explicit allowance not to fight auth in the browse daemon. The E2E spec covers
  functional render at both breakpoints.
- **No baseline JSON committed** — intentional; see Baseline note. A baseline
  over the redirect-to-login path would be misleading (it would track login, not
  this feature).
- **Browse-daemon Chromium symlink (1208→1223)** — environment plumbing, not a
  product finding; resolved in-session (documented preflight step).
