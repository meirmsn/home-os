## Gate 9: /qa

- Result: pass (live QA via gstack browse daemon)

Drove the live compare route (`/cards/<id>/compare`) in a real headless
Chromium with a seeded authenticated session + a card carrying two photo
touchpoints (primary wide+medium, close wide). Verified end-to-end:

- Auth + RLS-scoped load: compare route renders (no redirect — ≥2 gate passes).
- Side-by-side panels render distinct photos (A=earlier, B=later).
- Slot selector: clicking "Medium" toggles the radio (aria-checked flips) and
  panel B (which lacks medium) shows the greyed placeholder
  "No photo for this slot on Wed, May 20".
- Bounce auto-disables in the missing-slot state, with the hint
  "Bounce needs the selected slot on both dates." (spec D4).
- Back link, date pickers, dates, wordmark all present.
  Bounce rAF animation + pinch-zoom gestures are pinned by unit tests
  (bounce frame-swap test added in e20405b; sync-zoom-transform table tests)
  rather than driven here.

## Dismissals

None
