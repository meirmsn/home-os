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

## Core user story

N/A — all `page.tsx` / `*.tsx` files added by this PR live under `apps/web/app/(app)/spike/**` (verifiable: `git diff --name-only --diff-filter=A origin/main...HEAD | grep -E '^apps/web/app/.*page\.tsx$'` returns only `apps/web/app/(app)/spike/{,camera/,comparison/}page.tsx`; no other `apps/web/app/**/page.tsx` is added). No production link reaches `/spike/*` (verifiable: `git grep -nE '"/spike(/|\")' apps/web/app | grep -v 'app/(app)/spike/'` returns no matches outside the spike directory itself). The deliverable is `.gstack/pwa-spike-result.md` (file present in the diff), operator-filled post-merge per D7. Gate 9 (qa-walk) skips artifact assertion per the `N/A — <reason>` carve-out.

## In scope

- Three auth-protected pages under `apps/web/app/(app)/spike/`:
  - `/spike` — landing page that orients the operator and surfaces the result-doc gate.
  - `/spike/camera` — dual-path camera test surface (Path A `<input capture>` + Path B `getUserMedia`) with inline measured dimensions + byte size + Storage upload through `card-photos` bucket (D2 + D3).
  - `/spike/comparison` — sync-zoom panel pair + bounce-mode cadence test at slow 1200ms / default 750ms / fast 400ms (D4 + D5 + D6).
- Three pure-fn helper modules with paired unit tests (`bounce-timer`, `sync-zoom-transform`, `storage-path`) — D9.
- Two bundled sample JPEGs under `apps/web/public/spike/` for the comparison surface's default mode (D6).
- `.gstack/pwa-spike-result.md` shipped as a templated skeleton with `RESULTS-PENDING: yes` sentinel + per-feature `**Result:** TBD` sections (D7).
- `BUILD-LOG.md` head TODO recording the cleanup plan that ships with `photo-comparison-ui` PR (D8).
- `## Where Things Happen` entries in `CLAUDE.md` for every new path.
- `PLAN.md § Active` row updated (this skill writes it in Step 4).

## Out of scope (deferred)

