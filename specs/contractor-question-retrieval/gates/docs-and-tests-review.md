## Gate 5: docs-and-tests-review

**Audit moment:** pre-polish (Gate 5 inside `/ak-pre-ship`). First audit — no prior Audit N.
**Range:** `origin/main...HEAD` (HEAD = `477903a`), branch `feat/contractor-question-retrieval`.
**Posture:** HALT-ON-FIND — findings surfaced, not auto-fixed.

### DOCS review

Coverage is strong. The feature's doc surfaces were all updated and are accurate against the diff:

- **METRICS.md** — both new events (`contractor_questions_view_opened`, `contractor_appointment_nudge_shown`) added with correct source files, payload shapes (`{ group_count, total_question_cards }` and `{ contractor_type, question_count, oldest_card_days }`), dedup semantics, and intent. Payload shapes match the actual `posthog.capture(...)` calls in `ContractorQuestionsViewOpenedCapture.tsx` and `ContractorAppointmentNudge.tsx`. No existing event rows modified. ✓
- **apps/web/README.md** — new `/contractor-questions` route row added in the route table, describing the server-component fetch + Sentry-on-error + filter/group/nudge behavior + the 2 events + test files. Accurate. ✓
- **OVERVIEW.md** — one-line product entry added under the dashboard feature list. Accurate to D1–D3. ✓
- **ARCHITECTURE.md** — module map `apps/web/` row extended with the `/(app)/contractor-questions` page + `<ContractorQuestionsView />` + `<ContractorAppointmentNudge />`. ✓
- **CLAUDE.md gotchas** — none invalidated. The feature reuses the shared `parseContractorExpansion` validator (does NOT inline a third copy — honors the "locked-jsonb-shape validation lives in TWO places" gotcha), groups by card-level `contractor_tag` not granular `cost_estimate_hire.contractor_type` (honors Gotcha #7), and uses the UTC-slice calendar-date pattern (honors the reminder-due / `tier-cards.ts` calendar-date gotcha). No new CLAUDE.md gotcha was required by the spec or added. ✓
- **No migration** — correctly no `supabase/README.md` / advisor changes (read-only feature, no SQL). ✓

**Finding D1 (low):** The ARCHITECTURE.md module-map entry lists `<ContractorQuestionsView />` + `<ContractorAppointmentNudge />` but omits the third committed client component `<ContractorQuestionsViewOpenedCapture />`. This is the only one of the three view components that fires a documented metric event, so its absence from the surface list is a minor coherence gap (the capture component IS named in METRICS.md, so it is not undocumented overall). Cosmetic — the README route row covers the events fully.

### TESTS review

Every new behavior the audit brief enumerates is pinned by an assertion, with one real gap:

- **Grouping/filter/nudge lib — 7 cases claimed, 7 present** (`group-contractor-questions.test.ts`): empty (1), all-excluded incl. closed/dismissed/diy/empty-questions/null-expansion (2), single group oldest-first (3), multi-group alphabetical-by-label (4), override-wins-over-base + base-only (5), nudge boundary at exactly 29/30/31 days with injected `now` and `NUDGE_AGE_DAYS` pinned (6), invalid jsonb excluded-not-thrown (7). All map to spec § Tests. ✓
- **`contractor_tag` label map** (`contractor-tag-label.test.ts`): all 7 non-`diy` tags → expected labels, plus `diy` fallback and unknown-value fallback. Full coverage. ✓
- **View render** (`ContractorQuestionsView.test.tsx`): groups + cards + question items, nudge-only-for-showNudge (scoped via `within`), empty state, view-opened event, nudge-shown event. Covers all three render-condition columns. ✓
- **2 metric capture sites**: `ContractorQuestionsViewOpenedCapture.test.tsx` (first-mount fire + per-session sessionStorage dedup) and `ContractorAppointmentNudge.test.tsx` (copy, once-per-mount fire, raw-tag payload) — plus both are re-asserted at the integration level in the view test. ✓
- **Dashboard entry link** (`DashboardShell.test.tsx`): asserts the `contractor-questions-link` testid renders with `href="/contractor-questions"`. ✓
- **Singular/plural nudge copy fix (commit 22046d6)**: pinned in three places — `ContractorAppointmentNudge.test.tsx` (dedicated "1 open question" singular case + the plural case), `ContractorQuestionsView.test.tsx` (asserts the singular "1 open question" string), and `e2e/contractor-questions.spec.ts:209` (`'You have 1 open question for your Electrician contractor.'`). Well-pinned. ✓

**Finding T1 (medium):** The nudge accent style (commit `590c7d2`) is not pinned by any assertion. The commit's sole change adds `border-l-4 ... border-l-[var(--color-watch)]` to `ContractorAppointmentNudge.tsx` to visually distinguish the nudge from the question cards stacked below it. No test asserts the accent class/border or otherwise distinguishes the nudge banner's styling from the plain card surface — `ContractorAppointmentNudge.test.tsx` asserts only text content + event firing, and the view test asserts only presence/count. A future refactor that drops the `--color-watch` left-border (regressing the banner back to blending in with the cards — the exact bug the commit fixed) would leave all tests green. Class-name assertions are brittle, so this is a recommend (medium), not a blocker; if pinned, asserting the presence of the accent token on the nudge element's `className` (or a dedicated `data-accent` marker) is the lowest-friction option. The `--color-watch` token itself is confirmed defined in `apps/web/app/globals.css:27`, so the class resolves at runtime.

**Finding T2 (low):** Dead defensive branch unreached by any test — `group-contractor-questions.ts:145-148` (`oldest === undefined ? 0 : ...`). `cards` is non-empty by construction (a bucket is only created via `push`), as the inline comment notes, so the `=== undefined → 0` arm is unreachable. No test exercises it (none can, without breaking the invariant). Acceptable as a TypeScript-narrowing guard; noted only for branch-coverage completeness. Not worth a test.

### Dismissals

- **Nudge `oldestCardDays` prop "unused in render"** — considered, dismissed. The prop is consumed in the `contractor_appointment_nudge_shown` event payload (`oldest_card_days`), and that payload is asserted in both `ContractorAppointmentNudge.test.tsx` and `ContractorQuestionsView.test.tsx`. Not an untested prop.
- **E2E not executed in this gate** — dismissed as out-of-scope for a docs-and-tests audit. The spec/tasks.md record the E2E is CI-slow / pre-ship verifiable (no `webServer` in playwright.config); the spec itself was lint-checked and lists under both breakpoint projects. Execution is the slow-job gate's concern, not this fresh-eyes review.
- **`contractor-tag-label` `diy` returning the raw `'diy'` string** — dismissed. Intentional per D2/spec (diy is filtered upstream; the fallback is defensive), and explicitly tested.
- **README "Docs-Coverage-Bypass" trailer on Task 1 commit** — dismissed. The README route row that covers the grouping lib was added in the Task 2 commit (recorded in tasks.md § Decisions); coverage exists in the range, just not in the Task 1 commit. Not a missing doc.

findings: high=0 medium=1 low=2
