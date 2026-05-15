# Product Roadmap

Long-horizon feature sequence sliced from `.gstack/` plan reviews.

- **v0 Phase 1** (active build target) lives in `PLAN.md` — promoted there so the
  build sequence is visible alongside Active work. Rows ship into `BUILD-LOG.md`.
- **v1 Phase 2** + **v+ Future** live below — graduate into `PLAN.md` only when
  Phase 1 stabilizes with real users.

Source of truth for product strategy:

- `.gstack/ceo-review-home-os-2026-05-01-r2.md` — target user, premises, scope
- `.gstack/eng-review-home-os-2026-05-01.md` — architecture, data model, build order
- `.gstack/design-review-home-os-2026-05-02.md` — UI surfaces, tokens, IA

---

## v0 — Infrastructure / Tooling (current cycle)

Long-form context for the v0 infra entries on `PLAN.md § Active` whose tracker rows are too compact for the rationale + candidate-cause analysis. One section per `PLAN.md` row that lives here.

### `landing-redirect` (PLAN.md Active row)

**Problem.** The production root URL (`https://home-os-nu-two.vercel.app/`) still renders the day-zero placeholder — a single `<p>Home OS — coming soon.</p>` line in `apps/web/app/page.tsx`. The placeholder's own comment ("Replaced when the first feature ships") points at exactly this moment, but the capture-flow PR (#15) shipped its feature surfaces without touching `/`. The result: a new visitor lands on the prod URL, sees "coming soon," and has no discoverable path to the magic-link form at `/login` short of typing the URL by hand. Caught immediately post-deploy by the operator's first prod-URL visit on 2026-05-15.

**Why this is v0-priority** (Active on `PLAN.md`, ahead of every Phase 1 feature row): the capture flow is **shipped but undiscoverable**. Every minute the root URL renders "coming soon" is a minute a referral / share / spontaneous visit gets bounced with no funnel. Cost to fix: ~10 LOC + 1 middleware test extension. Benefit: the existing PR #15 feature surface stops being functionally invisible.

This is the canonical case for ordering: a tiny gap-fix that unblocks the visibility of every feature behind it should land before the next big feature, not after.

**Decision shape** — two sub-options were considered before settling on the chosen one:

1. **Replace placeholder with a marketing landing page** (Sign In CTA pointing at `/login`, brand copy on the dark-charcoal ground). Surfaces a discoverable entry without changing routing. Costs: copy / brand decisions, an extra surface to maintain, no clean answer for "what does an authenticated user see at `/`". **Rejected**: Phase 1 is alpha — there's no marketing message to land. The brand-state intent ("anchor dark-ground on day one") is already carried by `/login` itself, which renders the same tokens.
2. **Auth-aware middleware redirect** (anonymous → `/login`; authenticated → `/home`). Treats `/` as a thin routing surface. Symmetric with the rest of the app's auth posture — `apps/web/middleware.ts` already bounces `/home`, `/capture`, and `/dismissed` for anonymous users via `getUser()` + `GATED_PREFIXES`; this row adds an inverse rule for the root. **Chosen**: zero copy decisions, matches established auth-flow conventions, lets the alpha funnel point at `/login` (the only real entry surface today). When marketing copy exists post-Phase-1, the redirect can be reversed by deleting one branch in the middleware — cheap to undo.

**Fix shape:**

- Extend `apps/web/middleware.ts` with two rules at the top of the request handler:
  - `path === '/'` + anonymous → 303 to `/login` (no `?next=...` — `/login` already lands at `/home` post-auth per D4 in `auth-magic-link/spec.md`)
  - `path === '/'` + authenticated → 303 to `/home`
