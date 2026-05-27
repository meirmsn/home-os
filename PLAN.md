# Plan

Forward-looking plan at the feature/PR grain, scoped to one version at a time.

- **Current version**: the `## Planned` header declares which version is active (e.g., `v0`). Only items from that tier (and relevant TODOS) belong in Planned. Higher tiers stay in PRODUCT-ROADMAP/TODOS until the current version ships.
- Pipeline phase per active branch: each feature's `specs/<name>/tasks.md`
- Shipped (rich history): `BUILD-LOG.md`
- Long-form context per row: `PRODUCT-ROADMAP.md` / `TODOS.md` (linked from each row)
- Deferred / long-term: `PRODUCT-ROADMAP.md`
- Tactical bugs/polish: `TODOS.md`
- Plan history (including dropped rows): `git log --follow PLAN.md`

## How to add entries

Each Planned row is one feature / one PR. Long-form context (problem statement, full fix, sources) lives in `PRODUCT-ROADMAP.md` or `TODOS.md` — the Hook column is the one-sentence summary, not the spec.

**Columns**:

- `Feature` — kebab-case slug. The row's identifier. Used in all cross-references (commits, PRODUCT-ROADMAP, TODOS, Deps cells). Should match the source PRODUCT-ROADMAP/TODOS section anchor where possible.
- `Hook` — one sentence (≤ 120 chars) describing what shipping the row does. The observable change, not the mechanism.
- `Impact` — glyph + size + em-dash + short sentence about the payoff.
- `Risk` — glyph + size + em-dash + short sentence about what happens if skipped.
- `Cost` — glyph + size + em-dash + wallclock estimate.
- `Lev` — `Leverage = (impact_num × risk_num) ÷ cost_divisor`. Higher = sooner. Sort the table by this descending.
- `Deps` — blockers / ordering / defer signals. Empty means "unblocked, can start".
- `Source` — pointer to long-form context. Shape: `` `PRODUCT-ROADMAP.md` `` (file path in its own code span) + `§` (separator) + the section heading text copied verbatim from the source file (preserving any inline-code backticks the heading contains). Truncate at the first `—` or `→` when the full heading is >70 chars AND the truncated form remains unambiguous.

**Rating scale** (uniform across Impact / Risk / Cost):

| Glyph | Size | Impact if shipped                              | Risk if skipped                                        | Cost wallclock |
| ----- | ---- | ---------------------------------------------- | ------------------------------------------------------ | -------------- |
| 🟢🟢  | XS   | housekeeping                                   | aesthetic only                                         | 15–30 min      |
| 🟢    | S    | closes a recurring papercut                    | friction on uncommon path                              | 30–60 min      |
| 🟡    | M    | saves measurable time per cycle                | friction on common path                                | 1.5–3 hr       |
| 🔴    | L    | closes a major UX/ergonomics gap               | recurring tax, ongoing operator cost                   | 4–8 hr         |
| 🔴🔴  | XL   | closes a class of bug for every future project | active prod/security exposure or every project blocked | >8 hr          |

**Numeric mapping for the formula**: XS=1, S=2, M=3, L=4, XL=5 (risk + impact). Cost divisors: XS=0.25, S=0.75, M=2.5, L=5, XL=9.

**Deps glyphs**:

- ⛔ `<feature>` — blocked on `<feature>`; can't start until it lands.
- ⚠ — decision item or verify-usage-first; might auto-close.
- ⓘ after `<feature>` — ordering constraint, no hard block (e.g., same surface, conflicts if reversed).

**Lifecycle**:

- A Planned row becomes Active when `/ak-spec` runs (add `Branch` + `Spec` columns to the Active table).
- **Before implementing**: validate the entry still applies — context shifts, earlier work subsumes the need, constraints disappear. Surface concerns before coding.
- A row ships → delete from Planned/Active, close the source PRODUCT-ROADMAP/TODOS entry, append a BUILD-LOG entry. The BUILD-LOG entry is the durable record; the PR body is the delivery mechanism.
- A row is dropped (rescope, dead) → delete it. Commit message carries the rationale.
- "Not now, maybe later" work belongs in `PRODUCT-ROADMAP.md`, not Planned.
- **Version transitions**: when every Planned row for the current version has shipped or been dropped, bump the `## Planned` header to the next tier (e.g., `v0` → `v1`), pull in items from that PRODUCT-ROADMAP tier, and score/sort them.

