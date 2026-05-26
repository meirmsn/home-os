## Gate 7: /cso

**Branch**: `feature/close-flow` diff vs `main`
**Date**: 2026-05-26
**Verdict**: pass

### Audit dimensions

#### 1. Auth boundaries

- **`POST /api/card/[id]/close` (route.ts L24-36)**: Auth gate via `supabase.auth.getUser()` at the top of the handler. Returns 401 if no user. User ID is derived server-side from the session cookie -- never from the request body. **Pass.**
- **`close_card` RPC (migration 013 L56)**: Enforces `p_user IS DISTINCT FROM auth.uid()` and raises `42501 (forbidden)` on mismatch. The UPDATE predicate also scopes on `user_id = p_user`. Double-gated. **Pass.**
- **`cards/[id]/page.tsx` (L167-179)**: Explicit `getUser()` + redirect to `/login` before any data queries. Not relying solely on the layout auth check (avoids the layout-vs-page race). **Pass.**

#### 2. RLS

- All five public tables have per-action RLS policies (migration 003) scoped on `auth.uid() = user_id`.
- `card_photos` INSERT in the close route (L128-135) goes through the Supabase client, which carries the user's auth context. RLS enforces `user_id` match on INSERT. **Pass.**
- `cards` SELECT/UPDATE in the route (via `close_card` RPC) -- the RPC is `SECURITY DEFINER` so it bypasses RLS, but it has its own explicit `user_id = p_user` predicate in the WHERE clause plus the `auth.uid()` gate at entry. **Pass.**
- The 404-vs-409 re-read (route.ts L164-169) uses `.from('cards').select('id').eq('id', id).maybeSingle()` via the user-context client -- RLS scopes it to the authenticated user's rows. An attacker cannot distinguish "card exists but belongs to someone else" from "card does not exist." **Pass.**

#### 3. SQL injection

- No raw SQL anywhere in the diff. All DB operations go through the Supabase JS client (`supabase.rpc()`, `supabase.from().insert()`, `supabase.from().select().eq()`), which parameterizes queries. **Pass.**
- The `close_card` RPC uses named parameters, not string interpolation. **Pass.**

#### 4. Storage security

- Upload path: `${user.id}/cards/${id}/touchpoints/${touchpointId}/wide.jpg` (route.ts L115). The `user.id` is derived from `getUser()` (server-side), and `id` is UUID-validated (L39-45). `touchpointId` is generated server-side via `crypto.randomUUID()` (L114) -- not client-supplied. **Pass.**
- Storage bucket RLS (migration 004): `(storage.foldername(name))[1] = auth.uid()::text` -- the first path segment must be the authenticated user's UUID. A user cannot write to another user's Storage prefix. **Pass.**
- Bucket is private (`public: false`). Photos served via signed URLs only (10-minute TTL). **Pass.**

#### 5. Input validation

- **`spend_amount_cents`**: Parsed via `parseInt(String(rawSpend), 10)` (route.ts L66). `isNaN` check rejects non-numeric strings (L67-75). Null/empty is allowed. The `int` Postgres column type bounds the range to [-2147483648, 2147483647]; JS `parseInt` can exceed this range for extreme inputs, but Postgres will reject the overflow at write time with a type-range error (surfaces as 500, not data corruption). **Pass** -- no data corruption vector; the 500 is acceptable for adversarial billion-dollar inputs.
- **`spend_notes`**: Trimmed, length-checked to 500 chars (route.ts L83-90). Empty string maps to null. **Pass.**
- **`photo`**: Validated as `instanceof File`, `size > 0`, and `type.startsWith('image/')` (route.ts L97-109). The `accept="image/*"` on the client-side input provides defense-in-depth but is not the trust boundary -- the server-side check is. **Pass.**
- **`[id]` path param**: UUID regex validation (route.ts L39-45) before any DB operation. **Pass.**

#### 6. SECURITY DEFINER

- `close_card` function: `security definer` + `set search_path = public, pg_catalog` (migration 013 L48-49). Search path is pinned, consistent with all other SECURITY DEFINER RPCs in the codebase (006b, 007, 009, 010, 011). Prevents schema-injection. **Pass.**
- The RPC does NOT escalate privileges beyond what the function body does -- it writes to `public.cards` only, scoped to the authenticated user's row via `user_id = p_user` + the `auth.uid()` entry gate. No lateral reads/writes to other users' data. **Pass.**

#### 7. XSS

- No `dangerouslySetInnerHTML`, `innerHTML`, or `v-html` in any of the new components.
- `ClosedView.tsx`: `props.spendNotes` and `props.diagnosis` are rendered as React text children (JSX `{props.spendNotes}`), which React auto-escapes. **Pass.**
- `CloseCardForm.tsx`: Dollar input is `type="number"`; notes textarea value is controlled state. Error messages rendered as text children. **Pass.**
- `BeforeAfterPhotos.tsx`: Photo URLs come from Supabase signed URLs (server-generated), not user input. Date captions are formatted from ISO strings. **Pass.**

