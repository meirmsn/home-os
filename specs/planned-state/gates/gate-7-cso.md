## Gate 7: /cso

**Outcome**: pass

Daily-mode shard (8/10 confidence gate, zero noise) scoped to the `planned-state` diff vs `origin/main` (HEAD `5348d38`). Read the new PATCH route handler (`apps/web/app/api/card/[id]/reminder/route.ts`), its body parser (`_lib/parse-reminder-body.ts`), the additive migration (`supabase/migrations/20260517214500_012_planned_reminder.sql`), the four new/extended UI components (`ReminderEditor`, `ReminderDueChip`, `BeforeCloseSummary`, `PlannedView`, `_reminder-chip.ts`), the page wiring in `cards/[id]/page.tsx`, and the route's paired unit tests. Validated against the prior-art trust-boundary posture established by PR #27 (decide-state) and PR #26 (estimate-override). Variant grep across the diff surface for `service_role` / `SECURITY DEFINER` / `dangerouslySetInnerHTML` / `eval(` / `new Function(` returned zero hits.

The trust boundaries audited:

| Boundary            | Defense                                                                                                                                                                                                                        | Status |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Anonymous PATCH     | `supabase.auth.getUser()` → 401 (route.ts:32-37)                                                                                                                                                                               | PASS   |
| Body shape          | strict ISO regex + UTC round-trip (`parse-reminder-body.ts:45-68`) — Feb 30 / month 13 / `06/15/2026` all rejected                                                                                                             | PASS   |
| UUID param          | `^[0-9a-f]{8}-...-[0-9a-f]{12}$` regex (route.ts:22-23, 40-45)                                                                                                                                                                 | PASS   |
| Tenant isolation    | RLS `cards_update_own` (`auth.uid() = user_id` on both `using` + `with check`, migration 003) via user-context SSR client; **no SECURITY DEFINER**                                                                             | PASS   |
| State-guard race    | `.eq('state', 'planned')` in the UPDATE WHERE clause — concurrent decide/monitoring re-commits return 0 rows, never overwrite                                                                                                  | PASS   |
| 404 vs 409 disambig | re-read scoped through RLS — cannot probe other users' cards (mirrors `decide/route.ts` posture)                                                                                                                               | PASS   |
| Migration 012       | `ADD COLUMN IF NOT EXISTS` + partial index; no enum touched, no function dropped; migration 008's default-privileges block covers the new column (column grants inherit from table)                                            | PASS   |
| PostHog events      | fire client-side post-200 only (no optimistic capture); props are `card_id` (own uuid, RLS-scoped, unguessable per precedent #2), date strings (own dates, no PII), `days_out` integer — precedent #9 covers non-PII telemetry | PASS   |
| CSRF                | PATCH + `content-type: application/json` is not a CORS simple request; no `Access-Control-Allow-Methods: PATCH` header is set anywhere, so cross-origin preflight blocks abuse (same posture as PR #27)                        | PASS   |
| Sentry tags         | static strings (`route` + `stage`); no user-controlled input concatenated into tag values                                                                                                                                      | PASS   |

Variant-grep across the four UI files and the migration confirmed no service-role bypass, no SECURITY DEFINER (the only mention is the route's docstring explicitly stating it doesn't use one), no `dangerouslySetInnerHTML`, no `eval(`, no `new Function(`. No candidate finding clears the daily-mode 8/10 confidence gate.

### Dismissals

- **PostHog `card_id` in events** — UUIDs are unguessable per FP precedent #2; the event lands on the user's own distinct_id with their own card's uuid. Not a finding.
- **PostHog `reminder_date` / `from_date` / `to_date` in events** — user's own dates, no PII, no cross-tenant data. Precedent #9 covers non-PII telemetry. Not a finding.
- **No client-side min/max on `<input type="date">`** — D5 explicitly allows past dates ("remind me yesterday" is a deliberate user gesture). The server-side regex + round-trip is the trust boundary; client `<input type="date">` is a UX affordance. Not a finding.
- **No CHECK constraint on `planned_reminder_date` for past/future dates** — D1 + D5 explicitly allow past dates. Absence of a redundant DB-level constraint is not a vulnerability (FP precedent: missing hardening is not a finding unless it's a concrete risk).
- **`humanReminderDate` uses `toLocaleDateString` with user agent's default locale** — purely presentational; the underlying ISO date is the storage shape. Locale-driven label rendering is not a security boundary.
- **`<a target="_blank">` sources list in `cards/[id]/page.tsx`** — already carries `rel="noopener noreferrer"` (line 461); not touched by this PR, but verified during the page-wiring read.
- **Middleware doesn't gate `/api/card/...`** — by design. API routes return 401 JSON envelopes (route.ts:35-37) rather than 307 to `/login`. Same pattern as PR #4 (triage), PR #26 (estimate), PR #27 (decide). Not a finding.

---

**This tool is not a substitute for a professional security audit.** /cso is an AI-assisted scan that catches common vulnerability patterns — it is not comprehensive, not guaranteed, and not a replacement for hiring a qualified security firm. LLMs can miss subtle vulnerabilities, misunderstand complex auth flows, and produce false negatives. For production systems handling sensitive data, payments, or PII, engage a professional penetration testing firm. Use /cso as a first pass to catch low-hanging fruit and improve your security posture between professional audits — not as your only line of defense.
