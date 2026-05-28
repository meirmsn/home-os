## Gate 6: /review

Reviewed diff: `origin/main...HEAD` (14 commits, ~5800 lines across 40+ files).

### Finding 1: `MonitorViewOpenedCapture` fires on sessionStorage exception instead of deduping

**File:** `apps/web/app/(app)/cards/[id]/_components/MonitorViewOpenedCapture.tsx` lines 29-44

**Severity:** Low (inflated analytics, not a correctness bug)

When `sessionStorage.getItem()` or `.setItem()` throws (Safari Private Browsing, storage disabled), the `catch` block falls through and the `posthog.capture` call executes unconditionally. On every re-render / re-mount within the same page session, the event fires again because there is no in-memory fallback (unlike `DashboardViewedCapture` which uses a `useRef` guard). The `DecideViewOpenedCapture` pattern this mirrors likely has the same issue, but that does not excuse introducing it again.

**Impact:** Over-counted `monitor_view_opened` events for Safari Private Browsing users. Not a correctness bug, but skews analytics funnels.

### Finding 2: `TriagePendingBadge` error path is silently swallowed -- no Sentry, no fallback

**File:** `apps/web/app/(app)/_components/TriagePendingBadge.tsx` lines 6-14

**Severity:** Low (silent failure is acceptable per spec G7, but no Sentry capture)

The query `supabase.from('cards').select(...)` destructures only `{ count }` and ignores the `error` field. If the query fails (PostgREST error, network issue), `count` is `null`, which falls through to `n = count ?? 0` and renders nothing. This is a graceful degradation (badge disappears), but unlike the home page's `cards SELECT` and `card_photos SELECT` which both capture to Sentry on error, this one does not. The spec's Sentry event table does not list a TriagePendingBadge error, so this may be intentional omission, but it creates a blind spot -- if the query silently fails on every request, there is no observability.

**Impact:** No user-facing breakage; a persistent query failure would go undetected.

### Finding 3: `totalCount` query in home page counts ALL cards including closed/dismissed

**File:** `apps/web/app/(app)/home/page.tsx` lines 24-29

**Severity:** Info (correct behavior, but worth calling out)

The first-time empty detection query `select('id', { count: 'exact', head: true })` with no state filter counts ALL cards including closed and dismissed. This means a user who had cards but closed/dismissed all of them would NOT see the first-time empty state -- they would see the dashboard shell with zero active cards. This is consistent with the spec ("If count is 0 -> first-time empty. If count > 0 but no cards qualify for the active tab -> tab-specific empty") and the `nothing-active` empty state handles this case. Noting for clarity only.

### Finding 4: `cardError` in home page logs to Sentry but still renders empty dashboard

**File:** `apps/web/app/(app)/home/page.tsx` lines 40-49

**Severity:** Info (graceful degradation, not a 500)

When `cardError` is truthy, the error is captured to Sentry, but execution continues with `cards = (cardRows ?? []) as DashboardCardRow[]` which defaults to an empty array. The user sees an empty dashboard. This is the correct behavior per the "no 500" guideline, but it means a PostgREST configuration error would present as a silently empty dashboard. The Sentry capture provides observability.

### Finding 5: `walkthrough_completed` event fires in useEffect with stale closure risk

**File:** `apps/web/app/(app)/home/_components/WalkthroughMode.tsx` lines 33-39

**Severity:** Info (technically correct but brittle)

The `useEffect` that fires `walkthrough_completed` depends on `[completed, total, checkedCount, skippedCount]`. When `completed` transitions to `true`, the effect fires with the current `checkedCount` and `skippedCount` values. Since React batches state updates from the `handleKeepMonitoring` callback (`setShowPostCheckin(false)` + `setCurrentIndex(i + 1)`) and the `handleCheckinDone` that preceded it (`setCheckedCount(c + 1)` + `setShowPostCheckin(true)`), the values should be correct by the time the effect runs. This is technically fine, but the deps list including `checkedCount` and `skippedCount` means the effect also re-evaluates on every intermediate state change. Since it gates on `completed && total > 0`, it only fires once. No bug, just noting the pattern.

