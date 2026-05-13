# Plan

Forward-looking plan at the feature/PR grain.

- Pipeline phase per active branch: each feature's `specs/<name>/tasks.md`
- Shipped (rich history): `BUILD-LOG.md`
- Deferred / long-term (v1, v+): `PRODUCT-ROADMAP.md`
- Tactical bugs/polish: `TODOS.md`
- Plan history (including dropped rows): `git log --follow PLAN.md`

## Active

| Branch         | Spec                    | Notes                                                                                                                                                                                                                                        |
| -------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| feat/pwa-spike | specs/pwa-spike/spec.md | iOS Safari camera API at full resolution + Storage upload + sync zoom interaction + bounce-mode cadence (750ms). Output: `.gstack/pwa-spike-result.md` documenting which comparison-UI features ship in `photo-comparison-ui` vs defer to v1 |

## Planned

v0 Phase 1 — ordered by hard dependency. Each row is one `/ak-build` cycle, one
PR. Numbers are local to this list; dependencies use feature names so renumbering
on reorder (per convention) doesn't break cross-references. Gstack slice names
the `.gstack/{ceo,eng,design}-review-*.md` section `/ak-build` Phase 0 should
read when generating the spec.

| #   | Feature                         | Scope                                                                                                                                                                                                                                  | Depends on                                    | Gstack slice                                                                                                                      |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `capture-flow`                  | Photo + description + system/room tag, card-cap check (20/wk) with client-side preservation on cap-hit, async-queued state, "new issue or update?" prompt with card picker, DISMISS UX (graceful, reversible)                          | —                                             | ceo-review § Scope (CAPTURE) + eng-review § Build Order step 4 + design-review § Card Model + § Interaction States (DISMISS Flow) |
| 2   | `triage-route-handler`          | `POST /api/triage` initial read with web search, server-side ANTHROPIC_API_KEY, usage check before Q&A only, location handling (silent on stored / free question if missing + estimate needed), `TRIAGE_SYSTEM_PROMPT` env var         | `capture-flow`                                | eng-review § Triage Route Handler Logic + § Business Logic (location handling)                                                    |
| 3   | `triage-conversation`           | Multi-round Q&A (max 3 diagnostic rounds), free location ask outside the 3-round limit, AI-proposed monitoring cadence stored on card, provisional → confirmed transition, "How we diagnosed this" persistent collapsible thread       | `triage-route-handler`                        | ceo-review § Scope (AI triage) + eng-review § Build Order step 6 + design-review § TRIAGE — Two-Phase Diagnostic Conversation     |
| 4   | `decide-state`                  | Manual path first (limit reached / no triage), then dual DIY/Contractor with user-modifiable cost estimates ("edited" badge + reset link), contractor question tags (fixed taxonomy + custom override), MONITOR cadence picker         | `triage-conversation`                         | ceo-review § Scope (DECIDE) + eng-review § Build Order step 7 + design-review § DECIDE — Dual-Path Exploration                    |
| 5   | `planned-state`                 | Card face shows DIY/Contractor decision + what's needed before CLOSE, optional reminder date, never-overdue treatment, reminder-due chip lifts to Tier 1 (calm indigo outline)                                                         | `decide-state`                                | ceo-review § Card Lifecycle (PLANNED) + design-review § PLANNED + § Card States — Visual Presentation                             |
| 6   | `close-flow`                    | Spend log (optional), finished photo (encouraged), before/after pair available via "Compare photos" action from CLOSED                                                                                                                 | `planned-state`                               | ceo-review § Scope (CLOSE) + design-review § Card Model (Photo Comparison Is a Card Capability)                                   |
| 7   | `monitor-beta`                  | App-set cadence (AI-proposed, user-adjustable on card), ad-hoc check-ins reset cadence clock, walkthrough mode (inline dashboard prompt, not modal), multi-photo sets (wide/zoom/detail), capture-with-reference, restore-from-DISMISS | `decide-state`                                | ceo-review § Scope (MONITOR) + eng-review § Build Order step 10 + design-review § MONITOR (Beta)                                  |
| 8   | `photo-comparison-ui`           | Side-by-side, sync zoom, bounce mode (or side-by-side only — gated by `pwa-spike` result), screenshot-ready layout (dates + issue name in frame), missing-photo graceful degradation                                                   | `pwa-spike`, `monitor-beta`                   | ceo-review § Scope (Photo comparison) + design-review § Photo Comparison UI                                                       |
| 9   | `dashboard`                     | Tier 1 (Act Soon + reminder-due PLANNED) / Tier 2 (overdue MONITOR) visual hierarchy, dedicated PLANNED tab with dot indicator, first-time empty + "nothing active" states, user reordering (AI severity always visible), filter view  | `capture-flow`–`photo-comparison-ui`          | ceo-review § Scope (Dashboard) + design-review § Dashboard — Filtered Card List + § Visual Hierarchy                              |
| 10  | `contractor-question-retrieval` | Retrieval view grouped by contractor type (fixed taxonomy + custom tags), contextual 30-day nudge ("You have N open questions for your HVAC contractor")                                                                               | `decide-state`, `monitor-beta`                | ceo-review § Scope (Contractor question tags) + eng-review § Build Order step 13                                                  |
| 11  | `usage-counters-and-byok`       | `usage_counters` weekly tracking (5 sessions/wk, 20 cards/wk, Monday UTC reset), Settings/Profile usage block + progress bar, BYOK key entry (State A first-time + State B returning), key validation (401/402 distinct errors)        | `triage-route-handler`                        | eng-review § Business Logic (Usage limits + BYOK) + design-review § Settings/Profile + § Interaction States (BYOK Key Validation) |
| 12  | `triage-eval-dataset`           | 75 synthetic issues across all 9 system categories, Claude-generated + human-labeled, eval runner script diffing `/api/triage` output against labels — must run clean before any prompt change ships                                   | `triage-route-handler`, `triage-conversation` | eng-review § Pre-Ship Requirements #2 + § Build Order step 15                                                                     |

**Phase 1 ship gate**: `pwa-spike` (Active) + Planned #1–#12 all green +
`.gstack/pwa-spike-result.md` documented + eval runner clean + multi-user RLS
test green = ready for first-user invites.

**Trim candidates if scope is too wide** (per ceo-review § Sequencing):

- `photo-comparison-ui` sync zoom + bounce → side-by-side only (PWA spike may force this anyway)
- `contractor-question-retrieval` retrieval view → fold into `dashboard` as a manual filter

<!--
Conventions:
- Status lives in section membership (Active vs Planned) — no status column.
- A Planned row transitions to Active when /ak-spec runs: drop #, add Branch + Spec columns.
- An Active row disappears when the feature ships — BUILD-LOG.md carries the full record.
- A row that's dropped (rescope, deprecated) — delete it; git log + commit message is the audit trail.
- "Not now, maybe later" work (v1, v+) belongs in PRODUCT-ROADMAP.md, not Planned.
- Planned ordered by # ascending (smallest = next up). Renumber on reorder; deps use feature names so renumbering doesn't cascade.
-->
