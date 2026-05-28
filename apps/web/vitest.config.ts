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
  // JSX transform: use React 19's automatic runtime so `.tsx` test files
  // can render components without an explicit `import React` (matches how
  // Next compiles app-router files). tsconfig sets `jsx: preserve` for
  // Next's own pipeline; Vitest needs an explicit choice here.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    // Mirror tsconfig.json `paths`: "@/*": ["./*"]. Vite/Vitest doesn't
    // read tsconfig paths automatically; without this alias, tests that
    // import from `@/lib/...` fail at resolve time.
    alias: { '@': path.resolve(__dirname, './') },
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    // Default environment is Node; individual test files that need a DOM
    // opt in via the `// @vitest-environment happy-dom` pragma at the top
    // of the file. This keeps Node-only tests fast and avoids paying the
    // happy-dom cost everywhere.
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'happy-dom']],
    include: [
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
      'middleware.test.ts',
      // Triage eval harness lives under eval/ (outside lib/ + app/); without
      // this glob the score + dataset integrity tests silently never run.
      'eval/**/*.test.ts',
    ],
    exclude: ['node_modules', 'dist', '.next', 'e2e'],
  },
});
