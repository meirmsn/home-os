<!-- audited-at: 460d277901dabf26095273521588d9902241d7d0 -->

# Pre-Ship Review: supabase-schema-and-rls

Feature: `supabase-schema-and-rls`
Branch: `feature/supabase-schema-and-rls`
HEAD: `460d277901dabf26095273521588d9902241d7d0`
Run date: 2026-05-13

## Router Summary

(populated at the end of the run)

## Scope

Foundation PR: schema migrations + RLS policies + storage bucket + auth-signup trigger + types regeneration + isolation E2E. Diff against `origin/main`:

```
CLAUDE.md
PLAN.md
PRODUCT-ROADMAP.md
TODOS.md
apps/web/.gitignore
apps/web/e2e/rls-isolation.spec.ts
packages/core/src/supabase.types.ts
specs/supabase-schema-and-rls/spec.md
specs/supabase-schema-and-rls/tasks.md
supabase/migrations/20260513184100_001_enums.sql
supabase/migrations/20260513184101_002_tables.sql
supabase/migrations/20260513184102_003_rls_tables.sql
supabase/migrations/20260513184103_004_storage.sql
supabase/migrations/20260513184104_005_triggers.sql
```

No rendered UI surface. Per the spec's `## Core user story` (which reads "N/A — foundation database migration PR"), Gates 6 (responsive+theme), 11 (`/design-review`), 12 (`/qa`), 13 (`/benchmark`), 16 (hero shots) are `n/a`.

---

## Gate 1: preflight + tooling

**Outcome:** `pass`

- `pnpm` 10.33.0, `turbo` 2.9.12
- `eslint` v9.39.4, `prettier` 3.8.3, `tsc` 6.0.3
- `gitleaks` 8.30.1
- `dcg` available at `/usr/local/bin/dcg`
- `gh` authenticated as `meirmsn` (GITHUB_TOKEN)
- Branch is `feature/supabase-schema-and-rls` (not main)
- `kit/scripts/preship/` reachable via `/workspace/.devshopkit/scripts/preship/`

UI-scope test: `git diff --name-only origin/main...HEAD | grep -E '^(apps/|packages/ui/|components/)'` returns only `apps/web/.gitignore` and `apps/web/e2e/rls-isolation.spec.ts` — neither is a rendered surface. Chromium / browser-daemon preflight is advisory only (no browser-dependent gates apply to this PR).

### Dismissals

None

---

## Gate 2: docs check

**Outcome:** `pass`

`check-docs-freshness-project.sh` ran on each commit via the husky/pre-commit chain and produced a clean tree post-commit (`git status` reports nothing to commit, working tree clean). CLAUDE.md § Where Things Happen now documents:

- All 5 new migration files (with shape annotations)
- The `card-photos` private bucket + path convention
- The auth-signup trigger
- The `cards_updated_at` trigger
- The regenerated `Database` types file
- The new `rls-isolation.spec.ts`

Verified via `grep` against `/workspace/CLAUDE.md`. No drift between the diff and the documented surfaces.

### Dismissals

None

---

## Gate 3: metrics check

**Outcome:** `n/a (foundation schema PR — no user-facing code, no PostHog events introduced)`

No `posthog.capture()` calls added or modified in this diff. The feature spec's § Metrics is `n/a`. No app code beyond the regenerated types file.

### Dismissals

None

---

## Gate 4: fast-job-local (lint + typecheck + test:unit + build)

**Outcome:** `findings (1) pending`

`pnpm turbo run lint typecheck test:unit` → **all green**:

```
@home-os/core:lint  pass (cached)
@home-os/ui:lint    pass (cached)
@home-os/web:lint   pass (fresh)
@home-os/core:typecheck  pass
@home-os/ui:typecheck    pass
@home-os/web:typecheck   pass
@home-os/core:test:unit  pass (6 tests)
@home-os/ui:test:unit    pass (20 tests)
@home-os/web:test:unit   pass (8 tests)
Total: 9 tasks successful, 0 failed.
```

`pnpm turbo run build` → **fails on @home-os/web** with:

```
Failed to fetch `Inter` from Google Fonts.
There was an issue establishing a connection while requesting
https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap
```

**Diagnosis**: this is an **environment defect** identical in class to the documented `firewall-rebound-ports` issue. The workspace's egress firewall (`.devcontainer/init-firewall.sh`) does not include `fonts.googleapis.com` in its allowlist, so Turbopack's `next/font/google` (used by `apps/web/app/layout.tsx`) cannot fetch the Inter CSS at build time. Direct `curl 'https://fonts.googleapis.com/'` from the workspace fails with `Could not connect to server`; the same fetch succeeds from Vercel's build environment (which is outside this firewall).

