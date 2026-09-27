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
