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
