## Gate 11: convention

**Result: pass**
**Commit:** 141c0fe (HEAD)
**Date:** 2026-05-26

Checked the full diff (`git diff origin/main...HEAD` -- 14 commits, ~3300 lines) against CLAUDE.md project conventions.

### Convention checks

| #   | Convention                                           | Result | Detail                                                                                                                                                                                                   |
| --- | ---------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | SECURITY DEFINER functions pin `search_path`         | pass   | Both `mark_byok_used` (line 24) and `confirm_triage` (line 66) set `search_path = public, pg_catalog`.                                                                                                   |
| b   | RLS policies wrap `auth.uid()` in a subquery         | pass   | No new RLS policies created. `auth.uid()` in SECURITY DEFINER bodies (lines 27, 72) are procedural single-evaluation calls, not per-row RLS predicates -- subquery-wrap convention does not apply.       |
| c   | Every foreign key has a backing index                | pass   | No new foreign keys created in migration 014.                                                                                                                                                            |
| d   | No hardcoded secrets or env vars in code             | pass   | Zero API keys, tokens, or secrets in production code. Test files use mock values (`sk-ant-test`, etc.) appropriately. `ANTHROPIC_API_KEY` accessed only via `process.env` (existing pattern, unchanged). |
| e   | Commit messages follow conventional-commits format   | pass   | All 14 commits use valid prefixes: `feat(...)`, `fix(...)`, `chore(...)`, `docs(...)`, `simplify:`.                                                                                                      |
| f   | No `console.log` left in production code             | pass   | Zero `console.log` occurrences in the diff. Error paths use `Sentry.captureException` / `Sentry.captureMessage` per project posture.                                                                     |
| g   | Route handlers follow the established error envelope | pass   | All new routes (`key-validate`, triage additions) return `NextResponse.json({ error: '<class>' }, { status: N })` -- consistent with the D9/D10 envelope pattern used across the codebase.               |
| h   | Components use CSS custom properties, not hardcoded  | pass   | All color references in production components use `var(--color-*)` custom properties (21 occurrences verified). Zero hardcoded hex/rgb/hsl values.                                                       |

### Additional checks

- **Migration rollback recipe**: present and complete (lines 136-210), includes full inlined 011 body per convention. Verified separately in gate 2e.
- **`ADVISOR-EXEMPT` annotations**: none needed -- no lint findings in migration 014.
- **Env var naming**: no new env vars introduced. Existing `ANTHROPIC_API_KEY` usage unchanged.
- **BYOK key never logged/persisted**: verified -- `byok_key` does not appear in any Sentry `extra` payload, `console.*` call, or response body. Only evidence is `users.byok_used` flag and the `byok_key_validated` PostHog event (no key data in properties).

## Dismissals

None. All 8 convention checks passed with no findings.
