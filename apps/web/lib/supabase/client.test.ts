// What: Unit tests for the browser-side Supabase client factory.
// Why:  Lock in the `.trim()` defense — Pattern 1 from the SSR boilerplate.
//       A regression here silently 500s SSR routes when a trailing space
//       sneaks into NEXT_PUBLIC_SUPABASE_URL.
// Does NOT: Issue real network requests — the client object is built but
//           never connected.

import { describe, it, expect, vi, afterEach } from 'vitest';

describe('createClient (browser)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns a Supabase client with the configured shape', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54421');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
    const { createClient } = await import('./client');
    const client = createClient();
    expect(typeof client.from).toBe('function');
    expect(typeof client.auth).toBe('object');
  });

  it('trims trailing whitespace from env reads (Pattern 1)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '  http://127.0.0.1:54421  \n');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '\ttest-anon-key\t');
    const { createClient } = await import('./client');
    // If trim() weren't applied, createBrowserClient throws on URL parse.
    expect(() => createClient()).not.toThrow();
  });
});
