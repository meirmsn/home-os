# Plan

Forward-looking plan at the feature/PR grain.

- Pipeline phase per active branch: each feature's `specs/<name>/tasks.md`
- Shipped (rich history): `BUILD-LOG.md`
- Deferred / long-term: `PRODUCT-ROADMAP.md`
- Tactical bugs/polish: `TODOS.md`
- Plan history (including dropped rows): `git log --follow PLAN.md`

## Active

| Branch                            | Spec                                    | Notes                                                                                                                                                             |
| --------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature/supabase-schema-and-rls` | `specs/supabase-schema-and-rls/spec.md` | Foundation — all Phase 1 tables, all RLS, `card-photos` private bucket, auth-signup trigger, multi-user isolation E2E. Blocks every subsequent v0 feature. No UI. |

## Planned

| #   | Feature           | Notes                                                                                                                                                                                                                                                                                    |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `auth-magic-link` | PRODUCT-ROADMAP.md § v0 #2. Spec source: `.gstack/eng-review-home-os-2026-05-01.md` § Architecture (Auth). Magic-link sign-in/up, user profile on first session, `/login`, post-auth `/(app)` shell, sign-out. Extends existing `apps/web/middleware.ts` + `apps/web/lib/supabase/*`.    |
| 2   | `pwa-spike`       | PRODUCT-ROADMAP.md § v0 #3. Spec source: `.gstack/eng-review-home-os-2026-05-01.md` § Pre-Ship Requirements #1. Validates iOS Safari camera + full-res Storage + sync zoom + bounce mode (750ms). Output is `.gstack/pwa-spike-result.md` which gates #11 (`photo-comparison-ui`) scope. |

<!--
Conventions:
- Status lives in section membership (Active vs Planned) — no status column.
- A Planned row transitions to Active when /ak-spec runs: drop #, add Branch + Spec columns.
- An Active row disappears when the feature ships — BUILD-LOG.md carries the full record.
- A row that's dropped (rescope, deprecated) — delete it; git log + commit message is the audit trail.
- "Not now, maybe later" work belongs in PRODUCT-ROADMAP.md, not Planned.
- Planned ordered by # ascending (smallest = next up). Renumber on reorder.
-->
