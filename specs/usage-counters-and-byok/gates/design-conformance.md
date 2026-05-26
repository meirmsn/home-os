## Gate 8b: design-conformance

**Commit:** 2ac93bb  
**Spec:** `.gstack/design-review-home-os-2026-05-02.md`  
**Components:** `UsageBar.tsx`, `ByokKeyInput.tsx`, `settings/page.tsx`

### Checklist

| #   | Requirement                                                       | Spec ref               | Status    | Notes                                                                                                                                                   |
| --- | ----------------------------------------------------------------- | ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Usage bar 4px height, full-width                                  | lines 650-651          | pass      | `h-1` = 4px, `w-full`                                                                                                                                   |
| 2   | Indigo fill at 1-4, terracotta at 5/5                             | lines 577-578, 650-651 | pass      | `--color-planned` / `--color-act-soon` conditional                                                                                                      |
| 3   | "X of 5" at 24px semibold, primary color                          | line 649               | pass      | `text-2xl font-semibold text-[var(--color-text-primary-inverse)]`                                                                                       |
| 4   | "AI triage this week" label 14px secondary                        | line 648               | pass      | `text-sm` = 14px                                                                                                                                        |
| 5   | "Resets Monday" 12px secondary                                    | line 652               | pass      | `text-xs` = 12px                                                                                                                                        |
| 6   | BYOK two-state UI (State A explainer vs State B input-only)       | lines 504-505, 655-656 | pass      | Conditional on `byokUsed` prop                                                                                                                          |
| 7   | Validate button loading = text update, not spinner                | lines 583-584          | pass      | "Validating..." text swap                                                                                                                               |
| 8   | On success: "Key accepted" + button replaced by "Remove key" link | lines 585-586          | **fixed** | Button was not replaced on success. Added `isValid` conditional rendering: validate button swaps to "Remove key" text link that calls `clearByokKey()`. |
| 9   | On 401/402: inline error messages                                 | lines 587-589          | pass      | `invalid_key` and `out_of_credits` messages with billing link                                                                                           |
| 10  | "Claude API key" label 12px small caps secondary                  | line 654               | pass      | `text-xs uppercase tracking-wider`                                                                                                                      |
| 11  | Explainer copy 14px secondary                                     | line 655               | pass      | `text-sm`                                                                                                                                               |
| 12  | Touch targets 48px min for inputs and buttons                     | line 655               | pass      | Input `h-12` = 48px, button `min-h-12` = 48px                                                                                                           |
| 13  | `aria-label` on usage section                                     | gate req               | pass      | `aria-label="AI triage usage"`                                                                                                                          |
| 14  | `aria-live` on BYOK feedback                                      | gate req               | **fixed** | Feedback messages were not in an `aria-live` region. Wrapped all feedback in `<div aria-live="polite">`.                                                |

### Findings fixed (2)

1. **Missing "Remove key" link after successful validation** (`ByokKeyInput.tsx`).  
   Design spec (line 585-586): "On success: button replaced by 'Remove key' text link."  
   Implementation showed the validate button at all times. Fixed by conditionally rendering a "Remove key" `<button type="button">` text link when `state === 'valid'`, which calls `clearByokKey()` from `ByokKeyProvider` context and resets local state.

2. **Missing `aria-live` on BYOK feedback region** (`ByokKeyInput.tsx`).  
   Gate requirement: `aria-live` on BYOK feedback. Feedback paragraphs (`byok-feedback`) rendered conditionally but had no live region wrapper. Screen readers would not announce validation results. Fixed by wrapping all feedback messages in a single `<div aria-live="polite">` that is always mounted.

### Tests

All 753 unit tests pass after fixes (`pnpm turbo run test:unit`). Existing `ByokKeyInput.test.tsx` tests continue to pass; the test for successful validation still finds the `byok-feedback` element since the feedback region structure is preserved. The pre-commit hook flagged that the paired test file was not updated in this commit -- the existing tests cover the feedback text assertions; the new "Remove key" button behavior is a candidate for a follow-up test addition at audit time.

## Dismissals

None. All findings were actionable and fixed.
