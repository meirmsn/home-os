# TODOS

Project bugs and small fixes — tactical work that doesn't warrant a roadmap chapter.
Each item is self-contained — context included so an AI agent or future contributor
can act on it without reading other docs.

Organized by version to mirror `PRODUCT-ROADMAP.md`:

- **v0** — lands before the current-version migration ships. Subgrouped by when it runs: pre-ship / launch-day.
- **v1** / **v+** — deferred to future versions.
- **Dismissals** — items considered and explicitly NOT doing, with reason.

## v0

### pre-ship

- **firewall-google-fonts** — Add `fonts.googleapis.com` to `.devcontainer/firewall-extra-domains` so local `pnpm turbo run build` can fetch the Inter font at build time.
  - **Why**: `apps/web/app/layout.tsx` uses `next/font/google` for `Inter`, which fetches the font CSS from `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap` during Turbopack build. The workspace's egress firewall does not allow `fonts.googleapis.com`, so local builds fail with `Failed to fetch 'Inter' from Google Fonts`. CI builds (Vercel) succeed because they run outside this firewalled container — CI is the canonical enforcement surface for build verification.
  - **How**: append `fonts.googleapis.com` (and likely `fonts.gstatic.com`, which serves the actual woff2 files) to `.devcontainer/firewall-extra-domains`, then `sudo /usr/local/bin/init-firewall.sh` to re-apply.
  - **Where**: `.devcontainer/firewall-extra-domains`. Discovered while running pre-ship Gate 4 on `supabase-schema-and-rls` PR.

- **capture-flow-upload-success-feedback** — `capture-flow` (next PR after the spike per `PLAN.md § Planned`) must make upload-success feedback explicit — a visible toast or "✓ Uploaded" affirmation. The spike walk surfaced that without one, the operator falls back to "did the storage path appear?" as the proxy success signal, which is fragile.
  - **Why**: The pwa-spike `/spike/camera` page signaled upload success implicitly (storage path appended to the dimensions + file-size readout) and the operator's walk-through confirmed it works as a _diagnostic_ signal but not as a _user_ signal. `capture-flow` ships to real users on the dashboard async-queued state path; "did my photo upload?" must be unambiguous, not a guess from the presence of a path string.
  - **How**: when `capture-flow`'s spec is written, the upload-success affordance is explicit in the spec — either a toast on capture-flow's primary surface, or a "✓ Uploaded" chip rendered next to the freshly-added card on the dashboard. Design review's § CAPTURE async-queued state already covers this; this entry is a pointer so the design pass doesn't accidentally drop it.
  - **Where**: spec for the `capture-flow` PR (next in `PLAN.md § Planned`). Source: `.gstack/pwa-spike-result.md § Spike follow-ups for capture-flow`.

- **auth-callback-observability** — `apps/web/app/auth/callback/route.ts:80` silently swallows the `exchangeCodeForSession` error and redirects to `/login?error=callback_failed` with no detail. No `Sentry.captureException` call; no error class in the redirect; no way to tell PKCE-cookie-loss from one-shot-code-reuse from network failure. Surfaced 2026-05-15 when first-prod-deploy of the auth flow failed for an invitee on iOS Safari Private Browsing and Sentry had nothing to show. The Private Browsing case is "won't fix" (see CLAUDE.md § Gotchas) but future failures in other configurations need to be observable.
  - **Why**: Without instrumentation, every magic-link failure is an unresolvable mystery — "the link didn't work" with zero detail. The auth surface is load-bearing for invitee onboarding; opaque failures will eat invites without anyone noticing.
  - **How**: in `apps/web/app/auth/callback/route.ts`, in the `if (error)` branch (line ~80), call `Sentry.captureException(error, { tags: { route: 'GET /auth/callback', stage: 'exchange_code' } })` before the redirect. Then extend the redirect to `/login?error=callback_failed&reason=<class>` where `<class>` is a coarse-grained classifier ("expired", "consumed", "pkce_cookie_missing", "network", "unknown"). Update `/login`'s page to render reason-specific copy when present (private-browsing hint for `pkce_cookie_missing`, "send a new one" for `expired`/`consumed`). Add tests for each reason. ~30-line PR.
  - **Where**: `apps/web/app/auth/callback/route.ts`, `apps/web/app/login/page.tsx`, `apps/web/app/login/_components/LoginForm.tsx`. Discovered 2026-05-15 during `/ak-go-live` on PR #19.

- **login-form-429-copy-honesty** — `apps/web/app/login/_components/LoginForm.tsx`'s 429 branch renders "You're sending links too fast. Wait a minute and try again." But the actual rate-limit window for Supabase inbuilt-SMTP free tier is ~2 emails/hour project-wide, not 1 minute. The copy lies to users.
  - **Why**: A friend hit this 30min after another invitee's attempts and assumed they'd hit a per-user rate limit they could wait a minute on; really the project-wide bucket was exhausted and the wait was up to an hour. Misleading copy degrades trust + wastes invitee patience.
  - **How**: rewrite the 429 copy to be vague-but-honest ("Try again in a bit — we're rate-limited") or specific-and-actionable if you have visibility into when the bucket refills. Pair with the rate-limit-bump or Resend SMTP wire (see CLAUDE.md § Gotchas) so the cap stops biting at all.
  - **Where**: `apps/web/app/login/_components/LoginForm.tsx`. Same PR as `auth-callback-observability` makes sense — both are LoginForm-adjacent copy/observability work.

<!--
Each entry:

- **<short-id>** — <one-sentence description of the work>
  - **Why**: <load-bearing reason — what breaks or decays without this>
  - **How**: <what the fix looks like, terse>
  - **Where**: <file paths or doc anchors>
-->

### launch-day

_No launch-day items._

## v1

_No v1 items._

## Dismissals

Items considered and explicitly not doing — preserved so we don't re-debate.

_No dismissals captured yet._

<!--
Each dismissal:

- **<short-id>** — <what was considered>
  - **Why not**: <reason — typically "captured in PRODUCT-ROADMAP.md § X" or "scope decision: Y">
-->
