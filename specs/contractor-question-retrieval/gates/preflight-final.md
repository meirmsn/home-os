## Gate 10b: preflight-final

**Verdict: pass** — tree is shippable.

Branch `feat/contractor-question-retrieval`, HEAD `477903a`.

### 1. `pnpm turbo run lint typecheck test:unit`

All green.

```
@home-os/web:lint: ✖ 14 problems (0 errors, 14 warnings)
...
@home-os/web:test:unit:  Test Files  103 passed (103)
@home-os/web:test:unit:       Tests  992 passed (992)
...
 Tasks:    9 successful, 9 total
Cached:    5 cached, 9 total
  Time:    48.552s
```

- **lint**: 0 errors, 14 warnings. All warnings are pre-existing and outside this feature's scope — 13 `@next/next/no-img-element` (`<img>`) warnings across capture/cards/home/spike components, plus 1 `@typescript-eslint/no-unused-vars` (`_headers`) in `api/key-validate/route.test.ts`. **No warnings in any `contractor-questions/` file.** Not a finding.
- **typecheck**: green (part of the 9 successful turbo tasks).
- **test:unit**: 992 passed / 992, 103 test files. Includes new feature tests (`ContractorQuestionsViewOpenedCapture.test.tsx`, `ContractorQuestionsView.test.tsx`, `ContractorAppointmentNudge.test.tsx`, `group-contractor-questions.test.ts`, `contractor-tag-label.test.ts`).

`build` intentionally NOT run: it fails locally on the Google Fonts firewall block (tracked constraint, `TODOS.md § firewall-google-fonts`). CI is the canonical build surface. Not a finding.

### 2. `git status --porcelain`

Working tree clean (empty output). No uncommitted code changes. The two `PLAN.md` / `PRODUCT-ROADMAP.md` modifications from the session start were committed prior to HEAD; nothing pending. Untracked gate sink `.md` files under `specs/contractor-question-retrieval/gates/` are expected and OK.

### 3. Stray debug code in `apps/web/app/(app)/contractor-questions/`

```
grep -rnE 'console\.(log|debug)|debugger|\.only\(|TODO|FIXME|XXX|HACK' apps/web/app/(app)/contractor-questions/
→ NO_MATCHES
```

Clean. No `console.log`/`console.debug`, no `debugger`, no test-focus `.only(`, no blocking `TODO`/`FIXME`/`XXX`/`HACK`.

### 4. PostHog events vs METRICS.md

Two new events, both capture sites present and matching METRICS.md rows 56–57 exactly.

| Event                                | Capture site                                  | Payload (code)                                          | Payload (METRICS.md)                                                            | Match |
| ------------------------------------ | --------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- | ----- |
| `contractor_questions_view_opened`   | `ContractorQuestionsViewOpenedCapture.tsx:43` | `{ group_count, total_question_cards }`                 | `{ group_count: number, total_question_cards: number }`                         | ✓     |
| `contractor_appointment_nudge_shown` | `ContractorAppointmentNudge.tsx:42`           | `{ contractor_type, question_count, oldest_card_days }` | `{ contractor_type: string, question_count: number, oldest_card_days: number }` | ✓     |

Both fire-once dedupe mechanisms match the METRICS.md descriptions: view-opened uses a session-storage sentinel (`home_os.contractor_questions_view_opened_fired`), nudge uses a `fired` ref guard per rendered banner.

## Dismissals

- **14 lint warnings (0 errors)** — pre-existing, all outside `contractor-questions/`. 13 `<img>`-element LCP advisories (capture/cards/home/spike) and 1 unused `_headers` var in a key-validate test. None introduced by this feature; not blocking. Dismissed.
- **`build` not run** — local build fails on Google Fonts firewall block (tracked: `TODOS.md § firewall-google-fonts`); CI is the canonical build surface per gate instructions. Deterministically dismissed, not a finding.
