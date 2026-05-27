# Tasks: monitor-beta

## Decisions

- D1: New `check_ins` table. Photos link via `card_photos.touchpoint_id = check_in.id` with `touchpoint_type='checkin'`.
- D2: Add `'checkin'` to `touchpoint_type` enum via rename-recreate.
- D3: Atomic RPC `record_checkin` — INSERT check_ins + UPDATE cards.next_check_at.
- D4: `<MonitorView />` server component replacing the stub at page.tsx:633-637.
- D5: Inline expansion check-in form (same pattern as CloseCardForm).
- D6: Walkthrough mode deferred to `dashboard` PR.
- D7: "Change path" button POSTs to `/api/card/[id]/decide` with `{ path: 'decide' }`.
- D8: Three PostHog events: `monitor_checkin_submitted`, `monitor_view_opened`, `monitor_cadence_changed`.

## Task order

### Task 1: Migration 015

- Creates: `supabase/migrations/YYYYMMDDHHMMSS_015_monitor_beta.sql`
- Updates: `supabase/README.md`
- Status: pending

### Task 2: POST /api/card/[id]/checkin route + tests

- Creates: `apps/web/app/api/card/[id]/checkin/route.ts`, `route.test.ts`
- Depends on: Task 1
- Status: pending

### Task 3: PATCH /api/card/[id]/cadence route + tests

- Creates: `apps/web/app/api/card/[id]/cadence/route.ts`, `_lib/parse-cadence-body.ts`, `route.test.ts`
- Depends on: Task 1
- Status: pending

### Task 4: CheckInTimeline server component + tests

- Creates: `CheckInTimeline.tsx`, `CheckInTimeline.test.tsx`
- Depends on: nothing
- Status: pending

### Task 5: CheckInForm client component + tests

- Creates: `CheckInForm.tsx`, `CheckInForm.test.tsx`
- Depends on: Task 2
- Status: pending

### Task 6: CadenceEditor client component + tests

- Creates: `CadenceEditor.tsx`, `CadenceEditor.test.tsx`
- Depends on: Task 3
- Status: pending

### Task 7: MonitorViewOpenedCapture client component + tests

- Creates: `MonitorViewOpenedCapture.tsx`, `MonitorViewOpenedCapture.test.tsx`
- Depends on: nothing
- Status: pending

### Task 8: MonitorView server component + tests

- Creates: `MonitorView.tsx`, `MonitorView.test.tsx`
- Depends on: Tasks 4, 5, 6, 7
- Status: pending

### Task 9: Card detail page integration + METRICS.md + CLAUDE.md

- Modifies: `page.tsx`, `METRICS.md`, `CLAUDE.md`
- Depends on: Task 8
- Status: pending
