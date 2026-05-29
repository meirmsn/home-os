## Gate 11: convention

**Result:** pass (1 Low finding surfaced, justified — no blockers, no fixes applied)

Scope: `git diff origin/main...HEAD` on `feat/contractor-question-retrieval` @ `477903a`. Verified against `/workspace/CLAUDE.md` + `/devshop/kit/docs/guide/conventions.md`.

### Conventional commits — PASS

`git log origin/main..HEAD` uses only valid types/scopes, all scoped `(contractor-question-retrieval)`:

| Type  | Count |
| ----- | ----- |
| feat  | 4     |
| chore | 4     |
| docs  | 1     |
| fix   | 1     |
| style | 1     |
| test  | 1     |

Subjects are verb-led and behavior-describing (`dashboard entry-point link`, `singularize appointment-nudge copy for one question`, `give the appointment nudge a calm accent`), conform to the § Commit + PR Text Style rules, and stay ≤ 72 chars. The `style:` / `fix:` copy-tweak commits are correctly typed (presentation-only vs. behavior).

### File naming + (app) route-group placement — PASS

New route `apps/web/app/(app)/contractor-questions/` follows the route-group shape exactly:

- `page.tsx` — server component (`async`, `export const dynamic = 'force-dynamic'`, auth → RLS SELECT → render).
- `_components/` — client view + two `'use client'` zero-output capture components.
- `_lib/` — two pure modules (`group-contractor-questions.ts`, `contractor-tag-label.ts`), no DB/UI/metrics.
- Tests colocated: every `_lib` + `_components` source file has a sibling `*.test.ts(x)`. E2E in `apps/web/e2e/contractor-questions.spec.ts` (slow-job glob).

### File header convention (What / Why / Does NOT) — PASS

All six new source files carry the `// What: … // Why: … // Does NOT:` header matching `cards/[id]/page.tsx`. Headers are accurate and load-bearing — e.g. `group-contractor-questions.ts` cites the relevant gotchas inline, and the capture components reference their `MonitorViewOpenedCapture` / `DecideViewOpenedCapture` siblings.

### Documented gotchas — PASS

- **estimate-shapes shared validator not re-inlined.** `effectiveExpansion()` in `group-contractor-questions.ts` delegates to `parseContractorExpansion` from `@/app/api/triage/_lib/estimate-shapes` (the canonical boundary) — does NOT inline a third shape check. Honors CLAUDE.md "locked-jsonb-shape validation lives in TWO places."
- **contractor_tag vs contractor_type (Gotcha #7).** Grouping is keyed on the card-level routing tag `contractor_tag`, NOT the granular `cost_estimate_hire.contractor_type`. The header comment calls this out explicitly.
- **UTC-slice calendar derivation.** Nudge age math uses `utcDateIso()` (`new Date(v).toISOString().slice(0,10)`) + `wholeDaysBetween()` on midnight-UTC slices — never raw `Date` subtraction. Matches `tier-cards.ts § todayIso` and the card-detail reminder-due derivation; `now` is injected for deterministic 29/30/31-day tests.
- **Safari Private Browsing sessionStorage.** `ContractorQuestionsViewOpenedCapture` wraps `sessionStorage` access in try/catch and fires anyway on throw — matches the KNOWN-ISSUES posture and the sibling capture components.
- **`diy` exclusion.** `contractor-tag-label.ts` intentionally omits `diy` from `LABELS` and returns the raw string as a defensive fallback; the grouping lib filters `contractor_tag === 'diy'` upstream. Consistent and documented.

### METRICS.md authoring rules — PASS (2 new rows)

Both new events conform to § Metrics principles + the `| Event | When it fires | Key properties | Why we care |` table shape:

- `contractor_questions_view_opened` — boundary event (top of funnel), one-per-session sentinel `home_os.contractor_questions_view_opened_fired`, props `{ group_count, total_question_cards }`.
- `contractor_appointment_nudge_shown` — outcome event (a mount == a real surfaced nudge), props `{ contractor_type, question_count, oldest_card_days }`.

Property names in `posthog.capture(...)` calls match the METRICS.md rows **exactly** (verified both capture component bodies). "Why we care" columns name an actionable decision (threshold calibration, trade-level deferral patterns). Session-sentinel naming follows the `home_os.<event>_fired` convention; the omission of the `:<card_id>` suffix is correct here since this is a cross-card session-level event (not per-card like `decide_view_opened`).

### Findings

**[Low] `contractor-questions/page.tsx` has no colocated `page.test.tsx` — sibling pages do.**
Other `(app)` server-component pages (`home/page.tsx`, `cards/[id]/page.tsx`, `capture/page.tsx`, `dismissed/page.tsx`) each ship a colocated `page.test.tsx`; the new route does not. **Justified, surfaced not fixed:** spec.md (§ lines 189, 229) deliberately scopes the unit render test to `ContractorQuestionsView.test.tsx` (the view component), with the page's auth + RLS-SELECT + Sentry-on-error wiring covered by the Playwright E2E (`e2e/contractor-questions.spec.ts`). The page is a thin orchestration shell; the testable logic is extracted into the pure lib (`group-contractor-questions.test.ts`) + the view test. This is a defensible coverage split, but it diverges from the established per-page-test convention. Recommend either (a) accept the documented deviation, or (b) add a thin `page.test.tsx` for parity in a follow-up — not a ship blocker. Writing a server-component page render test is non-trivial (auth/SELECT mocking) and out of scope for an in-gate trivial fix.

## Dismissals

- **`page.tsx` missing What/Why/Does-NOT header** — N/A, header is present and correct.
- **DashboardShell entry-point link styling / a11y** — out of scope for convention gate (covered by design-review + responsive gates); link uses design tokens + `min-h-11` tap target, no convention issue.
- **Doc edits (ARCHITECTURE.md / OVERVIEW.md / apps/web/README.md)** — small, in-scope doc-coverage updates; content adequacy is the docs-check gate's remit, not convention placement. No convention violation observed.
- **No new migration in this PR** — SQL/migration conventions (ROLLBACK markers, search_path pin, FK indexes) are not applicable; this is a read-only presentation feature over existing columns.