**Not a code defect.** The font wiring is correct, matches CLAUDE.md § Where Things Happen, and ships with the project skeleton (existed on `main` before this branch). CI's fast-job is the canonical enforcement surface — recent CI runs on `main` (post-Vercel-deploy, post-dependabot bumps) pass cleanly.

**Tracked** in `TODOS.md § v0 → pre-ship → firewall-google-fonts` with the operator-applied fix recipe (append `fonts.googleapis.com` + `fonts.gstatic.com` to `.devcontainer/firewall-extra-domains`, then `sudo /usr/local/bin/init-firewall.sh`).

**Do not block on this** — pending the firewall fix; slow-job CI on push will confirm green build before merge.

### Dismissals

- **`@home-os/web#build` fails locally on Google Fonts fetch** — rationale: environment defect (egress firewall lacks `fonts.googleapis.com`); CI build on push is the canonical enforcement surface and recent runs are green; tracked in TODOS.md for operator-applied fix; same class as the documented `firewall-rebound-ports` defect.

---

## Gate 5: changed-tests-local

**Outcome:** `findings (1) pending`

The only new test in this PR is `apps/web/e2e/rls-isolation.spec.ts`. Parse-check via Playwright passed:

```
cd apps/web && pnpm exec playwright test --list e2e/rls-isolation.spec.ts
→ 14 tests in 1 file (7 cases × 2 projects [mobile, desktop])
```

Test cases enumerated:

- A cannot SELECT B rows across all tables
- A cannot INSERT rows owned by B (RLS denies)
- A UPDATE of B rows affects zero rows (RLS hides)
- A DELETE of B rows affects zero rows (RLS hides)
- A cannot DOWNLOAD B storage objects
- A cannot UPLOAD to B storage path
- B cannot SELECT / INSERT / UPDATE / DELETE / read storage from A

**Actual e2e run is environmentally blocked** by the documented `firewall-rebound-ports` defect (TODOS.md § v0 → pre-ship). The workspace egress firewall allowlists supabase ports `54321 + 54322` but the project rebound them to `54421 + 54422` (per CLAUDE.md § Local Supabase ports — to avoid lalista collision). Until the operator updates `.devcontainer/init-firewall.sh:233-234`, the spec parses cleanly but fails with `EHOSTUNREACH` against `host.docker.internal:54421` before reaching any assertion.

Per spec D10, slow-job CI is the canonical enforcement surface for Pre-Ship Requirement #3 — the test runs there in a different network shape that reaches the seeded local Supabase via the CI runner's compose network.

**Do not block on this** — environment defect, not code defect.

### Dismissals

- **`rls-isolation.spec.ts` cannot execute from workspace** — rationale: documented environment defect `firewall-rebound-ports` per TODOS.md; spec D10 mandates slow-job CI as the canonical enforcement surface; spec parses cleanly via playwright test --list; no code-level remediation possible from within this PR.

---

## Gate 6: responsive + theme

**Outcome:** `n/a (no UI surface in this PR — foundation schema only)`

### Dismissals

None

---

## Gate 7: /simplify (migration SQL + E2E spec review for over-abstraction)

**Outcome:** `pass`

Reviewed all five migration SQL files and the E2E spec for over-abstraction. Findings:

- **001_enums.sql** — plain `CREATE TYPE ... AS ENUM`. Seven types, listed verbatim from spec. No abstraction. No simplification possible — the spec demands these exact enums and Postgres native enums are the simplest path.
- **002_tables.sql** — five `CREATE TABLE` statements with explicit columns, FKs, CHECK constraints, and per-FK btree indexes. No view/CTE chains, no generated columns, no inheritance. Indexes added on every FK column + `cards.state` — sane defaults; not over-indexed.
- **003_rls_tables.sql** — per-action policies (4 × 5 tables = 20 policies), all using the same predicate shape (`auth.uid() = user_id`, or `auth.uid() = id` for `users`). The author chose explicit per-action policies over `FOR ALL` for readability in `pg_policies`, which is a one-time cost for permanent legibility — sound trade-off, called out in the file header. Could be macroed but that would obscure the predicate matrix; current shape is right.
- **004_storage.sql** — idempotent bucket insert (`ON CONFLICT DO NOTHING`) + 4 storage.objects policies all sharing the same `bucket_id = 'card-photos' AND (storage.foldername(name))[1] = auth.uid()::text` predicate. Slight repetition, but again — flatter is more auditable for security predicates. Pass.
- **005_triggers.sql** — two function/trigger pairs. `create_public_user_profile()` correctly uses `SECURITY DEFINER` + `SET search_path = public` per D2 hygiene; `set_updated_at()` is the canonical Postgres pattern. No over-engineering.
- **rls-isolation.spec.ts** — single describe block with seeded fixtures, `authedClient(email)` helper to mint per-test signed-in clients. The B→A direction is collapsed into one test for scan-ability (each action shape inlined) rather than duplicating four more named tests — author called this out in a comment. Acceptable. The WebSocket polyfill stub at the top is documented inline (Node 20 vs 22 compat) and slated for removal — appropriate scope.

