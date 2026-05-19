# Known issues — home-os

> Open user-facing or operational issues that are documented-but-not-yet-fixed. Read this before debugging a report that matches one of these — the cause is already known.
>
> Distinct from `CLAUDE.md § Gotchas` (developer traps that bite when writing code) and `TODOS.md` (operator action items). Entries here describe **broken production behavior**: the symptom users see, the cause we know, the workaround if any, and the disposition (won't fix / deferred / scheduled).

## Magic-link sign-in fails in Safari Private Browsing

**Surfaces**: iOS Safari + macOS Safari in Private Browsing mode.

**Symptom**: User submits email at `/login`, receives the magic-link email, taps the link → lands at `/login?error=callback_failed`.

**Cause**: The `signInWithOtp` PKCE flow stores a `code_verifier` cookie when the user submits their email; the server-side `/auth/callback` route at `apps/web/app/auth/callback/route.ts` needs that cookie present at `exchangeCodeForSession(code)` to complete the handoff. Private Browsing tabs isolate cookie state across tabs — when iOS Mail opens the magic-link in a new Private tab, the verifier from the original tab is gone, and the exchange fails.

**Workaround for invitees**: use a regular (non-private) browser window.

**Disposition**: **Won't fix** (decided 2026-05-15). Flipping to OTP-code flow would eliminate the failure class but the OTP code-entry UX is a larger change deferred to `PRODUCT-ROADMAP.md`.

**Related TODO**: `TODOS.md` carries a separate item to make `/auth/callback` capture the exchange error to Sentry + passthrough a reason to `?error=`. That observability gap is independent of the Private Browsing decision and worth fixing.

## Supabase inbuilt-SMTP rate limit on magic-link emails

**Surfaces**: fresh prod deployments inviting more than ~2 unique recipients within an hour.

**Symptom**: After the first 2-3 invitees, subsequent magic-link requests return `429` from Supabase. The form copy in `apps/web/app/login/_components/LoginForm.tsx` shows "You're sending links too fast. Wait a minute." — but the actual reset window is up to an hour, not a minute.

**Cause**: Supabase's inbuilt SMTP is rate-limited to ~2 magic-link emails/hour **project-wide** (not per-email-address; not per-IP). The 429 response is correct; the form copy is wrong.

**Workaround options**:

1. **Bump the rate limit** at `https://supabase.com/dashboard/project/<ref>/auth/rate-limits` (operator action — out-of-band).
2. **Wire Resend SMTP** (3k free/month) at the same dashboard's email-settings tab (operator action — out-of-band).

Both lift the cap significantly.

**Related TODO**: the form copy bug is tracked in `TODOS.md` and is independent of the rate-limit-bump decision.

**Disposition**: **Deferred** — operator decides whether to bump the dashboard rate limit or switch to Resend before broad invitee rollout. The form copy fix lands independently.

## Cross-references

- `CLAUDE.md § Gotchas` — developer-facing silent-failure traps.
- `TODOS.md` — operator action items + recoverable bugs scheduled to ship.
- `PRODUCT-ROADMAP.md` — long-term changes that resolve some known issues at root (e.g. OTP-code flow → resolves Safari Private Browsing failure).
