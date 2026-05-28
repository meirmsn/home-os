## Gate 2d: fast-job-local

**Result: pass**

All three local fast-job checks passed with zero errors.

### test:unit

| Package       | Files  | Tests   | Status     |
| ------------- | ------ | ------- | ---------- |
| @home-os/core | 1      | 6       | passed     |
| @home-os/ui   | 2      | 20      | passed     |
| @home-os/web  | 89     | 893     | passed     |
| **Total**     | **92** | **919** | **passed** |

Duration: 18.9s

### typecheck

All 3 packages (`@home-os/core`, `@home-os/ui`, `@home-os/web`) passed `tsc --noEmit` with zero errors.

### lint

All 3 packages passed with **0 errors, 12 warnings**.

Warnings are all `@next/next/no-img-element` (11 instances across 8 files) and one `@typescript-eslint/no-unused-vars` in a test file. These are warnings only (not errors) and do not block the gate.

## Dismissals

None
