## Gate 2c: slow-job-lifecycle

**Result: PASS**

### Analysis

Line 157 of `.github/workflows/ci.yml` contains:

```
  slow:
```

This is exactly the expected format: 2-space indent + `slow:` (active, not commented out). The slow job is defined as an active job in the `jobs:` block, not commented out with `#`.

The slow job:

- Runs on `ubuntu-latest` (line 158)
- Depends on `[fast, changes]` (line 159)
- Has a docs-only skip filter via `needs.changes.outputs.runtime == 'true'` (line 160)
- Has a 30-minute timeout (line 161)

The job is fully active and will run on every PR that touches runtime files.

### Dismissals

None.