### Finding 6: `DashboardCard` renders user-controlled `card.diagnosis` directly in DOM

**File:** `apps/web/app/(app)/home/_components/DashboardCard.tsx` line 113

**Severity:** Info (not an XSS risk in React)

The `card.diagnosis` field (which originates from the LLM, not direct user input) is rendered in a `<p>` element via JSX interpolation. React auto-escapes JSX expressions, so there is no XSS vector here. The LLM output is validated at the trust boundary (`parse-qa-output.ts`). No issue.

### Finding 7: `DashboardCard` PLANNED chip defaults to "diy" for any non-contractor path

**File:** `apps/web/app/(app)/home/_components/DashboardCard.tsx` line 256

**Severity:** Info (cosmetic, not a logic bug)

The planned-tab card chip renders `planned - {card.chosen_path === 'contractor' ? 'contractor' : 'diy'}`. Cards with `chosen_path = 'monitor'` or `null` would show "planned - diy". Since planned cards should always have a `chosen_path` of `'diy'` or `'contractor'` (the commit-decide flow sets this), this is unlikely to trigger, but if it does the label would be misleading. The spec says "PLANNED - DIY" or "PLANNED - Contractor" without covering the monitor/null edge case.

## Dismissals

1. **SQL injection via `.not('state', 'in', '(closed,dismissed)')` in home page**: The parenthesized list is a hard-coded string literal, not user input. PostgREST handles the filter; no injection vector.

2. **RLS bypass in `TriagePendingBadge`**: The server component creates a Supabase client with the request cookies. RLS policies on `cards` enforce `user_id = auth.uid()`, so the count is scoped to the authenticated user. No bypass.

3. **RLS bypass in cadence route**: The `.update()` chain uses `.eq('id', id).eq('state', 'monitoring')` with the RLS-enforced Supabase client. The `id` parameter is UUID-validated. The state guard prevents cadence changes on non-monitoring cards. No bypass.

4. **RLS bypass in checkin route**: The `record_checkin` RPC is `SECURITY DEFINER` with `search_path` pinned per migration conventions. The RPC validates `p_user` matches the card's `user_id` internally. No bypass.

5. **Race condition in walkthrough mode**: The walkthrough operates on a snapshot of overdue cards passed as props from the server render. If a card's state changes during the walkthrough (e.g., another browser tab closes it), the `CheckInForm` submit would fail with a 409, which the form handles gracefully (shows "Card state changed -- refreshing..."). No data corruption risk.

6. **Missing null check on `cards` query in home page**: `cardRows` is null-coalesced to `[]` at line 51. The `tierCards` function handles empty arrays. No 500 risk.

7. **`photoMap` signed URL expiration during long sessions**: Signed URLs have a 10-minute TTL. If a user sits on the dashboard for >10 minutes without navigating, image links expire. This is acceptable for v0 (`force-dynamic` means a page refresh fetches new URLs) and consistent with the card detail page's behavior.

8. **`user_id` leaked in Sentry extra for home page**: The `user_id` in Sentry extra data is the Supabase auth UUID, not PII. This is consistent with other routes' Sentry capture patterns.

9. **Cross-route-group import of `CheckInForm`**: `WalkthroughMode.tsx` imports from `cards/[id]/_components/CheckInForm`. This is a valid Node.js module import -- Next.js route groups are routing boundaries, not module boundaries. The import comment documents the dependency. TypeScript will catch prop mismatches at build time.

10. **`AllTab` shows `first-time` empty state when the `all` array is empty**: This could only happen when `totalCount > 0` but all active cards are filtered out (i.e., all are closed/dismissed). Since the page query already excludes closed/dismissed, `all.length === 0` means no cards at all in the active set, making the "first-time" label misleading. However, the user would have already seen the dashboard shell (because `totalCount > 0` prevented the early first-time return), so they see a "Nothing logged yet" message inside the shell. Cosmetic label mismatch, not a correctness issue. The `AttentionTab` handles its own empty state correctly with `nothing-active`.
