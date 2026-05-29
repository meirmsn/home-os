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
