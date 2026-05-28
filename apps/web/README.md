# apps/web

> Next.js 16 PWA — App Router pages, route handlers, edge middleware, components, observability wiring, E2E suite. The user-facing surface of home-os.
>
> For system-level context (deployment topology, data flow): [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md). For product-level context (what flows do): [`../../OVERVIEW.md`](../../OVERVIEW.md). For always-loaded context: [`../../CLAUDE.md`](../../CLAUDE.md).

## Structure

```
apps/web/
├── app/                       # App Router tree (routes + components co-located)
│   ├── layout.tsx             # Root layout — Inter font, PWA metadata, dark ground, <PostHogProvider> mount
│   ├── page.tsx               # Public `/` noscript-fallback (middleware bounces normal browsers to /login or /home)
│   ├── _components/           # Top-level client wrappers (PostHogProvider)
│   ├── (app)/                 # Auth-gated route group
│   ├── auth/                  # PKCE callback + sign-out route handlers
│   ├── login/                 # Magic-link sign-in form
│   └── api/                   # Route handlers (route.ts)
├── e2e/                       # Playwright suite + helpers
├── lib/                       # SSR Supabase clients + PostHog init
├── public/                    # PWA manifest + static assets
├── middleware.ts              # Edge middleware (session refresh + auth redirects)
├── instrumentation.ts         # Sentry server/edge init
├── sentry.{client,server,edge}.config.ts
└── next.config.ts             # CSP headers + sourcemap upload
```

## Routes

### Public

| Path     | File                                                         | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`      | `app/page.tsx`                                               | Noscript fallback (`<h1>home-os</h1>` + sign-in link). Normal browsers are 307-redirected by middleware before this renders. Covered transitively by `e2e/auth-edge-cases.spec.ts § landing-redirect cases`.                                                                                                                                                                                                                                                                                                        |
| `/login` | `app/login/page.tsx` + `app/login/_components/LoginForm.tsx` | Magic-link sign-in. Server-component shell reads `?error=callback_failed` and forwards to client form. Form calls `supabase.auth.signInWithOtp` with `emailRedirectTo = <window.location.origin>/auth/callback?next=/home`. Fires `posthog.capture('sign_in_requested', { method: 'magic_link' })` on success. 429 → rate-limit copy; other errors → generic + `Sentry.captureException`. Tests: `app/login/page.test.tsx` (7 cases); `LoginForm.tsx` is in `.devshop-test-coverage-exempt` (covered transitively). |

### Auth

| Path                 | File                         | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/callback` | `app/auth/callback/route.ts` | PKCE callback. Reads `?code` + `?next`, calls `exchangeCodeForSession(code)`, 303-redirects to `next` (default `/home`) on success or to `/login?error=callback_failed` on error/missing code. 303 (not 307/308) keeps `@supabase/ssr`'s cookie writes on the same response. `safeNext()` enforces `next` starts with `/` and is NOT protocol-relative (`//evil.example`); anything else falls back to `/home`. `export const dynamic = 'force-dynamic'`. Tests: 7 cases. |
| `POST /auth/signout` | `app/auth/signout/route.ts`  | POST-only. Calls `supabase.auth.signOut()` and 303-redirects to `/login`. GET/PUT/PATCH/DELETE return 405 with `Allow: POST`. POST-only matches the same-origin CSRF posture of the `<form method="post">` in the (app) header. No PostHog event. Tests: 2 cases.                                                                                                                                                                                                         |

### Authenticated (`(app)` route group)

The `(app)` layout (`app/(app)/layout.tsx`) is a server-component shell with defense-in-depth `supabase.auth.getUser()` → `redirect('/login')` if null. It mounts `<SignInCompletedCapture />` and renders a minimal header with the signed-in email + a POST sign-out form.

