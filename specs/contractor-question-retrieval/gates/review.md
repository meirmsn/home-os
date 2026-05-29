## Gate 6: /review

**Scope:** `git diff origin/main...HEAD` (HEAD `477903a`, branch `feat/contractor-question-retrieval`). Read-only presentation feature: new `/(app)/contractor-questions` route + pure grouping lib + label util + 3 client components + dashboard entry-point link + 2 PostHog events + METRICS.md rows. No migration, no new API route, no LLM call, no data write.

**Verdict:** `findings (3) noted` — 0 high, 0 medium, 3 low. No correctness, SQL-safety, trust-boundary, or RLS defects found. All three findings are low-severity quality/consistency notes; none block ship — routed as noted/accepted per the halt-on-find low-severity policy (rationale per finding below). Orchestrator routing: low → note + proceed.

**Scope check:** CLEAN. Intent (spec D1-D4 + In scope) matches the diff exactly. All 6 task-order items delivered (lib, label util, route+view+nudge+empty state, dashboard link, 2 metrics events, e2e + render tests). No scope creep; no missing requirements.

### Verified correct (load-bearing checks the brief called out)

- **Effective-expansion resolution** (`group-contractor-questions.ts:93`): `row.cost_estimate_hire_override ?? row.cost_estimate_hire` — override wins when present, `null`/absent → excluded. Routed through the shared `parseContractorExpansion` (estimate-shapes.ts) — no third inline validator (honors CLAUDE.md "locked-jsonb-shape validation lives in TWO places"). Confidence 9/10.
- **RLS scoping** (`page.tsx:39-43`): SELECT via `createClient()` (RLS-scoped server client), no explicit `owner_id` filter — identical posture to `home/page.tsx`. RLS on `cards` scopes to owner. Auth gate `getUser()` → `redirect('/login')` precedes the query. Confidence 9/10.
- **Sentry-on-error** (`page.tsx:45-57`): explicit `error` check → `captureException` tagged `surface: 'contractor-questions', stage: 'cards_select'` with `{ user_id, error_message, error_code }` → falls through to `data ?? []` (degraded-but-calm, no 500). No `data: null` swallow. No secrets in extra payload. Mirrors the documented home/card-detail pattern. Confidence 9/10.
- **Calendar-date / UTC-slice nudge math** (`group-contractor-questions.ts:67-83, 145-148`): `utcDateIso` slices to `YYYY-MM-DD`; `wholeDaysBetween` parses both endpoints as midnight-UTC and divides by `86_400_000` with `Math.round` — no raw `Date` subtraction, no DST drift. Boundary test (case 6) pins 29→false, 30→true, 31→true against a fixed injected `now`. Confidence 9/10.
- **Grouping by card-level `contractor_tag`, not `cost_estimate_hire.contractor_type`** (`:115, :128`) — honors CLAUDE.md Gotcha #7. `diy` and `null` tags excluded at `:115`. Confidence 9/10.
- **Deterministic ordering**: groups sorted alphabetical-by-label with raw-tag tie-break (`:164-169`); cards oldest-first via ISO-string `localeCompare` (`:141`) — lexicographic sort is correct for ISO-8601 UTC timestamps. Confidence 9/10.
- **Null/undefined edges**: `title || initial_description || 'Untitled'` fallback (`:123`); `oldest === undefined` guard (`:146`) is unreachable-but-safe; question array aliased by reference but never mutated downstream (only `.map`/`.reduce`). No null deref paths. Confidence 8/10.
- **Metrics**: both events documented in METRICS.md with accurate props; `contractor_type` prop carries the `contractor_tag` enum string (spec D4, documented divergence between prop name and value). sessionStorage sentinel wrapped in try/catch with fire-through (Safari Private Browsing tolerance, mirrors MonitorViewOpenedCapture). Nudge `useRef` once-guard = one event per mounted banner. Confidence 9/10.

### Findings

