## Preflight

- TOUCHES_UI=
- TOUCHES_MIGRATIONS=
- TOUCHES_FUNCTIONS=
- TOUCHES_KIT=
- TOUCHES_CODE=apps/web/eval/triage/score.ts
- TOUCHES_USER_CODE=apps/web/eval/triage/score.ts
- HAS_TURBO=yes
- Chromium: not required (non-UI PR)
- Supabase: not required (no DB/route/UI surface; UI gates dropped per operator decision)
- Result: pass

Gate-shape note: operator selected "Applicable gates only" at the Phase 3 gate-shape
decision. UI/app gates (responsive-theme, design-review, design-conformance, qa,
benchmark) and slow-job-lifecycle are out of scope for this zero-UI offline-tooling
diff and are NOT dispatched. metrics-check = n/a (no analytics events added).
