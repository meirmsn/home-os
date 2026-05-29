## Gate 9: /qa

**Feature:** contractor-question-retrieval
**Surface tested:** the Core user story (dashboard → entry link → grouped
view → nudge), the empty state, and the inclusion/exclusion + override-vs-
base edge cases for `/contractor-questions`.

**Breakpoints / environment:** desktop Playwright E2E (1440px) green;
manual Chromium dogfooding at 375px + 1440px against a seeded authenticated
user (aged electrician 1Q, aged plumber 2Q, recent hvac 3Q, excluded diy
card, excluded closed card). The `mobile` (webkit/375px) E2E project is
CI-covered (webkit cannot download in this firewalled env).

### Findings

1. **[Fixed — seeded] Appointment-nudge copy did not singularize.** The
   banner rendered "You have 1 open questions for your Electrician
   contractor." for a single-question group — grammatically wrong. Count
   semantics confirmed: the nudge receives `group.questionCount` (the
   per-group sum of `questions_for_contractor.length`, the same N shown in
   the group header as "N question(s)"), so N is the **question** count and
   the noun is "question". Fix: `open question{questionCount === 1 ? ''
: 's'}`, yielding "1 open question" / "2 open questions". Verified live
   at both breakpoints and via the E2E (which now asserts the singular
   string). Updated the nudge unit test (added an explicit singular case),
   the view render test, and the E2E assertion.
   **Fix commit:** `22046d6`
   `fix(contractor-question-retrieval): singularize appointment-nudge copy for one question`

### Functional checks (passed — no bug)

- **Core user story:** `/home` shows the `contractor-questions-link`
  (`min-h-11` tap target); clicking it navigates to `/contractor-questions`;
  the view renders one section per trade (alphabetical-by-label:
  Electrician, HVAC, Plumber) with each card's title + its
  `questions_for_contractor` as a bulleted list. E2E green at 1440px.
- **Nudge trigger (D3):** the aged electrician (45d) and aged plumber (60d)
  groups show the nudge; the recent hvac group (3d) does not. Per-group
  resolution confirmed (mixed nudge/no-nudge in the same view). Boundary
  (29/30/31 days, `NUDGE_AGE_DAYS=30`) is pinned by the lib unit tests with
  an injected `now` + UTC-slice dates.
- **diy-tagged card excluded:** seeded a `diy` card with valid questions →
  absent from the view (filter `contractor_tag !== 'diy'`). Confirmed via
  the empty-state E2E and the lib's all-excluded unit case.
- **closed card excluded:** seeded a `closed` plumber card → absent
  (filter `state NOT IN ('closed','dismissed')`). Confirmed via E2E +
  unit.
- **Override-vs-base questions:** the lib reads
  `cost_estimate_hire_override ?? cost_estimate_hire` (override wins when
  present, even if base is also present); a null/absent/invalid effective
  expansion excludes the card. Validated via the shared
  `parseContractorExpansion` boundary (no third inlined validator), pinned
  by the lib's override-vs-base + invalid-jsonb unit cases.
- **Empty state:** a user with only excluded cards sees
  `contractor-questions-empty` (calm copy), not a 500 or a blank page.
  E2E green.
- **Unauthenticated:** `/contractor-questions` with no session redirects to
  `/login`. E2E green.
- **Title fallback:** cards with a null `title` fall back to
  `initial_description` (then `'Untitled'`) — seeded cards render their
  description correctly.
- **Metrics:** `contractor_questions_view_opened` fires once per session
  (sessionStorage sentinel) and `contractor_appointment_nudge_shown` fires
  once per rendered nudge — covered by the view + capture render tests
  (PostHog mocked).

### Tests after fix

`pnpm turbo run test:unit` → **992 passed** (103 files; +1 over the prior
991 from the new singular nudge-copy test). Desktop E2E
`contractor-questions.spec.ts` → **3/3 passed**.

Note: one intermediate E2E run reported `ERR_CONNECTION_REFUSED` because
the local dev server process had exited; restarting `pnpm dev` and re-
running gave 3/3 green. Not a code regression — purely a transient
environment outage.

## Dismissals

- **No in-view interactions to test** (copy-to-clipboard, check-off,
  per-question events): explicitly out of scope per spec D4 + § Out of
  scope — this is a read-only presentation view. Not a gap.
- **No offline/error-state manual trigger:** the PostgREST-error path
  (Sentry capture + render-empty fall-through) is code-reviewed and matches
  the `home/page.tsx` posture; not separately fault-injected here
  (proportionate for a read-only view with existing E2E + unit coverage).
- **webkit/375px not run locally:** webkit cannot download in this
  firewalled env; 375px is CI-covered by the `mobile` Playwright project and
  was dogfooded via Chromium at 375px width. Per gate brief, not blocking.
