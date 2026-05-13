# Product Roadmap

Long-horizon feature sequence sliced from `.gstack/` plan reviews. Each row is a
shippable feature (one `/ak-build` cycle, one PR). When a row promotes to `PLAN.md`
it picks up a Branch + Spec column; when it ships it disappears here and a
`BUILD-LOG.md` entry takes its place.

Source of truth for product strategy:

- `.gstack/ceo-review-home-os-2026-05-01-r2.md` — target user, premises, scope
- `.gstack/eng-review-home-os-2026-05-01.md` — architecture, data model, build order
- `.gstack/design-review-home-os-2026-05-02.md` — UI surfaces, tokens, IA

---

## v0 — Phase 1 (ship to first users)

Ordered by hard dependency. Each row names the gstack slice `/ak-build` Phase 0
should read when generating the spec. Dependencies use the row number in this list.

| #   | Feature                         | Scope                                                                                                                                                                                                                                  | Depends on | Gstack slice                                                                                                                      |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 2   | `auth-magic-link`               | Supabase magic-link sign-in / sign-up, user profile created on first session, sign-out, post-auth `/(app)` shell route, login page, session-aware middleware (extend existing stub)                                                    | —          | eng-review § Architecture (Auth)                                                                                                  |
| 3   | `pwa-spike`                     | iOS Safari camera API at full resolution + Storage upload + sync zoom interaction + bounce-mode cadence (750ms). Output: `.gstack/pwa-spike-result.md` documenting which comparison-UI features ship in #11 vs defer to v1             | 2          | eng-review § Pre-Ship Requirements #1 + § Build Order step 3                                                                      |
| 4   | `capture-flow`                  | Photo + description + system/room tag, card-cap check (20/wk) with client-side preservation on cap-hit, async-queued state, "new issue or update?" prompt with card picker, DISMISS UX (graceful, reversible)                          | 2          | ceo-review § Scope (CAPTURE) + eng-review § Build Order step 4 + design-review § Card Model + § Interaction States (DISMISS Flow) |
| 5   | `triage-route-handler`          | `POST /api/triage` initial read with web search, server-side ANTHROPIC_API_KEY, usage check before Q&A only, location handling (silent on stored / free question if missing + estimate needed), `TRIAGE_SYSTEM_PROMPT` env var         | 4          | eng-review § Triage Route Handler Logic + § Business Logic (location handling)                                                    |
| 6   | `triage-conversation`           | Multi-round Q&A (max 3 diagnostic rounds), free location ask outside the 3-round limit, AI-proposed monitoring cadence stored on card, provisional → confirmed transition, "How we diagnosed this" persistent collapsible thread       | 5          | ceo-review § Scope (AI triage) + eng-review § Build Order step 6 + design-review § TRIAGE — Two-Phase Diagnostic Conversation     |
| 7   | `decide-state`                  | Manual path first (limit reached / no triage), then dual DIY/Contractor with user-modifiable cost estimates ("edited" badge + reset link), contractor question tags (fixed taxonomy + custom override), MONITOR cadence picker         | 6          | ceo-review § Scope (DECIDE) + eng-review § Build Order step 7 + design-review § DECIDE — Dual-Path Exploration                    |
| 8   | `planned-state`                 | Card face shows DIY/Contractor decision + what's needed before CLOSE, optional reminder date, never-overdue treatment, reminder-due chip lifts to Tier 1 (calm indigo outline)                                                         | 7          | ceo-review § Card Lifecycle (PLANNED) + design-review § PLANNED + § Card States — Visual Presentation                             |
| 9   | `close-flow`                    | Spend log (optional), finished photo (encouraged), before/after pair available via "Compare photos" action from CLOSED                                                                                                                 | 8          | ceo-review § Scope (CLOSE) + design-review § Card Model (Photo Comparison Is a Card Capability)                                   |
| 10  | `monitor-beta`                  | App-set cadence (AI-proposed, user-adjustable on card), ad-hoc check-ins reset cadence clock, walkthrough mode (inline dashboard prompt, not modal), multi-photo sets (wide/zoom/detail), capture-with-reference, restore-from-DISMISS | 7          | ceo-review § Scope (MONITOR) + eng-review § Build Order step 10 + design-review § MONITOR (Beta)                                  |
| 11  | `photo-comparison-ui`           | Side-by-side, sync zoom, bounce mode (or side-by-side only — gated by #3 spike result), screenshot-ready layout (dates + issue name in frame), missing-photo graceful degradation                                                      | 3, 10      | ceo-review § Scope (Photo comparison) + design-review § Photo Comparison UI                                                       |
| 12  | `dashboard`                     | Tier 1 (Act Soon + reminder-due PLANNED) / Tier 2 (overdue MONITOR) visual hierarchy, dedicated PLANNED tab with dot indicator, first-time empty + "nothing active" states, user reordering (AI severity always visible), filter view  | 4–11       | ceo-review § Scope (Dashboard) + design-review § Dashboard — Filtered Card List + § Visual Hierarchy                              |
| 13  | `contractor-question-retrieval` | Retrieval view grouped by contractor type (fixed taxonomy + custom tags), contextual 30-day nudge ("You have N open questions for your HVAC contractor")                                                                               | 7, 10      | ceo-review § Scope (Contractor question tags) + eng-review § Build Order step 13                                                  |
| 14  | `usage-counters-and-byok`       | `usage_counters` weekly tracking (5 sessions/wk, 20 cards/wk, Monday UTC reset), Settings/Profile usage block + progress bar, BYOK key entry (State A first-time + State B returning), key validation (401/402 distinct errors)        | 5          | eng-review § Business Logic (Usage limits + BYOK) + design-review § Settings/Profile + § Interaction States (BYOK Key Validation) |
| 15  | `triage-eval-dataset`           | 75 synthetic issues across all 9 system categories, Claude-generated + human-labeled, eval runner script diffing `/api/triage` output against labels — must run clean before any prompt change ships                                   | 5, 6       | eng-review § Pre-Ship Requirements #2 + § Build Order step 15                                                                     |

**Phase 1 ship gate**: #1–#15 all green + PWA spike documented + eval runner clean

- multi-user RLS test green = ready for first-user invites.

**Trim candidates if scope is too wide** (per ceo-review § Sequencing):

- #11 sync zoom + bounce → side-by-side only (PWA spike may force this anyway)
- #13 retrieval view → fold into #12 dashboard as a manual filter

---

## v1 — Phase 2 (after Phase 1 stabilizes with real users)

Sourced from ceo-review § Scope (Included — Phase 2) + eng-review § Phase 2 Deferrals.

- **`ai-photo-change-detection`** — AI analyzes check-in photo sets for change, prompts re-triage if change detected. Layers on top of the #11 comparison UI; does not replace human comparison.
- **`cross-card-contractor-surfacing`** — Automated retrieval: HVAC duct card in MONITOR auto-surfaces in the pre-appointment view for HVAC service. Builds on #13 taxonomy.
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
