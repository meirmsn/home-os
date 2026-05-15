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

Long-form context for the v0 infra entries on `PLAN.md § Planned` whose tracker rows are too compact for the rationale + candidate-cause analysis. One section per `PLAN.md` row that lives here.

### `devcontainer-supabase-fix` (PLAN.md row #1)

**Problem.** The workspace devcontainer can't reach the Supabase local stack on `localhost:54421` (connection-refused). The symptom reproduces on every PR (PR #9, #10, #12, #15 all hit it), and the workaround — defer `/ak-pre-ship` Gate 9 `/qa` to a Vercel-preview manual walkthrough — costs each PR a real hero shot set. PR #15 (capture-flow) shipped with three login-page captures as "hero shots" for that exact reason: the pre-ship agent could only capture anon-bounce variants because authenticated captures need Supabase reachable.

**Why this is v0-priority** (the row is #1 on `PLAN.md § Planned`): without this, every subsequent PR ships with the same `Gate 9 blocked` carry-over + degraded hero shot evidence. The signal-quality of the `/ak-pre-ship` audit comment decays — when "blocked" is the default outcome, it stops carrying information. Fixing this unblocks every E2E-touching PR's pre-ship quality.

**Root-cause candidates** (the new-session investigation walks these in order):

1. **Firewall allowlist drift on rebound ports.** `/ak-new-project` rebinds Supabase ports `+100` to avoid lalista collision (per CLAUDE.md § Local Supabase ports — `54421/54422/54423/54424/54427`). The firewall script at `.devcontainer/init-firewall.sh:213-237` still allows the upstream-default ports `54321/54322`. Workspace egress to `localhost:54421` is iptables-blocked. This is the most likely cause and has its own `TODOS.md § firewall-rebound-ports` entry from PR #9 era.
2. **`supabase-runner` not invoking `supabase start` on devcontainer boot.** If the runner container's entrypoint never runs `supabase start`, nothing's listening on the ports regardless of firewall state.
3. **socat forwards misconfigured for rebound ports.** `.devcontainer/compose.yml` has socat-based forwards from workspace → supabase-runner; if those still target upstream defaults instead of the `+100` rebind, packets never reach Kong.

**Fix shape:**

- Investigate the three candidates in order; the first one that closes the symptom is the fix.
- Update `.devcontainer/init-firewall.sh` allowlist + `.devcontainer/compose.yml` socat forwards + `.devcontainer/supabase-runner/Dockerfile` as needed.
- Re-run `sudo /usr/local/bin/init-firewall.sh` to re-apply, or `Reopen in Container` for full re-build.
- Verify: from the workspace, `curl -fsS http://localhost:54421/` should return 401/404 (Kong is up). `pnpm db:reset` should succeed. Replaying `/ak-pre-ship` Gate 9 `/qa` on this same branch should now show authenticated hero captures instead of anon-bounce.

**Cross-refs:**

- `PLAN.md § Planned row #1 (devcontainer-supabase-fix)` — the concrete row
- `TODOS.md § firewall-rebound-ports` — the specific firewall-allowlist issue (candidate 1)
- `TODOS.md § devcontainer-supabase-reachability` — the umbrella tracker covering all three candidates
- PR #15 capture-flow hero shots — the degraded evidence this fix removes

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