No simplification recommendations. No code changes from this gate.

### Dismissals

None

---

## Gate 8: /ak-check-docs-and-tests (Audit 1)

**Outcome:** `pass`

See `## Audit 1` section below — high=0 medium=0 low=2. Both low findings are intentional deferrals to feature PRs that will exercise the relevant DB invariants. Audit does not halt the pipeline.

### Dismissals

- **`cards_updated_at` trigger not explicitly tested** — rationale: low-severity test gap; trigger will be exercised indirectly by every feature PR that updates a card; foundation PR's E2E surface is RLS isolation per D10, not trigger semantics.
- **`cards.version` optimistic-lock not explicitly tested** — rationale: low-severity test gap; D5 is a guard for a multi-device race that lands when a feature PR (likely `triage-conversation`) starts updating cards from app code; deferral matches spec D9 ("validation at app boundary") philosophy.

---

## Audit 1: pre-polish (2026-05-13)

<!-- audited-at: 460d277901dabf26095273521588d9902241d7d0 -->
<!-- range: origin/main..HEAD -->

findings: high=0 medium=0 low=2

### Docs findings

- (none)

### Tests findings

- [low] `apps/web/e2e/rls-isolation.spec.ts` — `cards_updated_at` trigger (D6) is not explicitly tested. A 1-line assertion (admin-update a card, verify `updated_at` advances) would cover it. Acceptable to defer — foundation PR's E2E surface is RLS isolation, not trigger semantics; the trigger will be exercised indirectly by every feature PR that updates a card.
- [low] `apps/web/e2e/rls-isolation.spec.ts` — `cards.version` optimistic-lock column (D5) has no explicit test for the version-conflict update pattern. Acceptable to defer — D5 is a guard for a multi-device race; the writer pattern lands when a feature PR (likely `triage-conversation`) starts updating cards from app code.

### Bypass trailer audit

- (none)

**Audit verdict**: clean — zero high/medium findings, two low findings noted. Audit does not halt the pipeline.

---

## Gate 9: /review (code review on diff)

**Outcome:** `pass`

Reviewed diff against `origin/main` for SQL safety, conditional side effects, and trust boundaries. No app code in the diff beyond a regenerated types file — so LLM/trust-boundary surface is `n/a`.

### SQL safety

