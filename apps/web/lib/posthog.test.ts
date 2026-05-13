// What: Sanity tests for lib/posthog.ts — verify initPostHog no-ops without
//       a window, and only initializes when NEXT_PUBLIC_POSTHOG_KEY is set.
// Why:  PostHog init runs on the client; SSR/test envs lack `window`, and a
//       missing key should not throw. Both paths are easy to regress.

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js', () => ({
  default: { init: vi.fn() },
}));

describe('initPostHog', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('no-ops when window is undefined (SSR / Node test env)', async () => {
    // jsdom env defines window; clear it for this case.
    vi.stubGlobal('window', undefined);
    const { initPostHog } = await import('./posthog');
    const posthog = (await import('posthog-js')).default as unknown as {
      init: ReturnType<typeof vi.fn>;
    };
    initPostHog();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('no-ops when NEXT_PUBLIC_POSTHOG_KEY is missing', async () => {
    vi.stubGlobal('window', {});
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    const { initPostHog } = await import('./posthog');
    const posthog = (await import('posthog-js')).default as unknown as {
      init: ReturnType<typeof vi.fn>;
    };
    initPostHog();
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('initializes when window + key present', async () => {
    vi.stubGlobal('window', {});
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_key');
    const { initPostHog } = await import('./posthog');
    const posthog = (await import('posthog-js')).default as unknown as {
      init: ReturnType<typeof vi.fn>;
    };
    initPostHog();
    expect(posthog.init).toHaveBeenCalledOnce();
    expect(posthog.init).toHaveBeenCalledWith(
      'phc_test_key',
      expect.objectContaining({ api_host: 'https://us.i.posthog.com' })
    );
  });
});
