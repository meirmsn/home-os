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
| 9   | `METRICS.md` — three new rows (capture_started / completed / cap_hit)    | pending     |            |
| 10  | `CLAUDE.md § Where Things Happen` — append entries per § Files to create | pending     |            |
| 11  | E2E `capture-flow.spec.ts` + extend `rls-isolation.spec.ts`              | pending     |            |

## Decisions

Judgment calls made during implementation that the spec didn't pre-resolve.
Empty until a call is made.
