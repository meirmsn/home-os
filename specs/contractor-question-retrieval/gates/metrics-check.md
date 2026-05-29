## Gate 2: metrics-check

- Result: pass

Both D4 events have METRICS.md rows (lines 56-57) AND matching capture call
sites with prop shapes that exactly match the documented schema:

- `contractor_questions_view_opened` { group_count, total_question_cards }
  → ContractorQuestionsViewOpenedCapture.tsx:43 (once-per-session sentinel).
- `contractor_appointment_nudge_shown` { contractor_type, question_count,
  oldest_card_days } → ContractorAppointmentNudge.tsx:42 (per rendered banner).
  No undocumented capture sites; no documented-but-unwired events.

## Dismissals

None
