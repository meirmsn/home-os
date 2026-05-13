---
# RESULTS-PENDING: yes means the operator has NOT yet completed the
# real-iPhone-Safari walk-through. Phase 6 audit refuses to advance
# until this flag is "no" — see specs/pwa-spike/spec.md § D7.
RESULTS-PENDING: yes
feature: pwa-spike
spec: specs/pwa-spike/spec.md
device: TBD  # e.g. "iPhone 14 Pro, iOS 17.4, Safari, Low Power Mode off"
deploy: TBD  # e.g. "https://home-os-<sha>.vercel.app"
date: TBD
operator: TBD
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

**Result:** TBD

**Decision:** Ship / Defer / Ship-with-constraint — TBD

**Notes:**

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

**Result:** TBD

**Decision:** Ship / Defer / Ship-with-constraint — TBD

**Notes:**

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

**Result:** TBD

**Decision:** Ship / Defer / Ship-with-constraint — TBD

**Notes:**

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

**Result:** TBD

**Decision:** Ship / Defer / Ship-with-constraint — TBD

**Notes:**

---

## 5. Bounce mode — slow (1200 ms)

**Surface:** `/spike/comparison` — select "slow", tap Start bounce.

**What to validate:**

- Visible cadence matches the configured 1200 ms.
- Median readout converges near 1200 ms after ~20 swaps.
- p95 stays within 1.1× cadence (~1320 ms).
- Drift count stays at 0 in foreground, in steady state.

**Result:** TBD

**Decision:** Ship / Defer / Ship-with-constraint — TBD

**Notes:**

---

## 6. Bounce mode — default (750 ms)

**Surface:** `/spike/comparison` — select "default", tap Start bounce.

**What to validate:**

- Same checklist as section 5, with cadence 750 ms.
- This is the design-review default; the most critical of the three
  for `photo-comparison-ui`'s ship/defer call.

**Result:** TBD

**Decision:** Ship / Defer / Ship-with-constraint — TBD

**Notes:**

---

## 7. Bounce mode — fast (400 ms)

**Surface:** `/spike/comparison` — select "fast", tap Start bounce.

**What to validate:**

- Same checklist as section 5, with cadence 400 ms.
- This is the most demanding cadence; if drift fires here but not at
  750 ms, `photo-comparison-ui` ships the cadence picker without the
  "fast" option.

**Result:** TBD

**Decision:** Ship / Defer / Ship-with-constraint — TBD

**Notes:**

---

## Backgrounding behavior (informational)

Lock the iPhone or switch to another tab mid-bounce. iOS Safari throttles
`requestAnimationFrame` to ~1Hz in background → drift count spikes. This
is EXPECTED behavior (spec § Gotchas); record what you saw so
`photo-comparison-ui` knows what UX gesture to handle (e.g. pause-on-blur
or just-accept-drift).

**Observation:**

---

## Low Power Mode (informational)

Toggle Low Power Mode in iOS Settings → Battery and rerun bounce 400 ms.
Throttling typically worsens. Record what you observed.

**Observation:**

---

## Summary table — fill before flipping RESULTS-PENDING

| Item                  | Decision                                |
| --------------------- | --------------------------------------- |
| Camera Path A         | Ship / Defer / Ship-with-constraint     |
| Camera Path B         | Ship / Defer / Ship-with-constraint     |
| Storage upload        | Ship / Defer / Ship-with-constraint     |
| Sync zoom             | Ship / Defer / Ship-with-constraint     |
| Bounce slow (1200ms)  | Ship / Defer / Ship-with-constraint     |
| Bounce default (750ms)| Ship / Defer / Ship-with-constraint     |
| Bounce fast (400ms)   | Ship / Defer / Ship-with-constraint     |

When every row above shows a concrete decision (not "TBD"), flip
`RESULTS-PENDING: yes → no` in the frontmatter and push the result-doc
commit to `feature/pwa-spike`.
