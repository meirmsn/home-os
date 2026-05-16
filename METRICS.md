# Metrics

Event taxonomy and feature flags. Updated alongside every new `posthog.capture(...)` or `Sentry.captureException(...)` call site — `kit/scripts/commit-hooks/check-docs-freshness-project.sh` enforces this on pre-commit.

## Events

| Event                           | When it fires                                                                                                                                                                              | Key properties                                                                                                    | Why we care                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sign_in_requested`             | Fired from the `/login` form's submit handler in `apps/web/app/login/_components/LoginForm.tsx` after `supabase.auth.signInWithOtp` resolves without error.                                | `{ method: 'magic_link' }`                                                                                        | Top of the auth funnel — a drop between "requested" and "completed" is a deliverability / UX regression.                                                                                        |
| `sign_in_completed`             | Fired from `apps/web/app/(app)/_components/SignInCompletedCapture.tsx` on first authenticated mount per (user × session). Identifies the user with `posthog.identify(user.id)` first (D7). | `{ method: 'magic_link' }`                                                                                        | Bottom of the auth funnel — measures realized conversion to a signed-in session; the only conversion KPI now.                                                                                   |
| `capture_started`               | Fired once per session on mount of `apps/web/app/(app)/capture/_components/CaptureForm.tsx` (CAPTURE form), guarded by a `useRef` so re-renders don't re-fire (D9).                        | `{}`                                                                                                              | Top of the capture funnel — measures how many sessions reach the form at all.                                                                                                                   |
| `capture_completed`             | Fired from `apps/web/app/(app)/capture/_components/CaptureForm.tsx` after `POST /api/card` returns 201 + optional Storage upload resolves (D9).                                            | `{ has_photo: boolean, system_tag: string, room_tag_length: number, is_update: false }`                           | Bottom of the capture funnel — the realized conversion rate is `completed / started`; `is_update` reserves shape for row #7.                                                                    |
| `capture_cap_hit`               | Fired from `apps/web/app/(app)/capture/_components/CaptureForm.tsx` when the route handler returns 429 `card_cap_reached` (D9, D11).                                                       | `{ resets_on: string }` (ISO date)                                                                                | Leading indicator of "the user wants to keep capturing but the 20/wk cap blocks them" — informs whether 20 is the right number.                                                                 |
| `triage_initial_read_started`   | Fired from `apps/web/app/(app)/cards/[id]/_components/StartTriage.tsx` when the user clicks "Read this for me" and the `POST /api/triage` fetch begins (D10).                              | `{ card_id: string, system_tag: string }`                                                                         | Top of the triage funnel — measures how many capturing-state cards get sent to the AI for an initial read.                                                                                      |
| `triage_initial_read_completed` | Fired from `apps/web/app/(app)/cards/[id]/_components/StartTriage.tsx` when `POST /api/triage` returns 200 (D10).                                                                          | `{ card_id: string, system_tag: string, severity_provisional: string, latency_ms: number, search_count: number }` | Bottom of the triage funnel — realized conversion is `completed / started`; `severity_provisional` distribution informs prompt calibration; `search_count` surfaces the web_search cost driver. |
| `triage_initial_read_failed`    | Fired from `apps/web/app/(app)/cards/[id]/_components/StartTriage.tsx` when `POST /api/triage` returns non-2xx or the fetch throws (D10).                                                  | `{ card_id: string, error_class: string, latency_ms: number }`                                                    | Leading indicator of Anthropic outages / prompt regressions / parser failures — `error_class` (e.g. `triage_unavailable`, `triage_rate_limited`, `parse_failed`) routes the diagnosis.          |

<!--
Authoring rules:
- One row per `posthog.capture(...)` or `Sentry.captureException(...)` call site.
- "When it fires" names the verb (e.g. "successful sign-in", not "auth")
  AND the file (e.g. "Fired from `onAuthStateChange` on `SIGNED_IN` in `apps/web/...`").
- "Key properties" lists the literal property keys + their types.
- "Why we care" is one sentence — what does this number tell us 6 months from now?
-->

## Feature Flags

| Flag        | Controls                  | Default                         |
| ----------- | ------------------------- | ------------------------------- |
| <flag-name> | <what code path it gates> | <true \| false \| variant-name> |

<!--
- One row per flag read from PostHog (or whichever flag provider).
- Default is the value used when the flag service is unreachable.
-->

## Dashboards

<!--
List the canonical dashboards the operator/oncall watches. Each entry:

- **<dashboard-name>**: <URL> — <what it surfaces; when to look at it>
-->

_No dashboards configured yet._
