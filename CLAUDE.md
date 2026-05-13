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
- **Edge middleware (session refresh)**: `apps/web/middleware.ts` — runs `supabase.auth.getUser()` on every non-asset request to keep cookies fresh.
- **E2E Supabase helpers (Pattern 3)**: `apps/web/e2e/helpers/admin-client.ts` — five canonical exports (`adminClient` / `anonClient` / `userIdFromSignIn` / `isLocalSupabase` / `localSupabaseSkipReason`). `adminClient` refuses to run unless `isLocalSupabase` is true.
- **Security headers + CSP**: `apps/web/next.config.ts` — HSTS / X-Frame-Options / nosniff / Referrer-Policy / Permissions-Policy. CSP `connect-src` is built at config-load time from `NEXT_PUBLIC_SUPABASE_URL`, including its `ws(s)://` variant so Realtime works in both prod and local-stack shapes.
- **Workspace TS factory + prod-URL guard**: `packages/core/src/supabase.ts` — framework-agnostic `createClient(config)` + `assertNotProdUrlInTestEnv` (throws when `NODE_ENV=test` callers pass a URL pointing at the production project ref).
- **Design tokens (TS source of truth)**: `packages/ui/src/tokens.ts` — colors / text / border / space / radius / typography / motion. `apps/web/app/globals.css` mirrors the naming as Tailwind v4 `@theme` variables.
- **UI primitives**: `packages/ui/src/Button.tsx` — proof-of-concept; chip / card variants ship per-feature via `/ak-build`.
- **PWA manifest + icons**: `apps/web/public/manifest.json` + `apps/web/public/icon.svg` (placeholder house silhouette on dark ground). Apple touch icon + raster sizes 192/512 deferred until brand assets exist.
- **Local Supabase ports (rebound +100)**: `.devcontainer/compose.yml` socat forwards, `.devcontainer/supabase-runner/Dockerfile` EXPOSE, `.devcontainer/init-firewall.sh` allowlist. Rebound to avoid lalista collision: api/kong 54421, db 54422, studio 54423, inbucket 54424, realtime/analytics 54427.

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

- Platform: <fill in>
- Production URL: <fill in>
- Deploy workflow: <fill in>
- Deploy status command: <fill in>
- Merge method: <fill in — typically squash>
- Project type: <fill in>
- Post-deploy health check: <fill in>

### Custom deploy hooks

- Pre-merge: <none, or specify>
- Deploy trigger: <e.g. automatic on push to main>
- Deploy status: <e.g. poll production URL>
- Health check: <URL>
