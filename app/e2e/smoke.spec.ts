import { expect, test, type Page } from '@playwright/test';
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ACTIVATION_URL = 'https://activation.qa.invalid/v1/activate';

/** One network handler: the fake activation server answers; every other https request is aborted (offline market). */
async function routeNetwork(page: Page): Promise<void> {
  const key = createPrivateKey(readFileSync('e2e/.qa/qa-key.pem'));
  await page.route(url => url.protocol === 'https:', async route => {
    if (route.request().url() !== ACTIVATION_URL) return route.abort();
    const activationId = `qa-${Date.now()}`;
    const issuedAt = new Date().toISOString();
    const verifierPayload = JSON.stringify({ proofVersion: 1, purpose: 'kairos-activation', receiptVersion: 1, activationId, issuedAt });
    const verifierSignature = sign('sha256', Buffer.from(verifierPayload), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, receipt: { receiptVersion: 1, activationId, issuedAt, verifierPayload, verifierSignature } }),
    });
  });
}

async function activate(page: Page): Promise<void> {
  await routeNetwork(page);
  await page.goto('/');
  await page.getByLabel('Invite code').fill('QA-INVITE-001');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.kairos-shell')).toBeVisible();
}

test('(a) an invite code opens the app shell', async ({ page }) => {
  await activate(page);
});

test('(b) every route renders inside the phone width without page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  for (const path of ['/', '/journal', '/analysis', '/library', '/more', '/practice', '/goals', '/settings', '/profile', '/does-not-exist']) {
    await page.goto(path);
    await expect(page.locator('.kairos-shell'), path).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `${path} scrollWidth`).toBeLessThanOrEqual(390);
    if (path === '/settings') {
      const background = await page.locator('.kairos-settings-card').first().evaluate(element => getComputedStyle(element).backgroundColor);
      expect(background).not.toBe('rgba(0, 0, 0, 0)');
    }
    if (path === '/does-not-exist') await expect(page.getByRole('link', { name: 'Go to Home' })).toBeVisible();
    if (path === '/') await expect(page.getByText('Live prices are unavailable')).toBeVisible({ timeout: 15_000 });
  }
  expect(errors).toEqual([]);
});

test('(c) log a closed trade, find it in Your Trades and open it in Analysis', async ({ page }) => {
  await activate(page);
  await page.goto('/journal');
  await page.getByLabel(/^Symbol/).fill('BTCUSDT');
  await page.getByLabel(/^Market/).selectOption('crypto');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Status/).selectOption('closed');
  await page.locator('#kairos-trade-opened-at').fill('2026-09-20T09:00');
  await page.locator('#kairos-trade-closed-at').fill('2026-09-20T10:00');
  await page.getByLabel('Currency code').fill('USDT');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await page.getByLabel('Entry 1 price').fill('60000');
  await page.getByLabel('Entry 1 quantity').fill('0.1');
  await page.getByLabel('Entry 1 date and time').fill('2026-09-20T09:00');
  await page.getByRole('button', { name: 'Add exit' }).click();
  await page.getByLabel('Exit 2 price').fill('61500');
  await page.getByLabel('Exit 2 quantity').fill('0.1');
  await page.getByLabel('Exit 2 date and time').fill('2026-09-20T10:00');
  await page.getByRole('button', { name: 'Save trade' }).click();
  const outcome = page.locator('[data-outcome="profit"]').first();
  await expect(outcome).toContainText('Profit');
  await expect(outcome).toContainText('150 USDT');

  await page.goto('/');
  await page.getByRole('button', { name: 'Your Trades' }).click();
  // The bubbles float, so a normal click never settles; dispatch the click directly.
  await page.getByRole('button', { name: /BTCUSDT, long, Profit/ }).dispatchEvent('click');
  await page.getByRole('link', { name: 'View trade' }).or(page.getByRole('button', { name: 'View trade' })).first().click();

  await expect(page).toHaveURL(/\/analysis\?trade=/);
  await expect(page.getByText('Recorded result')).toBeVisible();
  await expect(page.getByText('150 USDT').first()).toBeVisible();
});

