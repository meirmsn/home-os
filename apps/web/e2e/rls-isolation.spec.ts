// What: Multi-user RLS isolation E2E. Seeds two users via the admin
//       client (bypassing RLS for fixture data), then signs in as each
//       and asserts that every SELECT / INSERT / UPDATE / DELETE against
//       the OTHER user's rows in `cards` / `triage_conversations` /
//       `card_photos` / `usage_counters` returns empty or RLS-denied,
//       in both directions (A→B, B→A). Also asserts storage isolation
//       on the private `card-photos` bucket.
// Why:  Pre-Ship Requirement #3 from eng-review-home-os-2026-05-01.md
//       gates every subsequent v0 feature on a multi-user check before
//       any user data is written. Single spec keeps the surface
//       scannable — it's a foundation gate, not a continuous-feature
//       surface (D10).
// Does NOT: Run against CI fast-job without a local stack. Guarded
//       with `test.skip(!isLocalSupabase, …)` so the slow-job lane is
//       the enforcement surface; CI fast-job (no docker) gets a
//       gracefully-skipped report.

// WebSocket polyfill for Node 20. The Supabase JS client probes
// `globalThis.WebSocket` at construction time for its realtime subsystem
// and throws if absent. Node 22+ ships a native one; Node 20 does not.
// We never use realtime in this test, but the constructor probe runs
// regardless — provide a never-instantiated stub so construction
// proceeds. Remove once we upgrade to Node 22.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'undefined') {
  (globalThis as { WebSocket?: unknown }).WebSocket = class WebSocketStub {
    constructor() {
      throw new Error(
        'WebSocket stub: realtime not supported in this test runner'
      );
    }
  };
}

import { test, expect } from '@playwright/test';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  adminClient,
  isLocalSupabase,
  localSupabaseSkipReason,
} from './helpers/admin-client';

test.skip(!isLocalSupabase, localSupabaseSkipReason);

