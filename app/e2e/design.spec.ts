import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
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

test('(4) An emphasised stat tile keeps its card shadow in all 5 themes', async ({ browser }) => {
  for (const theme of THEMES) {
    const context = await browser.newContext(test.info().project.use);
    const page = await context.newPage();
    await openKairos(page, { theme });
    const shadows = await page.evaluate(() => (['main', 'insight'] as const).map(emphasis => {
      const tile = document.createElement('div');
      tile.className = 'kairos-stat';
      tile.dataset.kairosEmphasis = emphasis;
      document.querySelector('main')!.append(tile);
      const shadow = getComputedStyle(tile).boxShadow;
      tile.remove();
      return shadow;
    }));
    for (const shadow of shadows) expect(shadow, `${theme} emphasised tile shadow`).not.toBe('none');
    await context.close();
  }
});

test('(5) The "Unavailable" box shows a focus ring and no card patch', async ({ browser }) => {
  for (const theme of ['kairos-depth', 'paper']) {
    const context = await browser.newContext(test.info().project.use);
    const page = await context.newPage();
    await openKairos(page, { theme });
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.className = 'kairos-error-state kairos-unavailable';
      box.tabIndex = -1;
      box.id = 'qa-unavailable';
      box.textContent = 'Unavailable · test';
      document.querySelector('main')!.append(box);
    });
    await page.keyboard.press('Tab');
    const look = await page.evaluate(() => {
      const box = document.getElementById('qa-unavailable')!;
      box.focus();
      const style = getComputedStyle(box);
      return { outline: style.outlineStyle, background: style.backgroundColor };
    });
    expect(look.outline, `${theme} focus ring`).toBe('solid');
    expect(look.background, `${theme} background`).toBe('rgba(0, 0, 0, 0)');
    await context.close();
  }
});

const EVERY_SCREEN = ['/', '/journal', '/analysis', '/library', '/more', '/practice', '/goals', '/strategies', '/coach', '/practice/coach', '/patterns', '/practice/patterns', '/news-calendar', '/currency', '/settings', '/profile', '/does-not-exist', '/library/words', '/library/calculators', '/library/lessons', '/practice/replay'];
const KEY_SCREENS = ['/', '/journal', '/analysis', '/coach', '/settings'];
const AXE_THEMES: ReadonlyArray<Readonly<{ theme: string; paths: readonly string[] }>> = [
  { theme: 'kairos-depth', paths: EVERY_SCREEN }, { theme: 'paper', paths: EVERY_SCREEN },
  { theme: 'ink', paths: KEY_SCREENS }, { theme: 'cosmic', paths: KEY_SCREENS }, { theme: 'ocean', paths: KEY_SCREENS },
];
const TEXT_FIELDS = 'input:not([type="radio"]):not([type="checkbox"]):not([type="file"]):not([type="hidden"]):not([type="range"]):not([type="color"]):visible, select:visible, textarea:visible';

async function openScreen(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('main h1').first(), path).toBeVisible();
  // A screen fades in; colours measured mid-fade are blends, so wait for every animation that ends (not loops).
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => undefined))));
}

async function axeProblems(page: Page, where: string): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return result.violations.map(violation => `${where}: ${violation.id} (${violation.impact ?? 'unknown'}) ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`);
}

/** Logs one closed crypto trade with Quick log, as smoke case (k) does, so a trade card, a result and a picture are checked. */
async function logClosedTrade(page: Page): Promise<void> {
  await page.goto('/journal');
  await page.getByRole('button', { name: 'Use Asia/Manila (this device)' }).click();
  await page.getByRole('button', { name: 'Quick log' }).click();
  await page.getByLabel(/^Symbol/).fill('ETHUSDT');
  await page.getByLabel(/^Market/).selectOption('crypto');
  await page.getByLabel(/^Direction/).selectOption('short');
  await page.getByLabel(/^Entry price/).fill('100');
  await page.getByLabel(/^Exit price/).fill('90');
  await page.getByLabel(/^Quantity/).fill('1');
  await page.getByRole('button', { name: 'Set opened time to now' }).click();
  await page.getByRole('button', { name: 'Set closed time to now' }).click();
  await page.getByLabel('Currency code').fill('USDT');
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();
}

for (const { theme, paths } of AXE_THEMES) {
  test(`(6) axe finds nothing on any screen · ${theme}`, async ({ page }) => {
    test.setTimeout(180_000);
    await openKairos(page, { theme });
    const problems: string[] = [];
    for (const path of paths) {
      await openScreen(page, path);
      problems.push(...await axeProblems(page, path));
    }
    if (theme === 'kairos-depth') {
      await logClosedTrade(page);
      for (const path of ['/journal', '/']) {
        await openScreen(page, path);
        problems.push(...await axeProblems(page, `${path} with a trade`));
      }
    }
    expect(problems).toEqual([]);
  });
}

for (const { theme, paths } of AXE_THEMES) {
  test(`(7) every field edge is 3:1 in the real app · ${theme}`, async ({ page }) => {
    test.setTimeout(180_000);
    await openKairos(page, { theme });
    const weak: string[] = [];
    for (const path of paths) {
      await openScreen(page, path);
      const fields = page.locator(TEXT_FIELDS);
      const count = await fields.count();
      for (let index = 0; index < count; index += 1) {
        const field = fields.nth(index);
        const { againstFill, againstOutside } = await contrastInPage(page, field);
        if (againstFill < 3 || againstOutside < 3) {
          const name = await field.evaluate(element => element.getAttribute('aria-label') ?? element.id ?? element.tagName);
          weak.push(`${path} ${name}: ${againstFill.toFixed(2)} on its fill, ${againstOutside.toFixed(2)} around it`);
        }
      }
    }
    expect(weak).toEqual([]);
  });
}

