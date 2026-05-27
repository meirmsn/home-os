## Gate 2: metrics-check

**Result: pass**

### Scope

Changed files: 26 (via `git diff --name-only origin/main...HEAD`).
Non-test `.ts`/`.tsx` source files with capture calls: 6.

### Forward check: every call site in the diff has a METRICS.md row

| #   | Event / Message                                                                                                              | File                           | METRICS.md |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------- |
| 1   | `monitor_checkin_submitted` (posthog)                                                                                        | `CheckInForm.tsx`              | Row exists |
| 2   | `monitor_view_opened` (posthog)                                                                                              | `MonitorViewOpenedCapture.tsx` | Row exists |
| 3   | `monitor_cadence_changed` (posthog)                                                                                          | `CadenceEditor.tsx`            | Row exists |
| 4   | `Sentry.captureException` — `POST /api/card/[id]/checkin` (stages: `record_checkin`, `storage_upload`, `card_photos_insert`) | `checkin/route.ts`             | Row exists |
| 5   | `Sentry.captureMessage` — `record_checkin returned no row`                                                                   | `checkin/route.ts`             | Row exists |
| 6   | `Sentry.captureException` — `PATCH /api/card/[id]/cadence` (stages: `update`, `lookup`)                                      | `cadence/route.ts`             | Row exists |
| 7   | `Sentry.captureException` — `cards SELECT errored on detail page` (pre-existing)                                             | `page.tsx`                     | Row exists |
| 8   | `Sentry.captureMessage` — `cards SELECT returned no row on detail page` (pre-existing)                                       | `page.tsx`                     | Row exists |

### Reverse check: new METRICS.md rows reference real call sites

All 6 new rows (lines 46-51 of METRICS.md) were verified against their declared source files. Each file contains the expected capture call.

### Summary

All 3 new PostHog events and 3 new Sentry instrumentation rows added in this branch are documented in METRICS.md, and every METRICS.md entry points to a file that contains the corresponding call site.

## Dismissals

None
