## Gate 2b: rls-coverage

**Result: PASS**

### Analysis

The close route (`apps/web/app/api/card/[id]/close/route.ts`) performs four client-facing DB operations through the Supabase JS client (which runs under the user's auth context with RLS enforced):

1. **`supabase.storage.from('card-photos').upload(...)`** (line 116-121)
   - Covered by `card_photos_insert_own` on `storage.objects` (migration 004, line 24-29). Policy checks `bucket_id = 'card-photos'` AND `storage.foldername(name)[1] = auth.uid()::text`. The upload path is `${user.id}/cards/${id}/touchpoints/...`, so the first segment matches.

2. **`supabase.from('card_photos').insert(...)`** (line 128-135)
   - Covered by `card_photos_insert_own` on `public.card_photos` (migration 003, line 54-55). Policy: `auth.uid() = user_id`. The insert passes `user_id: user.id` (the authenticated user).

3. **`supabase.rpc('close_card', ...)`** (line 149-154)
   - `close_card` is `SECURITY DEFINER` with `set search_path = public, pg_catalog` (migration 013, line 48-49). RPC enforces auth internally: `if p_user is distinct from auth.uid() then raise exception 'forbidden'` (line 56-57). The UPDATE predicate also filters `cards.user_id = p_user` (line 67). This is the correct pattern for SECURITY DEFINER RPCs.

4. **`supabase.from('cards').select('id').eq('id', id).maybeSingle()`** (line 165-168)
   - Read-only re-read for 404 vs 409 disambiguation. Covered by `cards_select_own` on `public.cards` (migration 003, line 28-29). Policy: `auth.uid() = user_id`.

### auth.uid() usage in close_card RPC

The RPC checks `p_user is distinct from auth.uid()` (line 56) before any mutation. This is the caller-identity-matches-param guard. The UPDATE WHERE clause additionally filters `cards.user_id = p_user` (line 67), double-gating on ownership. `auth.uid()` is called once (the `is distinct from` check); the UPDATE predicate uses the already-validated `p_user` parameter, which is functionally equivalent since the guard ensures `p_user = auth.uid()`.

### Dismissals

None.
