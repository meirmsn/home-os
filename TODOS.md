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

- **firewall-rebound-ports** — Update `.devcontainer/init-firewall.sh` to allow supabase ports `54421 + 54422` (the rebound `+100` ports per CLAUDE.md § Local Supabase ports), not the upstream-default `54321 + 54322`.
  - **Why**: Without this, the workspace container's egress firewall blocks `host.docker.internal:54421`, so `apps/web/e2e/rls-isolation.spec.ts` (and any future supabase-touching test) cannot run from workspace — fails with `EHOSTUNREACH` before reaching any assertion.
  - **How**: change `--dport 54321` → `--dport 54421` and `--dport 54322` → `--dport 54422` in `init-firewall.sh` (lines 233-234). Re-run `sudo /usr/local/bin/init-firewall.sh` in the workspace, or `Reopen in Container` to re-apply.
  - **Where**: `.devcontainer/init-firewall.sh:213-237`. Discovered while implementing `supabase-schema-and-rls` PR — the isolation E2E parses cleanly but cannot reach the local stack from workspace because of the stale port allowlist.

- **firewall-google-fonts** — Add `fonts.googleapis.com` to `.devcontainer/firewall-extra-domains` so local `pnpm turbo run build` can fetch the Inter font at build time.
  - **Why**: `apps/web/app/layout.tsx` uses `next/font/google` for `Inter`, which fetches the font CSS from `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap` during Turbopack build. The workspace's egress firewall does not allow `fonts.googleapis.com`, so local builds fail with `Failed to fetch 'Inter' from Google Fonts`. CI builds (Vercel) succeed because they run outside this firewalled container — CI is the canonical enforcement surface for build verification.
  - **How**: append `fonts.googleapis.com` (and likely `fonts.gstatic.com`, which serves the actual woff2 files) to `.devcontainer/firewall-extra-domains`, then `sudo /usr/local/bin/init-firewall.sh` to re-apply.
  - **Where**: `.devcontainer/firewall-extra-domains`. Discovered while running pre-ship Gate 4 on `supabase-schema-and-rls` PR.

- **ci-slow-job-activation** — Uncomment the `slow:` job in `.github/workflows/ci.yml` so the integration + E2E specs that landed in PR #9 (`rls-isolation.spec.ts`) and PR #10 (`magic-link.spec.ts`) actually run in CI.
  - **Why**: Per `.github/workflows/ci.yml` lines 80-83, the slow-job's `needs: [fast, changes]` plus the path-filter `changes:` job were stubbed when the workflow was scaffolded, on the premise that there were no slow specs to run yet. PR #9 + PR #10 crossed that threshold. Until the stub is uncommented, slow specs land green on push but are not enforced by CI — silent regression risk grows with every PR that touches Supabase or auth.
  - **How**: uncomment the `slow:` job block (`.github/workflows/ci.yml` line 142 onward) plus the dependent `changes:` job that `needs:` references. Verify locally with `act` if available, otherwise push to a draft PR and watch the workflow.
  - **Where**: `.github/workflows/ci.yml:80-83 + 142+`. Discovered as Gate 2c finding during `/ak-pre-ship` for `pwa-spike` PR; pre-existing on `origin/main` (not caused by `pwa-spike`).

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