| Path                                           | File                                                                                | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/home`                                        | `app/(app)/home/page.tsx`                                                           | Dashboard — tiered priority card list. Tier 1 (Act Soon + reminder-due PLANNED), Tier 2 (overdue MONITOR + TRIAGE_PENDING), PLANNED tab, All tab. Walkthrough mode for batching overdue check-ins. Tiering logic in `_lib/tier-cards.ts`. Test: `app/(app)/home/page.test.tsx` + `_lib/tier-cards.test.ts`.                                                                                                                                                                                                                                                                                                              |
| `/capture`                                     | `app/(app)/capture/page.tsx` + `app/(app)/capture/_components/CaptureForm.tsx`      | Single-screen capture form (`'use client'`). Holds photo File in React state (no localStorage mirror — memory budget). POSTs `multipart/form-data` to `/api/card`. Fires `capture_started` (once-per-session on mount), `capture_completed` (on 201), `capture_cap_hit` (on 429). On 201 → `router.push('/cards/${card_id}')`. On 429 → preserves form state + replaces Submit with cap-hit banner. When `searchParams.cardId` is set, renders an "updates ship in the next release" notice instead. Tests: form + page + existing-card picker.                                                                          |
| `/cards/[id]`                                  | `app/(app)/cards/[id]/page.tsx`                                                     | Server-rendered card detail. State-switched body per spec § Screens (`capturing` mounts `<StartTriage />`; `triaging` renders skeleton; `diagnosed` renders severity chip + diagnosis + thread; `decide` mounts `<DecideView />`; `planned` mounts `<PlannedView />` with `<CloseCardForm />`; `closed` mounts `<ClosedView />` with before/after photos + spend log). Pulls most-recent `primary/wide` photo + close-photo (for closed state) via 10-min signed Storage URLs. Calls `supabase.auth.getUser()` first and `redirect('/login?next=/cards/<id>')` if no session. Awaits `params` (Next 16). 28+ test cases. |
| `/dismissed`                                   | `app/(app)/dismissed/page.tsx` + `app/(app)/dismissed/_components/RestoreStrip.tsx` | Server-rendered list of the user's `state='dismissed'` cards (sorted `updated_at desc`). Collapsed→confirm→POST inline-strip Restore. Empty state: "Nothing dismissed yet."                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `/spike`, `/spike/camera`, `/spike/comparison` | `app/(app)/spike/**`                                                                | PWA spike surfaces (operator-only, deferred for cleanup with `photo-comparison-ui`). See § PWA spike below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### API handlers (`app/api/`)

All route handlers export `dynamic = 'force-dynamic'`, derive `p_user` from `getUser().id` (never from a body-supplied user id), and route through SECURITY DEFINER RPCs for atomic writes.

| Method + Path                   | File                              | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Tests                           |
| ------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `POST /api/card`                | `api/card/route.ts`               | `multipart/form-data` capture endpoint. Validates server-side; calls `claim_card_slot` RPC; on success uploads photo to `card-photos/{user_id}/cards/{card_id}/touchpoints/{touchpoint_id}/wide.jpg` AFTER cap claim succeeds (so 429 path never orphans Storage); inserts `card_photos` row. Returns 201 / 429 / 400 / 401 / 500. Title via `_lib/title-from-description.ts`.                                                                                                                                                                                                                                                   | 11 route + 8 title-fn cases     |
| `POST /api/card/[id]/restore`   | `api/card/[id]/restore/route.ts`  | Auth-gated, validates uuid, updates `cards set state='capturing'` from `'dismissed'`. Returns 200 / 404 / 409.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | yes                             |
| `POST /api/triage`              | `api/triage/route.ts`             | Initial-read trigger. State-classifies card (`capturing` proceeds; `triaging` → 202; `diagnosed` → 409 `already_triaged`; other → 409 `invalid_state`; not-found → 404). Atomically transitions via `start_triage` RPC. Fetches photo bytes via `_lib/photos`. Calls Claude Sonnet 4.6 (`_lib/anthropic.callInitialRead`). Defensively parses via `_lib/parse-tool-output.parseInitialRead`. Persists via `complete_triage` RPC. On any error after `start_triage`, best-effort reverts state to `capturing`. Envelope: 429 `triage_rate_limited` / 503 `triage_unavailable` / 502 `triage_invalid_output` / 500 `server_error`. | 24 cases                        |
| `POST /api/triage/answer`       | `api/triage/answer/route.ts`      | Q&A turn endpoint. Accepts `{ card_id, answer? }` OR `{ card_id, skip: true }`. State-classifies (`diagnosed + severity_confirmed=false`; else 404 / 409). Computes round state via `_lib/round-state.computeQaRoundState`. `forceConfirm = qaUserCount >= 3 \|\| skip`. Calls `_lib/anthropic-qa.callQaTurn`. Parses via `_lib/parse-qa-output.parseQaTurn`. Dispatches: `ask_next_question` → `answer_triage_round` RPC (+ optional dual-write to `users.location`); `confirm_assessment` → `confirm_triage` RPC.                                                                                                              | 33 cases                        |
| `POST /api/card/[id]/decide`    | `api/card/[id]/decide/route.ts`   | Path commitment. Body validated via `_lib/parse-decide-body.ts` (`path` enum + conditional `monitoring_cadence_days`). Calls `commit_decide` SECURITY DEFINER RPC. 404-vs-409 distinguished by narrow `cards` re-read. Envelope: 200 / 400 / 401 / 404 / 409 / 500.                                                                                                                                                                                                                                                                                                                                                              | 33 cases (15 parser + 18 route) |
| `PATCH /api/card/[id]/estimate` | `api/card/[id]/estimate/route.ts` | User-override of `cost_estimate_<path>_override` (diy or contractor). Body validated via `_lib/parse-estimate-override.ts` (re-exports from `_lib/estimate-shapes.ts`). Allowed in `state IN ('decide', 'planned', 'monitoring')`.                                                                                                                                                                                                                                                                                                                                                                                               | 25 cases (13 parser + 12 route) |
| `PATCH /api/card/[id]/reminder` | `api/card/[id]/reminder/route.ts` | Direct UPDATE on `cards.planned_reminder_date`. Body `{ reminder_date: 'YYYY-MM-DD' \| null }` validated via `_lib/parse-reminder-body.ts` (strict ISO regex + `Date.UTC` round-trip-equals-input check — JS's permissive `new Date()` would silently coerce `'2026-02-30'`). State guard via `.eq('state', 'planned')`.                                                                                                                                                                                                                                                                                                         | 35 cases (17 parser + 18 route) |
| `POST /api/card/[id]/close`     | `api/card/[id]/close/route.ts`    | Multipart close endpoint. Auth-gated, validates spend/notes/photo. Photo upload BEFORE RPC call (photo-first, state-second — photo failure does NOT block close). Calls `close_card` SECURITY DEFINER RPC (`state='planned'` guard only). 404-vs-409 narrow re-read. Envelope: 200 / 400 / 401 / 404 / 409 / 500.                                                                                                                                                                                                                                                                                                                | 18 cases                        |
| `POST /api/card/[id]/checkin`   | `api/card/[id]/checkin/route.ts`  | Multipart check-in endpoint. Auth-gated, validates notes (max 500) + up to 3 photo slots (wide/zoom/detail). RPC-first, photos-after (inverse of close-flow — G1). Calls `record_checkin` SECURITY DEFINER RPC (`state='monitoring'` guard). Photo upload failures Sentry-captured but do NOT block. Envelope: 200 / 400 / 401 / 404 / 409 / 500.                                                                                                                                                                                                                                                                                | 18 cases                        |
| `PATCH /api/card/[id]/cadence`  | `api/card/[id]/cadence/route.ts`  | JSON body cadence adjustment. Body `{ cadence_days: 1-365 }` validated via `_lib/parse-cadence-body.ts`. RLS-enforced direct UPDATE on `monitoring_cadence_days` + `next_check_at` (recalculated from now). State guard via `.eq('state', 'monitoring')`. 404-vs-409 narrow re-read. Envelope: 200 / 400 / 401 / 404 / 409 / 500.                                                                                                                                                                                                                                                                                                | 18 cases (12 parser + 6 route)  |
| `POST /api/key-validate`        | `api/key-validate/route.ts`       | BYOK key validation. Returns HTTP 200 for both valid and invalid keys (see CLAUDE.md gotcha). Calls Anthropic with minimal probe. Marks BYOK used via `mark_byok_used` RPC.                                                                                                                                                                                                                                                                                                                                                                                                                                                      | yes                             |

#### Triage `_lib/` (route-handler helpers under `api/triage/`)

| File                   | Purpose                                                                                                                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt.ts`            | `DEFAULT_TRIAGE_SYSTEM_PROMPT` + `resolveSystemPrompt()` (prefers trim-defended `TRIAGE_SYSTEM_PROMPT` env override). `PROMPT_MAX_CHARS=3500` leaves headroom under Vercel's 4096-byte env-var cap.                                                                     |
| `prompt-qa.ts`         | Q&A counterpart. Same posture; honors `TRIAGE_QA_SYSTEM_PROMPT`.                                                                                                                                                                                                        |
| `photos.ts`            | `fetchCardPhotosAsBase64(supabase, userId, cardId)` — up to `MAX_PHOTOS_PER_TRIAGE=3` rows from `card_photos` oldest-first. Supplied client MUST be the user-context server client (Storage RLS is the trust boundary).                                                 |
| `parse-tool-output.ts` | Hand-rolled runtime validator for `record_initial_read` tool-use payload. Returns `{ ok: true, value } \| { ok: false, field, reason }`. Validates all required fields + enums + `what_i_need_to_know` length 1..3 + sources `{url, title}[]`.                          |
| `parse-qa-output.ts`   | Runtime validator for Q&A `tool_use` block. Branches on `block.name`: `ask_next_question` → `AskNextQuestion`; `confirm_assessment` → `ConfirmAssessment`. Discriminated union for dispatch.                                                                            |
| `anthropic.ts`         | `callInitialRead(...)`. Constants pinned to `@anthropic-ai/sdk@0.96.0`: `DEFAULT_TRIAGE_MODEL='claude-sonnet-4-6'`, `WEB_SEARCH_TOOL_TYPE='web_search_20260209'`, `RECORD_INITIAL_READ_TOOL_NAME='record_initial_read'`. `baseURL` override is the E2E test seam.       |
| `anthropic-qa.ts`      | `callQaTurn(...)`. Reuses `DEFAULT_TRIAGE_MODEL` + `WEB_SEARCH_TOOL_TYPE`. Both Q&A tools + web_search server tool. `tool_choice` dispatches on `forceConfirm`. Attaches image blocks ONLY to first user message.                                                       |
| `round-state.ts`       | `computeQaRoundState(rows)` — pure-fn over the thread; returns `{ qaUserCount, nextRound, priorWasLocationAsk, priorAssistantToolName }`. `qaUserCount` filters `role='user' AND is_location_ask=false` (location asks are free).                                       |
| `estimate-shapes.ts`   | Shared `parseDiyExpansion(input)` + `parseContractorExpansion(input)`. Same module used by `parse-qa-output.ts` (LLM-output validation) AND `api/card/[id]/estimate/_lib/parse-estimate-override.ts` (user-PATCH validation) — single contract on two trust boundaries. |

#### Triage eval harness (`eval/triage/`)

Operator-run regression gate for the triage **initial read** — the quality floor
for the AI core. `eval/triage/run.ts` feeds 75 labeled synthetic home-issue
descriptions (`dataset.json`) through the _shipped_ prompt + tool schema (reusing
`resolveSystemPrompt()` + `callInitialRead()` + `parseInitialRead()` directly,
no HTTP/DB/auth), scores `severity_provisional` exact-match (gate ≥ 0.70) and the
derived DIY-vs-hire path (gate ≥ 0.85) against the labels, prints a per-category +
overall report, and exits non-zero on a gated-metric miss. **Run it before any
triage-prompt change**: `ANTHROPIC_API_KEY=... pnpm --filter web eval:triage`. Not
a CI step (non-deterministic + ~75 real API calls); only the deterministic
`score.test.ts` + `dataset.test.ts` run in CI. Full usage + how to add/correct
labels: [`eval/triage/README.md`](./eval/triage/README.md).

#### Other `_lib/` helpers

- `api/card/_lib/title-from-description.ts` — pure-fn title derivation.
- `api/card/[id]/decide/_lib/parse-decide-body.ts` — decide-route body validator.
- `api/card/[id]/estimate/_lib/parse-estimate-override.ts` — estimate-override body validator (re-exports from `triage/_lib/estimate-shapes.ts`).
- `api/card/[id]/reminder/_lib/parse-reminder-body.ts` — reminder-route body validator with strict ISO + UTC round-trip check.
- `api/card/[id]/cadence/_lib/parse-cadence-body.ts` — cadence-route body validator (integer in [1, 365]).

## Components

### Card detail surfaces (`app/(app)/cards/[id]/_components/`)

| Component                     | Purpose                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `StartTriage.tsx`             | `'use client'` "Read this for me" button on `capturing`-state cards. POSTs to `/api/triage`; fires `triage_initial_read_started` / `_completed` / `_failed`. Dispatches by status: 200 → `router.refresh()`; 202 → notice + delayed refresh; 409 `already_triaged` → notice + delayed refresh; 429 / 503 / 5xx / network → retry-eligible banner. 9 test cases.                                              |
| `AnswerThread.tsx`            | `'use client'` Q&A surface (mounted on `diagnosed` + `severity_confirmed=false`). Active question + textarea + Send + (round ≥ 1) "Skip — give me your best assessment". POSTs to `/api/triage/answer`. Fires `triage_qa_round_started` / `_completed` / `_confirmed` / `_failed`.                                                                                                                           |
| `DiagnosedThread.tsx`         | Server component. Replaces `<AnswerThread />` once `severity_confirmed=true`. Confirmed severity chip + final diagnosis + monitoring cadence + `<details>` "How we diagnosed this".                                                                                                                                                                                                                          |
| `QaThread.tsx`                | Server component. Compact thread for the provisional + mid-Q&A sub-state (between PR #19's preview + `<AnswerThread />`). Reuses `<ConversationRow />`. Returns null when no Q&A rounds.                                                                                                                                                                                                                     |
| `ConversationRow.tsx`         | Server component. Single-row renderer dispatched on `(role, tool_name, is_location_ask)`. `record_initial_read` → "Initial read"; `ask_next_question` → "Question N"; `confirm_assessment` → "Confirmed"; user row → "Your reply (round N)". Malformed JSON → fallback "Conversation row could not be parsed." + Sentry breadcrumb.                                                                          |
| `DecideView.tsx`              | Server component composition for `state='decide'`. Severity chip + diagnosis + dual `<PathCard />` + `<EstimateEditor />` slotted into expanded body + `<ChoosePath />` + "How we diagnosed this" collapsible. Mounts `<DecideViewOpenedCapture />`.                                                                                                                                                         |
| `PlannedView.tsx`             | Server component for `state='planned'`. "You chose: <path>" + chosen-path detail + `<BeforeCloseSummary />` (skipped for `monitor`) + greyed `<ChoosePath />` with "Change decision" + `<ReminderEditor />` + "How we diagnosed this". Threads `plannedReminderDate` + `isReminderDue` to `<ReminderEditor />`.                                                                                              |
| `PathCard.tsx`                | Server component. Single DIY or Contractor breakdown card. Collapsed summary + native `<details>` expand. Override-vs-app via `(override ?? estimate)` (never merged); "edited" badge when override non-null. Optional `editorSlot` for inline editor.                                                                                                                                                       |
| `EstimateEditor.tsx`          | `'use client'` inline edit form. Headline fields only (skill_level + time + total for DIY; cost range for Contractor). PATCHes `/api/card/[id]/estimate`. Fires `decide_estimate_edited` / `_reset`. `router.refresh()` on success.                                                                                                                                                                          |
| `ChoosePath.tsx`              | `'use client'` four-button commit row. `state='decide'` → all four active; `state='planned'` → greyed + chosen marked + "Change decision" link. Fires `decide_path_chosen` always + `decide_path_changed` when `prevChosenPath !== to_path` on re-commit (`prev` snapshotted before `router.refresh()`).                                                                                                     |
| `MonitorCadencePicker.tsx`    | `'use client'` cadence stepper mounted by `<ChoosePath />` on "Set to Monitor". Clamped to [7, 365] days.                                                                                                                                                                                                                                                                                                    |
| `BeforeCloseSummary.tsx`      | Server component. "Before you close" callout in `<PlannedView />` between chosen-path `<PathCard />` and `<ChoosePath />`. Branches on `chosenPath`: `diy` → materials + non-optional tools (first 5 + `+N more`); `contractor` → "Contractor to schedule: <type>" + top-3 questions + `+N more`; `monitor` → `null`. Override jsonb wins over app jsonb. "Estimate unavailable" placeholder when both null. |
| `ReminderEditor.tsx`          | `'use client'` reminder set/edit/clear surface. Three states keyed on `(plannedReminderDate, isReminderDue)`. PATCHes `/api/card/[id]/reminder`. Fires `planned_reminder_set` / `_cleared` / `_edited` AFTER 200 (never optimistic). `days_out` is signed. `had_future_date` on `_cleared` distinguishes regret from acknowledgment.                                                                         |
| `ReminderDueChip.tsx`         | Server component. Calm-indigo "Revisit by [date]" chip. Outline only (`border-[var(--color-planned)]` + `text-[var(--color-planned)]`). Mounted in `page.tsx` header conditionally on `card.state === 'planned' && isReminderDue === true`. `humanReminderDate()` from `_reminder-chip.ts` formats UTC-anchored.                                                                                             |
| `DecideViewOpenedCapture.tsx` | Zero-output `'use client'`. Mounts inside `<DecideView />`. Fires `decide_view_opened` once per `(card × browser session)` via sessionStorage sentinel `home_os.decide_view_opened_fired:<card_id>`.                                                                                                                                                                                                         |
| `CloseCardForm.tsx`           | `'use client'` inline "Mark as closed" form on `<PlannedView />`. Expands to: optional dollar input (client-side Math.round(parseFloat \* 100) → cents) + optional notes + optional photo + submit. Fires `card_close_started` on every expand + `card_closed` after POST 200. days_in_planned approximate (Gotcha #8). 12 test cases.                                                                       |
| `ClosedView.tsx`              | Server component for `state='closed'`. Severity chip + calm-green "Closed" chip (`--color-note`) + closed_at date + before/after photo pair + spend log + "How we diagnosed this" collapsible. 15 test cases.                                                                                                                                                                                                |
| `BeforeAfterPhotos.tsx`       | Server component. Before/after photo pair — earliest `touchpoint_type='primary'` + latest `touchpoint_type='close'`. Side by side desktop (`md:grid-cols-2`), stacked mobile. Placeholder text for missing photos. 6 test cases.                                                                                                                                                                             |
| `_reminder-chip.ts`           | Shared `reminderChipClasses(humanDate)` lookup. Underscore-prefix excludes from routing. Single source of truth for chip's class triple.                                                                                                                                                                                                                                                                     |
| `_severity-chip.ts`           | Shared `severityChipClasses()`. Maps severity tier → `{bg, text, label}`. Test locks `soon → --color-watch` / `urgent → --color-act-soon` token mapping.                                                                                                                                                                                                                                                     |

| `MonitorView.tsx` | Server component for `state='monitoring'`. Severity chip + calm-teal "Monitoring" chip + cadence display + overdue indicator + `<CheckInTimeline />` + `<CheckInForm />` + `<CadenceEditor />` + `<ChangePathButton />` + `<MonitorViewOpenedCapture />` + "How we diagnosed this" collapsible. 10 test cases. |
| `CheckInTimeline.tsx` | Server component. Reverse-chronological check-in history. Most recent entry expanded; older entries collapsed via `<details>`. Photo thumbnails per entry. Empty state: "No check-ins yet." 6 test cases. |
| `CheckInForm.tsx` | `'use client'` inline check-in form. "Check in now" CTA expands to: optional notes textarea + 3 photo slots (wide/zoom/detail, `capture="environment"`) + reference photos from last check-in + submit/cancel. Fires `monitor_checkin_submitted` after POST 200. 6 test cases. |
| `CadenceEditor.tsx` | `'use client'` inline cadence adjustment. "Check-in every N days" display + Edit link. Expands to number input [1, 365] + Save/Cancel. PATCHes `/api/card/[id]/cadence`. Fires `monitor_cadence_changed` after 200. 5 test cases. |
| `ChangePathButton.tsx` | `'use client'` "Change path" secondary action on `<MonitorView />`. POSTs to `/api/card/[id]/decide` with `{ path: 'decide' }`. Returns card to DECIDE surface. 3 test cases. |
| `MonitorViewOpenedCapture.tsx` | Zero-output `'use client'`. Mounts inside `<MonitorView />`. Fires `monitor_view_opened` once per (card x browser session) via sessionStorage sentinel. 4 test cases. |

### Dashboard surfaces (`app/(app)/home/_components/` + `_lib/`)

| Component                    | Purpose                                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DashboardCard.tsx`          | Server component. Tier 1/2/PLANNED/TRIAGE_PENDING card variants. Props: `card`, `tier`, `photoUrl`. Links to `/cards/[id]`. 8 test cases.             |
| `FilterBar.tsx`              | `'use client'` sticky tab bar. "Needs attention" / "Planned" / "All". Fires `dashboard_filter_changed`. Dot indicator on "Planned" when reminder due. |
| `EmptyState.tsx`             | Server component. First-time + nothing-active + tab-empty empty states.                                                                               |
| `WalkthroughPrompt.tsx`      | Server component. "N items need a check-in" prompt card.                                                                                              |
| `WalkthroughMode.tsx`        | `'use client'` walkthrough session. Sequences overdue cards with inline `<CheckInForm />`. Fires `walkthrough_started`/`walkthrough_completed`.       |
| `DashboardViewedCapture.tsx` | Zero-output `'use client'`. Fires `dashboard_viewed` once per page load (no sessionStorage dedup).                                                    |
| `DashboardShell.tsx`         | `'use client'` shell managing tab state + walkthrough state. Composes FilterBar, card lists, EmptyState, WalkthroughMode, DashboardViewedCapture.     |
| `_lib/tier-cards.ts`         | Pure tiering + sorting logic. `tierCards(cards, now)` returns `{ tier1, tier2, planned, all, overdueMonitor }`. 25 test cases.                        |

### Capture surfaces (`app/(app)/capture/_components/`)

- `CaptureForm.tsx` — `'use client'` photo-file-in-state form. Posts to `/api/card`; on 201 redirects to `/cards/${card_id}`.
- `ExistingCardPicker.tsx` — Server component. Existing-card picker (currently displayed but underlying update flow ships with monitor-beta).

### Dismissed surfaces (`app/(app)/dismissed/_components/`)

- `RestoreStrip.tsx` — `'use client'` collapsed → confirm → POST inline strip.

### App shell (`app/(app)/_components/`)

- `SignInCompletedCapture.tsx` — `'use client'` zero-output. Mounted by `(app)` layout. Calls `posthog.identify(user.id, { email })` FIRST (identify-before-capture), then `posthog.capture('sign_in_completed', { method: 'magic_link' })`. Guarded by `sessionStorage` key `home_os.sign_in_completed_fired:<user-id>` — fires once per (user × session); fresh sign-in re-fires automatically. 4 test cases.
- `TriagePendingBadge.tsx` — Server component. "N captures queued for triage" text in the header. Runs its own `cards` count query for `state IN ('capturing', 'triaging')`. Renders null when count is 0. 4 test cases.

### Top-level (`app/_components/`)

- `PostHogProvider.tsx` — `'use client'` wrapper triggering `initPostHog()` once per browser session.

## Edge layer

### `middleware.ts`

Runs on every non-asset request. Calls `supabase.auth.getUser()` to keep cookies fresh AND enforces auth redirects:

- Anonymous + path startsWith `/home` / `/capture` / `/dismissed` / `/cards` → redirects to `/login?next=<original-path>` (`GATED_PREFIXES`).
- Authenticated + path === `/login` → redirects to `/home`.
- Anonymous + path === `/` → redirects to `/login` (no `?next=` — would create a `/login` → auth → `safeNext('/')` → `/login` loop).
- Authenticated + path === `/` → redirects to `/home`.
- Asset paths + `/auth/*` callback URLs untouched.
- `getUser()` wrapped in try/catch so stale-cookie throws fall through as "anonymous".

Test: `middleware.test.ts` (16 cases).

### `next.config.ts`

- Security headers — HSTS / X-Frame-Options / nosniff / Referrer-Policy / Permissions-Policy.
- CSP `connect-src` built at config-load from `NEXT_PUBLIC_SUPABASE_URL`, including its `ws(s)://` variant so Realtime works in both prod and local-stack shapes.
- Wrapped with `withSentryConfig` for sourcemap upload (driven by `SENTRY_AUTH_TOKEN`; silently no-ops without it).

### `instrumentation.ts` + `sentry.{client,server,edge}.config.ts`

`instrumentation.ts` wires server + edge configs via `process.env.NEXT_RUNTIME`. Client config is loaded by Next directly.

## Lib

| File                     | Purpose                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `lib/supabase/client.ts` | Browser client — `createBrowserClient` with `.trim()`-defended env reads.                                                     |
| `lib/supabase/server.ts` | SSR client — `createServerClient` reading Next's async `cookies()`.                                                           |
| `lib/posthog.ts`         | `initPostHog()` reads `NEXT_PUBLIC_POSTHOG_KEY` (`.trim()`-defended), no-ops on SSR or missing key, dials `us.i.posthog.com`. |

## E2E suite (`e2e/`)

Playwright. All specs skip gracefully on non-local via `test.skip(!isLocalSupabase, ...)`; slow-job is the enforcement surface.

| Spec                                     | Coverage                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth-edge-cases.spec.ts`                | Landing-redirect cases (anon/`/`, auth/`/`) + middleware bounce cases.                                                                                                                                                                                                  |
| `magic-link.spec.ts`                     | Full round-trip — submit form → poll Inbucket → follow magic link → assert `/home` shell → sign out → assert middleware bounce.                                                                                                                                         |
| `capture-flow.spec.ts`                   | Sign-in (password helper) → submit capture → assert 201 + DB writes + redirect to `/cards/<uuid>`. Cap-hit seed → banner + no Storage object. Dismissed-seed → restore via UI → state flips.                                                                            |
| `triage-route-handler.spec.ts`           | Capture → trigger → diagnosed + DB writes. Anthropic 503 → retryable banner + state revert. Admin-seeded `triaging` → 202. Anthropic mocked via `ANTHROPIC_BASE_URL` local-server seam.                                                                                 |
| `triage-conversation.spec.ts`            | Single-round confirm, 3-round force-confirm, location-ask + `users.location` write, skip path, 503 retry.                                                                                                                                                               |
| `decide-state.spec.ts`                   | Happy-path Choose DIY → planned, edit + reset estimate, Set to Monitor + cadence, Dismiss, concurrent 409. Seeds `state='decide'` directly via admin client.                                                                                                            |
| `planned-state.spec.ts`                  | Set future reminder, reminder-due chip with past date + clear, edit future to past, `<BeforeCloseSummary />` Contractor variant + monitor variant, state-guard 409 on non-planned states.                                                                               |
| `close-flow.spec.ts`                     | Happy path with spend+photo, minimal close, photo-only close, state guard 409, cancel preserves state. 5 cases.                                                                                                                                                         |
| `rls-isolation.spec.ts`                  | Two-user spec asserting SELECT/INSERT/UPDATE/DELETE + Storage download/upload isolation on all 5 tables.                                                                                                                                                                |
| `triage-conversation-hero-shots.spec.ts` | Hero-screenshot capture (Wave 5.9 evidence).                                                                                                                                                                                                                            |
| `helpers/admin-client.ts`                | Five canonical exports: `adminClient` / `anonClient` / `userIdFromSignIn` / `isLocalSupabase` / `localSupabaseSkipReason`. `adminClient` refuses to run unless `isLocalSupabase`.                                                                                       |
| `helpers/inbucket.ts`                    | `latestMagicLink(email)` polls `http://127.0.0.1:54424/api/v1/mailbox/<mailbox>` and extracts the first `http(s)://.../auth/callback` URL.                                                                                                                              |
| `global-setup.ts`                        | PostgREST cache-staleness defense. Probes `/rest/v1/` OpenAPI for canary column; sends `notify pgrst, 'reload schema'` via psql if absent; falls back to `docker restart supabase_rest_*`. Skips silently on non-local. Wired via `playwright.config.ts § globalSetup`. |

## PWA spike

Operator-only surfaces deferred for cleanup with `photo-comparison-ui` per `BUILD-LOG.md` TODO. Reachable only by typing the URL after sign-in.

- `app/(app)/spike/page.tsx` — `/spike` landing. Orientation + links + result-doc gate reminder.
- `app/(app)/spike/camera/page.tsx` — Path A (`<input capture="environment">`) + Path B (`getUserMedia` + canvas-to-blob at quality 0.95). Both upload to `card-photos` Storage at `{auth.uid()}/spike/{ISO-no-colons}-{A|B}.jpg`.
- `app/(app)/spike/comparison/page.tsx` — Two `<img>` panels with `touch-action: none` ON THE PANELS (never on `<html>`/`<body>`). Pointer-event sync zoom + opacity-swap bounce at 1200/750/400ms. FPS overlay sampled every 500ms. "Use bundled / your own photos" toggle.
- `app/(app)/spike/_lib/{bounce-timer,sync-zoom-transform,storage-path}.ts` — three pure-fn helpers with paired Vitest tests (33 tests).
- `app/(app)/spike/_components/{CameraPathA,CameraPathB,ComparisonPanels,CadenceControls}.tsx` — spike-only client components.
- `public/spike/sample-left.jpg` + `sample-right.jpg` — bundled placeholder JPEGs for the comparison surface default.
- `/workspace/.gstack/pwa-spike-result.md` — operator-filled result doc gated by `RESULTS-PENDING: yes` frontmatter sentinel. Phase 6 audit refuses to merge until flipped.

## Environment variables

See `.env.example` for the full surface. Highlights:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — required.
- `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_POSTHOG_KEY` — optional.
- `ANTHROPIC_API_KEY` — required for `/api/triage` (server-only, NOT `NEXT_PUBLIC_*`).
- `TRIAGE_SYSTEM_PROMPT` / `TRIAGE_QA_SYSTEM_PROMPT` — optional overrides, ≤ 3500 chars (Vercel env-var 4096-byte cap headroom).
- `ANTHROPIC_MODEL` — optional, defaults to `claude-sonnet-4-6`.
- `ANTHROPIC_BASE_URL` — optional E2E test seam.

## Cross-references

- [`../../ARCHITECTURE.md § Components`](../../ARCHITECTURE.md#components) — system context (`apps/web`'s role, deps, consumers).
- [`../../ARCHITECTURE.md § Data flow`](../../ARCHITECTURE.md#data-flow) — SSR request lifecycle, Triage flow.
- [`../../CLAUDE.md § Gotchas`](../../CLAUDE.md#gotchas) — silent-failure traps that bite when writing code under `apps/web/`.
- [`../../supabase/README.md`](../../supabase/README.md) — schema (migrations, RPCs, RLS) that the route handlers consume.
- [`../../packages/core/README.md`](../../packages/core/README.md) — typed Supabase factory + shared models consumed by `apps/web`.
- [`../../packages/ui/README.md`](../../packages/ui/README.md) — design tokens + primitives consumed by `apps/web`.
