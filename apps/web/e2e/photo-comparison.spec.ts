// What: End-to-end Playwright spec for the photo-comparison feature (PR #6).
//       Seeds cards with photographed touchpoints (admin client) and exercises
//       the spec § Tests § E2E flows:
//         1. Entry link present on a 2+ touchpoint card → opens the compare
//            route → both panels / dates / issue name / wordmark / controls.
//         2. Entry link ABSENT on a 1-touchpoint card; direct navigation to
//            /compare redirects back to cards/[id].
//         3. Slot-missing path — select a slot one date lacks → placeholder +
//            bounce control disabled.
// Why:  Unit tests cover the grouping helper + component with mocks; this spec
//       proves the wire end-to-end: the RLS-scoped card_photos query, the
//       plural createSignedUrls signing, the >= 2 gate (link + route redirect),
//       and the client surface rendering signed photos.
// Does NOT: Re-assert RLS isolation — `e2e/rls-isolation.spec.ts` already pins
//           multi-user card_photos access. The compare route inherits it (it
//           queries card_photos under the user-context client).

// WebSocket polyfill — see rls-isolation.spec.ts header.
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
import {
  adminClient,
  isLocalSupabase,
  localSupabaseSkipReason,
} from './helpers/admin-client';

test.skip(!isLocalSupabase, localSupabaseSkipReason);

const TINY_JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

test.describe('photo-comparison', () => {
  let email = '';
  let password = '';
  let userId = '';

  test.beforeEach(async ({ page }) => {
    const runId = Math.random().toString(36).slice(2, 10);
    email = `compare-${runId}@test.local`;
    password = 'compare-test-password-2026';

    const admin = adminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    if (!data.user) throw new Error('createUser returned no user');
    userId = data.user.id;

    const { createClient } = await import('@supabase/supabase-js');
    const url = (process.env.SUPABASE_URL ?? '').trim();
    const anonKey = (process.env.SUPABASE_ANON_KEY ?? '').trim();
    const signinClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: session, error: signinError } =
      await signinClient.auth.signInWithPassword({ email, password });
    if (signinError) throw signinError;
    if (!session.session)
      throw new Error('signInWithPassword returned no session');

    const projectRef = new URL(url).hostname.split('.')[0] ?? 'local';
    const cookieValue = JSON.stringify({
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
      expires_at: session.session.expires_at,
      expires_in: session.session.expires_in,
      token_type: 'bearer',
      user: session.session.user,
    });
    await page.context().addCookies([
      {
        name: `sb-${projectRef}-auth-token`,
        value: encodeURIComponent(cookieValue),
        url: 'http://127.0.0.1:3000',
        httpOnly: false,
        sameSite: 'Lax',
        expires: -1,
      },
    ]);
  });

  test.afterEach(async () => {
    const admin = adminClient();
    if (userId) await admin.auth.admin.deleteUser(userId);
    userId = '';
  });

  /** Seed a closed card with the given photo touchpoints. Each touchpoint is
   *  { type, createdAt, slots: Slot[] } — one card_photos row + one storage
   *  object per slot. Returns the card id. */
  async function seedCard(
    touchpoints: Array<{
      type: 'primary' | 'checkin' | 'close';
      createdAt: string;
      slots: Array<'wide' | 'medium' | 'closeup'>;
    }>
  ): Promise<string> {
    const admin = adminClient();
    const { data: card, error } = await admin
      .from('cards')
      .insert({
        user_id: userId,
        state: 'closed',
        initial_description: 'Water stain on the ceiling.',
        system_tag: 'roofing',
        room_tag: 'Living room',
        severity: 'soon',
        severity_confirmed: true,
        diagnosis: 'Slow roof leak — patched.',
        chosen_path: 'diy',
        closed_at: new Date().toISOString(),
        title: 'Ceiling water stain',
      })
      .select('id')
      .single();
    if (error) throw error;
    const cardId = card!.id as string;

    for (const tp of touchpoints) {
      const touchpointId = crypto.randomUUID();
      for (const slot of tp.slots) {
        const storagePath = `${userId}/cards/${cardId}/touchpoints/${touchpointId}/${slot}.jpg`;
        const up = await admin.storage
          .from('card-photos')
          .upload(storagePath, TINY_JPG, {
            contentType: 'image/jpeg',
            upsert: true,
          });
        if (up.error) throw up.error;
        const ins = await admin.from('card_photos').insert({
          card_id: cardId,
          user_id: userId,
          touchpoint_id: touchpointId,
          touchpoint_type: tp.type,
          slot,
          storage_path: storagePath,
          created_at: tp.createdAt,
        });
        if (ins.error) throw ins.error;
      }
    }
    return cardId;
  }

  test('opens the compare surface from a 2+ touchpoint card', async ({
    page,
  }) => {
    const cardId = await seedCard([
      {
        type: 'primary',
        createdAt: '2026-05-01T08:00:00Z',
        slots: ['wide', 'medium'],
      },
      { type: 'close', createdAt: '2026-05-20T08:00:00Z', slots: ['wide'] },
    ]);

    await page.goto(`/cards/${cardId}`);
    const link = page.getByTestId('compare-photos-link');
    await expect(link).toBeVisible();
    await link.click();

    await expect(page).toHaveURL(new RegExp(`/cards/${cardId}/compare$`));
    await expect(page.getByTestId('photo-comparison')).toBeVisible();
    await expect(page.getByTestId('compare-issue-name')).toContainText(
      'Ceiling water stain'
    );
    await expect(page.getByTestId('compare-panel-a')).toBeVisible();
    await expect(page.getByTestId('compare-panel-b')).toBeVisible();
    await expect(page.getByTestId('compare-date-a')).toBeVisible();
    await expect(page.getByTestId('compare-date-b')).toBeVisible();
    await expect(page.getByTestId('compare-wordmark')).toContainText('Home OS');
    await expect(page.getByTestId('compare-bounce-toggle')).toBeVisible();
    await expect(page.getByTestId('compare-slot-selector')).toBeVisible();
  });

  test('hides the link + redirects /compare on a 1-touchpoint card', async ({
    page,
  }) => {
    const cardId = await seedCard([
      { type: 'primary', createdAt: '2026-05-01T08:00:00Z', slots: ['wide'] },
    ]);

    await page.goto(`/cards/${cardId}`);
    await expect(page.getByTestId('compare-photos-link')).toBeHidden();

    // Direct navigation to the route redirects back to the card.
    await page.goto(`/cards/${cardId}/compare`);
    await expect(page).toHaveURL(new RegExp(`/cards/${cardId}$`));
    await expect(page.getByTestId('photo-comparison')).toBeHidden();
  });

  test('slot-missing path shows the placeholder + disables bounce', async ({
    page,
  }) => {
    // A (earliest) has wide + medium; B (latest) has only wide. Selecting
    // medium leaves B in the missing-slot state.
    const cardId = await seedCard([
      {
        type: 'primary',
        createdAt: '2026-05-01T08:00:00Z',
        slots: ['wide', 'medium'],
      },
      { type: 'close', createdAt: '2026-05-20T08:00:00Z', slots: ['wide'] },
    ]);

    await page.goto(`/cards/${cardId}/compare`);
    await expect(page.getByTestId('compare-panel-b')).toBeVisible();
    // Wide is present on both → bounce enabled.
    await expect(page.getByTestId('compare-bounce-toggle')).toBeEnabled();

    await page.getByTestId('compare-slot-medium').click();
    await expect(page.getByTestId('compare-missing-b')).toContainText(
      'No photo for this slot'
    );
    await expect(page.getByTestId('compare-bounce-toggle')).toBeDisabled();
  });
});
