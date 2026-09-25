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
  for (const path of ['/', '/journal', '/analysis', '/library', '/more', '/practice', '/goals', '/strategies', '/coach', '/practice/coach', '/patterns', '/practice/patterns', '/settings', '/profile', '/does-not-exist']) {
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

test('(h) Replay: a practice trade on past prices, judged candle by candle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  const replayStart = Date.parse('2024-03-01T04:00:00.000Z'); // 12:00 in Asia/Manila, the project's time zone (playwright.config.ts)
  const cors = { 'Access-Control-Allow-Origin': '*' };
  await page.route(url => url.hostname === 'data-api.binance.vision', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v3/exchangeInfo') return route.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify({ symbols: [{ symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' }] }) });
    if (url.pathname !== '/api/v3/klines' || url.searchParams.get('interval') !== '1h') return route.abort();
    const hour = 3_600_000, from = Number(url.searchParams.get('startTime')), to = Number(url.searchParams.get('endTime')), limit = Number(url.searchParams.get('limit'));
    const rows: unknown[] = [];
    for (let openMs = from; openMs <= to && rows.length < limit; openMs += hour) {
      const k = (openMs - replayStart) / hour;
      const [open, high, low, close] = k < 0 ? [100, 101, 99, 100] : [100 + k, 101.5 + k, 99.5 + k, 101 + k];
      rows.push([openMs, String(open), String(high), String(low), String(close), '1', openMs + hour - 1, '1', 1, '1', '1', '0']);
    }
    return route.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify(rows) });
  });

  await page.goto('/practice');
  await page.getByRole('link', { name: 'Replay the past, one candle at a time' }).click();
  await expect(page).toHaveURL(/\/practice\/replay$/);
  await page.getByLabel(/^Market/).fill('BTCUSDT');
  await page.getByLabel(/^Start from/).fill('2024-03-01T12:00');
  await page.getByRole('button', { name: 'Start replay' }).click();
  await expect(page.locator('.kairos-replay__now strong')).toHaveText('100 USDT');
  await expect(page.getByText('240 candles left')).toBeVisible();

  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Entry price/).fill('100');
  await page.getByLabel(/^Stop price/).fill('95');
  await page.getByLabel(/^Target price/).fill('110');
  await page.getByLabel(/^Quantity/).fill('2');
  await page.getByRole('button', { name: 'Place trade' }).click();
  await expect(page.getByText('Waiting for the price to reach your entry.')).toBeVisible();
  await page.getByRole('button', { name: 'Next candle' }).click();
  await expect(page.getByText('Your entry was reached: in at 100 USDT.')).toBeVisible();
  for (let i = 0; i < 9; i += 1) await page.getByRole('button', { name: 'Next candle' }).click();
  await expect(page.getByText('Your target was reached: out at 110 USDT.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole('button', { name: 'Save to my practice trades' }).click();
  await expect(page.getByText('Saved with your practice trades. It never counts in your Journal.')).toBeVisible();
  await page.getByRole('link', { name: 'See your practice trades' }).click();
  const card = page.locator('.kairos-history-card').filter({ hasText: 'From replay' });
  await expect(card).toContainText('BTCUSDT');
  await expect(card.locator('[data-outcome="profit"]')).toContainText('20 USDT');

  await page.goto('/journal');
  await expect(page.getByText('No saved trades yet. Your first saved trade will appear here.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('(i) Strategies: your rules, checked on a trade before and after saving', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  await page.goto('/more');
  await page.getByRole('link', { name: 'Strategies' }).click();
  await expect(page).toHaveURL(/\/strategies$/);
  await expect(page.getByRole('heading', { name: 'Your strategies' })).toBeVisible();

  await page.getByRole('button', { name: 'Write your own' }).click();
  await page.getByLabel(/^Name/).fill('Breakout');
  await page.getByRole('checkbox', { name: 'Most I risk on one trade' }).check();
  await page.getByLabel(/^Amount/).fill('50');
  await page.getByLabel(/^Currency/).fill('USDT');
  await page.getByRole('checkbox', { name: 'Plan a stop before every trade' }).check();
  await page.getByRole('button', { name: 'Add a rule' }).click();
  await page.getByLabel(/^Rule 1/).fill('I wait for a candle to close above the line');
  await page.getByRole('button', { name: 'Save strategy' }).click();
  await expect(page.getByText('Strategy saved.')).toBeVisible();
  await expect(page.getByText('Risk at most 50 USDT on one trade')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.goto('/journal');
  await page.getByLabel(/^Symbol/).fill('BTCUSDT');
  await page.getByLabel(/^Market/).selectOption('crypto');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Status/).selectOption('draft');
  await page.getByLabel('Currency code').fill('USDT');
  await page.getByText('Trade plan · Optional').click();
  await page.getByLabel('Planned entry').fill('100');
  await page.getByLabel('Planned stop').fill('90');
  await page.getByLabel('Planned quantity').fill('10');
  await page.getByLabel(/^Strategy/).selectOption({ label: 'Breakout' });
  await expect(page.getByText('This trade breaks 1 of your 3 Breakout rules.')).toBeVisible();
  await expect(page.getByText('Risk: 100 USDT is more than your most, 50 USDT.')).toBeVisible();

  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();
  const strategy = page.getByRole('button', { name: 'Strategy Breakout: breaks 1 of 3 rules' });
  await expect(strategy).toBeVisible();

  await strategy.click();
  let dialog = page.getByRole('dialog', { name: 'Strategy: BTCUSDT' });
  await dialog.getByRole('checkbox', { name: 'I wait for a candle to close above the line' }).check();
  await dialog.getByRole('button', { name: 'Save strategy' }).click();
  await expect(dialog).toBeHidden();
  await expect(strategy).toBeVisible();

  await strategy.click();
  dialog = page.getByRole('dialog', { name: 'Strategy: BTCUSDT' });
  await expect(dialog.getByRole('checkbox', { name: 'I wait for a candle to close above the line' })).toBeChecked();
  expect(errors).toEqual([]);
});

test('(j) Coach: a trade that broke its plan, on its card, in the Journal and on the coach page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  await page.goto('/journal');
  await page.getByRole('button', { name: 'Use Asia/Manila (this device)' }).click();
  const coach = page.getByRole('region', { name: 'Your coach' });
  await expect(coach).toContainText('Nothing to point out this month.');

  await page.getByRole('button', { name: 'Quick log' }).click();
  await page.getByLabel(/^Symbol/).fill('BTCUSDT');
  await page.getByLabel(/^Market/).selectOption('crypto');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Entry price/).fill('100');
  await page.getByLabel(/^Exit price/).fill('90');
  await page.getByLabel(/^Quantity/).fill('3');
  await page.getByRole('button', { name: 'Set opened time to now' }).click();
  await page.getByRole('button', { name: 'Set closed time to now' }).click();
  await page.getByLabel('Currency code').fill('USDT');
  await page.getByText('Trade plan · Optional').click();
  await page.getByLabel('Planned entry').fill('100');
  await page.getByLabel('Planned stop').fill('95');
  await page.getByLabel('Planned quantity').fill('1');
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();

  const card = page.locator('.kairos-history-card').filter({ hasText: 'BTCUSDT' });
  await expect(card).toContainText('Your stop was 95, and you closed at 90 on average, beyond it.');
  await expect(card).toContainText('You planned a size of 1 and traded 3.');
  await expect(coach).toContainText('3 notes');
  await expect(coach).toContainText('1 trade this month closed beyond its stop.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await coach.getByRole('link', { name: 'See all your coach notes' }).click();
  await expect(page).toHaveURL(/\/coach$/);
  await expect(page.getByRole('heading', { name: 'Your coach', level: 1 })).toBeVisible();
  for (const title of ['1 trade this month closed beyond its stop.', '1 trade this month was bigger than you planned.', 'You reviewed 0 of your 1 closed trade this month.']) {
    await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'View trade' }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('(k) Patterns: a closed trade, then your patterns and your practice patterns', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
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

  await page.goto('/more');
  await page.getByRole('link', { name: 'Patterns', exact: true }).click();
  await expect(page).toHaveURL(/\/patterns$/);
  await expect(page.getByRole('heading', { name: 'Your patterns', level: 1 })).toBeVisible();
  const overall = page.getByRole('region', { name: 'All your trades' });
  await expect(overall).toContainText('1 trade.');
  await expect(overall).toContainText('Not enough trades with a result yet (1 of 10).');
  for (const title of ['Keeping your plan', 'After a win or a loss', 'By strategy', 'By day of the week', 'By time of day', 'Long or short']) {
    await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible();
  }
  await expect(page.getByRole('region', { name: 'Long or short' }).getByRole('listitem').filter({ hasText: 'Short (you sold first)' })).toContainText('1 trade.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.goto('/practice');
  await page.getByRole('link', { name: 'Your practice patterns' }).click();
  await expect(page).toHaveURL(/\/practice\/patterns$/);
  await expect(page.getByRole('heading', { name: 'Your practice patterns', level: 1 })).toBeVisible();
  await expect(page.getByText(/^No closed practice trades in the last 90 days yet\./)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('(l) Forex: a EUR/USD trade in units, its picture without crypto candles, and Analysis', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  await page.goto('/journal');
  const marketRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.hostname === 'data-api.binance.vision' && (url.pathname === '/api/v3/klines' || url.pathname === '/api/v3/exchangeInfo')) marketRequests.push(url.pathname);
  });

  await page.getByRole('button', { name: 'Quick log' }).click();
  await page.getByLabel(/^Market/).selectOption('forex');
  await page.getByLabel(/^Symbol/).fill('EUR/USD');
  await expect(page.getByText(/EUR\/USD: the price is how many USD one EUR costs\./)).toBeVisible();
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Entry price/).fill('1.085');
  await page.getByLabel(/^Exit price/).fill('1.09');
  await page.getByLabel(/^Quantity/).fill('10000');
  await expect(page.getByLabel(/^Quantity/)).toHaveAccessibleDescription('10000 units is 0.1 lots.');
  await page.getByRole('button', { name: 'Set opened time to now' }).click();
  await page.getByRole('button', { name: 'Set closed time to now' }).click();
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();

  const card = page.locator('.kairos-history-card').filter({ hasText: 'EUR/USD' });
  await expect(card.locator('[data-outcome="profit"]')).toContainText('50 USD');
  await expect(card).toContainText('Candles are shown for crypto trades only for now.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole('button', { name: 'Open the EUR/USD trade picture' }).click();
  const dialog = page.getByRole('dialog', { name: 'EUR/USD trade' });
  await expect(dialog.locator('.kairos-trade-picture__title')).toHaveText('EUR/USD · Long · Closed');
  await expect(dialog.locator('[data-info="size"] dd')).toHaveText('10000 units (0.1 lots)');
  await expect(dialog.locator('[data-info="pips"] dd')).toHaveText('+50 pips');
  await expect(dialog.locator('[data-info="pip-value"] dd')).toHaveText('1 USD');
  expect(marketRequests).toEqual([]);
  await dialog.getByRole('button', { name: 'Close' }).click();

  await card.getByRole('link', { name: 'View trade' }).click();
  await expect(page).toHaveURL(/\/analysis\?trade=/);
  await expect(page.getByRole('heading', { name: 'Your trade' })).toBeVisible();
  await expect(page.getByText(/The market chart has crypto markets from Binance only for now\./)).toBeVisible();
  const result = page.getByRole('region', { name: 'Recorded result' });
  await expect(result).toContainText('Result before fees');
  await expect(result).toContainText('50 USD');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('(m) Stocks: an AAPL trade in shares, its picture without crypto candles, Analysis and Replay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  await page.goto('/journal');
  const marketRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.hostname === 'data-api.binance.vision' && (url.pathname === '/api/v3/klines' || url.pathname === '/api/v3/exchangeInfo')) marketRequests.push(url.pathname);
  });

  await page.getByRole('button', { name: 'Quick log' }).click();
  await page.getByLabel(/^Market/).selectOption('stock');
  await page.getByLabel(/^Symbol/).fill('aapl');
  await expect(page.getByText(/AAPL: every price is the price of one share/)).toBeVisible();
  await expect(page.getByText(/Kairos never guesses a stock's currency from its ticker/)).toBeVisible();
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Entry price/).fill('187.5');
  await page.getByLabel(/^Exit price/).fill('190');
  await page.getByLabel(/^Quantity/).fill('10');
  await expect(page.getByLabel(/^Quantity/)).toHaveAccessibleDescription('Number of shares, such as 10. Parts of a share, such as 0.5, are fine.');
  await page.getByRole('button', { name: 'Set opened time to now' }).click();
  await page.getByRole('button', { name: 'Set closed time to now' }).click();
  await page.getByLabel('Currency code').fill('USD');
  await expect(page.getByText('Your prices and your result are in USD. Kairos never converts them.')).toBeVisible();
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();

  const card = page.locator('.kairos-history-card').filter({ hasText: 'AAPL' });
  await expect(card.locator('[data-outcome="profit"]')).toContainText('25 USD');
  await expect(card).toContainText('Candles are shown for crypto trades only for now.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole('button', { name: 'Open the AAPL trade picture' }).click();
  const dialog = page.getByRole('dialog', { name: 'AAPL trade' });
  await expect(dialog.locator('.kairos-trade-picture__title')).toHaveText('AAPL · Long · Closed');
  await expect(dialog.locator('[data-info="size"] dd')).toHaveText('10 shares');
  await expect(dialog.locator('[data-info="per-share"] dd')).toHaveText('+2.5 USD before fees');
  expect(marketRequests).toEqual([]);
  await dialog.getByRole('button', { name: 'Close' }).click();

  await card.getByRole('link', { name: 'View trade' }).click();
  await expect(page).toHaveURL(/\/analysis\?trade=/);
  await expect(page.getByRole('heading', { name: 'Your trade' })).toBeVisible();
  await expect(page.getByText(/The market chart has crypto markets from Binance only for now\. Your stock trade is drawn in its picture above/)).toBeVisible();
  const result = page.getByRole('region', { name: 'Recorded result' });
  await expect(result).toContainText('Result before fees');
  await expect(result).toContainText('25 USD');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.goto('/practice');
  await page.getByRole('link', { name: 'Replay the past, one candle at a time' }).click();
  await expect(page.getByLabel(/^Market/)).toHaveAccessibleDescription('Replay has crypto markets from Binance only for now, such as BTCUSDT.');
  expect(errors).toEqual([]);
});
