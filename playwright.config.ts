import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5178',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    browserName: 'chromium',
  },
  webServer: {
    command: 'npm run dev',
    // Readiness includes Vite's proxy and the real API/database connection.
    url: 'http://127.0.0.1:5178/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
