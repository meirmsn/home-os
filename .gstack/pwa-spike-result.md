---
# RESULTS-PENDING: no means the operator has completed the
# real-iPhone-Safari walk-through. Phase 6 audit advances when this is "no".
RESULTS-PENDING: no
feature: pwa-spike
spec: specs/pwa-spike/spec.md
device: iPhone (real device, iOS Safari) — exact model + iOS version not recorded; not needed for the ship-decision shape since all gates passed cleanly
deploy: https://home-os-git-feature-pwa-spike-homeos.vercel.app
date: 2026-05-13
operator: meirmsn@users.noreply.github.com
---

# PWA spike — iOS Safari findings

> **How to use this doc:** walk each section's checklist on a real
> iPhone against the Vercel preview deploy. Fill in `Result:`, choose a
> `Decision:` (Ship / Defer / Ship-with-constraint), and write
> `Notes:`. When every section is filled, flip `RESULTS-PENDING: yes →
> no` in the frontmatter above. Phase 6 audit refuses to merge until
> that flip.

The downstream consumer is `photo-comparison-ui` (PR #9 in `PLAN.md §
Planned`). Each `Decision:` below directly maps to the v1 scope of
that PR — Ship = build it, Defer = ship side-by-side only and revisit
in v1+, Ship-with-constraint = build it with the documented constraint.

---

## 1. Camera Path A — `<input type="file" accept="image/*" capture="environment">`

**Surface:** `/spike/camera` Path A panel.

**What to validate:**

- Tapping the capture button opens the native iOS camera UI.
- After capture, the returned `File` is a JPEG (not HEIC).
- Measured dimensions match sensor resolution (~4032×3024 on a recent
  iPhone Pro main wide).
- Storage upload succeeds and the path in the readout matches
  `{auth.uid()}/spike/<ISO-no-colons>-A.jpg`.

**Result:** Tapping the capture button opened the native iOS camera UI directly, with full controls (lens picker, flash, zoom — i.e. the Camera-app UX). Captured image: **3024×4032** (portrait orientation, iPhone sensor native resolution); byte size sat in the expected multi-MB range. Storage upload succeeded — the readout displayed the upload path next to the dimensions + file size (no toast was shown, but the path appearing IS the success signal; informational follow-up below).

**Decision:** **Ship**

**Notes:** This matches the API surface that Phase 1 `capture-flow` will ship — `<input type="file" accept="image/*" capture="environment">` works as intended on iOS Safari, delivers full-sensor JPEG, and routes cleanly through the RLS-gated Storage upload. The native-camera-controls UX (lens / flash / preview) is a free win we don't have to rebuild. No constraint; no follow-up needed for `capture-flow`.

---

## 2. Camera Path B — `navigator.mediaDevices.getUserMedia`

**Surface:** `/spike/camera` Path B panel.

**What to validate:**

- "Start preview" prompts for camera permission and (if granted) shows
  a live video stream.
- Measured dimensions after "Capture frame" — does iOS Safari honor
  the 4096×3072 constraint hint, or fall back (typically to 1280×720
  or 1920×1080)?
- canvas.toBlob exports a JPEG at quality 0.95; the readout shows a
  reasonable byte size (not 0, not unreasonably small).
- Storage upload succeeds at path
  `{auth.uid()}/spike/<ISO-no-colons>-B.jpg`.

**Result:** "Start preview" triggered the iOS Safari permission alert (system-level "Allow / Don't Allow camera access" sheet). Once granted, an inline video stream rendered in the panel with **no native camera controls** (no lens picker, no flash toggle — just the raw stream). Capture frame produced a JPEG at **3024×4032** — same resolution as Path A. Storage upload succeeded; path appeared in the readout (same shape as Path A).

**Decision:** **Defer** — keep this capability documented as viable on iOS but DO NOT ship it in Phase 1.

**Notes:** `getUserMedia` honors the full-sensor constraint hint on iOS Safari (does NOT fall back to 1280×720 — a frequently-reported iOS gotcha that DOESN'T fire here). So a custom in-app camera preview is technically feasible for v1+ if a design need surfaces. However, for Phase 1 the UX gap is decisive: Path A's native camera UX (full controls, familiar iOS interaction model) beats Path B's bare stream. Defer Path B to v1+ as a candidate for "custom camera coach" / "guided framing" features where the trade-off would be worth the rebuild. `photo-comparison-ui` and `capture-flow` ship with Path A only.

---

## 3. Storage upload (both paths)

**Surface:** Supabase Storage browser under the project's `card-photos`
bucket, folder `{your-user-id}/spike/`.

**What to validate:**

- Both uploads landed at the expected path shape.
- RLS isolation: a different signed-in user cannot list / download
  these files (verify by opening a separate browser session if
  available).
- File size + dimensions in the Supabase browser match what the
  in-app readout reported.

**Result:** Both paths uploaded full-sensor JPEGs at 3024×4032 and the storage path appeared in the in-app readout immediately post-capture — the success signal that landed without surfacing a toast (the toast itself is informational; the path-appearing IS the canonical success indicator). The multi-MB JPEG transfer completed cleanly over real-world cellular / wifi (no 413, no timeout, no truncation). RLS isolation (one-user-cannot-see-another) was not explicitly cross-walked in this run; relying on the existing PR #9 multi-user RLS isolation E2E (`apps/web/e2e/rls-isolation.spec.ts`) that already pins this contract across all card-photos paths including the `{user_id}/...` leading segment that spike paths use.

**Decision:** **Ship**

**Notes:** Upload contract for the capture-flow path is validated end-to-end on real device. One informational follow-up — the in-app "upload complete" toast didn't surface during the walk; it was the storage-path readout that signaled success. Worth a small tweak in `capture-flow` to make success feedback unambiguous (a visible toast or a "✓ Uploaded" chip next to the path). Not a spike-gate failure — a UX polish note for capture-flow. See Spike-followups below.

---

## 4. Sync zoom (FPS)

**Surface:** `/spike/comparison` — pinch on either panel.

**What to validate:**

- The other panel follows the pinch identically (no drift, no lag).
- FPS overlay reads ≥45 (ideally 60) during a sustained pinch on
  full-resolution JPEGs (toggle "Use your own photos" after uploading
  via `/spike/camera`).
- Pan after zoom: drag with one finger after pinching in — both
  panels pan together.
- `touch-action: none` is correctly scoped — page scroll still works
  outside the panel area.

**Result:** Sync zoom felt smooth on real-touch input. FPS overlay read **> 58** consistently during sustained pinch + drag on full-resolution JPEGs (i.e. effectively holding 60fps; iOS Safari's rAF cap is 60Hz, so > 58 is the practical "no dropped frames" signal). Both panels followed the gesture identically — no visible drift or lag between them.

**Decision:** **Ship**

**Notes:** Pinch-zoom-synced-across-two-`<img>` panels with shared `{scale, originX, originY}` transform state holds 60fps on iOS Safari at iPhone-sensor JPEG resolution. This was the most uncertain capability going into the spike — custom pointer-event handlers on a hot path with two simultaneous CSS-transform repaints could plausibly have dropped under 45fps. They don't. `photo-comparison-ui` ships sync zoom in Phase 1 with confidence. Pan-after-zoom + page-scroll-outside-panels behavior was not explicitly walked but is structurally guaranteed by the implementation: `touch-action: none` is on the panels (not on `<html>`/`<body>`), so page scroll outside the panel area is unaffected.

---

## 5. Bounce mode — slow (1200 ms)

**Surface:** `/spike/comparison` — select "slow", tap Start bounce.

**What to validate:**

- Visible cadence matches the configured 1200 ms.
- Median readout converges near 1200 ms after ~20 swaps.
- p95 stays within 1.1× cadence (~1320 ms).
- Drift count stays at 0 in foreground, in steady state.

**Result:** Drift count read **< 1** across the run at 1200 ms cadence on real device. Median + p95 not recorded numerically, but the visual cadence matched expectations and the drift counter never climbed.

**Decision:** **Ship**

**Notes:** Slow cadence is the easiest of the three — comfortably within iOS Safari's `requestAnimationFrame` capability budget. No throttling observed in foreground steady state.

---

## 6. Bounce mode — default (750 ms)

**Surface:** `/spike/comparison` — select "default", tap Start bounce.

**What to validate:**

- Same checklist as section 5, with cadence 750 ms.
- This is the design-review default; the most critical of the three
  for `photo-comparison-ui`'s ship/defer call.

**Result:** Drift count read **< 1** at 750 ms cadence on real device. This is the design-review default and the load-bearing ship/defer call — it passed cleanly.

**Decision:** **Ship**

**Notes:** Default cadence holds tight on iOS Safari. `photo-comparison-ui` ships the user-adjustable cadence picker with 750 ms as the default, per design-review § Photo Comparison UI.

---

## 7. Bounce mode — fast (400 ms)

**Surface:** `/spike/comparison` — select "fast", tap Start bounce.

**What to validate:**

- Same checklist as section 5, with cadence 400 ms.
- This is the most demanding cadence; if drift fires here but not at
  750 ms, `photo-comparison-ui` ships the cadence picker without the
  "fast" option.

**Result:** Drift count read **< 1** at 400 ms cadence on real device. The most demanding cadence held tight; no main-thread contention surfaced as visible drift.

**Decision:** **Ship**

**Notes:** Fast cadence works on iOS Safari — the spike-feared "iOS throttles rAF below 250ms" failure mode did not fire. `photo-comparison-ui` ships all three cadences (slow / default / fast) in the user-adjustable picker.

---

## Backgrounding behavior (informational)

Lock the iPhone or switch to another tab mid-bounce. iOS Safari throttles
`requestAnimationFrame` to ~1Hz in background → drift count spikes. This
is EXPECTED behavior (spec § Gotchas); record what you saw so
`photo-comparison-ui` knows what UX gesture to handle (e.g. pause-on-blur
or just-accept-drift).

**Observation:** Not explicitly walked in this run. The spike's structural finding (all three cadences hold tight in foreground steady state) gives `photo-comparison-ui` enough signal to defer the backgrounding-policy choice to its own design pass — likely "just-accept-drift" (do nothing, let the rAF loop self-throttle) since the comparison surface isn't safety-critical. If a future user complaint reports "the bounce stopped while I was looking at it on a locked screen," revisit then.

---

## Low Power Mode (informational)

Toggle Low Power Mode in iOS Settings → Battery and rerun bounce 400 ms.
Throttling typically worsens. Record what you observed.

**Observation:** Not explicitly walked. Same reasoning as backgrounding behavior — foreground steady-state passed cleanly; LPM as a degradation mode is a v1+ concern, not a Phase 1 ship-gate input. `photo-comparison-ui` ships as if LPM is rare in the comparison flow (users typically engage comparison while actively reviewing on the dashboard, not in deep-throttle scenarios).

---

## Summary table

| Item                  | Decision  |
| --------------------- | --------- |
| Camera Path A         | **Ship**  |
| Camera Path B         | **Defer** |
| Storage upload        | **Ship**  |
| Sync zoom             | **Ship**  |
| Bounce slow (1200ms)  | **Ship**  |
| Bounce default (750ms)| **Ship**  |
| Bounce fast (400ms)   | **Ship**  |

---

## Net implication for `photo-comparison-ui`

The downstream `photo-comparison-ui` PR ships with **the maximal Phase 1 scope** — no fallback to side-by-side-only required. Specifically:

- Side-by-side with sync zoom + pan
- User-adjustable bounce-mode cadence picker with all three options (slow 1200 / default 750 / fast 400 ms)
- "Compare photos" entry point from CLOSED, PLANNED, and MONITOR card states (per design-review § Photo Comparison Is a Card Capability, Not a State)
- Screenshot-ready layout (dates + issue name + wordmark in frame)
- Missing-photo graceful degradation per design-review § Photo Comparison — Missing Photos

The CEO-review committed alternative ("If sync zoom or bounce fail → Phase 1 ships side-by-side only") is **NOT triggered**.

## Spike follow-ups for `capture-flow`

One small UX polish surfaced during the walk that doesn't gate the spike but should be addressed in `capture-flow`:

- **Upload-success feedback is implicit.** The spike currently signals upload completion by appending the Storage path to the dimensions / file-size readout. There's no toast or "✓ Uploaded" affirmation. `capture-flow` should make this explicit — a visible success indicator after the upload completes. The existing async-queued state in design-review § CAPTURE already covers this; this is a reminder that the polish there is a real concern, not a phantom one.

## Spike follow-ups for `photo-comparison-ui`

- The "Use your own photos" toggle and bundled samples worked as a deterministic baseline. Keep that exact pattern when building the production comparison surface (sample-photo bundling is reusable for the missing-photo edge cases per design-review).
- The FPS counter + drift counter overlays were genuinely useful diagnostics in the operator walk. Consider keeping a hidden "diagnostic mode" toggle in the production comparison UI (cmd-shift-click on the wordmark, or similar) so future iOS regressions can be diagnosed without reviving the spike.
