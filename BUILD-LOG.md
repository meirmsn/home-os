# Build Log

> **[TODO] CAPTCHA deferred** — hCaptcha was not configured during `/ak-new-project` Step 17b. Before public launch, mint a secret at https://dashboard.hcaptcha.com/ and apply via `PATCH /v1/projects/kxhxbbljgunpjfhivccb/config/auth` with `{"security_captcha_enabled": true, "security_captcha_provider": "hcaptcha", "security_captcha_secret": "<secret>"}`. Remove this line when done.

> **[TODO] Preview-deploy email-auth deferred** — `uri_allow_list` is the minimal pair (`https://home-os-nu-two.vercel.app/**` + `http://localhost:3000/**`). Email-auth flows (password reset, magic link, signup confirm) will not work from Vercel PR preview deploys. When needed, append the team-hash wildcard (typically `https://*-<team-slug>-<team-hash>.vercel.app/**`) via the same Management API PATCH on `uri_allow_list`.

> **[TODO] PWA-spike surfaces deferred for cleanup** — After `photo-comparison-ui` ships and its design decisions are baked in, delete: `apps/web/app/(app)/spike/`, `apps/web/public/spike/`, the `## Where Things Happen` entries for spike surfaces, and the spike paths from any `connect-src` / route allowlists. Remove this line when done.

Project build history. One entry per merged PR, most-recent first. Written by `/ak-build` Phase 5.6 on the feature branch before merge, so the entry ships as part of its own PR.

For forward-looking plan: `PLAN.md`. For deferred/long-term work: `PRODUCT-ROADMAP.md`.

### auth-magic-link (2026-05-13)

- **Branch**: `feat/auth-magic-link` (merging via [#10](https://github.com/meirmsn/home-os/pull/10))
- **PR**: [#10](https://github.com/meirmsn/home-os/pull/10)
- **Spec**: `specs/auth-magic-link/spec.md`
- **Summary**: Magic-link sign-in/up on top of PR #9's schema. `/login` page + client form calling `signInWithOtp`, PKCE `/auth/callback` exchange with `safeNext()` open-redirect guard, POST-only `/auth/signout`, `(app)/` route group with `/home` authenticated shell + sign-out form, and middleware-enforced redirects (anon + gated → `/login?next=<orig>`; authed + `/login` → `/home`). Two new PostHog events (`sign_in_requested`, `sign_in_completed`) wired to the conversion funnel. Inbucket-backed Playwright E2E spec covering the full round-trip.
- **Commits**: 15 atomic commits — 1 PLAN flip to Active, 1 spec (skeleton + Phase 1 expand combined), 8 implement (one per spec § Task order entry), 1 tasks.md bookkeeping, 4 pre-ship findings (open-redirect defense + 44px touch targets + safeNext docs + review.md+hero shots), plus the BUILD-LOG bookkeeping commit on top.
- **Quality gates**: 13 passed, 4 n/a, 0 high-severity blockers; 2 findings_pending (devcontainer-environment carry-overs from PR #9: workspace firewall blocks `fonts.googleapis.com`; slow-job CI stub remains commented) and 1 blocked (Gate 9 `/qa` — devcontainer can't reach local Supabase Kong on :54421). All three are infrastructure / env defects, NOT code regressions; Vercel preview Ready (deploy URL in PR body). Slow-job CI is the canonical Playwright E2E enforcement surface per spec D10.

### supabase-schema-and-rls (2026-05-13)

- **Branch**: `feature/supabase-schema-and-rls` (merging via [#9](https://github.com/meirmsn/home-os/pull/9))
- **PR**: [#9](https://github.com/meirmsn/home-os/pull/9)
- **Spec**: `specs/supabase-schema-and-rls/spec.md`
- **Summary**: Foundation PR — 5 sequential Supabase migrations (7 enums, 5 tables, RLS on every table, private `card-photos` bucket, auth-signup trigger, cards `updated_at` trigger), regenerated `Database` types, and the multi-user RLS isolation E2E (14 tests) gating eng-review Pre-Ship Requirement #3. No UI; foundation for every subsequent v0 Phase 1 feature.
- **Commits**: 14 atomic commits — 1 PLAN/ROADMAP prep, 2 spec (skeleton + Phase 1 expand), 1 PLAN flip to Active, 8 implement (per-migration / types / E2E / docs), 2 pre-ship findings (ROLLBACK blocks + review finalization), plus the BUILD-LOG bookkeeping commit on top.
- **Quality gates**: 9 passed, 7 n/a (no UI), 0 blocked, 2 findings_pending — both are environment defects, not code (workspace firewall blocks `fonts.googleapis.com` for local build; firewall allowlists `54321/54322` instead of the rebound `54421/54422` for local E2E). Vercel CI builds clean; slow-job lane (not yet enabled) is the canonical E2E enforcement surface per spec D10. Both filed in `TODOS.md § v0 pre-ship`.
