import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 40000,
  expect: { timeout: 8000 }, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5175', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: [
    { command: 'npm run build && node scripts/preview-test.mjs', url: 'http://127.0.0.1:5175', reuseExistingServer: false, timeout: 90000 },
    { command: 'npm run build --prefix server && DB_PATH=/tmp/forma-playwright.db PORT=3198 node server/dist/index.js', url: 'http://127.0.0.1:3198/health', reuseExistingServer: false }
  ]
});
