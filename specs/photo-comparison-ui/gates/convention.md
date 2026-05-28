## Gate 11: convention

- Result: pass

Commits follow conventional-commits with `photo-comparison` scope
(feat/refactor/test/chore/docs). New files match the established
`cards/[id]/{_components,_lib}` structure: route at
`cards/[id]/compare/page.tsx`, pure helpers under `compare/_lib/`,
components co-located in `_components/`. Paired `.test.ts(x)` per source file.
No naming or structural drift from the project's prevailing conventions.

## Dismissals

None
