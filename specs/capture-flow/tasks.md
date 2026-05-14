# capture-flow — tasks

Tracker for `/ak-implement` on `feature/capture-flow`. Order matches
`specs/capture-flow/spec.md § Task order` (11 tasks). Single atomic commit
per task.

| #   | Task                                                                     | Status      | Commit SHA |
| --- | ------------------------------------------------------------------------ | ----------- | ---------- |
| 1   | Migration 006a + 006b (room_tag, week_start, dismissed enum, RPC)        | done        | 603591f    |
| 2   | Regenerate `supabase.types.ts` for migration 006                         | in_progress |            |
| 3   | `POST /api/card` route handler + `title-from-description` helper         | pending     |            |
| 4   | `POST /api/card/[id]/restore` route handler                              | pending     |            |
| 5   | `CaptureForm` client component (Path A photo + cap-hit preservation)     | pending     |            |
| 6   | `/capture` page server shell + `ExistingCardPicker` server component     | pending     |            |
| 7   | `/dismissed` list + `RestoreStrip` inline-confirm component              | pending     |            |
| 8   | `/home` Capture CTA + middleware gated-prefix extension                  | pending     |            |
| 9   | `METRICS.md` — three new rows (capture_started / completed / cap_hit)    | in_progress |            |
| 10  | `CLAUDE.md § Where Things Happen` — append entries per § Files to create | pending     |            |
| 11  | E2E `capture-flow.spec.ts` + extend `rls-isolation.spec.ts`              | pending     |            |

## Decisions

Judgment calls made during implementation that the spec didn't pre-resolve.

- **Task order: land T9 (METRICS.md) + T10 (CLAUDE.md docs) BEFORE T3-T8 surfaces.** The
  spec's § Task order placed T9 + T10 at the end (positions 9 + 10), but the
  pre-commit docs-freshness hook (`check-docs-freshness-project.sh`) blocks the
  introduction of a new route/page surface unless `CLAUDE.md § Where Things
Happen` and `ARCHITECTURE.md § Module map` are staged in the same commit,
  and blocks new `posthog.capture()` call sites without a matching `METRICS.md`
  row. The orchestrator brief explicitly authorized this reorder ("Reorder if
  needed"). Net effect: same set of 11 commits, just T9 and T10 land first as
  blanket docs commits covering all incoming surfaces (route handlers + pages
  - form + restore strip + middleware delta). The committed-but-not-yet-
    shipped paths still reflect the spec's design intent — the doc rows simply
    precede the source they describe by one or two commits.