The entire purpose of the spike is to inform downstream `photo-comparison-ui` (PR #9 in `PLAN.md § Planned`). Everything below is deferred pending the spike result — `photo-comparison-ui` consumes `.gstack/pwa-spike-result.md` and either ships or defers each per the recorded **Ship / Defer / Ship-with-constraint** decision.

- **Production capture flow** — `capture-flow` (separate PR, separate spec). Spike validates the API surface but does NOT ship the user-facing capture UX.
- **Production photo comparison UI** — `photo-comparison-ui` (separate PR, separate spec). Spike validates the interaction primitives but does NOT ship the screenshot-ready comparison renderer, dates-in-frame layout, missing-photo degradation, or any card-state integration.
- **Sync zoom in production** — deferred pending FPS finding (D5). If real-iPhone FPS drops below ~45 during pinch on full-res JPEGs, the result doc records "defer sync zoom to v1" and `photo-comparison-ui` ships side-by-side only.
- **Bounce mode in production** — deferred pending cadence-drift finding (D4). If iOS Safari throttles `requestAnimationFrame` such that drift count is unacceptably high, the result doc records "defer bounce to v1."
- **Custom in-app camera preview** — deferred pending resolution finding (D2 Path B). If `getUserMedia` falls back below sensor resolution, custom preview is permanently shelved.
- **PostHog instrumentation on spike surfaces** — D10 forbids events. `METRICS.md` unchanged.
- **Playwright E2E on spike pages** — D9 forbids; iOS-targeted spike, Chromium-only E2E would be theater.
- **New Storage bucket / new RLS policy** — D3 reuses the existing `card-photos` bucket.
- **Production link from any other page to `/spike/*`** — D1 forbids; reachable by typing the URL after sign-in only.
- **Service worker / offline behavior** — see § Offline behavior below; spike is online-only.

## Screens

### `/spike` (landing)

**Renders:** Plain dark-ground page with three things —

1. One-paragraph orientation: "This is the PWA spike. Three pages under `/spike/*` test iOS Safari camera + Storage + sync zoom + bounce mode. After exercising each on a real iPhone, fill `.gstack/pwa-spike-result.md` and flip `RESULTS-PENDING: yes → no` before merging the PR."
2. Two internal links: `→ /spike/camera` and `→ /spike/comparison`.
3. A reminder block: "Result-doc gate: `.gstack/pwa-spike-result.md` must show `RESULTS-PENDING: no` before merge. Phase 6 audit refuses to pass until then."

**Primary actions:** Navigate to either of the two sub-pages.

**Edge cases:**

- Anonymous user → middleware redirect to `/login?next=/spike` (existing behavior from PR #10; nothing spike-specific).
- Server crash on `(app)/layout.tsx` `getUser()` — already handled by the layout's defense-in-depth redirect.

### `/spike/camera`

**Renders:** Two test panels stacked vertically (mobile) or side-by-side (≥768px) —

- **Path A panel:** `<input type="file" accept="image/*" capture="environment">` styled as a single tappable button. On change, reads the resulting `File`, surfaces inline measured dimensions (via `createImageBitmap`) + byte size, then uploads to Storage and surfaces the storage path + a short success indicator.
- **Path B panel:** A `<video>` element for the `getUserMedia` preview + a "Capture frame" button. On capture, draws the current video frame to an offscreen `<canvas>`, exports JPEG via `canvas.toBlob`, surfaces measured dimensions + byte size, then uploads to Storage.

**Primary actions:** Capture-and-upload via either path; observe inline dimensions; verify Storage row appears in the project Storage browser.

**Edge cases:**

- `getUserMedia` permission denied → render an inline error: "Camera permission denied. Test Path A or grant the permission in Safari settings." No retry button (operator just reloads).
- `getUserMedia` falls back to a lower resolution than requested → still capture and upload; the dimensions readout makes the fallback visible. This IS the finding the spike is supposed to surface.
- Upload fails (network, RLS, 5xx) → catch the error, render an inline error chip with the message and the attempted path. `Sentry.captureException` so the failure is observable post-hoc.
- Path A `File` is HEIC (iOS default before iOS 11; modern iOS Safari returns JPEG via the `<input capture>` path) → upload as-is with the `.jpg` extension per D3 path shape. If the operator's iOS device returns HEIC, the result doc records it as a finding for `capture-flow` to handle.
- `createImageBitmap` unsupported (very old Safari) → fall back to `new Image()` + `naturalWidth/naturalHeight`. Inline note: "ImageBitmap unsupported; using `<img>` fallback."

### `/spike/comparison`

**Renders:** A comparison surface with two image panels (vertically stacked on mobile, side-by-side on ≥768px) + a control strip below containing —

- Three cadence buttons: `slow (1200ms)` · `default (750ms)` · `fast (400ms)`.
- A "Start / stop bounce" toggle.
- A "Use your own photos" toggle (default off — bundled samples; on — two most-recent uploads under `{auth.uid()}/spike/`).
- Live readouts: current cadence, last-60-swap median frame-interval, last-60-swap p95 frame-interval, drift count (swaps > 1.5× configured cadence), and an FPS counter overlay on the image panels (sampled every 500ms).

**Primary actions:** Toggle bounce on/off at each cadence; pinch-zoom on either panel and observe the other follows; toggle to operator's uploads; observe FPS and drift readouts.

**Edge cases:**

- "Use your own photos" toggled on but operator has zero spike uploads → render an empty-state hint: "No spike uploads yet. Visit `/spike/camera` first." Keep the bundled samples visible so the comparison stays interactive.
- Storage list query errors → fall back to bundled samples + render a small error chip. `Sentry.captureException`.
- Operator backgrounds the tab during bounce → iOS Safari throttles `requestAnimationFrame` to 1Hz. Drift count spikes; this is the EXPECTED behavior the spike documents. No special handling.
- Low Power Mode on iPhone → throttles further. Documented in the result doc, not in code.
- Bundled JPEGs missing (build asset mismatch) → render a build-time check: if `/spike/sample-left.jpg` or `/spike/sample-right.jpg` 404s, render a clear error and skip auto-loading. Operator can still toggle to their own photos.

## Render conditions

`N/A — every spike surface has at most one conditional element with a single boolean toggle (e.g., "bounce on / off", "samples / own"). The empty-state and error chips in § Screens above enumerate the cells implicitly. The full matrix discipline applies to user-facing UI; the spike is operator-only.`

## Data model changes

**None.** Spike writes to the existing `card-photos` bucket only, under a new prefix `{auth.uid()}/spike/...` (D3). No new tables, no new columns, no new enums, no new migrations, no new RLS policies. The path shape passes the existing policy `(storage.foldername(name))[1] = auth.uid()::text` from `supabase/migrations/20260513184103_004_storage.sql` without modification.

## API contracts

**None.** Spike does not introduce any Next.js Route Handlers, Server Actions, or Edge Functions. Browser uploads to Supabase Storage directly via `supabase.storage.from('card-photos').upload(...)` from the SSR-aware browser client at `apps/web/lib/supabase/client.ts`. Storage list query for "Use your own photos" uses `supabase.storage.from('card-photos').list('{auth.uid()}/spike', { limit: 2, sortBy: { column: 'created_at', order: 'desc' } })`.

## Offline behavior

**Online-only (Type A) with error state.** Spike requires a live Supabase Storage connection. On network failure, the camera page shows an inline error chip per § Screens edge cases; the comparison page falls back to bundled samples. No retry, no queue, no service worker. This is correct for a spike — the iOS-Safari findings are independent of offline behavior, and offline UX is owned by `capture-flow` (queued capture) per its own spec.

## Metrics

**None.** D10 forbids events from any spike surface. `METRICS.md` unchanged.

## Files to create/modify

### New files

```
apps/web/app/(app)/spike/page.tsx
apps/web/app/(app)/spike/page.test.tsx
apps/web/app/(app)/spike/camera/page.tsx
apps/web/app/(app)/spike/camera/page.test.tsx
apps/web/app/(app)/spike/comparison/page.tsx
apps/web/app/(app)/spike/comparison/page.test.tsx

apps/web/app/(app)/spike/_lib/bounce-timer.ts
apps/web/app/(app)/spike/_lib/bounce-timer.test.ts
apps/web/app/(app)/spike/_lib/sync-zoom-transform.ts
apps/web/app/(app)/spike/_lib/sync-zoom-transform.test.ts
apps/web/app/(app)/spike/_lib/storage-path.ts
apps/web/app/(app)/spike/_lib/storage-path.test.ts

apps/web/app/(app)/spike/_components/CameraPathA.tsx
apps/web/app/(app)/spike/_components/CameraPathB.tsx
apps/web/app/(app)/spike/_components/ComparisonPanels.tsx
apps/web/app/(app)/spike/_components/CadenceControls.tsx

apps/web/public/spike/sample-left.jpg     (bundled placeholder; ~200KB)
apps/web/public/spike/sample-right.jpg    (bundled placeholder; ~200KB)

.gstack/pwa-spike-result.md               (templated skeleton; RESULTS-PENDING: yes)

specs/pwa-spike/spec.md                   (this file — already written by Phase 0 + this skill)
```

`_components/*.tsx` are sibling-component thin wrappers; their logic is exercised through their parent `page.test.tsx`. Exempt via `.devshop-test-coverage-exempt` (same pattern as `LoginForm.tsx` in `auth-magic-link`).

### Modified files

```
CLAUDE.md                                 (+ § Where Things Happen entries for every new path)
BUILD-LOG.md                              (+ head TODO per D8)
PLAN.md                                   (move pwa-spike row Planned → Active — done by /ak-spec Step 4)
.devshop-test-coverage-exempt             (+ `apps/web/app/(app)/spike/_components/*.tsx` patterns)
```

## Tests

Per D9 — unit-test the testable layers; defer iOS-specific assertions to the result doc.

### Unit tests (Vitest + jsdom)

- **`bounce-timer.test.ts`** — drives the pure-fn `bounceTimer({ cadence, timestamps })` with synthetic `performance.now()` arrays:
  - Ideal cadence (delta == cadence exactly, repeated 60×) → drift count 0, median ≈ cadence.
  - Jitter ±10% → drift count 0, median ≈ cadence, p95 within 1.1× cadence.
  - Throttled 2× (delta == 2 × cadence) → every swap counted as drift.
  - Empty / single-element / two-element arrays → return shape stable, no NaN.
  - Three cadences (1200 / 750 / 400) parameterized via `it.each`.
- **`sync-zoom-transform.test.ts`** — pure transform math:
  - `pinchToScale(p0a, p0b, p1a, p1b, prevScale)` — table-driven cases: 2× zoom-in, 0.5× zoom-out, identity (no movement), single-touch (only one pointer changes — clamps to prevScale).
  - `clampOrigin({ x, y }, scale, bounds)` — clamps to image bounds at every scale level; at scale=1 origin must be `{0, 0}`.
  - `composeTransform({ scale, origin })` returns the exact `translate(...) scale(...)` string.
- **`storage-path.test.ts`** — pins the exact format:
  - `spikePath('7e2a-...-uuid', 'A', new Date('2026-05-13T18:30:45.000Z'))` → `'7e2a-...-uuid/spike/2026-05-13T18-30-45Z-A.jpg'`.
  - Slot must be `'A'` or `'B'` — throws on other input.
  - UserId must be non-empty — throws.

### Page-level tests (Vitest + React Testing Library + jsdom)

- **`page.test.tsx` (each of the 3 pages)** — thin Layer-1 test-presence assertions:
  - `/spike` renders the orientation paragraph + both internal links.
  - `/spike/camera` renders both Path A and Path B panel headings.
  - `/spike/comparison` renders three cadence buttons + the bounce toggle + the "use your own photos" toggle.

No Playwright E2E (D9). Page-level tests pass under jsdom — they assert structural rendering, not iOS-specific behavior. The iOS behaviors are operator-validated and recorded in `.gstack/pwa-spike-result.md`.

### Test-presence overrides

`apps/web/app/(app)/spike/_components/*.tsx` are component-only files exercised through parent `page.test.tsx`. Add a matching glob to `.devshop-test-coverage-exempt`.

## Dependencies

- **PR #9 (`supabase-schema-and-rls`)** — `card-photos` bucket exists with RLS policy keyed on the leading `{user_id}` path segment. Spike's upload path conforms.
- **PR #10 (`auth-magic-link`)** — `(app)` route group with middleware redirect + layout `getUser()` guard. Spike pages live under this group and inherit auth protection automatically.
- **Existing Supabase clients** — `apps/web/lib/supabase/client.ts` (browser) and `.../server.ts` (server). No new clients.
- **No new packages.** Spike uses native browser APIs (`<input capture>`, `getUserMedia`, `requestAnimationFrame`, `performance.now()`, `createImageBitmap`, `canvas.toBlob`, Pointer Events) + the existing Tailwind v4 token surface in `packages/ui/src/tokens.ts`.

## Task order

Dependency-ordered task list — `/ak-implement` consumes this directly. The live Phase 2 tracker is updated to mirror this order (helpers swapped to T1 so subsequent tasks can import without forward-references; the Phase 0 preview had helpers at position 4).

### T1 — Pure-fn helpers + their unit tests

Create `apps/web/app/(app)/spike/_lib/{bounce-timer,sync-zoom-transform,storage-path}.{ts,test.ts}`. All three are pure-functional; pin behavior with the test cases enumerated in § Tests § Unit tests. T1 is first so T2–T4 import without forward-references and T3/T4's page-level tests can stub helpers if needed.

### T2 — `/spike` landing page + `## Where Things Happen` entries

Create `apps/web/app/(app)/spike/page.tsx` + `page.test.tsx`. Server component (no `'use client'`), renders the orientation copy + the two internal links + the result-doc gate reminder. Add `## Where Things Happen` entries to `CLAUDE.md` for the landing page surface.

### T3 — `/spike/camera` dual-path camera + Storage upload

Create `apps/web/app/(app)/spike/camera/page.tsx` + `page.test.tsx`, plus the `_components/CameraPathA.tsx` and `_components/CameraPathB.tsx` wrappers (`'use client'` — they touch `<input>`, `<video>`, `<canvas>`, Storage). Wire the Storage upload through the existing `client.ts` browser client using `storagePath()` from T1. Surface inline measured dimensions + byte size + storage path + success/error chips per § Screens. Add `## Where Things Happen` entries for each new path.

### T4 — `/spike/comparison` sync-zoom + bounce mode

Create `apps/web/app/(app)/spike/comparison/page.tsx` + `page.test.tsx`, plus `_components/ComparisonPanels.tsx` and `_components/CadenceControls.tsx` (`'use client'` — Pointer Events + `requestAnimationFrame`). Wire `bounceTimer()` and the sync-zoom transform math from T1. Render two stacked `<img>` panels with `touch-action: none` ON THE PANELS (not the document — see § Gotchas), the cadence controls, the "use your own photos" toggle, and the live readouts (median, p95, drift, FPS). Add `## Where Things Happen` entries.

### T5 — Sample photos + `.gstack/pwa-spike-result.md` skeleton

Drop two placeholder JPEGs at `apps/web/public/spike/sample-left.jpg` and `apps/web/public/spike/sample-right.jpg` (~200KB each; any visibly-different scene pair so the comparison surface is testable on first load). Create `.gstack/pwa-spike-result.md` with `RESULTS-PENDING: yes` in frontmatter + one section per gate item (camera Path A, camera Path B, Storage upload, sync zoom, bounce 1200 / 750 / 400 ms), each with `**Result:** TBD` and a "Ship / Defer / Ship-with-constraint" line per D7.

### T6 — `BUILD-LOG.md` head TODO + `PLAN.md` Active row bookkeeping

Append the cleanup TODO from D8 to `BUILD-LOG.md` head (above the "Shipped" log). Confirm `PLAN.md § Active` row reads correctly (this skill writes the row in Step 4; T6 is the verification + any final tidy).

## Gotchas

iOS-Safari-specific things to be aware of while implementing:

- **`getUserMedia` requires HTTPS.** Works on the Vercel preview deploy (HTTPS by default). Fails on `http://localhost` unless Safari is launched with `--unsafely-treat-insecure-origin-as-secure=http://localhost` (Chromium-only flag) or the project is bound to `https://localhost` via a local cert. The spike testing surface is the Vercel preview URL — never local. Page-level tests run under jsdom which doesn't expose `mediaDevices`; stub or feature-detect.
- **`<input capture>` behavior varies by browser.** iOS Safari: opens camera UI directly, returns a JPEG `File`. Android Chrome: prompts "Camera or Files." Desktop Chrome / Firefox: ignores `capture`, opens file picker. The dimensions + size readout on Path A makes the behavior observable in each environment — don't try to detect the platform in code.
- **`touch-action: none` must be on the panels NOT the document.** Putting it on `<html>` or `<body>` disables every gesture on every page, including the `/spike` landing's scroll. Scope strictly to the two image panel `<div>`s inside `ComparisonPanels.tsx`.
- **Storage upload requires a signed-in user.** Middleware redirects anonymous users from `/spike/*` to `/login?next=/spike/...` (existing behavior — `(app)` group is matched by middleware). RLS rejects unsigned uploads at the Storage layer regardless. Don't add app-side auth checks; trust the existing gate.
- **`requestAnimationFrame` throttles to 1Hz when the tab is backgrounded on iOS.** The drift counter will spike when the operator switches tabs or locks the screen. This is the EXPECTED finding — don't suppress it with `document.visibilityState` checks; the result doc records it as a known constraint for `photo-comparison-ui`.
- **`createImageBitmap` Safari support is recent (15.4+).** Feature-detect and fall back to `new Image()` + `naturalWidth/naturalHeight` for the dimensions readout. The fallback is less precise (decodes via `<img>` not bitmap) but adequate for the spike.
- **`canvas.toBlob` quality default is 0.92 (Safari).** Spec passes `0.95` explicitly so the Path B JPEG is comparable to the Path A `<input capture>` JPEG. Don't omit the quality argument.
- **iOS Safari hides the address bar on scroll → viewport changes → FPS counter and pinch handlers must use `visualViewport` not `window.innerHeight`.** The FPS overlay positions via `visualViewport.height` to avoid drifting beneath the address bar mid-bounce.

## Acceptance criteria

(a) All CI green: typecheck, lint, fast-job unit tests including T1's three unit-test files + the three `page.test.tsx` files.

(b) Auth gate confirmed: anonymous request to `/spike`, `/spike/camera`, `/spike/comparison` → 303 redirect to `/login?next=<path>` per existing middleware behavior. Verified by the page tests asserting the layout's `getUser()` redirect path (or by manual browser navigation on the preview deploy).

(c) All three pages render without runtime error in Chromium (Vercel preview). Operator opens each URL → page renders, controls are interactive, no console errors at idle.

(d) Storage uploads land at the expected path: `{auth.uid()}/spike/{ISO-no-colons}-{A|B}.jpg` per D3. Verified by uploading from `/spike/camera` and inspecting the Storage browser in the Supabase project dashboard.

(e) `.gstack/pwa-spike-result.md` shipped with the templated skeleton + `RESULTS-PENDING: yes`. Operator flips to `no` after iOS validation; Phase 6 audit gates on `RESULTS-PENDING: no` and refuses to merge if `yes`.

## Rollout

**No feature flag.** The `(app)/spike/*` pages ship to production on merge but are not linked from any other page (D1). They're reachable only by a signed-in user typing the URL directly. No production marketing copy mentions them. The pages exist solely so the operator can test against the real Vercel-preview-shaped runtime (HTTPS, real Storage, real auth).

**No incremental rollout, no canary.** Spike is binary — either operator validates on iOS and fills the result doc, or it doesn't ship.

**Deletion path:** The cleanup PR is `photo-comparison-ui` (PR #9 in `PLAN.md § Planned`). It consumes `.gstack/pwa-spike-result.md`, ships the production photo-comparison surface, and in the same PR deletes `apps/web/app/(app)/spike/`, `apps/web/public/spike/`, the `## Where Things Happen` entries for spike surfaces, and the `BUILD-LOG.md` head TODO that tracks this cleanup. Per D8.

## Rollback

Revert the merge commit on `main`. No DB schema change to undo, no migration to reverse, no RLS policy to drop, no edge function to redeploy, no env var to rotate, no feature flag to flip. The only state that survives a revert is the operator's spike-prefixed Storage uploads under `{auth.uid()}/spike/` — those can be left in place (low-volume operator data, RLS-isolated) or batch-deleted via a one-line `storage.from('card-photos').remove(...)` if desired. The revert restores `BUILD-LOG.md`, `CLAUDE.md`, and `.devshop-test-coverage-exempt` to pre-PR state automatically.
