# capture-flow — tasks

Tracker for `/ak-implement` on `feature/capture-flow`. Order matches
`specs/capture-flow/spec.md § Task order` (11 tasks). Single atomic commit
per task.

| #   | Task                                                                  | Status      | Commit SHA |
| --- | --------------------------------------------------------------------- | ----------- | ---------- |
| 1   | Migration 006a + 006b (room_tag, week_start, dismissed enum, RPC)     | done        | 603591f    |
| 2   | Regenerate `supabase.types.ts` for migration 006                      | done        | 2f8a0af    |
| 3   | `POST /api/card` route handler + `title-from-description` helper      | done        | 763f4c5    |
| 4   | `POST /api/card/[id]/restore` route handler                           | done        | e2bccc4    |
| 5   | `CaptureForm` client component (Path A photo + cap-hit preservation)  | done        | edc968e    |
| 6   | `/capture` page server shell + `ExistingCardPicker` server component  | done        | 71cd8a3    |
| 7   | `/dismissed` list + `RestoreStrip` inline-confirm component           | in_progress |            |
| 8   | `/home` Capture CTA + middleware gated-prefix extension               | pending     |            |
| 9   | `METRICS.md` — three new rows (capture_started / completed / cap_hit) | done        | f4b3dc8    |
| 10  | `CLAUDE.md` + `ARCHITECTURE.md` + `OVERVIEW.md` doc entries           | done        | 9443254    |
| 11  | E2E `capture-flow.spec.ts` + extend `rls-isolation.spec.ts`           | pending     |            |

## Decisions

Judgment calls made during implementation that the spec didn't pre-resolve.

- **Task order: land T9 (METRICS.md) + T10 (CLAUDE.md docs) BEFORE T3-T8 surfaces.** The
  spec's § Task order placed T9 + T10 at the end (positions 9 + 10), but the
  pre-commit docs-freshness hook (`check-docs-coverage-project.sh`) blocks the
  introduction of a new route/page surface unless `CLAUDE.md § Where Things
Happen` and `ARCHITECTURE.md § Module map` are staged in the same commit,
  and blocks new `posthog.capture()` call sites without a matching `METRICS.md`
  row. The orchestrator brief explicitly authorized this reorder ("Reorder if
  needed"). Net effect: same set of 11 commits, just T9 and T10 land first as
  blanket docs commits covering all incoming surfaces (route handlers + pages
  - form + restore strip + middleware delta). The committed-but-not-yet-
    shipped paths still reflect the spec's design intent — the doc rows simply
    precede the source they describe by one or two commits.
