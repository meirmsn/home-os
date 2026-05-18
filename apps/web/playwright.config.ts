// What: Playwright E2E config for @home-os/web.
// Why:  Two breakpoint projects — mobile (375px) and desktop (1440px) —
//       cover the design-review's mobile-first + desktop layouts. Reporter +
//       webServer wiring follow Playwright defaults; tweak when the first
//       E2E test ships.
// Does NOT: Spawn a real Supabase stack — E2E helpers in
//           apps/web/e2e/helpers/admin-client.ts skip gracefully when
//           isLocalSupabase is false.

import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT ?? '3000';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['iPhone 15'], viewport: { width: 375, height: 812 } },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  // webServer left to the test runner — for local runs use `pnpm dev` in
  // another shell; CI brings up `next start` via the slow-job workflow.
});