- Replace `apps/web/app/page.tsx` body with a minimal `<a href="/login">Sign in</a>` noscript-fallback wrapper. The middleware fires before the page renders for any normal browser flow, so the page.tsx content is only seen by clients that don't follow redirects (curl `-I`, headless scrapers without auto-follow, search-engine crawlers indexing the bare `/` URL). Keeping a one-line anchor preserves SEO + accessibility without leaving the "coming soon" line in place.
- Extend `apps/web/middleware.test.ts` with two new cases (anon-at-root → /login; auth-at-root → /home) mirroring the existing GATED_PREFIXES test structure.
- Add a Playwright case in `apps/web/e2e/auth-edge-cases.spec.ts` asserting `goto('/')` ends on `/login` for the anonymous fixture and on `/home` for the authenticated fixture.
- Update `CLAUDE.md § Where Things Happen § Edge middleware`: append "AND root `/` redirect (anon → `/login`, auth → `/home`)" to the existing middleware description.
- Update the `apps/web/app/page.tsx` row in `CLAUDE.md § Where Things Happen` to note its new role (noscript-fallback only).
- Verify post-deploy: `curl -sI https://home-os-nu-two.vercel.app/` returns `303` + `Location: /login`. Browser-driven check: visiting `/` as anon lands on `/login`; signing in lands on `/home`; revisiting `/` while signed in bounces back to `/home`.

**Cross-refs:**

- `PLAN.md § Active (landing-redirect)` — the concrete row
- `apps/web/middleware.ts` + `apps/web/middleware.test.ts` — the surface that gets the change
- `apps/web/app/page.tsx` — the placeholder being replaced (current line 1-19, the "Replaced when the first feature ships" comment is the design intent this row delivers on)
- PR #15 (capture-flow) — the shipped-but-undiscoverable feature this row makes findable
- Future devshop generalization candidate: `/ak-pre-ship` could grow a gate that flags `app/page.tsx` containing only "coming soon" / placeholder copy on PRs that ship the first user-visible feature. Not in scope here.

---

## v1 — Phase 2 (after Phase 1 stabilizes with real users)

Sourced from ceo-review § Scope (Included — Phase 2) + eng-review § Phase 2 Deferrals.

- **`ai-photo-change-detection`** — AI analyzes check-in photo sets for change, prompts re-triage if change detected. Layers on top of the `photo-comparison-ui` surface; does not replace human comparison.
- **`cross-card-contractor-surfacing`** — Automated retrieval: HVAC duct card in MONITOR auto-surfaces in the pre-appointment view for HVAC service. Builds on `contractor-question-retrieval` taxonomy.
- **`house-profile`** — Implicit profile built silently from CAPTURE system + location tags; passed into triage prompt once meaningful card count is reached. Threshold to be defined before shipping.
- **`inspection-report-import`** — Seeding mechanism that ingests an inspection report into many cards, with graceful bulk-dismiss flow. Pairs with `house-profile`.
- **`smart-reminders`** — Weather-triggered and energy-anomaly triggers. Validate with 5–10 homeowners via survey before building.
- **`product-learning-analytics`** — Issue-type patterns, triage accuracy, escalation rates, where users modify cost estimates.
- **`push-notifications`** — Phase 1 surfaces nudges in-app only; Phase 2 adds opt-in push.
- **`capture-auto-match-dismissed`** — During CAPTURE, check description + location against DISMISSED items; if match, prompt "add an update instead?"
- **`pro-tier`** — Higher weekly triage limit; only if free tier + BYOK telemetry shows demand.
- **`light-mode`** — Only if user research shows demand. Dark is the designed Phase 1 state, not a toggle.

---

## v+ — Future / Explicitly Excluded

- **Contractor trust network / affiliate model** — Affiliate-incentive integrity risk is too high to solve cheaply. Not a Phase 2 candidate without a monetization-integrity plan first (per ceo-review § Explicitly excluded).
- **Appointment scheduling integration** — Phase 1 + 2 keep contractor question retrieval manual (tag + filter). Full scheduling would need a multi-vendor calendar story.
- **Single "top item" dashboard** — Rejected by ceo-review. Forces app priority on users with multiple genuine concurrent concerns. Do not revisit without a strong evidence shift.
- **User-input budget at CAPTURE** — Rejected. Users don't preemptively know what repairs cost; app-provided starting estimate + user-modifiable on the card is the decided pattern.
