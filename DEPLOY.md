# Deploy — home-os

> Operational runbook for deploying home-os. Configured by `/setup-deploy`. The committed `CLAUDE.md` keeps a one-line pointer here; this file owns the detail so CLAUDE.md stays slim.

## Platform

- **Vercel** — team `homeos`, project `home-os`, project ID `prj_4dMkbHkxYohqABcKt1SwaprZv3JM`.
- **Project type**: web app — Next.js 16 PWA hosted on Vercel.

## Production URL

`https://home-os-nu-two.vercel.app`

_(Confirmed 2026-05-13 after first green deploy `dpl_Dgie2QVpqBeTdqNU9kHJQBE6spmU`. The team-canonical `home-os-homeos.vercel.app` is gated behind Vercel SSO Protection (`ssoProtection.deploymentType = all_except_custom_domains`), so the auto-allocated `home-os-nu-two.vercel.app` is the public-facing alias. When a custom domain lands, it will bypass SSO automatically and become the canonical public URL — at that point, replace this value.)_

## Deploy flow

- **Vercel auto-deploys** `apps/web` on push via the GitHub App:
  - **Preview** deploy on every PR.
  - **Production** deploy on merge to `main`.
- **Supplementary GitHub Actions workflows**:
  - `.github/workflows/deploy-migrations.yml` — pushes Supabase schema on merge to `main` (project ref sed-derived from `SUPABASE_PROD_URL`).
  - `.github/workflows/deploy-functions.yml` — pushes Supabase edge functions on merge to `main` (path-filtered to `supabase/functions/**`).
  - `.github/workflows/keepalive.yml` — weekly Supabase ping to prevent auto-pause on quiet weeks.

## Operational commands

```bash
# List recent deployments
pnpm exec vercel ls --token "$VERCEL_TOKEN" --scope homeos

# Inspect project meta (env vars, build config, etc.)
pnpm exec vercel inspect home-os --token "$VERCEL_TOKEN" --scope homeos
```

## Merge method

**Squash** — linear history, enforced by branch protection on `main`.

## Custom deploy hooks

- **Pre-merge**: none. CI fast-job covers typecheck + tests. Slow-job uncomments after Phase 1c/1g when integration / E2E specs land.
- **Deploy trigger**: automatic on push to `main` via the Vercel GitHub App.
- **Deploy status**: poll production URL until it returns 200 with the new build hash header.
- **Health check**: `curl -sf https://home-os-nu-two.vercel.app/ -o /dev/null -w "%{http_code}"` expects `200`.

## Vercel dashboard follow-ups

Operator action items that can only be done in the Vercel dashboard live in `TODOS.md § Vercel dashboard follow-ups`. They are not deploy-runbook items but pending one-time config changes.

## Cross-references

- `ARCHITECTURE.md § Deployment topology` — system-level view.
- `BUILD-LOG.md` — chronological deploy history.
- `kit/docs/guide/ops.md` (delivered via the SessionStart hook for project sessions) — devshop-wide deploy / ops conventions.
