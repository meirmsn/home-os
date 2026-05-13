// What: Vitest config for @home-os/core
// Why: Toggle between unit tests (default) and unit+integration tests via the
//      VITEST_INTEGRATION env var; the slow-job CI sets the flag. setupFiles
//      stubs the global WebSocket constructor that @supabase/realtime-js
//      requires eagerly at SupabaseClient construction time (Node test env
//      has no built-in WebSocket — would crash createClient() unit tests).
// Does NOT: Run E2E tests (those live in apps/web/e2e/ + use Playwright).

import { defineConfig } from 'vitest/config';

const includeIntegration = process.env.VITEST_INTEGRATION === '1';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    include: includeIntegration
      ? ['src/**/*.test.ts', 'src/**/*.integration.test.ts']
      : ['src/**/*.test.ts'],
    exclude: includeIntegration
      ? ['node_modules', 'dist']
      : ['node_modules', 'dist', 'src/**/*.integration.test.ts'],
  },
});
