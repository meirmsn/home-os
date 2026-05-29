## Gate 7: /cso

**Mode:** DAILY (zero-noise, 8/10 confidence gate) · **Scope:** PR diff `origin/main...HEAD` · **Branch:** `feat/contractor-question-retrieval` · **HEAD:** `477903a`

**Verdict: PASS — 0 findings.**

Read-only presentation feature: new authenticated route `/contractor-questions` (server component) that does one RLS-scoped `cards` SELECT and renders grouped contractor questions. No new migration, no new API route, no secrets, no new external/outbound calls, no new npm deps. The diff is UI + a pure grouping lib + 2 PostHog events + docs/tests.

### Attack surface (diff-scoped)

- **Code surface added:** 1 authenticated route (`/contractor-questions`), 0 public/admin/API endpoints, 0 upload points, 0 webhook receivers, 0 background jobs.
- **Infra surface added:** 0 — no migration, no CI workflow change, no Dockerfile/IaC, no env vars.
- **External calls added:** 0 (PostHog `posthog-js` already wired; events are client-side analytics).
- **Secret management:** unchanged (no secrets touched in the diff).

### Verified-clean checks (the 5 focus areas)

1. **Auth bypass — VERIFIED CLEAN.** `page.tsx:29-35` resolves the user via `supabase.auth.getUser()` — the server-validated method (round-trips the Auth server to verify the JWT), NOT `getSession()` (which the FP precedents and Supabase docs warn against for trust decisions). `if (!user) redirect('/login')`. The `(app)` route group layout is the existing second gate. No unauthenticated path to the data.

2. **RLS scoping (owner cannot read other users' cards) — VERIFIED CLEAN.** The SELECT (`page.tsx:39-43`) goes through `@/lib/supabase/server` `createClient()`, which builds a cookie-backed client with the **anon key** (`server.ts` — `NEXT_PUBLIC_SUPABASE_ANON_KEY`), NOT the service-role key. Postgres RLS policy `cards_select_own` (`003_rls_tables.sql:28-29`, hardened to the subquery form `(select auth.uid()) = user_id` in `016_advisor_hardening.sql:59`) constrains every returned row to `user_id = auth.uid()`. The deliberate absence of an explicit `owner_id`/`user_id` filter is correct and safe — RLS is the enforcement boundary, mirroring `home/page.tsx`. There is no service-role client, no `rpc()` with `SECURITY DEFINER` reached from this route, and no raw SQL. An attacker authenticated as user A cannot enumerate user B's cards.

3. **Injection via free-text question strings rendered to DOM — VERIFIED CLEAN.** The LLM/user-sourced strings (`questions_for_contractor[]`, card `title`/`initial_description`) render as React text children — `ContractorQuestionsView.tsx:96` (`{card.title}`), `:101` (`<li>{q}</li>`), and the nudge copy in `ContractorAppointmentNudge.tsx:55-56`. React auto-escapes text nodes (FP precedent #4). No `dangerouslySetInnerHTML`, `innerHTML`, `.html()`, `eval`, `Function`, or `new Function` anywhere in the diff (grep-confirmed). The jsonb is additionally run through the shared `parseContractorExpansion` validator (`group-contractor-questions.ts:95`) before any field is read — invalid shapes exclude the card rather than rendering raw. No stored/reflected XSS path.

4. **PII in the 2 new PostHog event payloads — VERIFIED CLEAN.**
   - `contractor_questions_view_opened` (`ContractorQuestionsViewOpenedCapture.tsx:43-46`): `{ group_count, total_question_cards }` — integer counts only.
   - `contractor_appointment_nudge_shown` (`ContractorAppointmentNudge.tsx:42-46`): `{ contractor_type, question_count, oldest_card_days }` — a closed-enum `contractor_tag` string (e.g. `'plumber'`) plus integer counts.
   - Neither payload carries card titles, question text, card UUIDs, `user.id`, email, or `users.location`. No card content or user identifier leaks into analytics. Matches spec D4 exactly.

5. **Data leakage in rendered output — VERIFIED CLEAN.** Only the authed owner's own (RLS-filtered) cards render. Sentry error capture (`page.tsx:46-56`) logs `user_id` + sanitized `error_message`/`error_code` to Sentry extras (server-side observability, not client output) — no card content, no secrets, consistent with the project's established error-capture posture. Card UUIDs appear only as React `key` props (`ContractorQuestionsView.tsx:64,91`), which are unguessable and owner-scoped (FP precedent #2) and are not part of any payload sent to a third party.

### Other diff observations (not findings)

- The Sentry `extra.user_id` is the authenticated user's own id under an error branch — standard observability, not a leak (logging non-PII server-side; the user owns this id).
- `cards.cost_estimate_hire` / `_override` jsonb is LLM-sourced but is validated at the trust boundary (`parseContractorExpansion`) and only ever rendered as escaped React text — no second-order injection.
- The `e2e/contractor-questions.spec.ts:141` `user_id: userId` insert is a test-fixture seed for the seeded test user, not a production event/payload (FP rule #10 — test fixtures).

### Filter stats

Candidates scanned: 0 high-signal hits surviving initial triage. Hard-exclusion filtered: 0. Confidence-gate filtered: 0. Verification filtered: 0. **Reported: 0.**

## Dismissals

No candidate findings reached the reporting threshold, so there are no confidence-gate or FP dismissals to record. For traceability, the patterns explicitly checked and cleared:

- **Missing explicit `owner_id` filter on the cards SELECT** — NOT a finding. RLS (`cards_select_own`) is the enforcement boundary via the anon-key client; an app-layer filter would be redundant. Dismissed under "RLS-scoped client is the contract" + FP precedent #5 (server, not client, owns authz).
- **LLM/user free-text rendered to the DOM** — NOT a finding. React escapes text children by default (FP precedent #4); no escape hatch (`dangerouslySetInnerHTML` etc.) present.
- **`user.id` in Sentry `extra`** — NOT a finding. Server-side observability of a non-secret, owner-held identifier (FP precedent #9: logging non-PII is not a vulnerability; the user owns their own id). It is never returned to the client.
- **`user_id` in the E2E spec seed** — NOT a finding. Test fixture (FP filter rule #10), not imported by non-test code.
- **`force-dynamic` on the route** — NOT a finding. Correct for an auth- + cookie-dependent server render; prevents static caching of per-user data (avoids a cross-user cache-leak class), so it is a hardening positive, not a risk.

---

_This tool is not a substitute for a professional security audit. /cso is an AI-assisted scan that catches common vulnerability patterns — it is not comprehensive, not guaranteed, and not a replacement for hiring a qualified security firm. For production systems handling sensitive data, payments, or PII, engage a professional penetration testing firm._
