## Gate 8: /design-review

**Feature:** contractor-question-retrieval
**View under audit:** `/contractor-questions` (server component
`apps/web/app/(app)/contractor-questions/page.tsx` →
`_components/ContractorQuestionsView.tsx` +
`_components/ContractorAppointmentNudge.tsx`) + the dashboard entry link in
`apps/web/app/(app)/home/_components/DashboardShell.tsx`.

**Breakpoints audited:** 375px (mobile) and 1440px (desktop), Chromium,
dark theme (app is dark-only in Phase 1). Authenticated via a seeded user
(5 cards: aged electrician 1Q, aged plumber 2Q, recent hvac 3Q, plus an
excluded diy card and an excluded closed card) with the Supabase session
cookie injected into a Playwright Chromium context, mirroring
`e2e/contractor-questions.spec.ts`. The `mobile` (webkit/375px) E2E project
is CI-covered; webkit cannot download in this firewalled env, so 375px was
audited via Chromium at viewport width 375 per the gate brief.

**Audit lens applied:** hierarchy, spacing/rhythm, typography, tap-target
sizes (≥44px / h-11), dark-mode contrast, AI-slop patterns, empty-state
quality, nudge-banner styling.

### Findings

1. **[Fixed] Appointment nudge was visually indistinguishable from the
   question cards below it.** The nudge used the identical
   `bg-[var(--color-background-raised)]` + `border-[var(--color-border-default)]`
   treatment as the question cards stacked directly under it, so it read as
   "just another card" rather than a distinct attention element — the one
   piece of the view whose whole job is to gently draw the eye blended into
   the stack. Fix: added a 4px left accent border in the design-system
   `--color-watch` token ("urgency without alarm" — a calm amber, not an
   anxiety-amplifying red), keeping it on the calm-authority brand and
   introducing no new token. Verified at both breakpoints (the amber bar
   reads cleanly at 375px and 1440px).
   **Fix commit:** `590c7d2`
   `style(contractor-question-retrieval): give the appointment nudge a calm accent`

### Passed checks (no change needed)

- **Hierarchy:** clean top-down flow — page title (`text-lg semibold`) →
  muted subtitle → per-group header (label `text-base semibold` + right-
  aligned `text-xs` count) → nudge → cards → bulleted questions. Reads at a
  glance.
- **Spacing/rhythm:** consistent 8px-grid rhythm (`space-y-8` between
  groups, `space-y-3` within a group header block, `space-y-4` between
  cards, `space-y-1` between question items). No cramped or uneven gaps at
  either breakpoint.
- **Typography:** uses only the loaded Inter weights + the token type
  scale; no orphaned font sizes.
- **Tap targets:** the dashboard entry link is `inline-flex min-h-11`
  (44px) — meets the ≥44px requirement. The view itself is read-only
  (no in-view tap targets to size).
- **Dark-mode contrast:** primary text `--color-text-primary-inverse`
  (#f0efeb) on the charcoal grounds is high-contrast; question items use
  `--color-text-secondary-inverse` (muted by design for the
  checklist-detail tier) and remain legible at both sizes.
- **AI-slop patterns:** none — no gratuitous gradients, emoji, faux-3D, or
  filler copy. The subtitle is purposeful and calm.
- **Empty state:** calm, non-anxiety copy ("No contractor questions yet…
  they'll gather here by trade.") centered with generous padding — matches
  the project's spiral-prevention tone. (CI-covered + render-test-covered;
  not re-shot here.)
- **Responsive:** content column is `max-w-[720px]` centered; at 375px it
  fills width and wraps cleanly. The app-shell header (home-os / email /
  Sign out) wraps slightly at 375px, but that is the shared `(app)` layout,
  not this PR's surface — out of scope.

### Screenshots

- `specs/contractor-question-retrieval/screenshots/retrieval-view-desktop.png`
  (1440px, post-fix — singular copy + amber nudge accent)
- `specs/contractor-question-retrieval/screenshots/retrieval-view-mobile.png`
  (375px, post-fix)

### Tests after fix

`pnpm turbo run test:unit` → 992 passed (103 files). Desktop E2E
`contractor-questions.spec.ts` → 3/3 passed.

## Dismissals

- **App-shell header wrap at 375px** (home-os logo / email / Sign out
  wraps onto two lines): real but lives in the shared `(app)/layout.tsx`
  header, not in any file owned by this PR. Out of scope per the gate brief
  ("stay strictly within this PR's files").
- **Question-item muted color** (`--color-text-secondary-inverse`):
  intentional tier-of-detail choice (card title is primary, the questions
  are supporting checklist detail) and consistent with the rest of the app;
  legible at both breakpoints. No change.
- **Nudge could use an icon / stronger fill:** deliberately not added — the
  spec D3 copy is the contract, an accent bar is the minimal change that
  fixes the "blends in" problem without over-designing a read-only banner
  or amplifying anxiety. Proportionate.
