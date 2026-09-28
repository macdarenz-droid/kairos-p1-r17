import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Screenshot references (e2e/visual.spec.ts): CI never writes one, so a missing reference fails there.
  snapshotPathTemplate: '{testDir}/screenshots/{arg}{ext}',
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  expect: { toHaveScreenshot: { threshold: 0.02, maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide', scale: 'css' } },
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
        // Font hinting and sub-pixel text off, so the machine's font settings do not change screenshot pixels.
        launchOptions: { args: ['--font-render-hinting=none', '--disable-lcd-text'] },
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
