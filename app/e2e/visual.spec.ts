/*
 * Screenshots of 5 key screens in the 5 themes (T-049j, D184), compared on every pull request.
 *
 * Updating the references (never to make an unexplained change pass):
 * 1. On Linux x64, in app/: `npx playwright install chromium`, then
 *    `npx playwright test e2e/visual.spec.ts --update-snapshots=changed`.
 * 2. Open every changed image in e2e/screenshots/ and list each one in the report with the reason (which task changed
 *    that screen's look).
 * 3. If CI alone differs (another machine): the job log names each failed case and its pixel count, and CI's
 *    `-actual.png` and `-diff.png` files are in the `playwright-report` artifact of the failed run. When the diff shows
 *    only text edges, replace the references with CI's `-actual.png` files. No helper workflow makes references.
 *    The supervisor reads the log with the GitHub tool get_job_logs and fetches the artifact with actions_get
 *    (download_workflow_run_artifact); if no agent can fetch it, owner action O13.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openKairos } from './qaSession';

test.skip(process.platform !== 'linux', 'Screenshots are compared on Linux only');
// reducedMotion is a browser-context option (there is no top-level `reducedMotion` fixture).
test.use({ contextOptions: { reducedMotion: 'reduce' }, colorScheme: 'dark' });

const THEMES = ['ink', 'paper', 'kairos-depth', 'cosmic', 'ocean'] as const;
const SCREENS: readonly Readonly<{ name: string; path: string; firstContent: (page: Page) => Locator[] }>[] = [
  { name: 'home', path: '/', firstContent: page => ['BTC', 'ETH'].map(symbol => page.locator(`.kairos-glass-bubble[data-identity="${symbol}"] canvas[data-glass-ready="true"]`)) },
  { name: 'journal', path: '/journal', firstContent: page => [page.getByRole('textbox', { name: /^Symbol/ })] },
  { name: 'analysis', path: '/analysis', firstContent: page => [page.locator('.kairos-symbol-picker [role="combobox"]').first()] },
  { name: 'coach', path: '/coach', firstContent: page => [page.locator('main .kairos-coach p').first()] },
  { name: 'settings', path: '/settings', firstContent: page => [page.getByRole('heading', { name: 'Appearance' })] },
];

for (const theme of THEMES) {
  for (const screen of SCREENS) {
    test(`${screen.name} in ${theme}`, async ({ page }) => {
      await openKairos(page, { theme, fixedClock: '2026-09-20T04:00:00.000Z', server: 'fixed-market' });
      if (screen.path !== '/') await page.goto(screen.path);
      await expect(page.locator('main h1')).toBeVisible();
      for (const content of screen.firstContent(page)) await expect(content).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => page.evaluate(() => [...document.fonts].some(face => face.family.replace(/["']/g, '') === 'Inter Variable' && face.status === 'loaded'))).toBe(true);
      // The top progress bar is drawn only while the shell is loading (navigationShell.css).
      await expect(page.locator('.kairos-shell')).not.toHaveAttribute('data-loading', 'true');
      await expect(page).toHaveScreenshot(`${screen.name}-${theme}.png`);
    });
  }
}
