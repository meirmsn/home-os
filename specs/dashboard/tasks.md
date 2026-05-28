# Dashboard Implementation Tasks

## Decisions

- D1: Skip photo-comparison-ui hard dep
- D2: Walkthrough mode included
- D3: Manual card reordering deferred
- D4: Contractor-question-retrieval excluded
- D5: Sort order storage N/A
- D6: 4 PostHog events: dashboard_viewed, dashboard_filter_changed, walkthrough_started, walkthrough_completed
- D7: No migration needed
- D8: TRIAGE_PENDING cards shown in Tier 2

## Tasks

- [x] Task 1: Dashboard data query + tiering logic
- [x] Task 2: DashboardCard component (Tier 1 + Tier 2 variants)
- [x] Task 3: FilterBar component (sticky tabs)
- [x] Task 4: Empty states (first-time + nothing-active)
- [x] Task 5: Walkthrough mode (prompt + session flow)
- [x] Task 6: Top bar queued-triage indicator
- [x] Task 7: Dashboard PostHog events
- [x] Task 8: Home page integration + tests
