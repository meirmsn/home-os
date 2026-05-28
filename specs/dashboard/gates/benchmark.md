## Gate 10: /benchmark

**Mode:** Code-level performance analysis (no live Lighthouse run -- server-rendered page with `force-dynamic`)

### Supabase query count

The home page (`page.tsx`) makes the following Supabase round-trips during SSR:

| #    | Query                                                                                                          | Target      | Notes                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------ |
| 1    | `supabase.auth.getUser()`                                                                                      | GoTrue      | Auth check. Cached by `@supabase/ssr` within the request.                |
| 2    | `supabase.from('cards').select('id', { count: 'exact', head: true })`                                          | PostgREST   | Total card count for first-time empty detection. HEAD-only, no row data. |
| 3    | `supabase.from('cards').select(15 columns).not('state', 'in', '(closed,dismissed)')`                           | PostgREST   | Fetch all active cards. Returns full rows.                               |
| 4    | `supabase.from('card_photos').select('card_id, storage_path').in('card_id', [...]).eq(...).eq(...).order(...)` | PostgREST   | Batch photo lookup for all card IDs. Single query.                       |
| 5..N | `supabase.storage.from('card-photos').createSignedUrl(path, 600)`                                              | Storage API | **One per card with a photo.** Sequential `await` in a `for` loop.       |

**Fixed queries:** 4 (auth + count + cards + photos)

**Variable queries:** 1 per card with a photo (signed URL generation)

**Total for N cards with photos:** 4 + N

### N+1 analysis

**Signed URL generation is an N+1 pattern.** The photo query itself is properly batched (single `.in('card_id', cardIds)` query), but the subsequent signed URL generation runs one `await createSignedUrl(...)` per photo row inside a sequential `for` loop:

```typescript
for (const row of photoRows ?? []) {
  if (seen.has(row.card_id)) continue;
  seen.add(row.card_id);
  if (row.storage_path) {
    const { data: signed } = await supabase.storage
      .from('card-photos')
      .createSignedUrl(row.storage_path, 60 * 10);
    // ...
  }
}
```

**Impact by card count:**

| Cards with photos | Extra round-trips | Estimated latency added (50ms/RT) |
| ----------------- | ----------------- | --------------------------------- |
| 5                 | 5                 | ~250ms                            |
| 10                | 10                | ~500ms                            |
| 25                | 25                | ~1250ms                           |
| 50                | 50                | ~2500ms                           |

**Mitigation options (not implemented, noted for future):**

1. `Promise.all()` to parallelize signed URL generation (simple fix, bounded by Supabase rate limits)
2. Use public bucket with RLS instead of signed URLs (eliminates the query entirely)
3. Pre-generate signed URLs with longer TTL and cache them on the card row

### Redundant query

**The count query (query #2) is partially redundant.** It exists solely to distinguish "first-time user (0 cards ever)" from "user with all cards closed/dismissed." However, the cards query (#3) already filters out closed/dismissed cards, so `cards.length === 0` could indicate either state. The count query resolves this ambiguity but adds a round-trip. This is an acceptable trade-off for correctness -- the alternative would be a single query without the state filter, but that would fetch closed/dismissed card data unnecessarily.

### Layout query

**The layout (`layout.tsx`) adds 2 more Supabase queries** that run before the page:

| #   | Query                                                                                                        | Target                                           |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| L1  | `supabase.auth.getUser()`                                                                                    | GoTrue (cached -- same request as page query #1) |
| L2  | `supabase.from('cards').select('id', { count: 'exact', head: true }).in('state', ['capturing', 'triaging'])` | PostgREST                                        |

L1 is cached by `@supabase/ssr`. L2 (`TriagePendingBadge`) is an additional HEAD-only query for the header badge. **Net new query cost from layout: 1.**

**Total queries per page load:** 5 + N (where N = cards with photos)

### Bundle size impact

New client components added to the dashboard:

| Component                    | Approx size    | Notes                                                                                                                                                      |
| ---------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DashboardShell.tsx`         | ~3.5 KB source | Client component (state for tabs + walkthrough). Imports FilterBar, EmptyState, WalkthroughPrompt, WalkthroughMode, DashboardCard, DashboardViewedCapture. |
| `FilterBar.tsx`              | ~1.2 KB source | Client component (posthog import).                                                                                                                         |
| `WalkthroughMode.tsx`        | ~3.8 KB source | Client component (state + effects). Imports `CheckInForm` cross-route.                                                                                     |
| `DashboardViewedCapture.tsx` | ~0.8 KB source | Client component (posthog capture on mount).                                                                                                               |
| `DashboardCard.tsx`          | ~5.5 KB source | Server component (no 'use client'). NOT in client bundle.                                                                                                  |
| `EmptyState.tsx`             | ~1.5 KB source | Server component. NOT in client bundle.                                                                                                                    |
| `WalkthroughPrompt.tsx`      | ~0.4 KB source | Server component. NOT in client bundle.                                                                                                                    |
| `tier-cards.ts`              | ~3.0 KB source | Server-only utility. NOT in client bundle.                                                                                                                 |

**Estimated client bundle addition:** ~9.3 KB source (~3-4 KB gzipped). The `posthog-js` dependency is already in the bundle from other pages.

**Cross-route import concern:** `WalkthroughMode` imports `CheckInForm` from `cards/[id]/_components/`. This pulls the check-in form (and its dependencies) into the dashboard's client bundle. If `CheckInForm` has heavy dependencies (file upload, image processing), this could be a meaningful bundle size increase. Recommend verifying the actual bundle impact with `next build --analyze`.

### Server rendering characteristics

- `export const dynamic = 'force-dynamic'` -- page is never cached by Next.js. Every request triggers full SSR with all Supabase queries.
- No ISR, no `revalidate`, no `generateStaticParams`. This is correct for a personalized authenticated page.
- The waterfall is: auth check -> count query -> cards query -> photos query -> signed URLs (sequential). The first four queries run sequentially because each depends on the previous result. Only the signed URL loop could be parallelized.

### Summary

**Findings: 2** (1 N+1 pattern, 1 bundle size concern)

The primary performance concern is the sequential signed URL generation, which adds ~50ms per card during SSR. At 10+ cards this becomes noticeable. At 25+ cards it risks exceeding acceptable page load times. The fix (Promise.all) is straightforward. The cross-route CheckInForm import should be verified for bundle impact.

## Dismissals

None
