# Build Log

> **[TODO] CAPTCHA deferred** — hCaptcha was not configured during `/ak-new-project` Step 17b. Before public launch, mint a secret at https://dashboard.hcaptcha.com/ and apply via `PATCH /v1/projects/kxhxbbljgunpjfhivccb/config/auth` with `{"security_captcha_enabled": true, "security_captcha_provider": "hcaptcha", "security_captcha_secret": "<secret>"}`. Remove this line when done.

> **[TODO] Preview-deploy email-auth deferred** — `uri_allow_list` is the minimal pair (`https://home-os-homeos.vercel.app/**` + `http://localhost:3000/**`). Email-auth flows (password reset, magic link, signup confirm) will not work from Vercel PR preview deploys. When needed, append the team-hash wildcard (typically `https://*-<team-slug>-<team-hash>.vercel.app/**`) via the same Management API PATCH on `uri_allow_list`.

Project build history. One entry per merged PR, most-recent first. Written by `/ak-build` Phase 5.6 on the feature branch before merge, so the entry ships as part of its own PR.

For forward-looking plan: `PLAN.md`. For deferred/long-term work: `PRODUCT-ROADMAP.md`.

_No builds yet._