test('(8) the keyboard way in', async ({ page }) => {
  await openKairos(page);
  await openScreen(page, '/journal');
  await page.locator('body').focus();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.getElementById('kairos-main-content')!.contains(document.activeElement))).toBe(true);
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Analysis' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Analysis' })).toBeFocused();
  await expect(page).toHaveTitle('Analysis · Kairos');
  await page.goto('/settings');
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page).toHaveTitle('Settings · Kairos');
});

test('(9) one glow at most on every screen', async ({ page }) => {
  test.setTimeout(120_000);
  await openKairos(page, { theme: 'kairos-depth' });
  for (const path of EVERY_SCREEN) {
    await openScreen(page, path);
    expect(await page.locator('[data-kairos-emphasis]').count(), path).toBeLessThanOrEqual(1);
  }
});

test('(10) a Market, Direction or Status list with a mistake has the red edge', async ({ browser }) => {
  for (const theme of ['kairos-depth', 'paper']) {
    const context = await browser.newContext(test.info().project.use);
    const page = await context.newPage();
    await openKairos(page, { theme });
    const look = await page.evaluate(() => {
      const field = document.createElement('div');
      field.className = 'kairos-form-field kairos-form-field--error';
      field.innerHTML = '<div class="kairos-select"><select aria-label="QA list"><option>crypto</option></select></div>';
      document.querySelector('main')!.append(field);
      const probe = document.createElement('div');
      probe.style.color = 'var(--kairos-state-error)';
      document.querySelector('main')!.append(probe);
      return { edge: getComputedStyle(field.querySelector('select')!).borderTopColor, error: getComputedStyle(probe).color };
    });
    expect(look.edge, `${theme} list edge`).toBe(look.error);
    await context.close();
  }
});

test('(11) links, focus rings and the bottom-bar marker follow the theme, and lists show their whole text', async ({ browser }) => {
  test.setTimeout(180_000);
  const tokenColour = (page: Page, token: string) => page.evaluate(name => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
  const inkOnMore = async (page: Page, path: string) => {
    await expect(page.locator('.kairos-shell__nav-ink'), `${path} marker`).toHaveCount(1);
    const ink = await page.locator('.kairos-shell__nav-ink').boundingBox();
    const more = await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'More' }).boundingBox();
    expect(ink, `${path} marker`).not.toBeNull();
    expect(Math.abs((ink!.x + ink!.width / 2) - (more!.x + more!.width / 2)), `${path} marker over More`).toBeLessThanOrEqual(2);
  };
  const listsFit = async (page: Page, path: string) => {
    const cut = await page.evaluate(() => {
      const context = document.createElement('canvas').getContext('2d')!;
      return [...document.querySelectorAll('select')].filter(select => select.getClientRects().length > 0 && select.getBoundingClientRect().width > 0).flatMap(select => {
        const style = getComputedStyle(select);
        context.font = style.font;
        const text = select.selectedOptions[0]?.textContent ?? '';
        const room = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - (style.appearance === 'none' ? 0 : 20);
        const width = context.measureText(text).width;
        return width <= room ? [] : [`${select.getAttribute('aria-label') ?? select.id ?? select.name}: "${text}" needs ${Math.ceil(width)} px, has ${Math.floor(room)} px`];
      });
    });
    expect(cut, `${path} lists`).toEqual([]);
  };
  for (const theme of ['paper', 'kairos-depth']) {
    const context = await browser.newContext(test.info().project.use);
    const page = await context.newPage();
    await openKairos(page, { theme, fixedClock: '2026-09-20T04:00:00.000Z', server: 'fixed-market' });
    await expect(page.locator('main h1')).toBeVisible();
    await listsFit(page, `${theme} /`);

    await page.goto('/coach');
    await expect(page.locator('main .kairos-coach p').first()).toBeVisible();
    const accent = await tokenColour(page, '--kairos-accent-primary');
    const links = await page.locator('main a[href]').evaluateAll(anchors => anchors.map(anchor => getComputedStyle(anchor).color));
    expect(links.length, `${theme} Coach links`).toBeGreaterThan(0);
    for (const colour of links) expect(colour, `${theme} Coach link colour`).toBe(accent);
    await inkOnMore(page, `${theme} /coach`);
    await listsFit(page, `${theme} /coach`);

    await page.goto('/analysis');
    const heading = page.locator('main h1');
    await expect(heading).toBeFocused();
    await expect(page.locator('.kairos-symbol-picker [role="combobox"]').first()).toBeVisible();
    const focus = await tokenColour(page, '--kairos-state-focus');
    const ring = await heading.evaluate(element => ({ style: getComputedStyle(element).outlineStyle, colour: getComputedStyle(element).outlineColor }));
    expect(ring, `${theme} Analysis heading ring`).toEqual({ style: 'solid', colour: focus });
    await listsFit(page, `${theme} /analysis`);

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
    await inkOnMore(page, `${theme} /settings`);
    await listsFit(page, `${theme} /settings`);

    await page.goto('/journal');
    await expect(page.getByRole('textbox', { name: /^Symbol/ })).toBeVisible();
    await listsFit(page, `${theme} /journal`);
    await context.close();
  }
});