#### 8. OWASP Top 10

- **A01 Broken Access Control**: Covered by dimensions 1-2 above. **Pass.**
- **A02 Cryptographic Failures**: No secrets in the diff. Photo signed URLs expire after 10 minutes. **Pass.**
- **A03 Injection**: Covered by dimension 3 above. **Pass.**
- **A04 Insecure Design**: State machine guard (`state='planned'` only) is enforced in the RPC, not just the client. Terminal state is one-way -- no re-open vector. **Pass.**
- **A05 Security Misconfiguration**: `export const dynamic = 'force-dynamic'` prevents caching of auth-gated responses. Storage bucket is private. **Pass.**
- **A06 Vulnerable Components**: No new dependencies added. **Pass.**
- **A07 Authentication Failures**: Auth via `getUser()` (server-side session validation, not just JWT decode). **Pass.**
- **A08 Data Integrity**: The `close_card` RPC is atomic (single UPDATE with predicate guard). Photo-first ordering means a failed RPC after photo upload leaves an orphaned photo (harmless), not a closed card without a photo the user expected. **Pass.**
- **A09 Logging**: Sentry captures on upload failure (L123), card_photos insert failure (L137), RPC errors (L176), and edge cases (L186). 4xx errors are not captured (correct -- they're user errors). **Pass.**
- **A10 SSRF**: No server-side URL fetching from user input. Photo is uploaded as a File blob, not fetched by URL. **Pass.**

### Additional observations (informational, not blocking)

1. **`parseInt` vs integer overflow**: If a client sends `spend_amount_cents=99999999999999`, `parseInt` returns a number outside the Postgres `int` range (-2^31 to 2^31-1). Postgres rejects this with a type error, surfaced as a 500 to the user. This is not a data-corruption or security issue -- it's an edge-case UX issue for adversarial inputs. The client-side conversion `Math.round(parseFloat(dollars) * 100)` naturally caps at reasonable values for real spend amounts. A tighter server-side range check (e.g. `spendCents < 0 || spendCents > 100_000_000 → 400`) would improve the error UX but is not a security finding.

2. **MIME type check is prefix-based**: `photo.type.startsWith('image/')` accepts any `image/*` subtype, including potentially unusual types like `image/svg+xml`. SVGs stored in Supabase private Storage and served via signed URLs (not inlined as `<img>` src from user-controlled paths) have minimal XSS risk -- the browser renders them in an image context. If SVG upload becomes a concern in future features (e.g., inline rendering), a tighter allowlist (`image/jpeg`, `image/png`, `image/webp`, `image/heic`) would be warranted. Not a finding for this PR's threat model.

3. **Pre-existing: RLS policies use bare `auth.uid()` instead of subquery**: CLAUDE.md mandates `(select auth.uid())` in RLS policies for performance (initplan optimization). Migration 003's policies use bare `auth.uid()`. This is pre-existing across all tables and not introduced by this PR. The `close_card` RPC's `auth.uid()` call (L56) is in procedural PL/pgSQL context, not an RLS policy, so the subquery pattern does not apply there.

## Dismissals

1. **No `REVOKE EXECUTE ON FUNCTION close_card FROM public/anon`**: The function is callable by `authenticated` (needed) and in theory by `anon` via the default `GRANT EXECUTE ON FUNCTIONS TO public` that some Supabase setups have. However, the function's first line (`p_user IS DISTINCT FROM auth.uid()`) rejects any call where `auth.uid()` is null (anon sessions), so even if an anon caller reaches the RPC, it immediately raises `42501 forbidden`. **Dismissed** -- defense-in-depth via the entry guard; no privilege escalation possible.

2. **No negative-spend CHECK constraint**: The spec (D1) explicitly decided against a CHECK constraint on `actual_spend_cents`. Null/zero/any integer is valid. A negative spend is nonsensical but harmless to the system. **Dismissed** -- spec-intentional; not a security concern.

3. **Orphaned card_photos row on RPC failure after successful INSERT**: If the photo INSERT succeeds but `close_card` RPC fails, an orphaned `card_photos` row with `touchpoint_type='close'` remains. This is documented in spec Gotcha #2 and is by design (photo-first ordering). The orphaned row is scoped to the user's own data via RLS and has no security implications. **Dismissed** -- spec-intentional.

4. **`search_path` uses `pg_catalog` not `pg_temp`**: CLAUDE.md's example shows `public, pg_temp` but all 12+ SECURITY DEFINER functions in the codebase use `public, pg_catalog`. The `pg_catalog` inclusion is standard and safe (system catalog functions). The `pg_temp` absence is fine -- `pg_temp` in the search_path would be a security risk (temp-table hijacking), not a benefit. The codebase convention is correct; CLAUDE.md's example text is slightly imprecise. **Dismissed** -- not a risk.
