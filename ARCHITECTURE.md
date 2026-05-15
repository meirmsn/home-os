<!-- This file is the project's SYSTEM-level overview — answers "how is this app built".
     For the PRODUCT-level view (what the app does, for whom, which flows), see OVERVIEW.md.
     Both are on-demand docs. The always-loaded entry-point is CLAUDE.md.
     Authoring rules: kit/docs/guide/conventions.md § Project Docs Hierarchy. -->

# ARCHITECTURE: home-os

> System-level map of how this app is built. Components, data flow, deployment topology, package responsibilities. For the product view (what the app does), see [OVERVIEW.md](./OVERVIEW.md).

## High-level shape

PWA on Next.js (App Router), backed by Supabase (auth + Postgres + Realtime + edge functions), deployed on Vercel. Two workspace packages: `@home-os/core` (typed Supabase factory + prod-URL guard) and `@home-os/ui` (design tokens + primitives). The browser holds full-resolution photos on-device in Phase 1; cloud sync is a Phase 2 opt-in. Triage and contractor-question generation call Anthropic via Supabase edge functions; the prod Anthropic key never leaves Supabase's hosted runtime.

```text
                              ┌─────────────────────────┐
                              │     macOS / iOS PWA     │
                              │   (apps/web — Next.js)  │
                              └───────────┬─────────────┘
                                          │ HTTPS + WSS
                ┌─────────────────────────┴─────────────────────────┐
                │                                                   │
       ┌────────▼─────────┐                                ┌────────▼─────────┐
       │ Vercel (SSR/CDN) │                                │     Supabase     │
       │  Next 16 runtime │◄──────── @supabase/ssr ───────►│  Auth + Postgres │
       │  middleware.ts   │            cookies              │  Realtime + Edge │
       └────────┬─────────┘                                └────────┬─────────┘
                │                                                   │
                │ Sentry sourcemaps + errors                        │ deploy-functions.yml
                │ PostHog events                                    │ pushes prod
                ▼                                                   ▼
       ┌──────────────────┐                                ┌──────────────────┐
       │ Sentry · PostHog │                                │  Anthropic API   │
       └──────────────────┘                                │   (via edge fn)  │
                                                          └──────────────────┘
```

## Components

### `apps/web` — Next.js PWA

- **Purpose**: User-facing PWA. App Router root + page tree, edge middleware for Supabase session refresh, security headers, PWA manifest.
- **Lives at**: `apps/web/` — see `apps/web/README.md` (added when content warrants).
- **Depends on**: `@home-os/core`, `@home-os/ui`, `@supabase/ssr`, `next`, `react`, `tailwindcss`. Reads `NEXT_PUBLIC_*` env vars (with `.trim()` defense at every call site).
- **Consumed by**: End users via Vercel's edge runtime.

### `packages/core` — typed Supabase factory + guard

- **Purpose**: Framework-agnostic Supabase client factory and the `assertNotProdUrlInTestEnv` guard that catches test-env callers pointing at the prod project. Hosts shared domain types (`src/models/`) and the runtime-validation Zod schemas (`src/schemas/`) for LLM and external-HTTP trust boundaries.
- **Lives at**: `packages/core/` — exports via `src/index.ts` barrel.
- **Depends on**: `@supabase/supabase-js`, `zod`.
- **Consumed by**: `apps/web` directly; future Supabase edge functions.

### `packages/ui` — design tokens + primitives

- **Purpose**: TypeScript source of truth for design tokens (colors, text, border, space, radius, typography, motion). Houses primitive components — currently `Button` as a proof-of-concept. Severity chip / status chip / card-face variants ship per-feature via `/ak-build`, not eagerly.
- **Lives at**: `packages/ui/` — exports via `src/index.ts` barrel.
- **Depends on**: `react` (peer + dev). No runtime deps in production builds beyond React.
- **Consumed by**: `apps/web`. `apps/web/app/globals.css` mirrors the same names as Tailwind v4 `@theme` CSS variables so JSX can pick either: TypeScript token import (`text.primary`) or Tailwind utility (`text-primary`).

### Local Supabase stack (`supabase-runner`)

- **Purpose**: Spawn a local Supabase stack from the workspace devcontainer via the cmd-relay on `supabase-runner:9000`. Rebound to +100 ports to avoid clash with concurrent lalista work on the same host.
- **Lives at**: `.devcontainer/compose.yml` (workspace service) + `.devcontainer/supabase-runner/` (runner service).
- **Depends on**: Docker socket bind on the runner side; `host.docker.internal` reachability on the workspace side.
- **Consumed by**: `pnpm db:start` / `pnpm db:status` / `pnpm db:reset` / `pnpm db:gen-types` and integration / E2E tests under `apps/web/e2e/`.

## Data flow

**1. SSR request lifecycle**

1. Browser issues a request → Vercel edge runtime invokes `apps/web/middleware.ts`.
2. Middleware calls `supabase.auth.getUser()` against the prod Supabase project — refreshes cookies as needed.
3. Request hits the Next.js App Router route; the route's server component calls `createClient()` from `apps/web/lib/supabase/server.ts`, which reads the refreshed cookies.
4. Server component renders HTML; client components hydrate and (when needed) instantiate the browser client from `apps/web/lib/supabase/client.ts`.
5. Realtime / Postgres-changes subscriptions open over WSS using the same anon JWT.

