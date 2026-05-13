// What: Vitest config for @home-os/web unit tests.
// Why:  Mirror packages/core's setup — Node env + a WebSocket stub so
//       @supabase/ssr → @supabase/supabase-js → realtime-js doesn't crash
//       on construction in the default Node test env. Per-file test paths
//       under `lib/` get picked up automatically.
// Does NOT: Run E2E tests (Playwright lives in e2e/ and reads its own
//           config; vitest excludes that directory).

import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirror tsconfig.json `paths`: "@/*": ["./*"]. Vite/Vitest doesn't
    // read tsconfig paths automatically; without this alias, tests that
    // import from `@/lib/...` fail at resolve time.
    alias: { '@': path.resolve(__dirname, './') },
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
    ],
    exclude: ['node_modules', 'dist', '.next', 'e2e'],
  },
});
