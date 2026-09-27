import { expect, test } from '@playwright/test';
import { contrastInPage, openKairos } from './qaSession';

const THEMES = ['ink', 'paper', 'kairos-depth', 'cosmic', 'ocean'] as const;
const DEPTH_THEMES = new Set<string>(['kairos-depth', 'cosmic', 'ocean']);

test('(1) Cards stand off the page and every field edge is 3:1, in all 5 themes', async ({ browser }) => {
  for (const theme of THEMES) {
    // A fresh context per theme: its own storage, so the stored theme and the activation start clean.
    const context = await browser.newContext(test.info().project.use);
    const fresh = await context.newPage();
    await openKairos(fresh, { theme });
    await fresh.goto('/goals');
    const card = fresh.locator('.kairos-card').first();
    await expect(card, theme).toBeVisible();
    const { shadow, cardOnPage } = await card.evaluate(element => {
      const parse = (value: string) => { const [r, g, b] = /rgba?\(([^)]*)\)/.exec(value)![1]!.split(/[\s,/]+/).filter(Boolean).map(Number); return [r!, g!, b!] as const; };
      const luminance = ([r, g, b]: readonly [number, number, number]) => {
        const linear = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
      };
      const probe = document.createElement('div');
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--kairos-background-base').trim();
      document.body.append(probe);
      const pageColour = parse(getComputedStyle(probe).color);
      probe.remove();
      const style = getComputedStyle(element);
      const a = luminance(parse(style.backgroundColor)), b = luminance(pageColour);
      return { shadow: style.boxShadow, cardOnPage: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
    expect(shadow, `${theme} card shadow`).not.toBe('none');
    if (DEPTH_THEMES.has(theme)) expect(cardOnPage, `${theme} card on page`).toBeGreaterThanOrEqual(1.12);
    for (const path of ['/goals', '/settings', '/journal']) {
      await fresh.goto(path);
      await expect(fresh.locator('.kairos-shell')).toBeVisible();
      await expect(fresh.locator('main h1').first()).toBeVisible();
      const fields = fresh.locator('input:not([type="radio"]):not([type="checkbox"]):not([type="file"]):not([type="hidden"]):visible, select:visible');
      const count = await fields.count();
      expect(count, `${theme} ${path} has fields`).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        const field = fields.nth(index);
        const name = `${theme} ${path} ${await field.evaluate(element => element.getAttribute('aria-label') ?? element.id ?? element.tagName)}`;
        const { againstFill, againstOutside } = await contrastInPage(fresh, field);
        expect(againstFill, `${name} edge on its fill`).toBeGreaterThanOrEqual(3);
        expect(againstOutside, `${name} edge on what is around it`).toBeGreaterThanOrEqual(3);
      }
    }
    await context.close();
  }
});

test('(2) Inter with lined-up digits', async ({ page, request }) => {
  await openKairos(page);
  await page.goto('/journal');
  await expect(page.locator('main h1').first()).toBeVisible();
  const font = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      interLoaded: [...document.fonts].some(face => face.family.includes('Inter Variable') && face.status === 'loaded'),
      numeric: getComputedStyle(document.body).fontVariantNumeric,
    };
  });
  expect(font.interLoaded, 'an Inter Variable face is loaded').toBe(true);
  expect(font.numeric).toContain('tabular-nums');
  const serviceWorker = await request.get('/sw.js');
  expect(serviceWorker.ok()).toBe(true);
  expect(await serviceWorker.text()).toContain('.woff2');
});

test('(3) Match my phone follows the phone', async ({ browser }) => {
  const statusBar = (page: import('@playwright/test').Page) => page.locator('meta[name="theme-color"]');
  const matchPhone = await browser.newContext(test.info().project.use);
  const page = await matchPhone.newPage();
  await page.emulateMedia({ colorScheme: 'light' });
  await openKairos(page, { theme: 'system' });
  await expect(page.locator('html')).toHaveAttribute('data-kairos-theme', 'paper');
  await expect(statusBar(page)).toHaveAttribute('content', '#fafafa');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-kairos-theme', 'kairos-depth');
  await expect(statusBar(page)).toHaveAttribute('content', '#0b0d14');
  await matchPhone.close();

  const saved = await browser.newContext(test.info().project.use);
  const oceanPage = await saved.newPage();
  await oceanPage.emulateMedia({ colorScheme: 'light' });
  await openKairos(oceanPage, { theme: 'ocean' });
  await expect(oceanPage.locator('html')).toHaveAttribute('data-kairos-theme', 'ocean');
  await oceanPage.emulateMedia({ colorScheme: 'dark' });
  await expect(oceanPage.locator('html')).toHaveAttribute('data-kairos-theme', 'ocean');
  await oceanPage.emulateMedia({ colorScheme: 'light' });
  await expect(oceanPage.locator('html')).toHaveAttribute('data-kairos-theme', 'ocean');
  await saved.close();
});