**[LOW] (confidence: 8/10) `page.tsx:39-43` — SELECT omits the DB-level `state` filter the dashboard uses, fetching closed/dismissed rows only to discard them in-memory.**
`home/page.tsx:38` applies `.not('state', 'in', '(closed,dismissed)')` at the query; the contractor-questions SELECT pulls every card the user owns and relies on the lib's `EXCLUDED_STATES` filter (`group-contractor-questions.ts:114`) to drop closed/dismissed. Functionally correct, but a user with a large closed-card history transfers more rows than needed over the wire. Read-only v0 feature, low row counts expected — acceptable, but a divergence from the established dashboard pattern worth a one-line `.not(...)` to match. Not a bug. No fix applied (HALT-ON-FIND).

**[LOW] (confidence: 9/10) `group-contractor-questions.ts:119` — redundant `questions_for_contractor.length < 1` re-check; `parseContractorExpansion` already rejects empty arrays.**
`estimate-shapes.ts:384` fails validation when `questions_for_contractor.length < 1`, so any expansion that returns `ok: true` is guaranteed ≥1 question. The lib's line-119 guard can never be true for a parsed value. Harmless defense-in-depth (and the redundancy is implicitly insulating against a future loosening of the shared validator), but dead code today. Test case 2's `no-questions` card is actually excluded by the parser, not by this line. No correctness impact. No fix applied.

**[LOW] (confidence: 7/10) `group-contractor-questions.ts:145-148` — `oldestCardDays` has no floor for future-dated `created_at`; a clock-skewed future timestamp yields a negative day count.**
If `created_at` is in the future (clock skew, bad seed data), `wholeDaysBetween` returns a negative number. `showNudge` stays correctly `false` (negative < 30), and the value is only surfaced in the `oldest_card_days` PostHog prop — so the blast radius is one slightly-odd analytics datapoint, never a UI or logic defect. Worth a `Math.max(0, ...)` clamp for analytics cleanliness if touched, but not load-bearing. No fix applied.

### Dismissals

- **`oldest === undefined` branch (`:146`) as a potential silent-zero bug** — dismissed. A bucket is only ever created with a non-empty array (`:131` `set(tag, [card])`) and only grown via `push`; `cards[0]` is always defined. The guard is unreachable defensive code that avoids a non-null assertion, not a real zero-age path. Confidence 9/10.
- **Question array shared by reference (`:124` `questions: expansion.questions_for_contractor`)** — dismissed as an aliasing risk. The parsed array is consumed read-only downstream (`.map` in the view, `.reduce` for `questionCount`); nothing mutates it, so the alias is benign. Confidence 8/10.
- **`contractor_type` PostHog prop carrying a `contractor_tag` value** — dismissed as a naming mismatch. This is explicitly specified (D4 + METRICS.md note: the prop is named `contractor_type` but carries the card-level tag enum string). Intentional and documented. Confidence 9/10.
- **Label util fallback returning the raw tag for `diy`/unknown (`contractor-tag-label.ts:32`)** — dismissed. `diy` is filtered before reaching the label map (lib `:115`), so the fallback is unreachable in production; it exists as a non-throwing safety net. Correct posture. Confidence 9/10.
- **No service-worker / offline caching on the route** — dismissed. Spec § Offline behavior chose "online-only with error state" (default posture, not upgraded). Server-rendered, degraded-but-calm empty render on SELECT failure. Intentional. Confidence 9/10.
- **No explicit `owner_id` filter on the SELECT** — dismissed. RLS on `cards` scopes the query to the owner; defense-in-depth via RLS is the documented project posture (mirrors `home/page.tsx`). Confidence 9/10.

**Adversarial note:** This is a small, pure-logic-plus-presentation diff with an injectable-`now` unit-tested boundary, a shared trust-boundary validator reused (not re-implemented), and a documented RLS/Sentry posture copied verbatim from two existing pages. No race conditions (read-only, no writes), no SQL injection surface (PostgREST builder, no string interpolation), no LLM trust-boundary (no LLM call in this diff — the jsonb it reads was already validated at write time AND is re-validated here). The three findings are all quality/consistency, not correctness.
