<!-- This file is the project's PRODUCT-level overview — answers "what does this app do, and for whom".
     For the SYSTEM-level view (components, data flow, deployment), see ARCHITECTURE.md.
     Both are on-demand docs. The always-loaded entry-point is CLAUDE.md.
     Authoring rules: kit/docs/guide/conventions.md § Project Docs Hierarchy. -->

# OVERVIEW: home-os

> Product-level map of what this app does, the people it serves, and the user-visible flows that make it useful. For the system view (architecture, data flow, deployment), see [ARCHITECTURE.md](./ARCHITECTURE.md).

## What this is

Home OS is an intelligent home-maintenance companion. A homeowner captures an issue with a photo and a sentence; the app reads the capture, asks 1–3 clarifying questions, and surfaces a confident assessment with both a DIY path and a contractor path. From there the homeowner decides — and the app tracks the work through monitoring, planned, and close. The product's emotional job is **spiral prevention**: communicate "this is under control, here's what actually matters" rather than presenting a guilt list.

## Who uses it

- **Middle-income homeowner.** Time-constrained and budget-constrained. Cares about doing right by the house but cannot hold every issue in their head. Makes real DIY-vs-hire tradeoffs and knows DIY is sometimes the right answer, not just the cheap one.

Out of scope (small end): starter-home owners with few issues — manageable mentally without an app. Out of scope (large end): owners with someone else managing the home.

## Core flows

- **Capture.** Photo + short description + location tag (room + system). Creates a new card or adds a touchpoint to an existing one ("new issue or update?" prompt with a card picker). v0 surface: `/(app)/capture` — single-screen form, mobile-first, photo via `<input type="file" capture="environment">` (Path A). The 20/wk soft cap is enforced atomically by the `claim_card_slot` Postgres function; on cap-hit the form preserves state and shows a banner. The post-pick "update existing" flow is rendered but ships in `monitor-beta` (row #7).
- **Triage.** Two-phase diagnostic: AI returns a provisional read, then asks up to three clarifying questions in a conversational thread on the card. Converges on a confirmed assessment with provisional → confirmed severity (Act Soon / Watch / Note) and the diagnostic thread persisted as "How we diagnosed this". v0 surface: `/(app)/cards/[id]` — server-rendered card detail page with a state-machine body; capturing state renders a "Read this for me" button that POSTs to `/api/triage` (Claude Sonnet 4.6 + `web_search` tool, atomic state transitions via SECURITY DEFINER RPCs). Multi-round Q&A ships in `triage-conversation` (row #2).
- **Decide.** Dual-path view — DIY card and Contractor card side by side. Expand either path for full materials / gotchas / contractor questions. Commitment is a separate, explicit action ("Choose DIY" / "Choose Contractor"). User can modify app cost estimates with their own information.
- **Plan / Monitor / Close.** PLANNED holds a decision waiting for conditions (materials, contractor scheduled). MONITOR runs an app-set or ad-hoc check-in cadence with photo history. After every check-in the card returns to DECIDE. CLOSE logs spend and pairs the before/after photos.
- **Dismiss + Restore.** DISMISS is a first-class state, not a delete. Restoring uses one weekly triage session and re-enters TRIAGE_PENDING with the full prior context (Q&A + monitoring photo history) carried into the diagnostic thread. v0 surface: `/(app)/dismissed` lists dismissed cards with a symmetric inline-confirm Restore strip; the DISMISS entry point (button face on DECIDE / MONITOR) ships with rows #4 / #7.
- **Compare photos.** Available at every state where a card has 2+ photo touchpoints. Side-by-side, sync zoom, bounce mode (rapid toggle between dates at user-adjustable cadence). Screenshot-ready layout with Home OS wordmark.
- **Settings: usage tracker + BYOK.** Usage block shows weekly AI-triage session count with a fill-color shift at limit (calm indigo → terracotta). Optional Anthropic API key for unlimited triage; first-time vs returning UI states.

## Features

### Capture & Triage

- Photo + description capture flow (camera-aware on mobile, file-input fallback)
- Two-phase AI triage with persistent diagnostic thread on the card
- Severity tiers — Act Soon / Watch / Note — color + label, never color alone
- TRIAGE_PENDING / TRIAGE_PROVISIONAL / TRIAGE_CONFIRMED state machine
- Location ask as a free conversational round outside the 3-question limit

### Decide & Plan

- Dual-path Decide UI with side-by-side DIY and Contractor cards
- User-modifiable cost estimates; "Reset to app estimate" link
- Manual-path Decide (when weekly limit reached) with same UI — constraint in copy only
- PLANNED never overdue by default; optional user-set reminder lifts to dashboard Tier 1

### Monitor & Close

- App-set monitoring cadence with visible reasoning
- Multi-photo check-in sets (wide / zoom / detail) with "capture with reference"
- Walkthrough mode batches stale items into a single dashboard prompt
- Photo comparison: sync zoom, bounce mode, screenshot-ready output

### Lifecycle

- DISMISS as named, reversible state; bulk-manage and restore-with-context
- CLOSE logs spend; before/after pair available as a comparison

### Dashboard

- Tiered card list — Tier 1 (Act Soon + reminder-due PLANNED), Tier 2 (MONITOR overdue)
- PLANNED tab with dot indicator when any reminder is due
- Two empty-state shapes — first-time vs nothing-active (PLANNED at full weight)
- User can reorder cards manually; AI-suggested severity always visible

### Settings

- Weekly AI-triage usage block with proportionate progress-bar fill
- BYOK Anthropic API key entry with first-time vs returning UI states

## Out of scope (intentionally)

- Multi-property / property-manager features (Phase 2 candidate at best)
- Light mode (Phase 1 is dark mode by design — calm warm-charcoal ground)
- AI photo change detection (Phase 1 comparison is human-only)
- Contractor scheduling / payment processing (the app helps the homeowner prepare for a contractor visit, not arrange it)
- A celebratory animation on CLOSE — the before/after photo pair is the satisfaction moment

## Where to look next

- [ARCHITECTURE.md](./ARCHITECTURE.md) — how it's built, components, data flow, deployment
- [PLAN.md](./PLAN.md) — what's being built right now (Active + Planned PRs)
- [PRODUCT-ROADMAP.md](./PRODUCT-ROADMAP.md) — long-term / deferred features
- [BUILD-LOG.md](./BUILD-LOG.md) — what has shipped, in chronological order
- [CLAUDE.md](./CLAUDE.md) — the always-loaded entry point with path map + gotchas
- [.gstack/design-review-home-os-2026-05-02.md](.gstack/design-review-home-os-2026-05-02.md) — full design spec (the source of truth for visual decisions)