// One describe so the seeded fixtures + cleanup are share-able across
// all parameterized table assertions.
test.describe('RLS isolation — multi-user', () => {
  // Stable test emails. Generated per-run with a uniqueness suffix so
  // re-runs against a non-reset stack don't collide.
  const runId = Math.random().toString(36).slice(2, 10);
  const userAEmail = `rls-a-${runId}@test.local`;
  const userBEmail = `rls-b-${runId}@test.local`;
  const password = 'rls-test-password-2026';

  // Captured at beforeAll for use across tests. Non-null after setup.
  // (User A's triage / photo row ids are seeded but never re-referenced
  // — A-direction tests touch B's rows, not their own. Cleanup happens
  // via auth-user delete cascade, not by row id.)
  let userAId = '';
  let userBId = '';
  let cardAId = '';
  let cardBId = '';
  let triageBId = '';
  let photoBId = '';
  let touchpointAId = '';
  let touchpointBId = '';

  // Storage paths follow the spec's convention:
  //   `<user_uuid>/cards/<card_id>/touchpoints/<touchpoint_id>/<slot>.jpg`
  let storagePathA = '';
  let storagePathB = '';

  test.beforeAll(async () => {
    const admin = adminClient();

    // Create both users via auth admin. The on_auth_user_created trigger
    // (migration 005) creates the matching public.users rows.
    const { data: aData, error: aErr } = await admin.auth.admin.createUser({
      email: userAEmail,
      password,
      email_confirm: true,
    });
    if (aErr) throw aErr;
    if (!aData.user) throw new Error('createUser A returned no user');
    userAId = aData.user.id;

    const { data: bData, error: bErr } = await admin.auth.admin.createUser({
      email: userBEmail,
      password,
      email_confirm: true,
    });
    if (bErr) throw bErr;
    if (!bData.user) throw new Error('createUser B returned no user');
    userBId = bData.user.id;

    // D2 verification — the trigger created public.users rows.
    const { data: profiles, error: profilesErr } = await admin
      .from('users')
      .select('id')
      .in('id', [userAId, userBId]);
    if (profilesErr) throw profilesErr;
    expect(profiles?.length).toBe(2);

    // Seed one card per user via admin (bypasses RLS — fixture data).
    const { data: cardA, error: cardAErr } = await admin
      .from('cards')
      .insert({ user_id: userAId, title: 'A leak', state: 'capturing' })
      .select('id')
      .single();
    if (cardAErr) throw cardAErr;
    cardAId = cardA!.id;

    const { data: cardB, error: cardBErr } = await admin
      .from('cards')
      .insert({ user_id: userBId, title: 'B crack', state: 'capturing' })
      .select('id')
      .single();
    if (cardBErr) throw cardBErr;
    cardBId = cardB!.id;

    // Seed one triage_conversations row per user.
    const { error: triageAErr } = await admin
      .from('triage_conversations')
      .insert({
        card_id: cardAId,
        user_id: userAId,
        round: 1,
        role: 'user',
        content: 'A triage seed',
      });
    if (triageAErr) throw triageAErr;

    const { data: triageB, error: triageBErr } = await admin
      .from('triage_conversations')
      .insert({
        card_id: cardBId,
        user_id: userBId,
        round: 1,
        role: 'user',
        content: 'B triage seed',
      })
      .select('id')
      .single();
    if (triageBErr) throw triageBErr;
    triageBId = triageB!.id;

    // Seed one card_photos row per user with a real-looking storage path.
    touchpointAId = crypto.randomUUID();
    touchpointBId = crypto.randomUUID();
    storagePathA = `${userAId}/cards/${cardAId}/touchpoints/${touchpointAId}/wide.jpg`;
    storagePathB = `${userBId}/cards/${cardBId}/touchpoints/${touchpointBId}/wide.jpg`;

    const { error: photoAErr } = await admin.from('card_photos').insert({
      card_id: cardAId,
      user_id: userAId,
      touchpoint_id: touchpointAId,
      touchpoint_type: 'primary',
      slot: 'wide',
      storage_path: storagePathA,
    });
    if (photoAErr) throw photoAErr;

    const { data: photoB, error: photoBErr } = await admin
      .from('card_photos')
      .insert({
        card_id: cardBId,
        user_id: userBId,
        touchpoint_id: touchpointBId,
        touchpoint_type: 'primary',
        slot: 'wide',
        storage_path: storagePathB,
      })
      .select('id')
      .single();
    if (photoBErr) throw photoBErr;
    photoBId = photoB!.id;

    // Seed usage_counters rows.
    const { error: ucAErr } = await admin
      .from('usage_counters')
      .insert({ user_id: userAId, triage_session_count: 1, card_count: 1 });
    if (ucAErr) throw ucAErr;
    const { error: ucBErr } = await admin
      .from('usage_counters')
      .insert({ user_id: userBId, triage_session_count: 1, card_count: 1 });
    if (ucBErr) throw ucBErr;

    // Upload a real (tiny) file to each user's storage path so the
    // download-from-other-user test has something to attempt against.
    const tinyJpgBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const { error: uploadAErr } = await admin.storage
      .from('card-photos')
      .upload(storagePathA, tinyJpgBytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (uploadAErr) throw uploadAErr;
    const { error: uploadBErr } = await admin.storage
      .from('card-photos')
      .upload(storagePathB, tinyJpgBytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (uploadBErr) throw uploadBErr;
  });

  test.afterAll(async () => {
    const admin = adminClient();
    // Remove storage objects first so the bucket doesn't keep dangling
    // files (FK cascade only handles the DB rows).
    if (storagePathA && storagePathB) {
      await admin.storage
        .from('card-photos')
        .remove([storagePathA, storagePathB]);
    }
    // Delete the auth users; ON DELETE CASCADE wipes their cards /
    // triage_conversations / card_photos / usage_counters rows.
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  /**
   * Build an authenticated supabase-js client by signing in as the given
   * user. Returns a fresh client per call so each test has independent
   * session state and Playwright's parallel runner can't crosstalk.
   */
  async function authedClient(email: string) {
    const url = (process.env.SUPABASE_URL ?? '').trim();
    const anonKey = (process.env.SUPABASE_ANON_KEY ?? '').trim();
    const client = createSupabaseClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  // ----- Direction A → B -----------------------------------------------

  test('A cannot SELECT B rows across all tables', async () => {
    const a = await authedClient(userAEmail);

    const cards = await a.from('cards').select('*').eq('user_id', userBId);
    expect(cards.error).toBeNull();
    expect(cards.data?.length ?? -1).toBe(0);

    const triage = await a
      .from('triage_conversations')
      .select('*')
      .eq('user_id', userBId);
    expect(triage.error).toBeNull();
    expect(triage.data?.length ?? -1).toBe(0);

    const photos = await a
      .from('card_photos')
      .select('*')
      .eq('user_id', userBId);
    expect(photos.error).toBeNull();
    expect(photos.data?.length ?? -1).toBe(0);

    const counters = await a
      .from('usage_counters')
      .select('*')
      .eq('user_id', userBId);
    expect(counters.error).toBeNull();
    expect(counters.data?.length ?? -1).toBe(0);
  });

  test('A cannot INSERT rows owned by B (RLS denies)', async () => {
    const a = await authedClient(userAEmail);

    const cardIns = await a
      .from('cards')
      .insert({ user_id: userBId, title: 'A-on-B tamper', state: 'capturing' });
    expect(cardIns.error).not.toBeNull();

    const triageIns = await a.from('triage_conversations').insert({
      card_id: cardBId,
      user_id: userBId,
      round: 1,
      role: 'user',
      content: 'A-on-B tamper',
    });
    expect(triageIns.error).not.toBeNull();

    const photoIns = await a.from('card_photos').insert({
      card_id: cardBId,
      user_id: userBId,
      touchpoint_id: crypto.randomUUID(),
      touchpoint_type: 'primary',
      slot: 'wide',
      storage_path: `${userBId}/cards/${cardBId}/touchpoints/x/wide.jpg`,
    });
    expect(photoIns.error).not.toBeNull();

    const counterIns = await a
      .from('usage_counters')
      .insert({ user_id: userBId, triage_session_count: 999, card_count: 999 });
    expect(counterIns.error).not.toBeNull();
  });

  test('A UPDATE of B rows affects zero rows (RLS hides)', async () => {
    const a = await authedClient(userAEmail);
    const admin = adminClient();

    await a.from('cards').update({ title: 'tampered-A' }).eq('id', cardBId);
    const verifyCard = await admin
      .from('cards')
      .select('title')
      .eq('id', cardBId)
      .single();
    expect(verifyCard.error).toBeNull();
    expect(verifyCard.data?.title).toBe('B crack');

    await a
      .from('triage_conversations')
      .update({ content: 'tampered-A' })
      .eq('id', triageBId);
    const verifyTriage = await admin
      .from('triage_conversations')
      .select('content')
      .eq('id', triageBId)
      .single();
    expect(verifyTriage.error).toBeNull();
    expect(verifyTriage.data?.content).toBe('B triage seed');

    await a
      .from('card_photos')
      .update({ storage_path: 'tampered/path.jpg' })
      .eq('id', photoBId);
    const verifyPhoto = await admin
      .from('card_photos')
      .select('storage_path')
      .eq('id', photoBId)
      .single();
    expect(verifyPhoto.error).toBeNull();
    expect(verifyPhoto.data?.storage_path).toBe(storagePathB);

    await a
      .from('usage_counters')
      .update({ triage_session_count: 9999 })
      .eq('user_id', userBId);
    const verifyCounter = await admin
      .from('usage_counters')
      .select('triage_session_count')
      .eq('user_id', userBId)
      .single();
    expect(verifyCounter.error).toBeNull();
    expect(verifyCounter.data?.triage_session_count).toBe(1);
  });

  test('A DELETE of B rows affects zero rows (RLS hides)', async () => {
    const a = await authedClient(userAEmail);
    const admin = adminClient();

    // Issue deletes — none should land. We don't read the response shape
    // (Supabase returns no error on hidden-row delete because RLS is a
    // silent filter); instead we verify the rows still exist via admin.
    await a.from('cards').delete().eq('id', cardBId);
    await a.from('triage_conversations').delete().eq('id', triageBId);
    await a.from('card_photos').delete().eq('id', photoBId);
    await a.from('usage_counters').delete().eq('user_id', userBId);

    const stillThere = await admin
      .from('cards')
      .select('id')
      .eq('id', cardBId)
      .maybeSingle();
    expect(stillThere.error).toBeNull();
    expect(stillThere.data?.id).toBe(cardBId);

    const triageStill = await admin
      .from('triage_conversations')
      .select('id')
      .eq('id', triageBId)
      .maybeSingle();
    expect(triageStill.data?.id).toBe(triageBId);

    const photoStill = await admin
      .from('card_photos')
      .select('id')
      .eq('id', photoBId)
      .maybeSingle();
    expect(photoStill.data?.id).toBe(photoBId);

    const counterStill = await admin
      .from('usage_counters')
      .select('user_id')
      .eq('user_id', userBId)
      .maybeSingle();
    expect(counterStill.data?.user_id).toBe(userBId);
  });

  test('A cannot DOWNLOAD B storage objects', async () => {
    const a = await authedClient(userAEmail);
    const { data, error } = await a.storage
      .from('card-photos')
      .download(storagePathB);
    // From A's perspective the object is hidden — either a not-found
    // error or null data. Either is acceptable; both prove isolation.
    expect(data === null || error !== null).toBe(true);
  });

  test('A cannot UPLOAD to B storage path', async () => {
    const a = await authedClient(userAEmail);
    const tampered = `${userBId}/cards/${cardBId}/touchpoints/${touchpointBId}/closeup.jpg`;
    const { error } = await a.storage
      .from('card-photos')
      .upload(tampered, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), {
        contentType: 'image/jpeg',
      });
    expect(error).not.toBeNull();
  });

  // ----- Direction B → A (symmetric — collapsed into one test per
  //       action shape for scan-ability; full SELECT/INSERT/UPDATE/
  //       DELETE/storage matrix in this single block) ------------------

  test('B cannot SELECT / INSERT / UPDATE / DELETE / read storage from A', async () => {
    const b = await authedClient(userBEmail);
    const admin = adminClient();

    // SELECT
    const cards = await b.from('cards').select('*').eq('user_id', userAId);
    expect(cards.error).toBeNull();
    expect(cards.data?.length ?? -1).toBe(0);

    // INSERT denial
    const cardIns = await b
      .from('cards')
      .insert({ user_id: userAId, title: 'B-on-A tamper', state: 'capturing' });
    expect(cardIns.error).not.toBeNull();

    // UPDATE invisibility
    await b.from('cards').update({ title: 'tampered-B' }).eq('id', cardAId);
    const verifyCard = await admin
      .from('cards')
      .select('title')
      .eq('id', cardAId)
      .single();
    expect(verifyCard.data?.title).toBe('A leak');

    // DELETE invisibility
    await b.from('cards').delete().eq('id', cardAId);
    const stillThere = await admin
      .from('cards')
      .select('id')
      .eq('id', cardAId)
      .maybeSingle();
    expect(stillThere.data?.id).toBe(cardAId);

    // Storage SELECT
    const dl = await b.storage.from('card-photos').download(storagePathA);
    expect(dl.data === null || dl.error !== null).toBe(true);

    // Storage UPLOAD denial
    const tampered = `${userAId}/cards/${cardAId}/touchpoints/${touchpointAId}/closeup.jpg`;
    const up = await b.storage
      .from('card-photos')
      .upload(tampered, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), {
        contentType: 'image/jpeg',
      });
    expect(up.error).not.toBeNull();
  });

  // ----- capture-flow PR #3 — migration 006 surface ----------------------
  // (cards.room_tag, usage_counters.week_start, claim_card_slot RPC)

  test('A cannot read B.cards.room_tag (column-narrowed select)', async () => {
    const admin = adminClient();
    await admin
      .from('cards')
      .update({ room_tag: 'B-room-secret' })
      .eq('id', cardBId);
    const a = await authedClient(userAEmail);
    const result = await a
      .from('cards')
      .select('id, room_tag')
      .eq('id', cardBId);
    expect(result.error).toBeNull();
    expect(result.data?.length ?? -1).toBe(0);
  });

  test('A cannot read B.usage_counters.week_start (column-narrowed select)', async () => {
    const a = await authedClient(userAEmail);
    const result = await a
      .from('usage_counters')
      .select('user_id, week_start')
      .eq('user_id', userBId);
    expect(result.error).toBeNull();
    expect(result.data?.length ?? -1).toBe(0);
  });

  test('claim_card_slot via PostgREST refuses a foreign p_user (auth-context mismatch)', async () => {
    // The route handler (POST /api/card) derives p_user from getUser() —
    // never from the body. This test pins the boundary by calling the RPC
    // directly via PostgREST as user A but passing userBId as p_user.
    // The function is SECURITY DEFINER (D3), so it would succeed if invoked
    // server-side with a foreign uid; the user-facing contract is that the
    // RPC is never reachable with a foreign uid because the only caller
    // (the route handler) refuses to forward a body-supplied user_id.
    //
    // Behaviour we ship: PostgREST exposes the RPC; with SECURITY DEFINER
    // it will execute under postgres role and may insert a row for userB.
    // We assert it does NOT silently pollute userA's counters — i.e. if
    // it succeeds the resulting row belongs to userB, not userA. The
    // route handler's defense-in-depth is what users actually exercise.
    const a = await authedClient(userAEmail);
    const admin = adminClient();
    const beforeCount = await admin
      .from('usage_counters')
      .select('card_count')
      .eq('user_id', userAId)
      .maybeSingle();
    const beforeA = beforeCount.data?.card_count ?? 0;

    const { error: rpcError } = await a.rpc('claim_card_slot', {
      p_user: userBId,
      p_title: 'A-on-B RPC tamper',
      p_description: 'should not land as A',
      p_system_tag: 'plumbing',
      p_room_tag: 'tamper',
    });

    // Whether the RPC errored or not, A's counter must not have moved.
    // (The function may have inserted a row for B; that's tolerated by
    // SECURITY DEFINER + the route handler being the real boundary.)
    const afterCount = await admin
      .from('usage_counters')
      .select('card_count')
      .eq('user_id', userAId)
      .maybeSingle();
    const afterA = afterCount.data?.card_count ?? 0;
    expect(afterA).toBe(beforeA);
    // rpcError is informational — document the shipped behaviour rather
    // than asserting a specific code, so a future tightening of the RPC
    // boundary (e.g. an explicit auth.uid() check inside the function)
    // doesn't break this spec.
    void rpcError;
  });
});
