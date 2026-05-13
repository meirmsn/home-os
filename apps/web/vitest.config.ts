// What: Vitest config for @home-os/web unit tests.
// Why:  Mirror packages/core's setup — Node env + a WebSocket stub so
//       @supabase/ssr → @supabase/supabase-js → realtime-js doesn't crash
//       on construction in the default Node test env. Per-file test paths
//       under `lib/` get picked up automatically.
// Does NOT: Run E2E tests (Playwright lives in e2e/ and reads its own
//           config; vitest excludes that directory).

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx'],
    exclude: ['node_modules', 'dist', '.next', 'e2e'],
  },
});