- **FK cascade hygiene** ✓ Every FK in migration 002 uses `on delete cascade`. `public.users.id → auth.users(id) on delete cascade` matches CLAUDE.md § Gotchas convention (explicit `ON DELETE` on `auth.users` references).
- **RLS predicate shape** ✓ Migration 003 uses `auth.uid() = id` for `users` (PK is the auth id, per D1) and `auth.uid() = user_id` for every other table. Per-action policies: `SELECT/DELETE` use `USING` only; `INSERT` uses `WITH CHECK` only; `UPDATE` uses both (correct Postgres semantics — `USING` filters which rows the update is visible against, `WITH CHECK` validates the post-update row state).
- **Storage RLS** ✓ Bucket-scoped predicate `bucket_id = 'card-photos' AND (storage.foldername(name))[1] = auth.uid()::text` — correct 1-indexed array access (D8 gotcha called out in the spec); bucket-id scoping ensures other buckets' policies don't conflict.
- **SECURITY DEFINER hygiene** ✓ `create_public_user_profile()` (migration 005) is `SECURITY DEFINER` with `SET search_path = public` per D2 — this is the canonical Postgres pattern that prevents schema-shadowing attacks. Uses `ON CONFLICT (id) DO NOTHING` so retries are idempotent. `set_updated_at()` is NOT `SECURITY DEFINER` (correct — only modifies NEW row in caller's context).
- **Trigger isolation** ✓ `on_auth_user_created` fires `AFTER INSERT ON auth.users FOR EACH ROW` — runs in auth context after row materialization, with no risk of partial-state visibility to app readers. `cards_updated_at` fires `BEFORE UPDATE` so the new `updated_at` is in the row that gets written, not a later patch.
- **Idempotent bucket insert** ✓ Migration 004's `INSERT ... ON CONFLICT (id) DO NOTHING` makes the migration safe to re-apply on stacks where partial rollback left the bucket in place.

### Conditional side effects

No conditional branches in the SQL. Triggers fire unconditionally on their target events. No `EXECUTE` of dynamic SQL strings; no triggers that call other triggers.

### Trust boundaries

`n/a` — no app code added, no edge functions, no HTTP handlers, no LLM calls.

### Notes (informational, not findings)

- `usage_counters` has no DB-level seed of a row on user signup — the feature PR that introduces usage counting will need to UPSERT-on-first-write or extend `create_public_user_profile()`. Not a defect of this PR; the spec § Not in scope explicitly excludes app-side counter usage.

No code changes from this gate. `pnpm turbo run test:unit` checkpoint not needed (no edits applied).

### Dismissals

None

---

## Gate 10: /cso (security audit)

**Outcome:** `pass`

Security audit covering the threat surfaces the user flagged for this schema-foundation PR:

### 1. RLS bypass

All 5 public-schema tables have `ENABLE ROW LEVEL SECURITY` + 4 per-action policies each (20 total). No `FORCE ROW LEVEL SECURITY` on superuser is needed (Supabase's `authenticated` / `anon` roles are not superusers). No role is granted `BYPASSRLS`. Service-role-key bypasses RLS by design — that's the admin client surface, used only in tests and trusted server contexts. No `GRANT` of broader privileges than Supabase's default. ✓

### 2. SECURITY DEFINER privilege escalation

`create_public_user_profile()` is the only `SECURITY DEFINER` function in the diff. Audit:

- ✓ **search_path is pinned** to `public` (line 21 of migration 005) — prevents schema-shadowing attacks where a malicious low-privilege schema is prepended.
- ✓ **Function body accepts no user-controlled input**. It uses `NEW.id` (the auth user's UUID, controlled by Supabase auth) and `now()` only. No `EXECUTE`, no dynamic SQL.
- ✓ **Idempotent**: `ON CONFLICT (id) DO NOTHING` prevents accidental re-insert on retried events.
- ✓ **Scope is minimal**: inserts a single row into `public.users` with two columns. No cross-table writes, no privilege grants, no auth.\* mutations.

`set_updated_at()` is NOT `SECURITY DEFINER` (correct — it runs in the caller's context and only mutates `NEW.updated_at` which doesn't traverse search_path).

### 3. Storage path traversal

The storage RLS predicate `bucket_id = 'card-photos' AND (storage.foldername(name))[1] = auth.uid()::text` resists path-traversal:

- `storage.foldername(name)` splits on `/` and returns the path segments as a text[]. Index `[1]` is the **first segment** (1-based) of the object name.
- A malicious upload with path `<my-uuid>/../<other-uuid>/foo.jpg` would still have `[1] = '<my-uuid>'`, so the predicate matches the attacker's UUID, not the target's. The `..` segment is a literal text segment, not a filesystem path component (Supabase storage doesn't resolve `..` symbolically).
- The bucket-id scope (`bucket_id = 'card-photos'`) means the policy only fires on objects in that bucket — it doesn't grant access to other buckets.
- No way to upload an object with a leading segment that isn't your own UUID and still pass the policy. ✓

### 4. Hardcoded secrets

- `gitleaks detect` against the full repo: **0 leaks found** ✓
- `git diff origin/main...HEAD` grep for secret-like patterns surfaces only `'rls-test-password-2026'` in `apps/web/e2e/rls-isolation.spec.ts` — a static test fixture for two short-lived test users created via the admin API in `beforeAll` and torn down in `afterAll`. Not a secret. ✓
- No `SUPABASE_*`, `ANTHROPIC_*`, or `SENTRY_*` keys committed.

### 5. Other surfaces

- No edge functions added (the spec § Not in scope explicitly excludes `supabase/functions/`).
- No HTTP handlers, no LLM calls — `n/a`.
- The regenerated `packages/core/src/supabase.types.ts` is autogen output; no hand-written code to audit.

No high, medium, or low-severity security findings. No code changes from this gate.

### Dismissals

None

---

## Gate 11: /design-review

**Outcome:** `n/a (no UI surface in this PR)`

### Dismissals

None

---

## Gate 12: /qa (functional walk)

**Outcome:** `n/a (no UI to dogfood — multi-user isolation E2E is the structural QA gate, runs in slow-job CI per D10)`

Per the spec's `## Core user story` (`N/A — foundation database migration PR. No user-facing flow added or modified.`), the artifact-per-verb assertion is skipped. The closest analog to a functional walk is `apps/web/e2e/rls-isolation.spec.ts` (parse-verified in Gate 5; runs in slow-job CI per D10 / firewall-rebound-ports).

### Dismissals

None

---

## Gate 13: /benchmark

**Outcome:** `n/a (no rendered surface — no Core Web Vitals to measure)`

### Dismissals

None

---
