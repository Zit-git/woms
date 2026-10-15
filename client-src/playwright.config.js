import { defineConfig } from '@playwright/test';

// Browser tests run against a deployed copy of the app, signed in through a saved
// session file (see e2e/save-session.mjs) so no password is ever typed by a script.
//   WOMS_URL  where to test; defaults to the legacy /app/ site (always has the latest deploy)
export const BASE_URL = (process.env.WOMS_URL || 'https://woms-775318997.development.catalystserverless.com/app/').replace(/\/?$/, '/');
export const SESSION_FILE = 'e2e/.auth/state.json';

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.spec\.js/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1, // tests share one real database; run them one at a time
  reporter: [['list'], ['html', { outputFolder: 'e2e/report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    storageState: SESSION_FILE,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  outputDir: 'e2e/results',
});
