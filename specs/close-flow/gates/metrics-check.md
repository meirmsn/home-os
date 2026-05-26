## Gate 2: metrics-check

**Result: pass**

Verified every `posthog.capture(...)` and `Sentry.captureException(...)` / `Sentry.captureMessage(...)` call site in the diff from main against METRICS.md.

### Call sites in the diff

| #   | Call                                                                                                                                               | File                                                          | Event name / message       | METRICS.md row | Match                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | `posthog.capture('card_close_started', { card_id })`                                                                                               | `apps/web/app/(app)/cards/[id]/_components/CloseCardForm.tsx` | `card_close_started`       | Row 38         | exact match — event name, properties (`card_id`), file path, and description ("taps Mark as closed / form expand") all align. |
| 2   | `posthog.capture('card_closed', { card_id, chosen_path, has_spend_log, has_finished_photo, days_in_planned })`                                     | `apps/web/app/(app)/cards/[id]/_components/CloseCardForm.tsx` | `card_closed`              | Row 39         | exact match — all five properties documented. `days_in_planned` noted as approximate (Gotcha #8).                             |
| 3   | `Sentry.captureException(uploadError, { tags: { route: 'POST /api/card/[id]/close', stage: 'storage_upload' }, extra: { card_id, user_id } })`     | `apps/web/app/api/card/[id]/close/route.ts`                   | storage_upload stage       | Row 40         | exact match — stage name, tags, extra keys all match the documented row.                                                      |
| 4   | `Sentry.captureException(insertError, { tags: { route: 'POST /api/card/[id]/close', stage: 'card_photos_insert' }, extra: { card_id, user_id } })` | `apps/web/app/api/card/[id]/close/route.ts`                   | card_photos_insert stage   | Row 40         | exact match — covered by the same METRICS.md row (multi-stage).                                                               |
| 5   | `Sentry.captureException(rpcError, { tags: { route: 'POST /api/card/[id]/close', stage: 'close_card' }, extra: { card_id, user_id } })`            | `apps/web/app/api/card/[id]/close/route.ts`                   | close_card stage           | Row 40         | exact match — third stage in the same row.                                                                                    |
| 6   | `Sentry.captureMessage('close_card returned no row', { level: 'warning', tags: { route: 'POST /api/card/[id]/close' } })`                          | `apps/web/app/api/card/[id]/close/route.ts`                   | close_card returned no row | Row 41         | exact match — message, level, tags all align.                                                                                 |

### Summary

- 6 call sites in the diff; 6 matching rows in METRICS.md.
- Event names, property sets, file paths, and tag/extra keys are all accurate.
- No orphaned call sites (code without METRICS.md row).
- No stale METRICS.md rows pointing at non-existent code (rows 38-41 all reference files that exist in the diff).

## Dismissals

None