test('(d) the Library lists the sample learning source and saves it for offline', async ({ page }) => {
  await activate(page);
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Your saved charts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Learning sources' })).toBeVisible();
  const card = page.locator('[data-learning-source-id="kairos-library-sample"]');
  await expect(card.getByRole('heading', { name: 'How the Library works' })).toBeVisible();

  // Headless Chromium downloads PDFs instead of showing them, so the link is checked, not clicked.
  const link = card.getByRole('link', { name: /^Open PDF/ });
  await expect(link).toHaveAttribute('target', '_blank');
  const file = await page.request.get((await link.getAttribute('href'))!);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toContain('application/pdf');
  expect((await file.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');

  await card.getByRole('button', { name: /^Save for offline/ }).click();
  await expect(card.getByText('Saved for offline', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-learning-source-id="kairos-library-sample"]').getByText('Saved for offline', { exact: true })).toBeVisible();

  expect(await (await page.request.get('/sw.js')).text()).not.toContain('.pdf');
});

test('(e) Library: trading words and the calculators', async ({ page }) => {
  await activate(page);
  await page.goto('/library');
  await page.getByRole('link', { name: /^Trading words/ }).click();
  await expect(page).toHaveURL(/\/library\/words$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Trading words' })).toBeVisible();
  const words = page.getByRole('heading', { level: 2 });
  const before = await words.count();
  await page.getByLabel('Find a word').fill('stop');
  await expect(page.getByRole('heading', { level: 2, name: 'Stop' })).toBeVisible();
  // The search filters: fewer words than before, never a pinned number.
  await expect.poll(() => words.count()).toBeLessThan(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.goto('/library/calculators');
  const calculator = page.getByRole('region', { name: 'How much can I buy?' });
  await calculator.getByLabel('Money in your account').fill('1000');
  await calculator.getByLabel("Most you're willing to lose (%)").fill('1');
  await calculator.getByLabel('Entry price').fill('100');
  await calculator.getByLabel('Stop price').fill('95');
  await expect(calculator.getByText('You can buy up to 2')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('(f) Library: a lesson from start to finish', async ({ page }) => {
  await activate(page);
  await page.goto('/library');
  await page.getByRole('link', { name: /^Lessons/ }).click();
  await expect(page).toHaveURL(/\/library\/lessons$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Lessons' })).toBeVisible();
  await page.locator('.kairos-lessons__list a').first().click();
  const progress = page.locator('.kairos-lesson__progress');
  await expect(progress).toHaveText(/^Step 1 of \d+$/);
  const steps = Number(/of (\d+)$/.exec((await progress.textContent()) ?? '')![1]);
  for (let i = 1; i <= steps; i += 1) {
    await expect(progress).toHaveText(`Step ${i} of ${steps}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    if (await page.locator('.kairos-lesson-check').count() > 0) {
      await page.locator('.kairos-lesson-check button').first().click();
      await expect(page.locator('.kairos-lesson-check__feedback')).toHaveText(/^(Right\.|Not quite\.)/);
    }
    await page.getByRole('button', { name: i < steps ? 'Next' : 'Finish', exact: true }).click();
  }
  await expect(page.getByRole('heading', { level: 2, name: 'Lesson finished' })).toBeVisible();
  await expect(progress).toHaveText(`All ${steps} steps done`);
});

test('(g) Practice: pretend money, a plan from the calculator, and a practice trade', async ({ page }) => {
  await activate(page);
  await page.goto('/practice');
  const money = page.getByRole('region', { name: 'Your practice money' });
  await money.getByLabel(/^Starting amount/).fill('1000');
  await money.getByLabel(/^Money currency/).fill('usdt');
  await money.getByRole('button', { name: 'Start practising' }).click();
  const moneyNow = money.locator('.kairos-practice-money__now strong');
  await expect(moneyNow).toHaveText('1000 USDT');

  await page.goto('/library/calculators');
  const calculator = page.getByRole('region', { name: 'How much can I buy?' });
  await calculator.getByLabel('Money in your account').fill('1000');
  await calculator.getByLabel("Most you're willing to lose (%)").fill('1');
  await calculator.getByLabel('Entry price').fill('100');
  await calculator.getByLabel('Stop price').fill('95');
  await calculator.getByRole('link', { name: 'Try it as a practice trade' }).click();

  await expect(page).toHaveURL(/\/practice\?side=long&entry=100&stop=95&quantity=2$/);
  await expect(page.getByLabel(/^Direction/)).toHaveValue('long');
  await expect(page.getByLabel('Planned stop')).toHaveValue('95');
  await expect(page.getByLabel('Planned quantity')).toHaveValue('2');
  await page.getByLabel(/^Symbol/).fill('BTCUSDT');
  await page.getByLabel(/^Market/).selectOption('crypto');
  await page.getByLabel(/^Status/).selectOption('closed');
  await page.locator('#kairos-practice-opened-at').fill('2026-09-20T09:00');
  await page.locator('#kairos-practice-closed-at').fill('2026-09-20T10:00');
  await page.getByLabel('Currency code').fill('USDT');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await page.getByLabel('Entry 1 price').fill('100');
  await page.getByLabel('Entry 1 quantity').fill('2');
  await page.getByLabel('Entry 1 date and time').fill('2026-09-20T09:00');
  await page.getByRole('button', { name: 'Add exit' }).click();
  await page.getByLabel('Exit 2 price').fill('110');
  await page.getByLabel('Exit 2 quantity').fill('2');
  await page.getByLabel('Exit 2 date and time').fill('2026-09-20T10:00');
  await page.getByRole('button', { name: 'Save practice trade' }).click();

  await expect(page.locator('.kairos-journal__feedback--success')).toHaveText('Practice trade saved. It stays out of your journal results.');
  await expect(page).toHaveURL(/\/practice$/);
  await expect(moneyNow).toHaveText('1020 USDT');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.goto('/journal');
  await expect(page.getByText('No saved trades yet. Your first saved trade will appear here.')).toBeVisible();
});
