## Gate 6: /review

**Outcome**: findings (3) — pending

Pre-landing review against `origin/main` (HEAD `5348d38`, 26 files, +3436 / -61). Reviewed: migration 012 (additive `cards.planned_reminder_date` + partial index on `state='planned' AND planned_reminder_date IS NOT NULL`), `PATCH /api/card/[id]/reminder` route + `_lib/parse-reminder-body.ts`, the four UI surfaces (`ReminderEditor`, `ReminderDueChip`, `BeforeCloseSummary`, `<PlannedView />` extension), `cards/[id]/page.tsx` SELECT extension + chip mount, E2E spec, docs deltas. Halt-on-find posture: surface only; orchestrator routes by severity.

Core safety surfaces are clean:

- **SQL safety**: Migration 012 is plain additive (`ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`). No rename-recreate, no function-dependency dance. Partial index correctly casts `'planned'::public.card_state` and double-predicates on `planned_reminder_date IS NOT NULL` — small + useful for the PR #4 dashboard reader. Migration 008's `ALTER DEFAULT PRIVILEGES` covers the new column (no per-column GRANT needed).
- **Trust boundaries**: Body parser is strict — regex `/^\d{4}-\d{2}-\d{2}$/` + UTC `Date.UTC` round-trip rejects `'2026-13-45'`, Feb 30, Apr 31, non-leap Feb 29, day=00, month=00, regex-suffix bypass (`'2026-06-15extra'`). The user-PATCH trust boundary is the only thing standing between auth'd users and a `cards.planned_reminder_date` UPDATE; defended.
- **RLS posture**: Direct user-context UPDATE with `.eq('id', id).eq('state', 'planned')`. RLS enforces ownership; the explicit `.eq('state', 'planned')` adds defense-in-depth state guard (spec § Gotchas #4). 404-vs-409 disambig matches PR #27's `/decide` route posture.
- **Race conditions**: Single-row UPDATE with state filter is atomic. Concurrent state flip between SELECT and UPDATE collapses to "no row updated" → re-read disambig path → correct 404/409. No window for incorrect 200.
- **Enum completeness**: `CardState` type lists all 8 values (capturing/triaging/diagnosed/decide/planned/monitoring/closed/dismissed); page.tsx body switch handles each branch.
- **LLM trust boundary**: N/A — this PR has no LLM surface.
- **Auth race**: `cards/[id]/page.tsx` keeps the explicit `getUser()` + `redirect('/login?next=…')` defense-in-depth pattern; new SELECT column threaded through correctly.
- **PostHog timing**: All three events fire AFTER PATCH 200 (Gotcha #6 honored); `had_future_date` snapshot from `props.plannedReminderDate` (pre-clear) is the right discriminator for set-vs-ack regret.
- **E2E**: 5 cases per spec § Tests § E2E. Cookie-injection pattern matches `decide-state.spec.ts` / `triage-conversation.spec.ts`. Skips gracefully on non-local Supabase.

### Findings

| # | Severity | Conf | File:line | Finding | Recommended action |
|---|---|---|---|---|---|
| 1 | low | 8/10 | `apps/web/app/api/card/[id]/reminder/route.ts:36` vs `specs/planned-state/spec.md:303` | Spec § Error states says 401 body is `{ error: 'unauthenticated' }` but implementation returns `{ error: 'unauthorized' }`. Implementation is consistent with sibling routes (`/decide` line 39, `/estimate` line 39) — so this is a spec doc drift, not a code defect. | Update spec to `unauthorized` for consistency. No code change. Mechanical fix candidate. |
| 2 | low | 8/10 | `apps/web/app/api/card/[id]/reminder/route.test.ts` | State-guard test covers 5 of 7 non-planned states (decide/diagnosed/monitoring/closed/dismissed). Spec § Gotchas #4 explicitly lists all 6 + decide as the canonical set to assert against. Missing explicit cases: `capturing`, `triaging`. The route's `.eq('state', 'planned')` clause means all non-planned states collapse to identical disambig logic, so this is genuinely a coverage gap (not a defect risk) — the unit test asserts the wire path, not the state value. | Add two it() cases asserting 409 for `capturing` + `triaging` rows. Mechanical fix candidate (~6 lines, copy the existing `decide` case twice). |
| 3 | cosmetic | 9/10 | `apps/web/app/(app)/cards/[id]/_components/ReminderEditor.tsx:52` | Spec § Gotchas #9 recommends `Math.floor((reminderMs - todayMs) / 86400000)` but implementation uses `Math.round(...)`. Functionally identical at runtime — both sides are UTC-midnight aligned, so the subtraction is always an exact integer multiple of 86400000, and `Math.round` / `Math.floor` agree on integers. Cosmetic spec/code drift only. | Either update spec to say `Math.round` OR change code to `Math.floor` for spec-literal compliance. Zero behavior change either way. Mechanical fix candidate. |

All three findings are low/cosmetic severity. No critical, no high-confidence-medium. The Fix-First heuristic would auto-fix #2 and #3 in a non-halt-on-find pass; surfacing them here per the gate's halt-on-find posture so the orchestrator routes appropriately.

### Dismissals

- **`humanReminderDate` uses `toLocaleDateString(undefined, …)` on the SSR server** — pre-existing pattern in `cards/[id]/page.tsx:94` (`humanDate(card.created_at)`). Server-side locale resolution risk is identical to that existing surface; not a new defect. Dismissed as pre-existing.
- **`Math.round` vs `Math.floor` impact under DST** — both sides are anchored to UTC midnight via `Date.UTC(...)` and `T00:00:00.000Z`. DST shifts wall clocks, not UTC offsets, so the subtraction stays an integer multiple of 86400000. No drift window. Dismissed.
- **Route does not fire PostHog events** — spec D8 explicitly puts event firing in the client component (`<ReminderEditor />`), not the route. Matches PR #27's `decide_path_chosen` posture (event fires from `<ChoosePath />`, not from `/decide` route). Not a defect.
- **No `min`/`max` on `<input type="date">`** — spec § Gotchas #12 explicitly states this is intentional (D5 allows past + future). Not a defect.
- **No SQL view for `is_reminder_due`** — spec D7 explicitly defers centralization until PR #4 (dashboard) has a real consumer with its own query shape. Two-consumer-zero-infrastructure is the right shape; YAGNI is documented in spec § Gotchas #7. Not a defect.
- **Migration 012 has no `updated_at` trigger update** — spec D1 explicitly notes the existing `cards_updated_at` BEFORE UPDATE trigger from migration 005 already covers row touches. Not a defect.
