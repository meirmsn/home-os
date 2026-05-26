## Gate 9: qa

**Result**: pass

### UI walk

| Step | Action                                                                             | Expected                                               | Actual                                                                                                                                                 | Status |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1    | Navigate to `http://localhost:3000/login`                                          | Login page renders                                     | "Sign in to home-os" with email field + "Send magic link" button                                                                                       | PASS   |
| 2    | Enter `gatetest@example.com`, click Send magic link                                | "Check your email" confirmation                        | Confirmation displayed with correct email                                                                                                              | PASS   |
| 3    | Retrieve magic link from Mailpit (`host.docker.internal:54424`)                    | Email with auth link                                   | Magic link received, token `pkce_768458bb...`                                                                                                          | PASS   |
| 4    | Follow magic link (Supabase auth verify -> callback -> /home)                      | Redirect to /home, authenticated                       | Landed on `/home`, signed in as `gatetest@example.com`                                                                                                 | PASS   |
| 5    | Navigate to PLANNED card `/cards/fa3874c0-aefe-4306-b62b-a23e6b2ec0b6`             | PlannedView renders with card data                     | Card shows: "Dripping from the handle when turned off", "You chose: DIY", "Worn washer causing drip", severity "soon", "Mark as closed" button visible | PASS   |
| 6    | Click "Mark as closed"                                                             | CloseCardForm expands with amount, notes, photo fields | Form expanded: "Amount spent ($)" spinbutton, "Notes" textarea, "Finished photo" upload, "Close this card" + "Cancel" buttons                          | PASS   |
| 7    | Fill amount `25.00`, notes "Fixed with new washer"                                 | Fields accept input                                    | Amount shows "25.00", notes shows "Fixed with new washer"                                                                                              | PASS   |
| 8    | Click "Close this card"                                                            | Card transitions to CLOSED, ClosedView renders         | ClosedView displayed: "closed" chip, "Closed on Tue, May 26", "You spent: $25.00", "Fixed with new washer", before/after photo placeholders            | PASS   |
| 9    | Navigate to pre-existing CLOSED card `/cards/20db1fab-f7e3-4f40-9132-85e86080207d` | ClosedView with $85.10 spend                           | "You spent: $85.10" (float-safe formatting confirmed), "Tile repair kit and grout", "cosmetic" + "closed" chips                                        | PASS   |
| 10   | Check console for JS errors                                                        | No application errors                                  | Only 404 from tester's initial wrong URL (`/card/` vs `/cards/`); no app errors                                                                        | PASS   |

### API-level verification (supplementary)

All 5 RPC-level tests passed in prior run:

| Test | Description                                                        | Status |
| ---- | ------------------------------------------------------------------ | ------ |
| 1    | `close_card` RPC happy path with spend (`actual_spend_cents=1500`) | PASS   |
| 2    | State guard: close already-closed card raises `invalid_state`      | PASS   |
| 3    | Minimal close: no spend, no notes (both null)                      | PASS   |
| 4    | Cross-user forbidden: user 2 cannot close user 1's card            | PASS   |
| 5    | Close from non-planned state (`capturing`) raises `invalid_state`  | PASS   |

### Route handler analysis (code review)

The `POST /api/card/[id]/close` route handler was reviewed and passes all checks:
auth gate, UUID validation, FormData parsing, spend validation, notes validation,
photo validation, photo-first ordering (per Gotcha #2), RPC error handling, success response.

### Unit test coverage

- `route.test.ts`: 18 tests (happy path, 401, 400 validation, 409, 404, 500, photo upload tolerance)
- `CloseCardForm.test.tsx`: 12 tests (expand, cancel, submit, error states, PostHog events)
- `ClosedView.test.tsx`: 15 tests (render with/without spend, photos, thread)

### Dollar-to-cents formatting verification

The $85.10 card confirms the float-safe formatting documented in CLAUDE.md:

- Storage: `actual_spend_cents = 8510` (integer, no float dust)
- Display: `(8510 / 100).toFixed(2)` = `"85.10"` (trailing zero preserved)
- UI renders: "You spent: $85.10" (correct)

### Screenshots

| File                                  | Description                                      |
| ------------------------------------- | ------------------------------------------------ |
| `/tmp/qa-01-login-page.png`           | Login page with email field                      |
| `/tmp/qa-02-magic-link-sent.png`      | "Check your email" confirmation                  |
| `/tmp/qa-03-home-logged-in.png`       | Home page, authenticated as gatetest@example.com |
| `/tmp/qa-04-planned-card.png`         | PLANNED card detail with "Mark as closed" button |
| `/tmp/qa-05-close-form-expanded.png`  | CloseCardForm expanded (first view)              |
| `/tmp/qa-07-form-filled.png`          | Form filled with $25.00 and notes                |
| `/tmp/qa-08-after-close.png`          | ClosedView after successful close                |
| `/tmp/qa-09-existing-closed-card.png` | Pre-existing closed card with $85.10             |

### Dismissals

None