**2. Triage flow (Phase 1, planned)**

1. User captures a photo + description in `apps/web/app/(capture)/...`.
2. Client uploads photo to Supabase Storage (on-device fallback in Phase 1), then calls the `/api/triage` route handler.
3. Route handler forwards to the Supabase edge function `triage` (deployed via `deploy-functions.yml`).
4. Edge function calls Anthropic with `ANTHROPIC_API_KEY` (auto-injected from the project's edge runtime), returns a structured response validated by a Zod schema in `packages/core/src/schemas/`.
5. Card lifecycle row updates land in Postgres; Realtime pushes the state change to the dashboard.

**3. Deploy migration flow**

1. PR merges to `main` → `.github/workflows/deploy-migrations.yml` fires.
2. Workflow derives the project ref from `SUPABASE_PROD_URL` (Variable), connects via `SUPABASE_DB_PASSWORD` (Secret), runs `supabase db push`.

## External dependencies

| Service                          | Role                                                | Credentials (storage class)                                                                                         | Configured in                                                 |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Supabase (prod project)          | Auth + Postgres + Realtime + Storage + Edge runtime | `SUPABASE_PROD_URL` (Variable), `SUPABASE_DB_PASSWORD` (Secret), `SUPABASE_ACCESS_TOKEN` (Secret)                   | `.github/workflows/deploy-*.yml`, Vercel env (NEXT*PUBLIC*\*) |
| Vercel                           | SSR + CDN + auto-deploy                             | `VERCEL_TOKEN` (Secret + `.devcontainer/.env`)                                                                      | Vercel GitHub App + workspace `vercel link`                   |
| Anthropic (via Supabase edge fn) | Triage diagnostic + contractor-question generation  | `ANTHROPIC_API_KEY_PROD` (Secret → pushed to Supabase edge), `ANTHROPIC_API_KEY_QA` (Secret + `.devcontainer/.env`) | `.github/workflows/deploy-functions.yml`                      |
| Sentry                           | Error reporting + sourcemap upload                  | `SENTRY_DSN` (Secret + Vercel), `SENTRY_AUTH_TOKEN` (Secret + Vercel build env)                                     | `apps/web/sentry.*.config.ts` (added in subsequent commit)    |
| PostHog                          | Analytics + feature flags                           | `NEXT_PUBLIC_POSTHOG_KEY` (Variable + Vercel)                                                                       | `apps/web/lib/posthog.ts` (added in subsequent commit)        |
| GitHub                           | Source + CI + branch protection                     | Fine-grained PAT (`.devcontainer/.env`)                                                                             | Repo settings + workflows                                     |
| ntfy.sh                          | Optional Claude-Code notification topic             | `NTFY_URL` (`.devcontainer/.env`)                                                                                   | `.claude/settings.json` hooks                                 |

Blast-radius detail and rotation cadence: see `/ak-new-project § Security Posture` (loaded via the SessionStart hook).

## Deployment topology

- **Vercel** auto-deploys `apps/web` on push to `main` (GitHub App). Preview deploys land on every PR.
- **Supabase migrations** auto-deploy via `.github/workflows/deploy-migrations.yml` on push to `main`.
- **Supabase edge functions** auto-deploy via `.github/workflows/deploy-functions.yml` on push to `main` to paths under `supabase/functions/`.
- **`keepalive.yml`** runs weekly to prevent Supabase auto-pause on quiet weeks.

## Module map

| Directory            | Purpose                                                                                                                                                             | README                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `apps/web/`          | Next.js PWA — App Router pages, middleware, lib helpers, E2E suite (route handlers include `/api/card` POST + `/api/card/[id]/restore` POST per capture-flow PR #3) | (added when content warrants)                  |
| `packages/core/`     | Typed Supabase factory + prod-URL guard + shared models + Zod schemas                                                                                               | (added when content warrants)                  |
| `packages/ui/`       | Design tokens (TS) + primitive components                                                                                                                           | (added when content warrants)                  |
| `supabase/`          | Migrations + edge functions (populated at `supabase init` — Step 15)                                                                                                | `supabase/functions/README.md` (opt-in per fn) |
| `.devcontainer/`     | Dev container + supabase-runner sibling + firewall                                                                                                                  | `.devcontainer/README.md`                      |
| `.github/workflows/` | CI (fast/slow), deploy-migrations, deploy-functions, keepalive                                                                                                      | n/a                                            |
| `.gstack/`           | Plan-mode artifacts (ceo / design / eng review docs)                                                                                                                | n/a                                            |

## Where to look next

- [OVERVIEW.md](./OVERVIEW.md) — what the product does, who uses it, which flows
- [CLAUDE.md](./CLAUDE.md) — always-loaded entry point with `§ Where Things Happen` path map
- Per-package READMEs (when present) — finer-grained module docs
- [BUILD-LOG.md](./BUILD-LOG.md) — what has shipped, in chronological order
