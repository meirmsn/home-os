## Gate 2g: advisor-clean

- Result: n/a (no migration in this PR)

`pnpm db:advisor` gates new migrations for SECURITY DEFINER search_path pins,
RLS subquery wrapping, and FK backing indexes. This PR adds no migration, so
there is no new DB object for the advisor to lint.

## Dismissals

None
