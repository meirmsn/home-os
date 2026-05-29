## Gate 4: /simplify

**Outcome: pass** — no changes applied. The PR's changed code is already clean
across all four review angles (reuse, simplification, efficiency, altitude).

Scope reviewed (diff `origin/main...HEAD`, in-PR files only):

- `apps/web/app/(app)/contractor-questions/_lib/group-contractor-questions.ts`
- `apps/web/app/(app)/contractor-questions/_lib/contractor-tag-label.ts`
- `apps/web/app/(app)/contractor-questions/page.tsx`
- `apps/web/app/(app)/contractor-questions/_components/ContractorQuestionsView.tsx`
- `apps/web/app/(app)/contractor-questions/_components/ContractorAppointmentNudge.tsx`
- `apps/web/app/(app)/contractor-questions/_components/ContractorQuestionsViewOpenedCapture.tsx`
- `apps/web/app/(app)/home/_components/DashboardShell.tsx` (entry-point link)
- `apps/web/e2e/contractor-questions.spec.ts` + the four `*.test.*` files

### Findings

None applied. Code mirrors existing repo patterns faithfully:

- **Reuse** — `ContractorQuestionsViewOpenedCapture` correctly mirrors
  `MonitorViewOpenedCapture`/`DecideViewOpenedCapture` (sessionStorage sentinel,
  try/catch fall-through, `posthog.capture`); `parseContractorExpansion` +
  `ContractorTag`/`CONTRACTOR_TAG_VALUES` are imported from the shared
  `estimate-shapes`/`parse-tool-output` modules rather than reimplemented (no
  third jsonb validator — honors the CLAUDE.md locked-shape gotcha); the page's
  auth + RLS-scoped SELECT + Sentry-on-error + `data ?? []` posture matches
  `home/page.tsx`.
- **Simplification** — single-pass bucket → sort → group is the minimal form;
  no redundant/derivable state; no dead code left behind.
- **Efficiency** — pure synchronous lib, one SELECT, no repeated I/O, nothing
  added to a hot path.
- **Altitude** — the change is a self-contained additive route + pure lib; no
  special-casing layered onto shared infrastructure.

### Dismissals

- **`utcDateIso` (group-contractor-questions.ts:72) vs `todayIso`
  (tier-cards.ts:41)** — surfaced under the Reuse angle as a possible duplicate
  one-liner. rationale: spec § Dependencies explicitly sanctions "either import
  or replicate the one-liner with a citing comment", and the citing comment is
  present (lines 67-71). More importantly, `utcDateIso` accepts `number | string`
  because the lib slices both `now` (number) and `createdAt` (string), whereas
  `todayIso` is typed `(now: number)` and is only ever called with a number
  elsewhere. Importing the narrower helper would force a cast on the string
  path — no net simplification — and widening the shared signature is out of
  this PR's scope. Genuinely broader helper, not a redundant reimplementation.
- **`oldest === undefined ? 0 : …` guard (group-contractor-questions.ts:145-148)**
  — surfaced under Simplification as seemingly-dead defensive code (the bucket is
  non-empty by construction). rationale: `tsconfig.base.json` sets
  `noUncheckedIndexedAccess: true`, so `cards[0]` is typed
  `ContractorQuestionCard | undefined` and the guard is required by the type
  checker. Removing it fails typecheck; any alternative form just relocates the
  same guard. Not dead code — it is the idiomatic narrowing this flag mandates.
- **Title fallback `row.title || row.initial_description || 'Untitled'`
  (group-contractor-questions.ts:123)** — surfaced under Reuse as a near-copy of
  `DashboardCard.tsx:34` (`… || 'Untitled card'`). rationale: no shared helper
  exists today (each call site inlines its own string, and they differ:
  "Untitled" vs "Untitled card" vs "Untitled issue"). Extracting a cross-route
  util would be net-new shared infrastructure well outside this read-only PR's
  scope — invented churn, not a clear win.
