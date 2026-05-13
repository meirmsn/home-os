# CLAUDE.md

> **Orientation**: drill in on demand —
>
> - **Foundational** (what is this / how is it built): `OVERVIEW.md` (product), `ARCHITECTURE.md` (system). Per-package detail in `apps/<x>/README.md`, `packages/<x>/README.md`, `supabase/functions/README.md` (opt-in per package).
> - **Operational** (project-management state): `PLAN.md`, `BUILD-LOG.md`, `TODOS.md`, `METRICS.md`, `PRODUCT-ROADMAP.md`.

## Project: home-os

Intelligent home maintenance companion. Captures a homeowner's issues (photo + description), triages them via a two-phase AI diagnostic conversation, helps the user decide between DIY and contractor paths, and tracks the lifecycle from capture through close. Calm authority, not anxiety amplifier — spiral prevention is an explicit design goal. PWA on the dark warm-charcoal ground.

### Where Things Happen

Path map of every documented surface. Update this section when introducing a new page, API wrapper, edge function, design token surface, or CI/CD workflow — `kit/scripts/commit-hooks/check-docs-freshness-project.sh` blocks PRs that add a triggering surface without updating this section.

- **App router root + landing**: `apps/web/app/layout.tsx` (Inter font, PWA metadata, dark ground, `<PostHogProvider>` mount), `apps/web/app/page.tsx` (placeholder landing until first feature ships).
- **Analytics provider (client boundary)**: `apps/web/app/_components/PostHogProvider.tsx` — `'use client'` wrapper that triggers `initPostHog()` once per browser session.
- **PostHog init**: `apps/web/lib/posthog.ts` — `initPostHog()` reads `NEXT_PUBLIC_POSTHOG_KEY` (`.trim()`-defended), no-ops on SSR or missing key, dials `us.i.posthog.com`.
- **Sentry init (client / server / edge)**: `apps/web/sentry.client.config.ts`, `apps/web/sentry.server.config.ts`, `apps/web/sentry.edge.config.ts`. Server + edge are wired by `apps/web/instrumentation.ts` via `process.env.NEXT_RUNTIME`. `next.config.ts` is wrapped with `withSentryConfig` for sourcemap upload (driven by `SENTRY_AUTH_TOKEN`; silently no-ops without it).
- **Global styles + Tailwind v4 @theme**: `apps/web/app/globals.css` (mirrors `packages/ui/src/tokens.ts` — single naming source).
- **Supabase SSR client (browser)**: `apps/web/lib/supabase/client.ts` — `createBrowserClient` with the canonical `.trim()` env-var defense.
- **Supabase SSR client (server)**: `apps/web/lib/supabase/server.ts` — `createServerClient` reading from Next's async `cookies()` store.
- **Edge middleware (session refresh + auth redirects)**: `apps/web/middleware.ts` — runs `supabase.auth.getUser()` on every non-asset request to keep cookies fresh AND enforces auth-magic-link D6 redirect rules: anonymous + path startsWith `/home` redirects to `/login?next=<original-path>`; authenticated + path === `/login` redirects to `/home`. `getUser()` is wrapped in try/catch so a stale-cookie throw falls through as "anonymous". Asset paths + `/` (public landing) + `/auth/*` callback URLs stay untouched. Test: `apps/web/middleware.test.ts` (9 cases).
- **Magic-link sign-in page (`/login`)**: `apps/web/app/login/page.tsx` (server-component shell that reads `?error=callback_failed` and forwards to the client form) + `apps/web/app/login/_components/LoginForm.tsx` (`'use client'` form: email input + submit that calls `supabase.auth.signInWithOtp` with `emailRedirectTo = <window.location.origin>/auth/callback?next=/home` per D13; fires `posthog.capture('sign_in_requested', { method: 'magic_link' })` on success per D7; 429 → rate-limit copy, other errors → generic copy + `Sentry.captureException`). Test: `apps/web/app/login/page.test.tsx` (7 cases). `LoginForm.tsx` is in `.devshop-test-coverage-exempt` (covered transitively by `page.test.tsx`).
- **PKCE callback route handler (`GET /auth/callback`)**: `apps/web/app/auth/callback/route.ts` — reads `?code` + `?next` from the magic-link redirect URL, calls `supabase.auth.exchangeCodeForSession(code)`, 303-redirects to `next` (default `/home`) on success or to `/login?error=callback_failed` on error / missing code (D4). 303 (not 307/308) keeps `@supabase/ssr`'s `setAll` cookie writes on the same response the browser sees. Open-redirect defense: `safeNext()` enforces that `next` starts with `/` and is NOT protocol-relative (`//evil.example`) — anything else falls back to `/home` (closes the class flagged in pre-ship /cso). `export const dynamic = 'force-dynamic'`. Test: `apps/web/app/auth/callback/route.test.ts` (7 cases — success + 3 error paths + 3 open-redirect defenses).
- **Sign-out POST route handler (`POST /auth/signout`)**: `apps/web/app/auth/signout/route.ts` — POST-only. Calls `supabase.auth.signOut()` and 303-redirects to `/login`. GET/PUT/PATCH/DELETE return 405 with `Allow: POST`. POST-only matches the same-origin CSRF posture of the `<form method="post">` in the (app) header (D11). No PostHog event per D7. Test: `apps/web/app/auth/signout/route.test.ts` (2 cases).
- **Authenticated `(app)` shell + `/home`**: `apps/web/app/(app)/layout.tsx` (D3, D11 — server-component shell with defense-in-depth `supabase.auth.getUser()` → `redirect('/login')` if null, minimal header with the signed-in email + a POST sign-out form, mounts `<SignInCompletedCapture />`) + `apps/web/app/(app)/home/page.tsx` (minimal authenticated landing). Layout test: `apps/web/app/(app)/layout.test.tsx`; home test: `apps/web/app/(app)/home/page.test.tsx`.
- **`sign_in_completed` capture component**: `apps/web/app/(app)/_components/SignInCompletedCapture.tsx` — `'use client'` zero-output component mounted by the `(app)` layout. Calls `posthog.identify(user.id, { email })` FIRST (D7 — identify-before-capture so the event lands on the user's distinct_id, not the anonymous one), then `posthog.capture('sign_in_completed', { method: 'magic_link' })`. Guarded by a `sessionStorage` key `home_os.sign_in_completed_fired:<user-id>` so the capture fires exactly once per (user × session); a fresh sign-in after sign-out re-fires automatically because the key is keyed off `user.id`. Test: `apps/web/app/(app)/_components/SignInCompletedCapture.test.tsx` (4 cases).
- **Inbucket E2E helper**: `apps/web/e2e/helpers/inbucket.ts` — `latestMagicLink(email)` polls `http://127.0.0.1:54424/api/v1/mailbox/<mailbox>` (Inbucket port from § Local Supabase ports), pulls the latest message body, and extracts the first `http(s)://.../auth/callback` URL via regex. Used by `magic-link.spec.ts`; mirrors the `helpers/admin-client.ts` convention (named export per helper, hard-coded port, no env var).
- **Magic-link E2E**: `apps/web/e2e/magic-link.spec.ts` — full round-trip spec (submit form → poll Inbucket → follow magic link → assert `/home` shell → sign out → assert middleware bounce). Skips gracefully via `test.skip(!isLocalSupabase, …)` (same pattern as `rls-isolation.spec.ts`) so CI fast-job reports skipped; slow-job is the enforcement surface.
- **E2E Supabase helpers (Pattern 3)**: `apps/web/e2e/helpers/admin-client.ts` — five canonical exports (`adminClient` / `anonClient` / `userIdFromSignIn` / `isLocalSupabase` / `localSupabaseSkipReason`). `adminClient` refuses to run unless `isLocalSupabase` is true.
- **Security headers + CSP**: `apps/web/next.config.ts` — HSTS / X-Frame-Options / nosniff / Referrer-Policy / Permissions-Policy. CSP `connect-src` is built at config-load time from `NEXT_PUBLIC_SUPABASE_URL`, including its `ws(s)://` variant so Realtime works in both prod and local-stack shapes.
- **Workspace TS factory + prod-URL guard**: `packages/core/src/supabase.ts` — framework-agnostic `createClient(config)` + `assertNotProdUrlInTestEnv` (throws when `NODE_ENV=test` callers pass a URL pointing at the production project ref).
- **Design tokens (TS source of truth)**: `packages/ui/src/tokens.ts` — colors / text / border / space / radius / typography / motion. `apps/web/app/globals.css` mirrors the naming as Tailwind v4 `@theme` variables.
- **UI primitives**: `packages/ui/src/Button.tsx` — proof-of-concept; chip / card variants ship per-feature via `/ak-build`.
- **PWA manifest + icons**: `apps/web/public/manifest.json` + `apps/web/public/icon.svg` (placeholder house silhouette on dark ground). Apple touch icon + raster sizes 192/512 deferred until brand assets exist.
- **Local Supabase ports (rebound +100)**: `.devcontainer/compose.yml` socat forwards, `.devcontainer/supabase-runner/Dockerfile` EXPOSE, `.devcontainer/init-firewall.sh` allowlist. Rebound to avoid lalista collision: api/kong 54421, db 54422, studio 54423, inbucket 54424, realtime/analytics 54427.
- **Supabase schema migrations (foundation v0 Phase 1 PR #1)**:
  - `supabase/migrations/20260513184100_001_enums.sql` — 7 native Postgres enums (`card_state`, `system_tag`, `severity`, `contractor_tag`, `touchpoint_type`, `photo_slot`, `triage_role`).
  - `supabase/migrations/20260513184101_002_tables.sql` — 5 public-schema tables (`users`, `cards`, `triage_conversations`, `card_photos`, `usage_counters`) with FKs (`on delete cascade`), CHECK constraints (cards monitoring cadence + version; triage round 1-3; usage counters non-negative), and indexes on every FK column + `cards.state`.
  - `supabase/migrations/20260513184102_003_rls_tables.sql` — `ENABLE ROW LEVEL SECURITY` + 4 per-action policies on each of the 5 public tables (20 total). Predicate is `auth.uid() = id` for `users` and `auth.uid() = user_id` everywhere else.
  - `supabase/migrations/20260513184103_004_storage.sql` — private `card-photos` bucket (idempotent `ON CONFLICT DO NOTHING`) + 4 `storage.objects` policies gated by `bucket_id = 'card-photos' AND (storage.foldername(name))[1] = auth.uid()::text`.
  - `supabase/migrations/20260513184104_005_triggers.sql` — `create_public_user_profile()` SECURITY DEFINER (with pinned `search_path`) + `on_auth_user_created` AFTER INSERT trigger on `auth.users` (D2); `set_updated_at()` + `cards_updated_at` BEFORE UPDATE trigger (D6).
- **Storage bucket (private)**: `card-photos`. Path convention `{user_id}/cards/{card_id}/touchpoints/{touchpoint_id}/{slot}.jpg`; RLS scoped on the leading path segment matching `auth.uid()::text`.
- **Auth-signup → profile trigger**: `public.create_public_user_profile()` + `on_auth_user_created` AFTER INSERT trigger on `auth.users`. Eliminates the race window between signup and the first app-side read against `public.users`.
- **Cards `updated_at` trigger**: `public.set_updated_at()` (generic) + `cards_updated_at` BEFORE UPDATE trigger on `public.cards`. Other tables add the trigger in their own migrations when they grow update flows.
- **Generated Database types**: `packages/core/src/supabase.types.ts` — regenerated via `pnpm db:gen-types` against the local stack (D11). Contains all 5 Tables and all 7 Enums.
- **Multi-user RLS isolation E2E**: `apps/web/e2e/rls-isolation.spec.ts` — two-user Playwright spec (Pattern 3 helpers). Asserts SELECT/INSERT/UPDATE/DELETE + storage download/upload isolation in both directions on all 5 tables. Skips gracefully via `test.skip(!isLocalSupabase, …)` so CI fast-job reports skipped; slow-job is the enforcement surface.

_This section grows as code is added. Update it when introducing new paths._

### Gotchas

Non-obvious rules surfaced by shipping work. Read before touching the relevant area. Add an entry only when a real gotcha bit a session — not preemptively.

- **PostgREST returns `data: null` + populated `error` on a non-existent column; downstream code typically swallows the error.** Any `.from(...).select(...)` that names a column that doesn't exist (typo, stale generated types, or a FK that was deliberately not added) responds with `{ data: null, error: { message: 'column "<x>" does not exist', ... } }`. The next line that touches `data.<field>` crashes with `TypeError: Cannot read properties of null (reading '<field>')` — a generic null-deref that looks like missing-data, not a column typo. **Always check `error` before consuming `data`** at every `.select()` call site (single-row AND array form). Don't rely on the `<Row>` generic — that's a compile-time cast against generated types, which can be stale post-migration.
- **`.trim()` on every `NEXT_PUBLIC_*` env read.** A trailing newline or space in a copy-pasted env value silently 500s SSR routes via Supabase URL parsing. Defense lives in `apps/web/lib/supabase/{client,server}.ts` and `apps/web/middleware.ts` already; replicate at any new env-read site.
- **`PRODUCTION_URL` lives in two places with different formats.** `.devcontainer/.env` wants the bare hostname (`<your-app>.com`) — consumed by `/usr/local/bin/refresh-allowed-ips.sh`. The GitHub Variable wants the full URL form (`https://<your-app>.com`) — consumed by `.github/workflows/keepalive.yml`. Don't paste one into the other.

### Testing

Unit tests live alongside their source (`packages/*/**.test.ts`, `apps/*/**.test.ts`). Integration tests opt in via the `*.integration.test.ts` suffix. E2E lives in `apps/web/e2e/` (Playwright).

**Test-presence is enforced at pre-commit**: every new `.ts`/`.tsx` file under `apps/*/{src,app,components,lib,hooks}/` or `packages/*/src/` needs a paired `*.test.ts` (or sibling exemption — see `guide/conventions.md § Test Presence`). The override file is `.devshop-test-coverage-exempt` at repo root.

### Stack

Next.js 16 (App Router, React 19) · Turborepo + pnpm workspace · `packages/core` (typed Supabase factory + prod-URL guard) · `packages/ui` (design tokens + primitives) · Supabase (auth + Postgres + Realtime + edge functions) · Vercel (deploy + env) · Tailwind v4 (CSS `@theme`) · Inter (Latin subset, three weights, next/font preload) · Sentry (errors, sourcemaps) · PostHog (analytics, feature flags) · Vitest (unit) · Playwright (E2E) · GitHub Actions (CI) · ESLint + Prettier · husky + lint-staged · gitleaks · DCG.

### Env Var Naming

Per devshop convention, GitHub Secrets use the base name; each surface adds its prefix. `packages/core` does NOT read env vars — exports `createClient(config)`, each app passes prefixed vars in.

| Base name                 | Next.js (Vercel)                |
| ------------------------- | ------------------------------- |
| `SUPABASE_URL`            | `NEXT_PUBLIC_SUPABASE_URL`      |
| `SUPABASE_ANON_KEY`       | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `SENTRY_DSN`              | `NEXT_PUBLIC_SENTRY_DSN`        |
| `NEXT_PUBLIC_POSTHOG_KEY` | `NEXT_PUBLIC_POSTHOG_KEY`       |

Anthropic edge functions (when added) use the split: `ANTHROPIC_API_KEY_QA` in CI + local; `ANTHROPIC_API_KEY_PROD` pushed to the Supabase project's edge runtime by `deploy-functions.yml`; the function code reads the canonical `ANTHROPIC_API_KEY` (Supabase auto-rebinds the PROD key at runtime).

### Migration Workflow

```bash
supabase migration new <name>   # create migration (workspace — fs only, no docker)
pnpm db:reset                   # apply locally (relay → supabase-runner)
pnpm db:gen-types               # regen types from local stack (relay → supabase-runner)
# Migrations deploy via CI on push-to-main
# (.github/workflows/deploy-migrations.yml; project ref is sed-derived from
# the SUPABASE_PROD_URL Variable).
```

## Deploy Configuration (configured by /setup-deploy)

- Platform: Vercel (team `homeos`, project `home-os`, `prj_4dMkbHkxYohqABcKt1SwaprZv3JM`)
- Production URL: https://home-os-nu-two.vercel.app _(confirmed 2026-05-13 after first green deploy `dpl_Dgie2QVpqBeTdqNU9kHJQBE6spmU`. The team-canonical `home-os-homeos.vercel.app` is gated behind Vercel SSO Protection (`ssoProtection.deploymentType = all_except_custom_domains`), so the auto-allocated `home-os-nu-two.vercel.app` is the public-facing alias. When you set up a custom domain, it'll bypass SSO automatically and become the canonical public URL — at that point, replace this value.)_
- Deploy workflow: Vercel auto-deploys on push — preview URL on every PR, production on merge to `main`. Supplementary GitHub Actions: `deploy-migrations.yml` (Supabase schema push) + `deploy-functions.yml` (Supabase edge fns) + `keepalive.yml` (weekly Supabase ping).
- Deploy status command: `pnpm exec vercel ls --token "$VERCEL_TOKEN" --scope homeos` (deployments) or `pnpm exec vercel inspect home-os --token "$VERCEL_TOKEN" --scope homeos` (project meta).
- Merge method: squash (linear history, branch protection enforces)
- Project type: web app — Next.js 16 PWA hosted on Vercel
- Post-deploy health check: `curl -sf https://home-os-nu-two.vercel.app/ -o /dev/null -w "%{http_code}"` expects `200`.

### Custom deploy hooks

- Pre-merge: none (CI fast-job covers typecheck + tests; slow-job uncomments after Phase 1c/1g when integration / E2E specs land)
- Deploy trigger: automatic on push to `main` via Vercel GitHub App
- Deploy status: poll production URL until it returns 200 with the new build hash header
- Health check: https://home-os-nu-two.vercel.app/

### Vercel dashboard follow-ups (operator)

- Set **Framework Preset** → `Next.js` (currently `Other` — affects build cache + image optimization)
- Set **Root Directory** → `apps/web` (currently `.` — required for monorepo build to find `next.config.ts`)
- Set **Install Command** → `pnpm install --frozen-lockfile` (optional but explicit)
- Establish **GitHub Login Connection** at vercel.com/account/login-connections so the project can auto-import + auto-deploy on push (initial `vercel link` reported "Failed to link meirmsn/home-os. You need to add a Login Connection")
