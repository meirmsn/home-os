# Visual evidence — deferred to manual capture

**Phase 5.9 status:** deferred per `/ak-build § Phase 5.9.3 (No halt path)`.
**Branch:** `feature/planned-state` · **HEAD at deferral:** `672c79a`.
**Date:** 2026-05-18.

## Why capture is deferred

The sandbox running `/ak-build` for `planned-state` cannot reach the public internet —
`curl` against both `https://home-os-git-feature-planned-state-homeos.vercel.app/` and
the canonical `https://home-os-nu-two.vercel.app/` returns `HTTP 000` (DNS / egress
firewalled). This is the same `blocked (n/a per scope: sandbox)` posture Phase 3
documented for browser-driven gates (design-review / qa / benchmark) and is unblocked
the moment a human operator with browser access takes the wheel.

Even with reachability, authenticated capture of `/cards/<uuid>` against the Vercel
preview needs one of:

- the gstack `setup-browser-cookies` skill (interactive operator step — picks a
  domain from the operator's real Chromium browser and imports its cookies into the
  headless browse session), or
- a fixture seed against the production Supabase Cloud project using the
  `SUPABASE_SERVICE_ROLE_KEY` (not in scope from the workspace; secrets stay on
  Vercel + GitHub).

The local stack option is also out — `next/font` won't fetch Inter without internet,
and Playwright's Chromium isn't installed in the sandbox image (Phase 3's preflight
recorded the same constraint).

## What to capture (operator follow-up)

Run against the Vercel preview URL once it's reachable:

`https://home-os-git-feature-planned-state-homeos.vercel.app`

Save 1440px-wide PNGs into this directory at the filenames below. The hero set
demonstrates the three reminder render states from spec § D5 + the BeforeCloseSummary
DIY variant from § D4.

### 1. `cards-planned-no-reminder.png` — State A

- Card detail page for a `state='planned'` card with `chosen_path='diy'` and
  `planned_reminder_date IS NULL`.
- Header: room_tag · system_tag chip · created_at. **No** `<ReminderDueChip />` —
  hidden because no reminder is set.
- Body: severity chip + diagnosis + DIY `<PathCard />` (collapsed) +
  `<BeforeCloseSummary />` DIY variant (materials inline; non-optional tools first
  five inline + `+N more` `<details>` if applicable) + greyed `<ChoosePath />` row
  with "✓ Chosen" on Choose DIY + "Change decision" link below.
- `<ReminderEditor />` at the bottom in **State A**: a "Set a reminder" text link
  (not expanded; clicking would expand to native `<input type="date">` + Save /
  Cancel).
- "How we diagnosed this" `<details>` closed by default at the very bottom.

### 2. `cards-planned-future-reminder.png` — State B

- Same seeded card after PATCH `/api/card/<id>/reminder` with a future date (e.g.
  `2026-06-01`).
- Header: **No** `<ReminderDueChip />` — hidden because the date is in the future.
- Body identical to State A above except `<ReminderEditor />` in **State B**:
  a "Revisit by [date]" subline rendered in secondary text color + inline Edit /
  Clear text links (not buttons).

### 3. `cards-planned-due-reminder.png` — State C

- Same seeded card after PATCH with a past date (e.g. `2026-05-10`) — or wait until
  the picked date arrives.
- Header: **`<ReminderDueChip />` mounted**, calm-indigo outline ("Revisit by
  May 10" or similar) using `border-[var(--color-planned)]
text-[var(--color-planned)]` — outline only, no fill.
- Body identical except `<ReminderEditor />` in **State C**: same shape as State B
  (Revisit-by subline + Edit / Clear links). The urgency cue lives in the header
  chip, not in the editor.

### 4. (Optional) `cards-planned-contractor-summary.png` — BeforeCloseSummary contractor variant

- Card detail page for a `state='planned'` card with `chosen_path='contractor'`.
- Body shows `<BeforeCloseSummary />` Contractor variant: "Contractor to schedule:
  <type>" headline + top-3 questions inline + `+N more questions` `<details>` if
  the AI returned more than three.

## Seed recipe (for the operator)

Two paths to a seeded `state='planned'` card on the Vercel preview:

**Path A — manual click-through:**

1. Sign in to the preview at `/login` (magic link via Inbucket on local, Resend on
   prod-like).
2. `/capture` → submit a card (photo + description + system_tag + room_tag).
3. Wait for AI initial-read → answer one Q&A round (or click Skip) → confirm.
4. On the resulting `state='decide'` page, click "Choose DIY". The card lifts to
   `state='planned'` with `chosen_path='diy'`.
5. **For State A:** screenshot immediately (no reminder yet).
6. **For State B:** click "Set a reminder" → pick `2026-06-01` (or any future
   date) → Save → screenshot after `router.refresh()`.
7. **For State C:** click Edit → change to `2026-05-10` (past) → Save → screenshot.
8. **For contractor variant:** repeat steps 1-4 but click "Choose Contractor"
   instead.

**Path B — direct admin seed (faster, needs service-role key):**

```sql
-- Seed a state='planned' DIY card with no reminder (State A)
INSERT INTO public.cards
  (user_id, state, chosen_path, title, description, system_tag, room_tag,
   severity_provisional, severity_confirmed, cost_estimate_diy)
VALUES
  ('<auth.uid()>', 'planned', 'diy', 'Test reminder UX',
   'Demo card for hero shots', 'plumbing', 'kitchen',
   'soon', true, '<diy jsonb from spec § D3>');

-- For State B: set future date
UPDATE public.cards SET planned_reminder_date = '2026-06-01' WHERE id = '<id>';

-- For State C: set past date
UPDATE public.cards SET planned_reminder_date = '2026-05-10' WHERE id = '<id>';
```

(Skip the user-context auth; this seeds directly. RLS won't block service-role.)

## Capture command (operator, gstack)

After authenticating the browse session against the preview origin:

```bash
# 1440px viewport matches the in-repo convention
gstack browse --viewport 1440x900 \
  https://home-os-git-feature-planned-state-homeos.vercel.app/cards/<uuid> \
  --screenshot specs/planned-state/hero/cards-planned-no-reminder.png

# Repeat for each render state per the spec above.
```

Once the four (or three) PNGs land, commit them with:

```bash
git add specs/planned-state/hero/*.png
git -c devshop.dirtyTreeReason="operator devcontainer Supabase CLI bump, deferred to separate PR" \
  commit -m "chore(planned-state): refresh visual evidence at HEAD (Phase 5.9, operator-captured)"
```

The .devcontainer/ files in the working tree at the time of this deferral
(`compose.yml`, `Dockerfile`, `README.md`) are the operator's pre-existing Supabase
CLI bump destined for its own PR — matches the dirty-tree-reason posture used by
prior commits on this branch (`7bf2b0b`, `fcc0a75`).
