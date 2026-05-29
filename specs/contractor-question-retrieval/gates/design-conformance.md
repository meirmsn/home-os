## Gate 8b: design-conformance

**Type:** static, read-only (Gate 8 /design-review already did the live visual audit).
**Branch:** feat/contractor-question-retrieval · **HEAD:** 477903a
**Scope:** `apps/web/app/(app)/contractor-questions/_components/*.tsx` + the `DashboardShell.tsx` entry-point change.

**Result: pass** — no findings.

### What was verified

**1. Design tokens (no hard-coded colors, no dead tokens)** — PASS

- Every color/surface/border in the new components resolves to a CSS custom property defined in `apps/web/app/globals.css` `@theme`:
  - `--color-text-primary-inverse` (#f0efeb), `--color-text-secondary-inverse` (#6b6a63), `--color-border-default` (neutral-200), `--color-background-raised` (#242320), `--color-watch` (#a07c2e) — all defined.
- No hard-coded hex/rgb/rgba values in any of the four files (grep clean).
- No dead-token references remain: `--color-surface-raised` / `--color-border-subtle` are absent from the whole `contractor-questions/` tree (confirming the Phase-2 judgment call that corrected them to `--color-background-raised` / `--color-border-default` was applied and nothing regressed).
- `--color-watch` accent on the nudge (`border-l-[var(--color-watch)]`) is consistent with sibling severity usage in `cards/[id]/_components/_severity-chip.ts` (`text-[var(--color-watch)]`, `bg-[var(--color-watch)]/20`) — same severity-token family, valid accent application.

**2. Tap targets ≥ 44px** — PASS

- Dashboard entry link (`DashboardShell.tsx:65`) is `inline-flex min-h-11 items-center …` → 44px min height. Matches the sibling `capture-cta-first-time` link in `EmptyState.tsx` (also `inline-flex min-h-11 items-center`).

**3. Dark-ground / spacing / type consistency** — PASS

- Page chrome (`page.tsx`) carries no inline styling — it delegates entirely to `ContractorQuestionsView`, so all presentation flows through tokens.
- Spacing uses the standard Tailwind scale (`px-4 py-6`, `space-y-8/4/3`, `mb-6/1`, `py-16` empty state) — same scale family as `home/_components/EmptyState.tsx` (`py-20 px-6`, `space-y-6`) and the cards detail components.
- Type: `text-lg`/`text-base`/`text-sm`/`text-xs` with `font-semibold`/`font-medium` — inherits the Inter stack from the app shell exactly like siblings; no font overrides introduced.
- Empty state mirrors the calm tone + centered layout of `EmptyState` (`flex flex-col items-center justify-center … text-center`, `text-secondary-inverse`).

**4. AI-slop patterns** — PASS

- No gradients (`bg-gradient`/`gradient` grep clean).
- No emoji in component source (the `·` middot in the count line is a typographic separator, not an emoji).
- Radii consistent: only `rounded-md` used across the new components (card containers + nudge banner), drawn from the sibling radii vocabulary (`rounded-md`/`rounded-lg`/`rounded-full` all appear in cards detail; the simpler surfaces here correctly use the `rounded-md` they match).
- Nudge banner uses `role="status"` for accessibility, consistent with sibling status banners (`AnswerThread.tsx`, `StartTriage.tsx`).

### Files inspected

- `apps/web/app/(app)/contractor-questions/_components/ContractorQuestionsView.tsx`
- `apps/web/app/(app)/contractor-questions/_components/ContractorAppointmentNudge.tsx`
- `apps/web/app/(app)/contractor-questions/_components/ContractorQuestionsViewOpenedCapture.tsx`
- `apps/web/app/(app)/contractor-questions/page.tsx` (no styling — delegates)
- `apps/web/app/(app)/home/_components/DashboardShell.tsx` (entry-point link)
- Comparison baselines: `home/_components/EmptyState.tsx`, `cards/[id]/_components/_severity-chip.ts`, `cards/[id]/_components/AnswerThread.tsx`, `apps/web/app/globals.css` `@theme`.

## Dismissals

- **`ContractorQuestionsViewOpenedCapture` renders no UI** — zero design surface; included in scope only as a sibling of the in-scope `_components` but has no tokens/tap-targets/visuals to audit. Not a finding.
- **Nudge accent is `--color-watch` (single left-border) rather than a filled severity chip like `_severity-chip.ts`** — intentional differentiation: this is a calm advisory banner ("book the visit"), not a state-severity chip. The single accent border + raised surface is the lighter-weight treatment appropriate to a non-anxiety nudge per the product's spiral-prevention design goal. Consistent token, deliberate weight choice — not a conformance deviation.
- **Dashboard link is an underlined text link rather than a button** — per spec § In scope ("a plain `next/link` styled with the dark-charcoal tokens"). It still meets the 44px tap target via `min-h-11`. Styling matches the spec's explicit design call; not a finding.
