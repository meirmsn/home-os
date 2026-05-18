<!-- audited-at: 892fd53c72ff59303764418e1790d054f8a38e3a -->

## Audit 2 (post-polish docs + tests)

**Range:** `d3a28ce..HEAD` (9 commits)
**Audited at:** `892fd53`
**Method:** Direct execution (Step 1 docs + Step 2 tests) per Phase 5.8 contract — orchestrator bypass agreed in the shard contract.

### Range shape

9 commits, 12 files changed (+610 / -13):

- `BUILD-LOG.md` — planned-state entry (close-out)
- `PLAN.md` — Active row → "No work in progress"
- `apps/web/e2e/global-setup.ts` — **new** (CI fix-loop attempts 2/3/4 cumulative; 183 lines)
- `apps/web/e2e/planned-state.spec.ts` — `request` → `page.request` fixture swap (state-guard test)
- `apps/web/playwright.config.ts` — `globalSetup: './e2e/global-setup'` wired
- `supabase/migrations/20260517214500_012_planned_reminder.sql` — added trailing `notify pgrst, 'reload schema'` + active `-- ROLLBACK:` marker block
- `specs/planned-state/gates/{audit-1,gate-8-design-review,gate-9-qa,gate-10-benchmark,preflight-final}.md` — gate evidence shards
- `specs/planned-state/review.md` — Phase 3 consolidation aggregate

Composition: 1 spec-evidence consolidation commit (`fec4205`) + 1 Audit 1 shard commit (`9a12191`) + 6 CI fix-loop commits (`fcc0a75`, `7bf2b0b`, `0f6935c`, `1c5bb45`, `d5e54df`, `72f528d`) + 1 bookkeeping close-out (`892fd53`).

### Docs findings

**Finding D1 (medium) — Two § Gotchas entries promised by commit messages never landed.**

Two CI fix-loop commits explicitly promised follow-up CLAUDE.md § Gotchas entries that the audit range does not contain:

1. **Commit `fcc0a75` body:** _"Also surface this as a § Gotchas entry in CLAUDE.md (separate commit once CI is green)."_ — codifying that plain `ALTER TABLE ... ADD COLUMN` does NOT trigger PostgREST's auto-refresh in the local-stack `supabase start` shape (PR #27's migration 011 got lucky because rename-recreate + ALTER COLUMN TYPE triggers the deeper refresh path). Without a trailing `NOTIFY pgrst, 'reload schema'`, every PostgREST request that names the new column returns `PGRST204` from the in-memory cache. This is a root-cause-class gotcha — the next PR that adds a plain column will hit the same trap without the entry.

2. **Commit `d5e54df` body:** the root-cause for the 6-attempt CI fix-loop arc is that `ci-rollback-explain.sh` **SKIPS** migrations that lack a `-- ROLLBACK:` marker. The script's iteration cycle is `rollback → forward → rollback → forward` for each marked migration; unmarked migrations are excluded entirely. Migration 002's rollback `drop table public.cards cascade` then permanently wipes any column added by a skipped downstream migration (here: `planned_reminder_date`). PostgREST's cache was correct — the column genuinely wasn't in the DB. This is a load-bearing devshop convention that any future ADD COLUMN migration must follow.

Both gotchas survive in the commit messages + this audit's record, but the canonical CLAUDE.md § Gotchas surface is empty on both. Future-PR readers grep CLAUDE.md, not git log.

**Verdict:** medium — not blocking (the underlying fixes shipped + the root cause is documented in BUILD-LOG.md's planned-state entry), but two reusable-pattern gotchas are missing from the canonical knowledge surface. Phase 6's audit comment should call these out so a follow-up doc commit can land them post-merge.

**Finding D2 (low) — CLAUDE.md path-map row for migration 012 is stale.**

Line 99 of CLAUDE.md describes migration 012 as having "Rollback recipe commented in-file" — accurate at Audit 1 stamp, but the migration was mutated in commits `fcc0a75` and `d5e54df` to add (a) a trailing `notify pgrst, 'reload schema'` statement and (b) a real (uncommented, load-bearing) `-- ROLLBACK:` marker block. Both additions are now structural — the NOTIFY is defense-in-depth (the globalSetup carries the redundant runtime path), and the ROLLBACK marker is load-bearing for `ci-rollback-explain.sh`'s round-trip iteration.

The row should be amended to mention the trailing NOTIFY + the active ROLLBACK marker. Low because the load-bearing facts ARE captured elsewhere (BUILD-LOG.md, the migration file itself with explanatory comments) — the path-map row is the secondary index that's out of date.

**Finding D3 (low) — `apps/web/e2e/global-setup.ts` undocumented in CLAUDE.md path-map.**

The new 183-line `globalSetup` is a load-bearing CI surface — it runs once before every E2E test and carries a three-tier fallback (cache probe → NOTIFY pgrst → docker restart of `supabase_rest`) with verbose diagnostic logging. The path-map header explicitly lists "CI/CD workflow" as a triggering surface for path-map updates. The Playwright config diff that wired it (`globalSetup: './e2e/global-setup'`) is also a quiet config surface that warrants a one-line mention.

Low because (a) the file is heavily self-documented at the top, (b) the BUILD-LOG.md entry references the full fix-loop arc, and (c) docs-coverage hook scopes only to `apps/*/app/...` so this didn't trip the gate at commit time. But a path-map row would help the next reader who's chasing a similar PostgREST cache symptom find the prior-art.

### Tests findings

Clean — coverage adequate.

- **`apps/web/e2e/global-setup.ts`** — structurally exempt via TWO paths in `check-tests-coverage-project.sh`: (a) `SOURCE_GLOBS='^(apps/[^/]+/(src|app|components|lib|hooks)/|packages/[^/]+/src/)'` excludes `e2e/` entirely, and (b) `EXEMPT_PATH_PATTERNS` contains `/e2e/`. No paired test required; no `.devshop-test-coverage-exempt` entry needed. The file's behavior is verified transitively — if it fails to reload the cache, every E2E spec that touches `planned_reminder_date` fails (which is exactly what surfaced during the fix-loop arc).
- **`apps/web/e2e/planned-state.spec.ts`** — Playwright spec (not a paired unit test). Diff is a fixture swap (`request` → `page.request`) confined to three call sites in one test (`state guard — PATCH /api/card/[id]/reminder rejects non-planned states with 409`). Verified by the test running green in CI run `26019024498` (cited in BUILD-LOG.md).
- **`apps/web/playwright.config.ts`** — config file, structurally exempt (lives outside SOURCE_GLOBS). One-line wire-up that's verified by globalSetup actually running (log lines present in CI output).
- **`supabase/migrations/20260517214500_012_planned_reminder.sql`** — no paired unit test (migrations don't pair with tests); covered by the E2E specs AND the `ci-rollback-explain.sh` round-trip step — which is now the specific surface that caught the original bug.

### Bypass trailer audit

None. All 9 commits in the range have empty trailer blocks. No `devshop.dirtyTreeReason`, `devshop.docsCoverageReason`, `devshop.testReviewSkipReason`, `devshop.prDescStaleReason`, or `devshop.dirtyPushReason` invoked.

### Summary

findings: high=0 medium=1 low=2

**Disposition:** medium=1 (D1 — two missing CLAUDE.md § Gotchas entries) routes to Phase 6's audit comment for follow-up; low=2 (D2 + D3 — stale path-map row + undocumented globalSetup) are nice-to-have polish that don't block the merge or follow-up surface. The shipped code is correct; the gap is in the canonical knowledge surface.
