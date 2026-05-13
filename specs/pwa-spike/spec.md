<!-- generated-by: /ak-build Phase 0 (skeleton — /ak-spec will expand) -->
<!-- feature: pwa-spike -->
<!-- date: 2026-05-13 -->

# Spec: pwa-spike (PR 3)

**Sources:**

- `PLAN.md § Planned § row 1 (pwa-spike)` — primary scope and the "Output: `.gstack/pwa-spike-result.md`" gate
- `.gstack/eng-review-home-os-2026-05-01.md § Pre-Ship Requirements #1` ("PWA spike") + `§ Build Order step 3` (parallel-with-foundation positioning + photo-comparison-ui gating) — primary scope
- `.gstack/design-review-home-os-2026-05-02.md § Photo Comparison UI` — cadence canonical set (slow 1200ms / default 750ms / fast 400ms), "instant cut between frames — no crossfade", screenshot-ready layout
- `.gstack/ceo-review-home-os-2026-05-01-r2.md § PWA photo comparison quality` ("If not achievable at required quality, these are Phase 2 candidates and Phase 1 ships side-by-side only.")
- Existing surfaces on main: `apps/web/app/(app)/layout.tsx` (auth-protected shell from PR #10), `apps/web/lib/supabase/{client,server}.ts` (SSR clients), `card-photos` Storage bucket from PR #9 (RLS gate `(storage.foldername(name))[1] = auth.uid()::text`)
- Prior spec `specs/auth-magic-link/spec.md` — structure + style reference

Build a minimal in-app surface under `apps/web/app/(app)/spike/` that exercises (1) iOS Safari camera capture at full sensor resolution via two paths, (2) full-resolution Storage upload through the existing `card-photos` RLS-gated bucket, (3) sync-zoom interaction across two image panels, and (4) bounce-mode rapid alternation at the three design-review cadences (1200 / 750 / 400 ms). Operator validates on real iPhone Safari against the Vercel preview deploy, then fills `.gstack/pwa-spike-result.md` (shipped as a templated skeleton with a `RESULTS-PENDING: yes` sentinel) with per-feature ship-or-defer decisions for the downstream `photo-comparison-ui` PR. Result doc must be filled (`RESULTS-PENDING: no`) before merge.

---

## Decisions (resolved at spec time)

11 `/ak-spec`-time decisions resolved in Phase 0 with the operator. Recorded below so Phase 1 preserves them verbatim and a crashed Phase 1 resumes without re-asking.

### D1: Spike pages live under `apps/web/app/(app)/spike/*`

**Decision:** Three pages under the existing auth-protected `(app)` route group: `(app)/spike/page.tsx` (landing + result-doc gate reminder), `(app)/spike/camera/page.tsx` (camera tests), `(app)/spike/comparison/page.tsx` (sync-zoom + bounce-mode tests). No env-var gate, no production link from any other page.

**Rationale:** The `(app)` shell from auth-magic-link (PR #10) already enforces auth via middleware redirect + layout `getUser()` guard. Storage RLS protects uploads regardless. No user-facing entry point means no risk of leakage. An env gate would prevent the operator from testing the prod-shaped flow on the Vercel preview. Deletion is a single PR change after `photo-comparison-ui` consumes the findings (D8).

### D2: Dual camera-API approach

**Decision:** `(app)/spike/camera` renders two side-by-side test surfaces:

1. **Path A — `<input type="file" accept="image/*" capture="environment">`** — primary, matches the API surface `capture-flow` will ship. Reads the resulting `File` via `FileReader` + `createImageBitmap` to surface measured pixel dimensions and byte size inline.
2. **Path B — `navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 3072 } } })`** — secondary, validates whether a custom in-app camera preview is viable for v1+ at full sensor resolution. Frame captured to a `<canvas>` then exported as JPEG via `canvas.toBlob`.

Both paths upload through the same Storage helper to the same path shape (D3) so the operator can compare resulting JPEG quality + dimensions in Storage.

**Rationale:** (a) is the actual shipping API for Phase 1 capture-flow; spike-validating it is the gate's first job. (b) tests whether the iOS Safari `getUserMedia` constraint hint is honored at the sensor's native resolution — if it falls back to 1280×720 or similar, that's a hard "custom preview is not viable on iOS Safari" finding worth documenting now rather than discovering during a v1+ design cycle.

### D3: Storage upload path shape

**Decision:** Existing `card-photos` bucket, no new bucket, no new policies. Path shape:

```
{auth.uid()}/spike/{ISO-timestamp}-{path-letter}.jpg
```

Example: `7e2a.../spike/2026-05-13T18-30-45Z-A.jpg` (Path A — `<input capture>`) or `...-B.jpg` (Path B — `getUserMedia`). The leading `{auth.uid()}` segment passes the RLS rule `(storage.foldername(name))[1] = auth.uid()::text` defined in `supabase/migrations/20260513184103_004_storage.sql`.

**Rationale:** RLS already gates by user folder. Carving a separate bucket would require a new migration + a new policy + a new Storage URL in CSP and would never be cleanly deletable. Co-locating spike uploads inside the user's own folder under a `/spike/` prefix lets the operator (or the cleanup PR) drop them with a single `storage.from('card-photos').remove(...)` if desired.

### D4: Bounce-mode cadence test at the three design-review canonical values

**Decision:** `(app)/spike/comparison` renders one comparison surface that lets the operator pick the cadence (slow 1200ms / default 750ms / fast 400ms — the values written into design-review § Photo Comparison UI) via three buttons. Implementation uses `requestAnimationFrame` + `performance.now()` deltas to drive an `opacity: 0/1` swap between two stacked `<img>` elements (no `src` swap, no crossfade, instant cut). The page surfaces:

- The configured cadence
- The measured median + p95 frame-interval over the last 60 swaps
- A running drift count: number of swaps that arrived > 1.5× the configured cadence (signals battery throttling or main-thread contention)

**Rationale:** Design review specifies the three cadences; the gate has to validate all three because v1 ships a user-adjustable cadence picker, not a single hard-coded 750ms. `opacity` swap on two stacked elements avoids the `src`-decoded-on-paint stall that browsers exhibit when swapping `<img>` sources. `performance.now()` deltas surface the iOS-Safari-specific throttling behaviors (background tab, low-power mode) that are the actual unknowns being tested.

### D5: Sync-zoom implementation — custom pinch handler with shared transform state

**Decision:** Two `<img>` panels stacked vertically (mobile portrait) or side-by-side (≥768px). `touch-action: none` on both panels. Custom `pointerdown`/`pointermove`/`pointerup` handlers compute one shared `{scale, originX, originY}` state from the user's pinch + drag gestures and apply it as `transform: translate(...) scale(...)` to BOTH panels identically. An FPS counter (sampled every 500ms via `requestAnimationFrame` deltas) is overlaid bottom-right so the operator can see whether 60fps holds during pinch on a real device.

**Rationale:** Native `touch-action: pinch-zoom` doesn't synchronize zoom state across separate elements — each element pinch-zooms independently. Custom handlers are the only viable shape. Spike measures whether two simultaneous CSS-transform repaints on full-resolution JPEGs hold 60fps on iOS Safari; if FPS drops below ~45 during pinch, that's a hard "defer sync zoom to v1" finding.

### D6: Test photo set — bundled samples + operator's own photos

**Decision:** `(app)/spike/comparison` defaults to two bundled JPEGs in `apps/web/public/spike/` (an "Empty test card — left" + "Empty test card — right" placeholder pair) so the surface is testable immediately on first load. A "Use your own photos" toggle switches the comparison source to the two most-recent images uploaded by the current user under `{auth.uid()}/spike/`. The operator's testing flow is: open `/spike/camera`, upload two photos (one Path A, one Path B), then open `/spike/comparison`, toggle "Use your own photos", and exercise sync zoom + bounce.

**Rationale:** Bundled photos give a deterministic baseline that anyone reviewing the PR can reproduce. Operator's own iPhone-captured 4032×3024 JPEGs are the actual workload the spike is supposed to validate — bundled photos alone don't stress the comparison renderer the way real-camera output does. Both modes share the same renderer; the toggle is one signal flip.

### D7: Result-doc gate — `.gstack/pwa-spike-result.md` with `RESULTS-PENDING` sentinel

**Decision:** The PR ships `.gstack/pwa-spike-result.md` as a templated skeleton with `RESULTS-PENDING: yes` at the top of the frontmatter block and one section per gate item (camera Path A, camera Path B, Storage upload, sync zoom, bounce 1200ms / 750ms / 400ms). Each section has a `**Result:** TBD` field that the operator fills in after iOS testing along with a per-feature **Ship / Defer / Ship-with-constraint** decision. When all `Result:` fields are filled, operator flips `RESULTS-PENDING: yes → no`. Phase 6's evidence-on-disk sweep checks `RESULTS-PENDING: no` and refuses to advance the audit gate if `yes`.

**Rationale:** The whole point of the spike is the result doc; merging without it filled in is the failure mode this entire feature exists to prevent. A textual sentinel reduces the human-must-do check to a grep — same shape as Phase 6's existing evidence sweep over image-embed paths. CI doesn't enforce because CI can't drive iOS Safari; the structural gate has to be in the audit comment workflow.

### D8: Cleanup plan recorded in `BUILD-LOG.md` head TODO

**Decision:** Add a `BUILD-LOG.md` head TODO mirroring the CAPTCHA + preview-deploy-email TODOs already there:

```
> **[TODO] PWA-spike surfaces deferred for cleanup** — After `photo-comparison-ui`
> ships and its design decisions are baked in, delete:
> `apps/web/app/(app)/spike/`, `apps/web/public/spike/`, the `## Where Things
> Happen` entries for spike surfaces, and the spike paths from any `connect-src`
> / route allowlists. Remove this line when done.
```

**Rationale:** Spike code shouldn't outlive its consumer. The TODO pattern is the project's existing convention (PR #10 head). `photo-comparison-ui` PR consumes `.gstack/pwa-spike-result.md` directly; deleting the spike pages in that same PR keeps history tidy.

### D9: Tests — unit-test the testable layers; defer iOS-specific assertions to the result doc

**Decision:** Unit tests cover:

- `bounce-timer.ts` — pure function that computes cadence drift from a sequence of `performance.now()` timestamps. Tested via jsdom + `vi.useFakeTimers()` with synthetic timestamp arrays for the three cadence × ideal/jitter/throttled-by-2x scenarios.
- `sync-zoom-transform.ts` — pure transform-math functions (`pinchToScale(p0a, p0b, p1a, p1b, prevScale)`, `clampOrigin`, etc.). Pure-functional, table-driven test cases.
- `storage-path.ts` — `spikePath(userId, slot, now)` → `"{user_id}/spike/{ISO-with-colons-stripped}-{slot}.jpg"`. Trivial unit test pinning the exact format string.

Page-level components (`page.tsx` files) carry sibling `*.test.tsx` files satisfying Layer-1 test-presence; assertions are limited to "renders without crashing + the toggle changes the visible source," because the load-bearing iOS behavior (resolution, FPS, cadence drift) is operator-validated and recorded in `.gstack/pwa-spike-result.md`. No Playwright E2E — Playwright cannot drive real iOS Safari, and a Chromium-only E2E would falsely "validate" the iOS-specific behaviors.

**Rationale:** Test-presence hook is satisfied at the file level; logic that has a deterministic input/output gets pinned by an assertion; the iOS-specific findings live in the result doc, which is the gate. Layering Playwright on a spike whose entire premise is "Chromium-based testing doesn't capture iOS-specific quirks" would be theater.

### D10: No metrics events for spike surfaces

**Decision:** No PostHog events fired from `(app)/spike/*`. `METRICS.md` unchanged.

**Rationale:** Spike has no shipped UX. Instrumentation would be deleted by the cleanup PR. Adding it pollutes the events list and creates a "phantom event" in analytics dashboards for the duration the spike exists. Net negative.

### D11: Operator workflow → result-doc fill → merge

**Decision:** PR's `## Test plan § Manual review` section will carry an explicit operator checklist:

```
- [ ] Open Vercel preview URL on iPhone Safari (real device, not simulator)
- [ ] Sign in via magic link
- [ ] Walk /spike/camera Path A: capture, observe measured dimensions, verify Storage upload
- [ ] Walk /spike/camera Path B: capture via getUserMedia, observe measured dimensions, verify Storage upload
- [ ] Walk /spike/comparison: sync zoom (FPS check), bounce 1200 / 750 / 400 ms (drift check)
- [ ] Fill .gstack/pwa-spike-result.md with findings + per-feature Ship / Defer / Ship-with-constraint
- [ ] Flip RESULTS-PENDING: yes → no in the result doc
- [ ] Push the result-doc commit to feature/pwa-spike
- [ ] Merge
```

Phase 6's audit comment will surface the same checklist so it's not lost between Phase 6 and merge.

**Rationale:** The handoff has to be explicit because it's the load-bearing manual step the entire spike is structured around. Burying it in `review.md` instead of the PR body would make merging-without-results too easy.

---

<!-- /ak-spec (Phase 1) expands the file from here: In scope, Screens, Data
     model changes, API contracts, Offline behavior, Metrics, Files to
     create/modify, Tests, Dependencies, Task order, Gotchas, Acceptance /
     rollout / rollback. The Decisions section above stays verbatim. -->
