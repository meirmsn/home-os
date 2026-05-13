// What: Vitest config for @home-os/ui.
// Why: Standard unit-test loop; no jsdom/RTL yet — Button smoke tests don't
//      render JSX. Add jsdom + @testing-library/react alongside the first
//      consumer test that needs DOM-level coverage.
// Does NOT: Run E2E (Playwright lives in apps/web/e2e/).

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'dist'],
  },
});
