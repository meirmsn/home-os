## Gate 4: simplify

Reviewed `git diff origin/main...HEAD` (29 files, ~3900 lines) for dead code,
unnecessary abstractions, duplicated logic, and over-engineering.

### Findings (2) -- fixed

1. **Redundant photoCount counter in CheckInForm.tsx** (lines 77-80)
   Three file variables (`wideFile`, `zoomFile`, `detailFile`) were already
   extracted and tested for truthiness when appending to FormData. A separate
   3-line manual counter (`let photoCount = 0; if (wideFile) photoCount++; ...`)
   duplicated those checks. Replaced with:
   `const photoCount = [wideFile, zoomFile, detailFile].filter(Boolean).length;`
   Commit: `9263934`

2. **Duplicate types in page.tsx** (lines 374-380)
   `MonitorCheckInPhoto` and `MonitorCheckInEntry` were defined inline inside
   page.tsx but were structurally identical to `CheckInPhoto` and `CheckInEntry`
   already exported from `CheckInTimeline.tsx`. Replaced with imports. Also
   removed a stale `eslint-disable-next-line react-hooks/purity` directive
   that became unnecessary after the ESLint config fix.
   Commit: `9263934`

### Ancillary fix

- **ESLint react-hooks/purity rule-not-found error** (pre-existing)
  `eslint-plugin-react-hooks` v7.1.1 ships compiler-only rules that error with
  "Definition for rule not found" when the React compiler is not enabled. Added
  the plugin as an explicit dependency and disabled `purity` in eslint.config.mjs
  to unblock lint-staged. Commit: `3fb7d0e`

## Dismissals

- **`UUID_RE` duplicated across 7+ route files**: Pre-existing codebase pattern;
  each route declares its own `UUID_RE`. Extracting to a shared module would
  change the import graph for files outside this feature's scope.

- **`isObject()` helper duplicated across 7 parse-\*.ts files**: Pre-existing
  codebase pattern; each trust-boundary validator carries its own `isObject`.
  The function is a one-liner; extracting would add a shared module with one
  consumer per file (no dedup leverage). Consistent with existing posture.

- **Three photo `<input>` elements in CheckInForm.tsx**: Each input has a
  distinct ref, label, and data-testid. Looping would require an array of refs
  (via `useRef` array or `createRef`) which adds complexity for 3 items. The
  existing CloseCardForm uses the same inline pattern. Not worth abstracting.

- **Empty JSDoc blocks (`/** \*/`) on handler functions\*\*: Pre-existing codebase
  convention (CloseCardForm, ChoosePath, etc. all use the same pattern). These
  are placeholder doc blocks, not dead code.

- **Cadence text duplication** ("Check back every N days" in MonitorView header
  vs "Check-in every N days" in CadenceEditor display): Intentionally different
  wording serving different UX purposes (summary vs editable section).
