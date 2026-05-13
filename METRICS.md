# Metrics

Event taxonomy and feature flags. Updated alongside every new `posthog.capture(...)` or `Sentry.captureException(...)` call site — `kit/scripts/commit-hooks/check-docs-freshness-project.sh` enforces this on pre-commit.

## Events

| Event               | When it fires                                                                                                                                                                              | Key properties             | Why we care                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `sign_in_requested` | Fired from the `/login` form's submit handler in `apps/web/app/login/_components/LoginForm.tsx` after `supabase.auth.signInWithOtp` resolves without error.                                | `{ method: 'magic_link' }` | Top of the auth funnel — a drop between "requested" and "completed" is a deliverability / UX regression.      |
| `sign_in_completed` | Fired from `apps/web/app/(app)/_components/SignInCompletedCapture.tsx` on first authenticated mount per (user × session). Identifies the user with `posthog.identify(user.id)` first (D7). | `{ method: 'magic_link' }` | Bottom of the auth funnel — measures realized conversion to a signed-in session; the only conversion KPI now. |

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
