import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4317',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'phone-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        locale: 'en-US',
        timezoneId: 'Asia/Manila',
        serviceWorkers: 'block',
      },
    },
  ],
  webServer: {
    command: 'node e2e/qa-build.mjs && npx vite preview --port 4317 --strictPort',
    url: 'http://localhost:4317',
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