## Active

_No work in progress._

## Planned (v0)

v0 Phase 1 — sorted by Leverage descending. Each row is one `/ak-build` cycle, one PR. Deps use feature names so reordering doesn't break cross-references.

| Feature                         | Hook                                                                                       | Impact                                                                          | Risk                                                                                     | Cost           | Lev     | Deps                                        | Source                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------- | ------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `monitor-beta`                  | Monitor-path cards gain AI-set check-in cadence, multi-photo capture, and walkthrough mode | 🔴 L — Monitor is a primary decision outcome; without it the path is a dead end | 🔴 L — users who chose Monitor have no follow-through surface                            | 🔴 L — ~5–7 hr | **3.2** | —                                           | ceo-review § Scope (MONITOR) + eng-review § Build Order step 10 + design-review § MONITOR (Beta) |
| `dashboard`                     | Tiered priority card list replaces the flat home page with Act Soon / overdue hierarchy    | 🔴 L — primary navigation surface; flat list fails past 3–4 cards               | 🔴 L — equal visual weight on all cards triggers the anxiety spiral the product prevents | 🔴 L — ~5–8 hr | **3.2** | ⛔ `monitor-beta`, ⛔ `photo-comparison-ui` | ceo-review § Scope (Dashboard) + design-review § Dashboard — Filtered Card List                  |
| `photo-comparison-ui`           | Side-by-side sync-zoom photo comparison with bounce mode on cards with 2+ photos           | 🟡 M — "show me the difference" surface for multi-photo cards                   | 🟢 S — users can scroll photos manually; absence is friction on uncommon path            | 🟡 M — ~2–3 hr | **2.4** | ⛔ `monitor-beta`                           | ceo-review § Scope (Photo comparison) + design-review § Photo Comparison UI                      |
| `triage-eval-dataset`           | 75 synthetic issues + eval runner that gates every prompt change on regression accuracy    | 🟡 M — quality floor for the AI core; makes triage trustworthy over time        | 🔴 L — every prompt change ships without regression detection                            | 🔴 L — ~5–7 hr | **2.4** | —                                           | eng-review § Pre-Ship Requirements #2 + § Build Order step 15                                    |
| `contractor-question-retrieval` | Retrieval view groups contractor questions by type with a 30-day appointment nudge         | 🟢 S — aggregation convenience; questions already exist on individual cards     | 🟢 S — users find questions per-card; friction only with many contractor-path cards      | 🟡 M — ~2–3 hr | **1.6** | ⛔ `monitor-beta`                           | ceo-review § Scope (Contractor question tags) + eng-review § Build Order step 13                 |

**Phase 1 ship gate**: all Planned rows green + `.gstack/pwa-spike-result.md` documented + eval runner clean + multi-user RLS test green = ready for first-user invites.

**Trim candidates if scope is too wide** (per ceo-review § Sequencing):

- `photo-comparison-ui` sync zoom + bounce → side-by-side only (PWA spike may force this anyway)
- `contractor-question-retrieval` retrieval view → fold into `dashboard` as a manual filter

<!--
Maintenance conventions:
- Status lives in section membership (Active vs Planned) — no status column.
- Planned header carries the current version in parens: `## Planned (v0)`.
- Planned ordered by Leverage descending; ties on dependencies (Deps column).
- Feature slug is the row's identifier — used in all cross-references. Never rename in place; if a row's scope changes meaningfully, delete + add a new row.
- Hook stays ≤ 120 chars. Long-form context goes to PRODUCT-ROADMAP/TODOS, not the table cell.
- Source column splits the file path into its own code span so inline-code backticks inside the heading text render correctly — markdown can't nest code spans, so a single outer wrap eats the inner backticks.
- Version transitions: bump the parens when every row for the current tier has shipped or been dropped. Pull in items from the next PRODUCT-ROADMAP tier, score, sort.
-->
