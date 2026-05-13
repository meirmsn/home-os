// What: Smoke test for the server-side Supabase client factory.
// Why:  Lock in `.trim()` defense — Pattern 1 from the SSR boilerplate.
//       Server-side reads use Next's async cookies() so the test mocks the
//       `next/headers` module to return a deterministic cookie store.
// Does NOT: Verify Next's cookie set/remove fallthrough — that's part of
//           Next's own contract; we trust the framework here.

import { describe, it, expect, vi, afterEach } from 'vitest';

const fakeStore = {
  getAll: () => [] as Array<{ name: string; value: string }>,
  set: () => {},
};

vi.mock('next/headers', () => ({
  cookies: async () => fakeStore,
}));

describe('createClient (server)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns a Supabase client with the configured shape', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54421');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
    const { createClient } = await import('./server');
    const client = await createClient();
    expect(typeof client.from).toBe('function');
    expect(typeof client.auth).toBe('object');
  });

  it('trims trailing whitespace from env reads (Pattern 1)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '  http://127.0.0.1:54421  \n');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '\ttest-anon-key\t');
    const { createClient } = await import('./server');
    await expect(createClient()).resolves.toBeDefined();
  });
});
