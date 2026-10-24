import AxeBuilder from '@axe-core/playwright';
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

/** A fresh install opens the setup (T-053d, D222): `setup: 'show'` leaves it open, otherwise "Skip for now" is tapped. */
async function activate(page: Page, setup: 'skip' | 'show' = 'skip'): Promise<void> {
  await routeNetwork(page);
  await page.goto('/');
  await page.getByLabel('Invite code').fill('QA-INVITE-001');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.kairos-shell')).toBeVisible();
  if (setup === 'show') return;
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
}

test('(a) an invite code opens the app shell', async ({ page }) => {
  await activate(page);
});

test('(b) every route renders inside the phone width without page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  for (const path of ['/', '/journal', '/analysis', '/library', '/more', '/practice', '/goals', '/strategies', '/coach', '/practice/coach', '/patterns', '/practice/patterns', '/news-calendar', '/currency', '/settings', '/profile', '/backup', '/does-not-exist']) {
    await page.goto(path);
    await expect(page.locator('.kairos-shell'), path).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `${path} scrollWidth`).toBeLessThanOrEqual(390);
    if (path === '/settings') {
      const background = await page.locator('.kairos-settings-card').first().evaluate(element => getComputedStyle(element).backgroundColor);
      expect(background).not.toBe('rgba(0, 0, 0, 0)');
    }
    if (path === '/does-not-exist') await expect(page.getByRole('link', { name: 'Go to Home' })).toBeVisible();
    if (path === '/') await expect(page.getByText('Unavailable · Live prices', { exact: false })).toBeVisible({ timeout: 15_000 });
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
  // The saved message takes the focus the busy Save button gave up, never the page.
  await expect(page.locator('.kairos-journal__feedback--success')).toBeFocused();
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
      // The answered choices stay readable: not dimmed like a disabled button (T-054b fix r1).
      const opacities = await page.locator('.kairos-lesson-check button').evaluateAll(buttons => buttons.map(button => getComputedStyle(button).opacity));
      expect(opacities).toEqual(opacities.map(() => '1'));
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
  await expect(page.getByRole('heading', { name: 'No saved trades yet' })).toBeVisible();
  await expect(page.getByText('Your first saved trade will appear here.')).toBeVisible();
});

test('(h) Replay: a practice trade on past prices, judged candle by candle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  const replayStart = Date.parse('2024-03-01T04:00:00.000Z'); // 12:00 in Asia/Manila, the project's time zone (playwright.config.ts)
  const cors = { 'Access-Control-Allow-Origin': '*' };
  // The QA build asks the Kairos server (VITE_KAIROS_API_URL), so the market list and candles come in its answer shape.
  const serverAnswer = (data: unknown) => JSON.stringify({ apiVersion: 1, ok: true, data });
  await page.route(url => url.hostname === 'api.qa.invalid' && url.pathname.startsWith('/market/'), async route => {
    const url = new URL(route.request().url());
    const fetchedAt = new Date().toISOString();
    if (url.pathname === '/market/symbols') return route.fulfill({ headers: cors, contentType: 'application/json', body: serverAnswer({ source: 'binance-spot', fetchedAt, markets: [{ symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', tickSize: '0.01', stepSize: '0.00001' }], leftOut: 0 }) });
    if (url.pathname !== '/market/candles' || url.searchParams.get('interval') !== '1h') return route.abort();
    const hour = 3_600_000, from = Number(url.searchParams.get('start')), to = Number(url.searchParams.get('end')), limit = Number(url.searchParams.get('limit'));
    const candles: unknown[] = [];
    for (let openMs = from; openMs <= to && candles.length < limit; openMs += hour) {
      const k = (openMs - replayStart) / hour;
      const [open, high, low, close] = k < 0 ? [100, 101, 99, 100] : [100 + k, 101.5 + k, 99.5 + k, 101 + k];
      candles.push({ openTime: new Date(openMs).toISOString(), closeTime: new Date(openMs + hour - 1).toISOString(), open: String(open), high: String(high), low: String(low), close: String(close), volume: '1' });
    }
    return route.fulfill({ headers: cors, contentType: 'application/json', body: serverAnswer({ source: { provider: 'binance', market: 'spot', symbol: 'BTCUSDT' }, backup: null, interval: '1h', fetchedAt, candles, next: null }) });
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
  await expect(page.getByRole('heading', { name: 'No saved trades yet' })).toBeVisible();
  await expect(page.getByText('Your first saved trade will appear here.')).toBeVisible();
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
  await page.goto('/analysis');
  await expect(page.getByText('Time zone: Asia/Manila')).toBeVisible();
  await page.goto('/journal');
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
  await page.goto('/analysis');
  await expect(page.getByText('Time zone: Asia/Manila')).toBeVisible();
  await page.goto('/journal');

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

  // T-053c (D220): Patterns is a part of Analysis.
  await page.goto('/analysis');
  await page.getByRole('group', { name: 'Analysis view' }).getByRole('button', { name: 'Patterns' }).click();
  await expect(page).toHaveURL(/\/analysis\?view=patterns$/);
  await expect(page.getByRole('heading', { name: 'Patterns', level: 2 })).toBeVisible();
  const overall = page.getByRole('region', { name: 'All your trades' });
  await expect(overall).toContainText('1 trade.');
  await expect(overall).toContainText('Not enough trades with a result yet (1 of 10).');
  for (const title of ['Keeping your plan', 'After a win or a loss', 'By strategy', 'By day of the week', 'By time of day', 'Long or short']) {
    await expect(page.getByRole('heading', { name: title, level: 3 })).toBeVisible();
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

test('(l) Forex: a EUR/USD trade in units, its picture asking only the Kairos server, and Analysis', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  // A Kairos server without the OANDA token yet (O4a): forex candles are not set up; (ac) has them.
  await page.route(url => url.hostname === 'api.qa.invalid' && url.pathname.startsWith('/market/'), route => route.fulfill({
    status: 503, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({ apiVersion: 1, ok: false, error: 'unavailable', reason: 'not-set-up', retryAfter: null }),
  }));
  await page.goto('/journal');
  const marketRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.hostname === 'data-api.binance.vision' && (url.pathname === '/api/v3/klines' || url.pathname === '/api/v3/exchangeInfo')) marketRequests.push(url.pathname);
    if (url.hostname === 'api.qa.invalid' && url.pathname.startsWith('/market/')) marketRequests.push(url.pathname);
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
  // The picture asks for candles once it is on screen.
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText("Candles: OANDA isn't connected to the Kairos server yet.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole('button', { name: 'Open the EUR/USD trade picture' }).click();
  const dialog = page.getByRole('dialog', { name: 'EUR/USD trade' });
  await expect(dialog.locator('.kairos-trade-picture__title')).toHaveText('EUR/USD · Long · Closed');
  await expect(dialog.locator('[data-info="size"] dd')).toHaveText('10000 units (0.1 lots)');
  await expect(dialog.locator('[data-info="pips"] dd')).toHaveText('+50 pips');
  await expect(dialog.locator('[data-info="pip-value"] dd')).toHaveText('1 USD');
  // Only the server's candles, never Binance or the market list.
  expect([...new Set(marketRequests)]).toEqual(['/market/candles']);
  await dialog.getByRole('button', { name: 'Close' }).click();

  await card.getByRole('link', { name: 'View trade' }).click();
  await expect(page).toHaveURL(/\/analysis\?trade=/);
  await expect(page.getByRole('heading', { name: 'Your trade' })).toBeVisible();
  // The pair's own chart, not ready on a server without the token.
  await expect(page.getByText('OANDA · EUR/USD · mid prices')).toBeVisible();
  await expect(page.locator('[data-live-candle-status="unavailable"]')).toContainText("Candles: OANDA isn't connected to the Kairos server yet.");
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
    if (url.hostname === 'api.qa.invalid' && url.pathname.startsWith('/market/')) marketRequests.push(url.pathname);
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
  await expect(page.getByText('Your prices and your result are in USD. Kairos never changes them; only your totals can show them in your home currency.')).toBeVisible();
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();

  const card = page.locator('.kairos-history-card').filter({ hasText: 'AAPL' });
  await expect(card.locator('[data-outcome="profit"]')).toContainText('25 USD');
  await expect(card).toContainText('Candles are shown for crypto and forex trades for now.');
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
  await expect(page.getByText(/The market chart has crypto and forex markets for now\. Your stock trade is drawn in its picture above/)).toBeVisible();
  const result = page.getByRole('region', { name: 'Recorded result' });
  await expect(result).toContainText('Result before fees');
  await expect(result).toContainText('25 USD');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.goto('/practice');
  await page.getByRole('link', { name: 'Replay the past, one candle at a time' }).click();
  await expect(page.getByLabel(/^Market/)).toHaveAccessibleDescription('Replay has crypto markets from Binance and forex and metals from OANDA, such as BTCUSDT or EUR/USD.');
  expect(errors).toEqual([]);
});

test('(n) Currency: totals in your currency, with the bank\'s rates and a rate you type', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  const bankRequests: string[] = [];
  let bankOnline = true;
  const BANK_RATES: Record<string, string> = { GBP: '0.8588', USD: '1.146' };
  await page.route(url => url.hostname === 'data-api.ecb.europa.eu', async route => {
    const url = new URL(route.request().url());
    bankRequests.push(`${url.pathname}${url.search}`);
    if (!bankOnline) return route.abort('internetdisconnected');
    const currencies = url.pathname.split('/')[4].split('.')[1].split('+');
    const start = url.searchParams.get('startPeriod')!, end = url.searchParams.get('endPeriod')!;
    const lines = ['KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE'];
    for (let time = Date.parse(`${start}T00:00:00Z`); new Date(time).toISOString().slice(0, 10) <= end; time += 86_400_000) {
      const day = new Date(time).toISOString().slice(0, 10);
      for (const currency of currencies) if (BANK_RATES[currency]) lines.push(`EXR.D.${currency}.EUR.SP00.A,D,${currency},EUR,SP00,A,${day},${BANK_RATES[currency]}`);
    }
    return route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: lines.join('\n') });
  });

  await page.goto('/analysis');
  await expect(page.getByText('Time zone: Asia/Manila')).toBeVisible();
  await page.goto('/journal');
  const quickLog = async (symbol: string, side: 'long' | 'short', entry: string, exit: string, quantity: string, currency: string) => {
    await page.getByRole('button', { name: 'Quick log' }).click();
    await page.getByLabel(/^Market/).selectOption('stock');
    await page.getByLabel(/^Symbol/).fill(symbol);
    await page.getByLabel(/^Direction/).selectOption(side);
    await page.getByLabel(/^Entry price/).fill(entry);
    await page.getByLabel(/^Exit price/).fill(exit);
    await page.getByLabel(/^Quantity/).fill(quantity);
    await page.getByRole('button', { name: 'Set opened time to now' }).click();
    await page.getByRole('button', { name: 'Set closed time to now' }).click();
    await page.getByLabel('Currency code').fill(currency);
    await page.getByRole('button', { name: 'Save trade' }).click();
    await expect(page.getByText('Trade saved to your journal.')).toBeVisible();
  };
  await quickLog('vod.l', 'long', '70', '75', '1000', 'GBX');
  await quickLog('aapl', 'long', '187.5', '190', '10', 'USD');

  await page.goto('/more');
  await page.getByRole('link', { name: 'Currency', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your currency' })).toBeVisible();
  await page.getByLabel('Show my totals in').selectOption('EUR');
  await page.getByRole('button', { name: 'Save my currency' }).click();
  await expect(page.getByText('Saved. Your totals are shown in EUR (Euro).')).toBeVisible();
  const needed = page.getByRole('region', { name: 'Rates you still need' });
  await expect(needed).toContainText('GBP to EUR');
  await expect(needed).toContainText('USD to EUR');
  await needed.getByRole('button', { name: 'Get rates from the European Central Bank' }).click();
  await expect(page.getByText('Saved 2 rates from the European Central Bank.')).toBeVisible();
  await expect(needed).toContainText('No rates missing: every trade with a result and a currency counts in EUR.');
  expect(bankRequests).toHaveLength(1);
  expect(bankRequests[0]).toContain('/service/data/EXR/D.GBP+USD.EUR.SP00.A');
  const saved = page.getByRole('region', { name: 'Your saved rates' });
  await expect(saved).toContainText('1 EUR = 0.8588 GBP');
  await expect(saved).toContainText('1 EUR = 1.146 USD');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.goto('/analysis');
  const results = page.getByRole('region', { name: 'Your results' });
  await expect(results).toContainText('Totals in EUR. 2 trades in other currencies were converted to EUR.');
  const today = page.locator('td[data-day-today] button');
  await expect(today).toHaveAttribute('aria-label', /Profit, 80\.04 EUR, today, 2 trades/);
  await today.click();
  const dayTrades = page.locator('.kairos-results-day-trades');
  await expect(dayTrades).toContainText('In EUR: 58.22');
  await expect(dayTrades).toContainText('In EUR: 21.82');

  bankOnline = false;
  await page.goto('/journal');
  await quickLog('7203.t', 'short', '2500', '2487.5', '100', 'JPY');
  await page.goto('/analysis');
  await expect(results).toContainText('Totals in EUR. 1 trade still needs an exchange rate');
  await results.getByRole('link', { name: 'Add the missing rates' }).click();
  await expect(page).toHaveURL(/\/currency$/);
  await expect(needed).toContainText('JPY to EUR');
  await needed.getByRole('button', { name: 'Get rates from the European Central Bank' }).click();
  await expect(needed.getByRole('alert')).toHaveText('Exchange rates are unavailable right now. Check your connection, then try again.');
  await expect(needed.getByRole('button', { name: 'Try again' })).toBeVisible();
  await page.getByLabel(/^1 JPY in EUR on /).fill('0.0055');
  await page.getByRole('button', { name: /^Save rate for JPY to EUR/ }).click();
  await expect(page.getByText(/^Saved your rate: 1 JPY = 0\.0055 EUR/)).toBeVisible();
  await expect(needed).toContainText('No rates missing');

  await page.goto('/analysis');
  await expect(results).toContainText('Totals in EUR. 3 trades in other currencies were converted to EUR.');
  await expect(today).toHaveAttribute('aria-label', /86\.92 EUR, today, 3 trades/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('(o) Online services: Profile checks the Kairos server only on a tap', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  const requests: { url: string; device: string | undefined }[] = [];
  let serverOnline = false;
  // Home asks the server for market data after activation; only the online services check is counted here.
  await page.route(url => url.hostname === 'api.qa.invalid' && !url.pathname.startsWith('/market/'), async route => {
    requests.push({ url: route.request().url(), device: route.request().headers()['x-kairos-device'] });
    if (!serverOnline) return route.abort('internetdisconnected');
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ apiVersion: 1, ok: true, data: { service: 'kairos-api', serverTime: new Date().toISOString(), device: 'recognised', checks: { deviceKey: 'ready', cache: 'ready', limits: 'ready' } } }) });
  });
  await page.goto('/profile');
  await expect(page.getByRole('button', { name: 'Check online services' })).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Check online services' }).click();
  await expect(page.locator('[data-online-services="unavailable"]')).toContainText('Unavailable · Online services: Kairos could not reach its server. Check your connection, then try again.');
  serverOnline = true;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Online services are working. This device is recognised.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check again' })).toBeFocused();
  expect(requests.map(request => request.url)).toEqual(['https://api.qa.invalid/health', 'https://api.qa.invalid/health']);
  expect(requests[1].device).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  expect(errors).toEqual([]);
});

test('(p) News: official news from the Kairos server, then offline, then on the trade it was near', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  const newsCalls: { path: string; device: string | undefined }[] = []; let serverUp = false; let cpiAt = '';
  await page.route(url => url.hostname === 'api.qa.invalid' && url.pathname.startsWith('/news/'), async route => {
    const url = new URL(route.request().url());
    newsCalls.push({ path: `${url.pathname}${url.search}`, device: route.request().headers()['x-kairos-device'] });
    if (!serverUp) return route.abort('internetdisconnected');
    const [, , kind, source] = url.pathname.split('/'); const fetchedAt = new Date().toISOString();
    const data = kind === 'calendar'
      ? { source, fetchedAt, covers: { from: new Date(Date.now() - 3 * 86_400_000).toISOString(), to: new Date(Date.now() + 30 * 86_400_000).toISOString() }, events: source === 'bls' ? [{ key: '0123456789abcdef', title: 'Consumer Price Index', startsAt: cpiAt }] : [], leftOut: 0 }
      : { source, fetchedAt, items: source === 'yahoo' ? [{ title: 'Stocks rise as inflation cools', url: 'https://finance.yahoo.com/news/stocks-rise-inflation-cools-000000000.html', publishedAt: fetchedAt, publisher: 'Reuters' }] : [], leftOut: 0 };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ apiVersion: 1, ok: true, data }) });
  });

  await page.goto('/analysis');
  await expect(page.getByText('Time zone: Asia/Manila')).toBeVisible();
  await page.goto('/journal');
  await page.getByRole('button', { name: 'Quick log' }).click();
  await page.getByLabel(/^Market/).selectOption('stock');
  await page.getByLabel(/^Symbol/).fill('aapl');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Entry price/).fill('187.5');
  await page.getByLabel(/^Exit price/).fill('190');
  await page.getByLabel(/^Quantity/).fill('10');
  await page.getByRole('button', { name: 'Set opened time to now' }).click();
  await page.getByRole('button', { name: 'Set closed time to now' }).click();
  await page.getByLabel('Currency code').fill('USD');
  const opened = await page.locator('input[name="openedAt"]').inputValue();
  cpiAt = await page.evaluate(value => new Date(new Date(value).getTime() - 12 * 60_000).toISOString(), opened);
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();

  await page.goto('/more');
  await page.getByRole('link', { name: 'News calendar' }).click();
  await expect(page.getByRole('heading', { name: 'News calendar', level: 1 })).toBeVisible();
  const unavailable = 'Unavailable · News: Kairos could not reach its server. Check your connection, then try again.';
  await expect(page.locator('.kairos-unavailable')).toContainText(unavailable);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

  serverUp = true;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText(/^Updated /)).toBeVisible();
  // A run in the first 12 minutes of a Monday in Manila puts the CPI in the week before.
  const cpiLastWeek = await page.evaluate(([cpi, now]) => {
    const day = (instant: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short' }).format(new Date(now));
    return weekday === 'Mon' && day(cpi) !== day(now);
  }, [cpiAt, new Date().toISOString()]);
  if (cpiLastWeek) await page.getByRole('button', { name: 'Earlier week' }).click();
  await expect(page.getByText('US inflation (CPI)').first()).toBeVisible();
  await expect(page.getByText("USD · Big news (Kairos's rating)").first()).toBeVisible();
  await expect(page.getByText('From U.S. Bureau of Labor Statistics: Consumer Price Index')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Stocks rise as inflation cools' })).toHaveAttribute('href', /^https:\/\/finance\.yahoo\.com\//);
  const paths = newsCalls.map(call => call.path);
  expect(paths.filter(path => path.includes('?'))).toEqual([]);
  expect(paths).toEqual(expect.arrayContaining(['/news/calendar/bls', '/news/headlines/yahoo']));
  for (const call of newsCalls) expect(call.device).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

  serverUp = false;
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.locator('.kairos-unavailable')).toContainText(unavailable);
  await expect(page.getByText(/^Showing news saved /)).toBeVisible();
  await expect(page.getByText('US inflation (CPI)').first()).toBeVisible();
  const localCpi = await page.evaluate(value => {
    const date = new Date(value); const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }, cpiAt);
  await page.getByLabel(/^Name/).fill('ECB President speaks');
  await page.getByLabel(/^Date and time/).fill(localCpi);
  await page.getByLabel(/^Currency \(optional\)/).fill('eur');
  await page.getByRole('radio', { name: 'Medium news', exact: true }).check();
  await page.getByRole('button', { name: 'Save news' }).click();
  await expect(page.getByText(/^Saved: ECB President speaks, /)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.context().setOffline(false);

  await page.goto('/journal');
  const card = page.locator('.kairos-history-card').filter({ hasText: 'AAPL' });
  await expect(card).toContainText('Big news near this trade');
  await expect(card).toContainText("US inflation (CPI): scheduled 12 minutes before this trade opened. Source: U.S. Bureau of Labor Statistics. Big news by Kairos's rating.");
  await expect(card).not.toContainText('ECB President speaks');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('(q) Market data through the Kairos server: sources on the pictures, the real reason, a quiet retry, and Home', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const serverAnswer = (data: unknown) => JSON.stringify({ apiVersion: 1, ok: true, data });
  const minute = 60_000;
  const intervalMs: Record<string, number> = { '1m': minute, '3m': 3 * minute, '5m': 5 * minute, '15m': 15 * minute, '30m': 30 * minute, '1h': 60 * minute, '2h': 120 * minute, '4h': 240 * minute, '6h': 360 * minute, '8h': 480 * minute, '12h': 720 * minute, '1d': 1_440 * minute };
  const candleCalls: string[] = [];
  let busyOnce = true;
  let offline = false; // page.route still answers while the context is offline, so the handler drops requests itself
  // The QA build asks the Kairos server (VITE_KAIROS_API_URL); every answer uses the server's exact shapes.
  await page.route(url => url.hostname === 'api.qa.invalid' && url.pathname.startsWith('/market/'), async route => {
    if (offline) return route.abort('internetdisconnected');
    const url = new URL(route.request().url());
    const fetchedAt = new Date().toISOString();
    if (url.pathname === '/market/symbols') {
      return route.fulfill({ headers: cors, contentType: 'application/json', body: serverAnswer({ source: 'binance-spot', fetchedAt, leftOut: 0, markets: [
        { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', tickSize: '0.01', stepSize: '0.00001' },
        { symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT', tickSize: '0.01', stepSize: '0.0001' },
      ] }) });
    }
    if (url.pathname === '/market/tickers') {
      const now = Date.now();
      const tickers = (url.searchParams.get('symbols') ?? '').split(',').map((symbol, index) => ({
        symbol, lastPrice: index === 0 ? '61000' : '2450', openPrice: index === 0 ? '60000' : '2500', highPrice: index === 0 ? '61500' : '2520', lowPrice: index === 0 ? '59800' : '2440',
        volume: '1000', quoteVolume: index === 0 ? '61000000' : '2450000', openTime: new Date(now - 86_400_000).toISOString(), closeTime: new Date(now).toISOString(),
      }));
      return route.fulfill({ headers: cors, contentType: 'application/json', body: serverAnswer({ source: 'binance-spot', fetchedAt, tickers }) });
    }
    if (url.pathname !== '/market/candles') return route.abort();
    const market = url.searchParams.get('market'), symbol = url.searchParams.get('symbol') ?? '', interval = url.searchParams.get('interval') ?? '';
    candleCalls.push(`${market} ${symbol}`);
    if (symbol === 'ETHUSDT' && busyOnce) {
      busyOnce = false;
      return route.fulfill({ status: 503, headers: { ...cors, 'Retry-After': '60' }, contentType: 'application/json', body: JSON.stringify({ apiVersion: 1, ok: false, error: 'unavailable', reason: 'source-busy', retryAfter: 60 }) });
    }
    const step = intervalMs[interval];
    if (step === undefined) return route.abort();
    const limit = Number(url.searchParams.get('limit'));
    const end = Math.min(Number(url.searchParams.get('end') ?? Date.now()), Date.now());
    const start = Number(url.searchParams.get('start') ?? end - limit * step);
    const candles: unknown[] = [];
    for (let openMs = start; openMs <= end && candles.length < limit; openMs += step) {
      const k = candles.length % 7;
      candles.push({ openTime: new Date(openMs).toISOString(), closeTime: new Date(openMs + step - 1).toISOString(), open: String(100 + k), high: String(102 + k), low: String(99 + k), close: String(101 + k), volume: '3' });
    }
    const futures = market === 'binance-usdm';
    const source = futures ? { provider: 'okx', market: 'perpetual-swap', symbol: `${url.searchParams.get('base')}-${url.searchParams.get('quote')}-SWAP` } : { provider: 'binance', market: 'spot', symbol };
    return route.fulfill({ headers: cors, contentType: 'application/json', body: serverAnswer({ source, backup: futures ? 'refused' : null, interval, fetchedAt, candles, next: null }) });
  });

  await page.goto('/analysis');
  await expect(page.getByText('Time zone: Asia/Manila')).toBeVisible();
  await page.goto('/journal');
  const quickLog = async (symbol: string, when?: { opened: string; closed: string }) => {
    await page.getByRole('button', { name: 'Quick log' }).click();
    await page.getByLabel(/^Market/).selectOption('crypto');
    await page.getByLabel(/^Symbol/).fill(symbol);
    await page.getByLabel(/^Direction/).selectOption('long');
    await page.getByLabel(/^Entry price/).fill('100');
    await page.getByLabel(/^Exit price/).fill('104');
    await page.getByLabel(/^Quantity/).fill('1');
    if (when === undefined) {
      await page.getByRole('button', { name: 'Set opened time to now' }).click();
      await page.getByRole('button', { name: 'Set closed time to now' }).click();
    } else {
      await page.locator('input[name="openedAt"]').fill(when.opened);
      await page.locator('input[name="closedAt"]').fill(when.closed);
    }
    await page.getByLabel('Currency code').fill('USDT');
    await page.getByRole('button', { name: 'Save trade' }).click();
    await expect(page.getByText('Trade saved to your journal.')).toBeVisible();
  };
  const openPicture = async (symbol: string) => {
    await page.getByRole('button', { name: `Open the ${symbol} trade picture` }).first().click();
    const dialog = page.getByRole('dialog', { name: `${symbol} trade` });
    await expect(dialog).toBeVisible();
    return dialog;
  };
  const closePicture = async () => {
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  };

  await quickLog('BTC/USDT');
  let dialog = await openPicture('BTC/USDT');
  await expect(dialog.locator('.kairos-trade-picture__source')).toHaveText('Candles: Binance Spot · BTC/USDT');
  await closePicture();

  await quickLog('BTCUSDT.P');
  dialog = await openPicture('BTCUSDT.P');
  await expect(dialog.locator('.kairos-trade-picture__source')).toHaveText("Candles: OKX Futures · BTC/USDT · Binance isn't available in your region");
  await closePicture();
  expect(candleCalls).toContain('binance-usdm BTCUSDT');

  await quickLog('ETH/USDT');
  dialog = await openPicture('ETH/USDT');
  await expect(dialog.locator('.kairos-unavailable')).toContainText('too many requests');
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(dialog.locator('.kairos-trade-picture__source')).toHaveText('Candles: Binance Spot · ETH/USDT');
  await closePicture();

  offline = true;
  await page.context().setOffline(true);
  // Another day, so no copy of an earlier answer can stand in for the network.
  await quickLog('ETHUSDT', { opened: '2026-09-20T09:00', closed: '2026-09-20T10:00' });
  dialog = await openPicture('ETHUSDT');
  await expect(dialog.locator('.kairos-unavailable')).toContainText("you're offline");
  offline = false;
  await page.context().setOffline(false);
  // No tap: the picture asks again by itself when the connection comes back.
  await expect(dialog.locator('.kairos-trade-picture__source')).toHaveText('Candles: Binance Spot · ETH/USDT');
  await closePicture();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.goto('/');
  await expect(page.locator('.kairos-glass-bubble[data-identity="BTC"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.kairos-glass-bubble[data-identity="ETH"]')).toBeVisible();
  await expect(page.getByText('Unavailable · Live prices', { exact: false })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('(r) Your results fetch a missing bank rate on their own', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  const bankRequests: string[] = [];
  let bankOnline = true;
  const BANK_RATES: Record<string, string> = { USD: '1.146', JPY: '162.5' };
  await page.route(url => url.hostname === 'data-api.ecb.europa.eu', async route => {
    const url = new URL(route.request().url());
    bankRequests.push(`${url.pathname}${url.search}`);
    if (!bankOnline) return route.abort('internetdisconnected');
    const currencies = url.pathname.split('/')[4].split('.')[1].split('+');
    const start = url.searchParams.get('startPeriod')!, end = url.searchParams.get('endPeriod')!;
    const lines = ['KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE'];
    for (let time = Date.parse(`${start}T00:00:00Z`); new Date(time).toISOString().slice(0, 10) <= end; time += 86_400_000) {
      const day = new Date(time).toISOString().slice(0, 10);
      for (const currency of currencies) if (BANK_RATES[currency]) lines.push(`EXR.D.${currency}.EUR.SP00.A,D,${currency},EUR,SP00,A,${day},${BANK_RATES[currency]}`);
    }
    return route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: lines.join('\n') });
  });

  await page.goto('/analysis');
  await expect(page.getByText('Time zone: Asia/Manila')).toBeVisible();
  await page.goto('/currency');
  await page.getByLabel('Show my totals in').selectOption('EUR');
  await page.getByRole('button', { name: 'Save my currency' }).click();
  await expect(page.getByText('Saved. Your totals are shown in EUR (Euro).')).toBeVisible();

  await page.goto('/journal');
  const quickLog = async (symbol: string, entry: string, exit: string, quantity: string, currency: string) => {
    await page.getByRole('button', { name: 'Quick log' }).click();
    await page.getByLabel(/^Market/).selectOption('stock');
    await page.getByLabel(/^Symbol/).fill(symbol);
    await page.getByLabel(/^Direction/).selectOption('long');
    await page.getByLabel(/^Entry price/).fill(entry);
    await page.getByLabel(/^Exit price/).fill(exit);
    await page.getByLabel(/^Quantity/).fill(quantity);
    await page.getByRole('button', { name: 'Set opened time to now' }).click();
    await page.getByRole('button', { name: 'Set closed time to now' }).click();
    await page.getByLabel('Currency code').fill(currency);
    await page.getByRole('button', { name: 'Save trade' }).click();
    await expect(page.getByText('Trade saved to your journal.')).toBeVisible();
  };
  await quickLog('aapl', '187.5', '190', '10', 'USD');

  await page.goto('/analysis');
  const results = page.getByRole('region', { name: 'Your results' });
  await expect(results).toContainText('Totals in EUR. 1 trade in another currency was converted to EUR.');
  const resultTile = results.locator('.kairos-stat').filter({ hasText: 'Result after fees' });
  await expect(resultTile).toContainText('EUR');
  await expect(resultTile).not.toContainText('Not available');
  expect(bankRequests).toHaveLength(1);
  await page.reload();
  await expect(results).toContainText('Totals in EUR. 1 trade in another currency was converted to EUR.');
  expect(bankRequests).toHaveLength(1);

  bankOnline = false;
  await page.goto('/journal');
  await quickLog('7203.t', '2500', '2510', '100', 'JPY');
  await page.goto('/analysis');
  await expect(results.getByText('The missing exchange rates could not be fetched.', { exact: false })).toBeVisible();
  await expect(results).toContainText('Unavailable');
  bankOnline = true;
  await results.getByRole('button', { name: 'Try again' }).click();
  await expect(results.getByText('Got 1 exchange rate from the European Central Bank.')).toBeVisible();
  await expect(results.getByText('Unavailable', { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('(s) Your results: a large day and its week fit the calendar at phone width, in their own colours', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  await page.goto('/analysis');
  await expect(page.getByText('Time zone: Asia/Manila')).toBeVisible();
  await page.goto('/journal');
  await page.getByRole('button', { name: 'Quick log' }).click();
  await page.getByLabel(/^Symbol/).fill('BTCUSDT');
  await page.getByLabel(/^Market/).selectOption('crypto');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Entry price/).fill('100');
  await page.getByLabel(/^Exit price/).fill('123556');
  await page.getByLabel(/^Quantity/).fill('1');
  await page.getByRole('button', { name: 'Set opened time to now' }).click();
  await page.getByRole('button', { name: 'Set closed time to now' }).click();
  await page.getByLabel('Currency code').fill('USDT');
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();

  await page.goto('/analysis');
  const results = page.getByRole('region', { name: 'Your results' });
  const calendar = results.locator('.kairos-results-calendar');
  await expect(calendar.locator('[data-cell-amount]').first()).toHaveText('+123.5K');
  await expect(calendar.locator('.kairos-results-calendar__week [data-cell-amount]')).toHaveText('+123.5K');
  const fit = await calendar.evaluate(table => ({
    table: [table.scrollWidth, table.clientWidth],
    cells: [...table.querySelectorAll<HTMLElement>('[data-cell-amount]')].map(amount => [amount.scrollWidth, (amount.closest('button') as HTMLElement).clientWidth]),
    page: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
    background: getComputedStyle(table.querySelector('td > button')!).backgroundImage,
  }));
  expect(fit.table[0]).toBeLessThanOrEqual(fit.table[1]!);
  for (const [amount, button] of fit.cells) expect(amount).toBeLessThanOrEqual(button!);
  expect(fit.page[0]).toBeLessThanOrEqual(fit.page[1]!);
  // The day's colour is the cell's, not the field look Analysis gives other buttons.
  expect(fit.background).toBe('none');
  expect(errors).toEqual([]);
});

test('(t) Your results with trades, at phone width', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  await page.goto('/analysis');
  await expect(page.getByText('Time zone: Asia/Manila')).toBeVisible();
  await page.goto('/journal');
  for (const [symbol, exit] of [['BTCUSDT', '110'], ['BTCUSDT', '120'], ['BTCUSDT', '95'], ['ETHUSDT', '105'], ['ETHUSDT', '85']] as const) {
    await page.getByRole('button', { name: 'Quick log' }).click();
    await page.getByLabel(/^Symbol/).fill(symbol);
    await page.getByLabel(/^Market/).selectOption('crypto');
    await page.getByLabel(/^Direction/).selectOption('long');
    await page.getByLabel(/^Entry price/).fill('100');
    await page.getByLabel(/^Exit price/).fill(exit);
    await page.getByLabel(/^Quantity/).fill('1');
    await page.getByRole('button', { name: 'Set opened time to now' }).click();
    await page.getByRole('button', { name: 'Set closed time to now' }).click();
    await page.getByLabel('Currency code').fill('USDT');
    await page.getByRole('button', { name: 'Save trade' }).click();
    await expect(page.getByText('Trade saved to your journal.')).toBeVisible();
  }

  await page.goto('/analysis');
  const results = page.getByRole('region', { name: 'Your results' });
  await expect(results.locator('.kairos-stat').filter({ hasText: 'Result after fees' })).toContainText('+15 USDT');
  await expect(results.getByRole('region', { name: 'Your numbers' })).toContainText('Won 3 of 5');
  await expect(results.locator('.kairos-results-calendar [data-cell-amount]').first()).toBeVisible();
  await expect(results.getByRole('columnheader', { name: 'Week' })).toBeVisible();
  await expect(results.getByRole('heading', { name: /^Your total in / })).toBeVisible();
  const heatmap = results.getByRole('region', { name: 'When you trade' });
  await expect(heatmap.locator('td > button').first()).toBeVisible();
  const markets = results.getByRole('region', { name: 'Your markets' });
  await expect(markets.locator('.kairos-results-markets__tile')).toHaveCount(2);
  await expect(results.getByRole('region', { name: 'Your discipline' })).toBeVisible();

  await heatmap.locator('td > button').first().click();
  await expect(results.getByRole('heading', { name: /^Trades opened on / })).toBeVisible();
  await expect(results.locator('.kairos-results-day-trades li')).toHaveCount(5);
  await markets.locator('.kairos-results-markets__tile').first().click();
  await expect(results.getByRole('heading', { name: 'Trades in BTCUSDT' })).toBeVisible();
  await expect(results.locator('.kairos-results-day-trades li')).toHaveCount(3);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const axe = await new AxeBuilder({ page }).include('.kairos-results').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map(violation => `${violation.id}: ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
  expect(errors).toEqual([]);
});

test('(u) Share a trade as an image, and a planned trade drawn from now', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const serverAnswer = (data: unknown) => JSON.stringify({ apiVersion: 1, ok: true, data });
  const intervalMs: Record<string, number> = { '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000 };
  // The QA build asks the Kairos server for the market list and the candles (as (q) does).
  await page.route(url => url.hostname === 'api.qa.invalid' && url.pathname.startsWith('/market/'), async route => {
    const url = new URL(route.request().url());
    const fetchedAt = new Date().toISOString();
    if (url.pathname === '/market/symbols') {
      return route.fulfill({ headers: cors, contentType: 'application/json', body: serverAnswer({ source: 'binance-spot', fetchedAt, leftOut: 0, markets: [{ symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', tickSize: '0.01', stepSize: '0.00001' }] }) });
    }
    if (url.pathname !== '/market/candles') return route.abort();
    const interval = url.searchParams.get('interval') ?? '';
    const step = intervalMs[interval];
    if (step === undefined) return route.abort();
    const limit = Number(url.searchParams.get('limit'));
    const end = Math.min(Number(url.searchParams.get('end') ?? Date.now()), Date.now());
    const start = Number(url.searchParams.get('start') ?? end - limit * step);
    const candles: unknown[] = [];
    for (let openMs = Math.ceil(start / step) * step; openMs <= end && candles.length < limit; openMs += step) {
      const k = candles.length % 7;
      candles.push({ openTime: new Date(openMs).toISOString(), closeTime: new Date(openMs + step - 1).toISOString(), open: String(100 + k), high: String(102 + k), low: String(99 + k), close: String(101 + k), volume: '3' });
    }
    return route.fulfill({ headers: cors, contentType: 'application/json', body: serverAnswer({ source: { provider: 'binance', market: 'spot', symbol: 'BTCUSDT' }, backup: null, interval, fetchedAt, candles, next: null }) });
  });

  // A planned trade: entry, stop and target, no time of its own (D212).
  await page.goto('/journal');
  await page.getByLabel(/^Symbol/).fill('BTCUSDT');
  await page.getByLabel(/^Market/).selectOption('crypto');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Status/).selectOption('draft');
  await page.getByLabel('Currency code').fill('USDT');
  await page.getByText('Trade plan · Optional').click();
  await page.getByLabel('Planned entry').fill('103');
  await page.getByLabel('Planned stop').fill('98');
  await page.getByLabel('Planned target').fill('113');
  await page.getByLabel('Planned quantity').fill('2');
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();
  await page.getByRole('button', { name: 'Open the BTCUSDT trade picture' }).first().click();
  let dialog = page.getByRole('dialog', { name: 'BTCUSDT trade' });
  await expect(dialog.locator('.kairos-trade-picture__candle').first()).toBeVisible();
  await expect(dialog.locator('[data-box]')).toHaveCount(2);
  await expect(dialog.locator('[data-info="price-now"] dd')).toHaveText(/^\d+ USDT \(last candle, .+\)$/);
  await expect(dialog.locator('.kairos-trade-picture__candle-size')).toHaveText('15-minute candles');
  await expect(dialog.locator('.kairos-trade-picture__note')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).click();

  // A closed trade: its time axis, one candle looked at, and the share card in both shapes.
  await page.getByRole('button', { name: 'Quick log' }).click();
  await page.getByLabel(/^Market/).selectOption('crypto');
  await page.getByLabel(/^Symbol/).fill('BTC/USDT');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Entry price/).fill('100');
  await page.getByLabel(/^Exit price/).fill('104');
  await page.getByLabel(/^Quantity/).fill('1');
  const opened = new Date(Date.now() - 3 * 3_600_000), closed = new Date(Date.now() - 3_600_000);
  const local = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.locator('input[name="openedAt"]').fill(local(opened));
  await page.locator('input[name="closedAt"]').fill(local(closed));
  await page.getByLabel('Currency code').fill('USDT');
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();
  await page.getByRole('button', { name: 'Open the BTC/USDT trade picture' }).first().click();
  dialog = page.getByRole('dialog', { name: 'BTC/USDT trade' });
  await expect(dialog.locator('.kairos-trade-picture__candle').first()).toBeVisible();
  expect(await dialog.locator('[data-axis-tick]').count()).toBeGreaterThan(0);
  const slider = dialog.getByRole('slider', { name: 'Look at a candle' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('.kairos-trade-picture__readout')).toHaveText(/: open \d+, high \d+, low \d+, close \d+$/);

  const pngSize = async (shape: 'Tall' | 'Square') => {
    await dialog.getByRole('button', { name: shape }).click();
    await expect(dialog.locator(`img.kairos-trade-share__preview[data-shape="${shape.toLowerCase()}"]`)).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Share or download image' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^kairos-BTCUSDT-\d{4}-\d{2}-\d{2}\.png$/);
    const png = readFileSync((await download.path())!);
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };
  expect(await pngSize('Tall')).toEqual([1080, 1350]);
  expect(await pngSize('Square')).toEqual([1080, 1080]);
  await expect(dialog.getByRole('button', { name: 'Share or download image' })).toBeFocused();
  const preview = dialog.locator('img.kairos-trade-share__preview');
  await expect(preview).toHaveAttribute('alt', /\d USDT/);
  await dialog.getByRole('checkbox', { name: 'Hide money amounts' }).check();
  await expect(preview).not.toHaveAttribute('alt', /\d USDT/);
  await expect(preview).toHaveAttribute('alt', /^BTC\/USDT long, won/);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map(violation => `${violation.id}: ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
  expect(errors).toEqual([]);
});

test('(v) Where am I: back to your place, the tab you are in, and the top of a new page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  // A short window, so the Journal and the coach page are both taller than the view.
  await page.setViewportSize({ width: 390, height: 560 });
  await activate(page);
  await page.goto('/analysis');
  await expect(page.getByText('Time zone: Asia/Manila')).toBeVisible();
  await page.goto('/journal');
  const openCoach = page.getByRole('link', { name: 'Open your coach' });
  await expect(openCoach).toBeVisible();
  await openCoach.scrollIntoViewIfNeeded();
  const place = await page.evaluate(() => window.scrollY);
  expect(place).toBeGreaterThan(100);

  // Bringing a field above the view to the top puts it below the sticky header, never under it (Chromium centres a
  // focused field anyway; a jump to a part of the page, as the log address does, lines it up with the top).
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByLabel(/^Symbol/)).not.toBeInViewport();
  await page.getByLabel(/^Symbol/).evaluate(element => element.scrollIntoView({ block: 'start' }));
  const header = (await page.locator('.kairos-shell__header').boundingBox())!;
  expect((await page.getByLabel(/^Symbol/).boundingBox())!.y).toBeGreaterThanOrEqual(header.y + header.height);
  await openCoach.scrollIntoViewIfNeeded();
  const left = await page.evaluate(() => window.scrollY);

  // A new page opens at its top, with focus on its heading.
  await openCoach.click();
  const title = page.getByRole('heading', { level: 1, name: 'Your coach' });
  await expect(title).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(title).toBeFocused();
  expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual(header.y + header.height);
  // Coach belongs to Analysis (D220), so Analysis is marked as the part you are in.
  await expect(page.getByRole('link', { name: 'Analysis', exact: true })).toHaveAttribute('aria-current', 'true');

  // The skip link adds a "#" entry the browser names like the first screen; Back still names and opens the Journal (fix r1).
  await page.locator('.kairos-skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#kairos-main-content$/);
  // Back returns to the Journal, at the place you left it, and focus goes to its heading.
  await page.getByRole('button', { name: 'Back to Journal' }).click();
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Journal' })).toBeFocused();
  await expect(page.getByRole('heading', { level: 1, name: 'Journal' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(left - 2);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - left)).toBeLessThanOrEqual(2);

  // Opened directly, a page goes up to its parent.
  await page.goto('/goals');
  const up = page.getByRole('link', { name: 'Back to More' });
  await expect(up).toBeVisible();
  await expect(page.getByRole('link', { name: 'More', exact: true })).toHaveAttribute('aria-current', 'true');
  await up.click();
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'More', exact: true })).toHaveAttribute('aria-current', 'page');

  // On a wide screen, where the bottom bar is a side list, More is marked too.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/goals');
  const more = page.getByRole('link', { name: 'More', exact: true });
  await expect(more).toHaveClass(/kairos-shell__nav-link--active/);
  const background = (name: string) => page.getByRole('link', { name, exact: true }).evaluate(element => getComputedStyle(element).backgroundColor);
  expect(await background('More')).not.toBe(await background('Home'));
  expect(errors).toEqual([]);
});

test('(w) First run: the setup step by step, then the Journal; it can be opened again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  const axeOk = async (where: string) => {
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map(violation => `${where} ${violation.id}: ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  };
  const next = () => page.getByRole('button', { name: 'Next' }).click();
  const stepTitle = (name: string) => page.getByRole('heading', { level: 2, name });

  // A fresh install opens the setup in Home's place.
  await activate(page, 'show');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Set up Kairos' })).toBeVisible();
  await expect(stepTitle('Your time zone')).toBeVisible();
  await expect(page.getByText('Step 1 of 6')).toBeVisible();
  await expect(page.getByText(/time zone: Asia\/Manila/)).toBeVisible();
  await axeOk('step 1');
  await next();

  // The home currency starts on the browser region's currency.
  await expect(stepTitle('Your home currency')).toBeFocused();
  await expect(page.getByLabel('Home currency', { exact: true })).toHaveValue('USD');
  await expect(page.getByText("USD, from this phone's region")).toBeVisible();
  await axeOk('step 2');
  await next();

  await expect(stepTitle('What you trade')).toBeFocused();
  await next();
  await expect(page.getByText('Choose at least one market.')).toBeVisible();
  await page.getByLabel('Forex').check();
  await axeOk('step 3');
  await next();

  await expect(stepTitle('Your checklist')).toBeFocused();
  const steps = page.getByRole('group', { name: 'Before you trade: your steps' }).getByRole('checkbox');
  const kept = await steps.count();
  await steps.nth(0).uncheck();
  await steps.nth(1).uncheck();
  await axeOk('step 4');
  await next();

  await expect(stepTitle('Your first goal')).toBeFocused();
  await page.getByLabel('Trades a month').fill('20');
  await axeOk('step 5');
  await next();

  await expect(stepTitle("You're set")).toBeFocused();
  await axeOk('step 6');
  await page.getByRole('link', { name: 'Log your first trade' }).click();
  await expect(page).toHaveURL(/\/journal$/);
  // The trade form starts on the market chosen first.
  await expect(page.getByLabel(/^Market/)).toHaveValue('forex');

  // What was chosen is saved: the coach needs no time zone, the checklist lost two steps, the goal shows.
  await page.goto('/coach');
  await expect(page.getByText('Nothing to point out this month.')).toBeVisible();
  await page.goto('/analysis?view=discipline');
  await expect(page.getByRole('form', { name: 'Your checklist' }).getByRole('group', { name: 'Before you trade: your steps' }).getByRole('textbox')).toHaveCount(kept - 2);
  await expect(page.getByText(/Closed trades this month/)).toBeVisible();
  // Saving the checklist keeps focus on its button (T-053c fix r1: a disabled button lost it to the page).
  const saveChecklist = page.getByRole('button', { name: 'Save your checklist' });
  await saveChecklist.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Your checklist is saved.')).toBeVisible();
  await expect(saveChecklist).toBeFocused();

  // More › Set up Kairos opens it again at step 1, showing what is saved.
  await page.goto('/more');
  await page.getByRole('link', { name: 'Set up Kairos' }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(stepTitle('Your time zone')).toBeVisible();
  await next();
  await next();
  await expect(page.getByLabel('Forex')).toBeChecked();
  // Home opens Home now: the setup was finished. A cold start opens it on "Your Trades" for a forex trader at once,
  // never on Live Market first (T-053d fix r1): every view the dashboard control shows is noted from the first frame.
  await page.addInitScript(() => {
    const shown: string[] = [];
    (window as unknown as { kairosShownViews: string[] }).kairosShownViews = shown;
    new MutationObserver(() => {
      const pressed = document.querySelector('[role="group"][aria-label="Dashboard view"] button[aria-pressed="true"]')?.textContent ?? null;
      if (pressed !== null && shown.at(-1) !== pressed) shown.push(pressed);
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed'] });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Your Trades' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as unknown as { kairosShownViews: string[] }).kairosShownViews)).toEqual(['Your Trades']);
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

test('(w2) First run skipped: Home, and never the setup again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Dashboard view' })).toBeVisible();
  // Home's read answers within moments; the address must still be Home well after it (T-053d fix r1).
  const until = Date.now() + 2000;
  while (Date.now() < until) {
    expect(new URL(page.url()).pathname).toBe('/');
    await page.waitForTimeout(100);
  }
  expect(errors).toEqual([]);
});

test('(x) Log a trade from anywhere: "+ Log trade", the log address and Getting started', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  const axeOk = async (where: string) => {
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map(violation => `${where} ${violation.id}: ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  };
  const logTrade = page.getByRole('link', { name: 'Log trade' });
  const symbol = page.getByLabel(/^Symbol/);
  // Symbol has focus, and the form is in view: below the sticky header and above the button.
  const formReady = async () => {
    await expect(page).toHaveURL(/\/journal$/);
    await expect(symbol).toBeFocused();
    const header = (await page.locator('.kairos-shell__header').boundingBox())!;
    const field = (await symbol.boundingBox())!;
    const button = (await logTrade.boundingBox())!;
    expect(field.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(field.y + field.height).toBeLessThanOrEqual(button.y);
  };
  await activate(page);

  // A skipped setup still shows Getting started on Home, with the button.
  const gettingStarted = page.getByRole('region', { name: 'Getting started' });
  await expect(gettingStarted).toBeVisible();
  await expect(gettingStarted.getByText(/^\d of 6 done$/)).toBeVisible();
  await expect(gettingStarted.getByRole('link', { name: 'Your first trade' })).toBeVisible();
  await expect(logTrade).toBeVisible();
  await axeOk('Home');
  await logTrade.click();
  await formReady();
  await axeOk('Journal');
  // T-053e fix r1: the button is inside the page's landmark (axe's "region" rule, not in the WCAG tags above).
  const inLandmarks = async (where: string) => {
    const axe = await new AxeBuilder({ page }).withRules(['region']).analyze();
    expect(axe.violations.map(violation => `${where} ${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
  };
  await inLandmarks('Journal');
  // A part of the page brought into view at the bottom stops above the button.
  const save = page.getByRole('button', { name: 'Save trade' });
  await save.evaluate(element => element.scrollIntoView({ block: 'end' }));
  expect(((await save.boundingBox())!.y + (await save.boundingBox())!.height)).toBeLessThanOrEqual((await logTrade.boundingBox())!.y);
  // The update prompt (its markup as UpdatePrompt draws it; a waiting update cannot be made here) rises above the button.
  await page.evaluate(() => {
    const prompt = document.createElement('div');
    prompt.className = 'kairos-update-prompt';
    prompt.setAttribute('role', 'status');
    prompt.innerHTML = '<p>A new version is ready.</p><button type="button">Update</button>';
    document.querySelector('.kairos-shell')!.append(prompt);
  });
  const update = page.getByRole('button', { name: 'Update' });
  expect((await update.boundingBox())!.y + (await update.boundingBox())!.height).toBeLessThanOrEqual((await logTrade.boundingBox())!.y);
  await update.click({ trial: true });
  await page.evaluate(() => document.querySelector('.kairos-shell > .kairos-update-prompt')?.remove());

  await page.goto('/analysis');
  await expect(page.getByRole('heading', { level: 1, name: 'Analysis' })).toBeVisible();
  await inLandmarks('Analysis');
  await logTrade.click();
  await formReady();

  // A trade saved, then the Journal scrolled to its end: the button covers no card.
  await page.getByLabel(/^Market/).selectOption('crypto');
  await symbol.fill('BTCUSDT');
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
  await expect(page.locator('[data-outcome="profit"]').first()).toContainText('150 USDT');
  // The card's picture arrives after the save and the page grows, so the end is reached again until the page settles.
  const lastCardClear = async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    return page.evaluate(() => {
      const card = [...document.querySelectorAll('.kairos-history-card')].at(-1)!.getBoundingClientRect();
      const button = document.querySelector('.kairos-log-trade')!.getBoundingClientRect();
      return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1 && card.bottom <= button.top;
    });
  };
  await expect.poll(lastCardClear).toBe(true);
  await expect(symbol).not.toBeInViewport();
  // On the Journal the button brings the form back, without a step added to Back.
  await logTrade.click();
  await formReady();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Analysis' })).toBeVisible();

  // Opened directly (the app shortcut's address).
  await page.goto('/journal?log=1');
  await formReady();

  // Getting started ticks the first trade; the button is not on Practice.
  await page.goto('/');
  await expect(gettingStarted.getByText('Your first trade (done)')).toBeVisible();
  await expect(gettingStarted.getByRole('link', { name: 'Your first trade' })).toHaveCount(0);
  // Home's bubbles end above the button, with Getting started above them (at the page's end when they do not fit).
  await page.getByRole('button', { name: 'Your Trades' }).click();
  const fieldClear = async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    return page.evaluate(() => {
      const field = document.querySelector('.kairos-your-trades__field')?.getBoundingClientRect();
      const button = document.querySelector('.kairos-log-trade')?.getBoundingClientRect();
      return field !== undefined && button !== undefined && field.height >= 240 && field.bottom <= button.top;
    });
  };
  await expect.poll(fieldClear).toBe(true);
  await page.goto('/practice');
  await expect(page.getByRole('heading', { level: 1, name: 'Practice' })).toBeVisible();
  await expect(logTrade).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('(y) Back up when it is due: the reminder on Home and the Journal, "Back up now", and "Remind me"', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  const axeOk = async (where: string) => {
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map(violation => `${where} ${violation.id}: ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  };
  const reminder = page.getByRole('region', { name: 'Back up your journal' });
  await activate(page);
  // A fresh journal has nothing to lose: no reminder.
  await expect(page.getByRole('region', { name: 'Getting started' })).toBeVisible();
  await expect(reminder).toHaveCount(0);

  // One trade, never backed up: the reminder is on the Journal and on Home.
  await page.goto('/journal');
  await page.getByLabel(/^Symbol/).fill('BTCUSDT');
  await page.getByLabel(/^Market/).selectOption('crypto');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Status/).selectOption('open');
  await page.locator('#kairos-trade-opened-at').fill('2026-09-20T09:00');
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText(/BTCUSDT/).first()).toBeVisible();
  await page.reload();
  await expect(reminder).toBeVisible();
  await expect(reminder.getByText('No backup yet. Save a copy of your journal so you never lose it.')).toBeVisible();
  await page.goto('/');
  await expect(reminder).toBeVisible();
  await axeOk('Home with the reminder');

  // "Remind me: Never" keeps it away; "Every week" brings it back.
  await page.goto('/backup');
  await expect(page.getByRole('heading', { level: 1, name: 'Backup and restore' })).toBeVisible();
  await expect(page.getByText('No backup yet on this device.')).toBeVisible();
  await axeOk('Backup and restore');
  await page.getByLabel('How often').selectOption('never');
  await expect(page.getByText('Saved.')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Getting started' })).toBeVisible();
  await expect(reminder).toHaveCount(0);
  await page.goto('/backup');
  await page.getByLabel('How often').selectOption('7');
  await expect(page.getByText('Saved.')).toBeVisible();

  // "Back up now" on Home downloads a backup Kairos can read back; the reminder goes away.
  await page.goto('/');
  const [download] = await Promise.all([page.waitForEvent('download'), reminder.getByRole('button', { name: 'Back up now' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^kairos-backup-.*Z\.json$/);
  const backupPath = (await download.path())!;
  const saved = JSON.parse(readFileSync(backupPath, 'utf8')) as { formatName: string; payload: { trades: unknown[] } };
  expect(saved.formatName).toBe('kairos-full-backup');
  expect(saved.payload.trades).toHaveLength(1);
  await expect(reminder.getByText('Backup saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Getting started' })).toBeVisible();
  await expect(reminder).toHaveCount(0);
  await page.goto('/backup');
  await expect(page.getByText(/^Last backup today · /)).toBeVisible();

  // T-054a fix r1: a refused file leaves focus on its field; a button that can't be used looks it (aria-disabled, dimmed).
  // A tap on the field gives it focus before the phone's file picker opens.
  const restoreField = page.getByLabel('Backup file', { exact: true });
  await restoreField.focus();
  await restoreField.setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":true}') });
  await expect(page.getByRole('alert')).toContainText('That file is not a Kairos backup');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('kairos-backup-backup-file');
  await page.getByLabel('Backup file to import from').setInputFiles(backupPath);
  const add = page.getByRole('button', { name: 'Add these records' });
  await expect(add).toBeFocused();
  await expect(add).toHaveAttribute('aria-disabled', 'true');
  expect(await add.evaluate(element => getComputedStyle(element).opacity)).toBe('0.58');
  await page.getByRole('button', { name: 'Cancel' }).click();

  // T-054b: on a phone the share sheet takes the backup (stubbed here: Playwright has no share sheet); a closed sheet saves nothing.
  await page.addInitScript(() => {
    const kept: Array<[string, string]> = [];
    (window as unknown as { kairosShared: typeof kept }).kairosShared = kept;
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }: { files: File[] }) => {
      sessionStorage.setItem('kairos-qa-share-calls', String(Number(sessionStorage.getItem('kairos-qa-share-calls') ?? '0') + 1));
      if (sessionStorage.getItem('kairos-qa-share') === 'cancel') throw new DOMException('closed', 'AbortError');
      for (const shared of files) kept.push([shared.name, shared.type]);
    } });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect(page.getByText("Shared. Kairos can't see where you shared it; keep it somewhere you can find.")).toBeVisible();
  const shared = await page.evaluate(() => (window as unknown as { kairosShared: Array<[string, string]> }).kairosShared);
  expect(shared).toHaveLength(1);
  expect(shared[0]![0]).toMatch(/^kairos-backup-.*Z\.json$/);
  expect(shared[0]![1]).toBe('application/json');
  await page.evaluate(() => sessionStorage.setItem('kairos-qa-share', 'cancel'));
  await page.reload();
  const lastBefore = await page.getByText(/^Last backup today · /).textContent();
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('kairos-qa-share-calls'))).toBe('2');
  await expect(page.locator('[data-backup-export]')).toHaveAttribute('data-backup-export', 'idle');
  await expect(page.getByText(/^Backup saved:/)).toHaveCount(0);
  expect(await page.getByText(/^Last backup today · /).textContent()).toBe(lastBefore);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});


test('(z) Install help: the Home Screen guide on iPhone Safari, and "Not now" kept', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  // Only iPhone and iPad Safari have `navigator.standalone` (D228); here it says "not on the Home Screen".
  await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { configurable: true, value: false }); });
  await activate(page);
  const help = page.getByRole('region', { name: 'Add Kairos to your Home Screen' });
  await expect(help).toBeVisible();
  // Below Getting started.
  expect(await page.getByRole('region', { name: 'Getting started' }).evaluate((started, card) => (started.compareDocumentPosition(card!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0, await help.elementHandle())).toBe(true);
  const steps = help.getByRole('list', { name: 'How to add Kairos' }).getByRole('listitem');
  await expect(steps).toHaveText(['1Tap Share.', '2Choose "Add to Home Screen".', '3Tap "Add". Kairos is now on your Home Screen.']);
  for (const [index, icon] of ['share', 'plus', 'home'].entries()) await expect(steps.nth(index).locator(`svg[data-icon="${icon}"]`)).toBeVisible();
  await expect(help.getByRole('button', { name: 'Install' })).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map(violation => `${violation.id}: ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await help.getByRole('button', { name: 'Not now' }).click();
  await expect(help).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Live Market' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('group', { name: 'Dashboard view' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(help).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('(aa) Two tabs: a save shows in the other tab, and an update in another tab says Reload', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`tab 1 ${page.url()}: ${error.message}`));
  await activate(page);
  // The second tab of the same browser: same journal, same activation.
  const other = await context.newPage();
  other.on('pageerror', error => errors.push(`tab 2 ${other.url()}: ${error.message}`));
  await other.goto('/journal');
  await expect(other.getByRole('heading', { level: 1, name: 'Journal' })).toBeVisible();
  await expect(other.getByText('TWOTABS')).toHaveCount(0);

  await page.goto('/journal');
  await page.getByLabel(/^Symbol/).fill('TWOTABS');
  await page.getByLabel(/^Market/).selectOption('crypto');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Status/).selectOption('cancelled');
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('TWOTABS').first()).toBeVisible();
  // Tab 2 reads again without a reload.
  await expect(other.getByText('TWOTABS').first()).toBeVisible();
  await expect(other.getByRole('alert')).toHaveCount(0);

  // A newer Kairos opening the journal in another tab: tab 2 is told to reload.
  await page.evaluate(name => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 100_000);
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  }), 'kairos');
  const banner = other.getByRole('alert').filter({ hasText: 'Kairos was updated in another tab. Reload to keep saving.' });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Reload' })).toBeVisible();
  // Analysis's chart opens the journal again on each read (coming back to the tab, too); the note stays until Reload
  // (T-054d fix r1).
  await other.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Analysis' }).click();
  await other.getByRole('group', { name: 'Analysis view' }).getByRole('button', { name: 'Chart' }).click();
  await expect(other).toHaveURL(/view=chart/);
  await other.evaluate(() => window.dispatchEvent(new Event('focus')));
  await other.waitForTimeout(500);
  await expect(banner).toBeVisible();
  const axe = await new AxeBuilder({ page: other }).include('.kairos-database-status').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map(violation => violation.id)).toEqual([]);
  expect(await other.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('(ab) A crash: Reload, a copy of my data, and the error details', async ({ page }) => {
  // The clipboard as the page sees it; what it copied is kept for the test.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { sessionStorage.setItem('qa-copied', text); } } });
  });
  await activate(page);
  await page.goto('/journal');
  await page.getByLabel(/^Symbol/).fill('CRASHSAFE');
  await page.getByLabel(/^Market/).selectOption('crypto');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Status/).selectOption('cancelled');
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.locator('.kairos-journal__feedback--success')).toBeVisible();

  // The QA build's page that crashes on purpose.
  await page.goto('/qa/crash');
  const title = page.getByRole('heading', { level: 1, name: 'Kairos hit a problem' });
  await expect(title).toBeVisible();
  await expect(title).toBeFocused();
  await expect(page.getByText('Your journal is safe on this device. Reload to try again.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download a copy of my data' }).click()]);
  const saved = JSON.parse(readFileSync((await download.path())!, 'utf8')) as { formatName: string; payload: { trades: Array<{ symbol: string }> } };
  expect(saved.formatName).toBe('kairos-full-backup');
  expect(saved.payload.trades.map(trade => trade.symbol)).toEqual(['CRASHSAFE']);
  await expect(page.getByText(`Downloaded ${download.suggestedFilename()}.`)).toBeVisible();

  await page.getByRole('button', { name: 'Copy error details' }).click();
  await expect(page.getByText('Copied. This is the text:')).toBeVisible();
  // The trader sees exactly what was copied (T-054e fix r1).
  expect(await page.getByRole('textbox', { name: 'Error details' }).inputValue()).toBe(await page.evaluate(() => sessionStorage.getItem('qa-copied')));
  const copied = await page.evaluate(() => sessionStorage.getItem('qa-copied'));
  expect(copied).toContain('Error: Error: QA crash on purpose (e2e)');
  expect(copied).not.toContain('CRASHSAFE');

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map(violation => `${violation.id}: ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('(ac) Forex candles: a EUR/USD trade and a practice gold trade drawn with OANDA candles through the Kairos server', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const serverAnswer = (data: unknown) => JSON.stringify({ apiVersion: 1, ok: true, data });
  const intervalMs: Record<string, number> = { '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000 };
  const asked: string[] = [];
  // The Kairos server's forex answer (T-055a): OANDA's mid prices as text, no volume, OANDA's own name for the pair.
  await page.route(url => url.hostname === 'api.qa.invalid' && url.pathname.startsWith('/market/'), async route => {
    const url = new URL(route.request().url());
    const market = url.searchParams.get('market'), symbol = url.searchParams.get('symbol') ?? '', interval = url.searchParams.get('interval') ?? '';
    asked.push(`${url.pathname} ${market} ${symbol}`);
    const step = intervalMs[interval];
    if (url.pathname !== '/market/candles' || market !== 'oanda-forex' || step === undefined) return route.abort();
    const limit = Number(url.searchParams.get('limit'));
    const end = Math.min(Number(url.searchParams.get('end') ?? Date.now()), Date.now());
    const start = Number(url.searchParams.get('start') ?? end - limit * step);
    const [low, tick] = symbol === 'XAUUSD' ? [2648, 1] : [1.083, 0.0005];
    const price = (n: number) => (low + n * tick).toFixed(symbol === 'XAUUSD' ? 2 : 5);
    const candles: unknown[] = [];
    for (let openMs = Math.ceil(start / step) * step; openMs <= end && candles.length < limit; openMs += step) {
      const k = candles.length % 7;
      candles.push({ openTime: new Date(openMs).toISOString(), closeTime: new Date(openMs + step - 1).toISOString(), open: price(k + 1), high: price(k + 3), low: price(k), close: price(k + 2), volume: null });
    }
    const source = { provider: 'oanda', market: 'forex', symbol: `${symbol.slice(0, 3)}_${symbol.slice(3)}` };
    return route.fulfill({ headers: cors, contentType: 'application/json', body: serverAnswer({ source, backup: null, interval, fetchedAt: new Date().toISOString(), candles, next: null }) });
  });

  // A closed EUR/USD trade in the Journal.
  await page.goto('/journal');
  await page.getByRole('button', { name: 'Quick log' }).click();
  await page.getByLabel(/^Market/).selectOption('forex');
  await page.getByLabel(/^Symbol/).fill('EUR/USD');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Entry price/).fill('1.085');
  await page.getByLabel(/^Exit price/).fill('1.087');
  await page.getByLabel(/^Quantity/).fill('10000');
  await page.getByRole('button', { name: 'Set opened time to now' }).click();
  await page.getByRole('button', { name: 'Set closed time to now' }).click();
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();
  const card = page.locator('.kairos-history-card').filter({ hasText: 'EUR/USD' });
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.kairos-trade-picture__candle').first()).toBeVisible();
  await page.getByRole('button', { name: 'Open the EUR/USD trade picture' }).click();
  const dialog = page.getByRole('dialog', { name: 'EUR/USD trade' });
  await expect(dialog.getByText('Candles: OANDA · EUR/USD · mid prices')).toBeVisible();
  await expect(dialog.locator('.kairos-trade-picture__candle').first()).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map(violation => `${violation.id}: ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
  await dialog.getByRole('button', { name: 'Close' }).click();

  // View trade: the Analysis chart draws the pair from OANDA with the trade's entries and exits, read again every 30 seconds.
  await card.getByRole('link', { name: 'View trade' }).click();
  await expect(page).toHaveURL(/\/analysis\?trade=/);
  const chart = page.getByRole('region', { name: 'Market chart' });
  await expect(chart.getByText('OANDA · EUR/USD · mid prices')).toBeVisible();
  await expect(chart.locator('[data-live-candle-status="live"]')).toContainText('EUR/USD · 5m · Updates every 30 seconds');
  await expect(chart.locator('[data-saved-trade-marker-evidence="ready"]')).toBeVisible();
  const pairChart = chart.getByRole('group', { name: 'EUR/USD 5m candlestick chart' });
  await pairChart.focus();
  await expect(pairChart).toBeFocused();
  const chartAxe = await new AxeBuilder({ page }).include('.kairos-analysis-chart').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(chartAxe.violations.map(violation => `${violation.id}: ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // A practice gold trade gets the same picture.
  await page.goto('/practice');
  const money = page.getByRole('region', { name: 'Your practice money' });
  await money.getByLabel(/^Starting amount/).fill('10000');
  await money.getByLabel(/^Money currency/).fill('usd');
  await money.getByRole('button', { name: 'Start practising' }).click();
  await expect(money.locator('.kairos-practice-money__now strong')).toHaveText('10000 USD');
  // The form keeps the Journal's Quick log.
  await expect(page.getByRole('button', { name: 'Quick log' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel(/^Market/).selectOption('forex');
  await page.getByLabel(/^Symbol/).fill('XAUUSD');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Entry price/).fill('2650');
  await page.getByLabel(/^Exit price/).fill('2655');
  await page.getByLabel(/^Quantity/).fill('1');
  await page.getByRole('button', { name: 'Set opened time to now' }).click();
  await page.getByRole('button', { name: 'Set closed time to now' }).click();
  await page.getByRole('button', { name: 'Save practice trade' }).click();
  await expect(page.locator('.kairos-journal__feedback--success')).toHaveText('Practice trade saved. It stays out of your journal results.');
  const gold = page.locator('.kairos-history-card').filter({ hasText: 'XAU' });
  await gold.scrollIntoViewIfNeeded();
  await expect(gold.locator('.kairos-trade-picture__candle').first()).toBeVisible();
  await page.getByRole('button', { name: /^Open the XAU.?USD trade picture$/ }).click();
  await expect(page.getByRole('dialog').getByText('Candles: OANDA · XAU/USD · mid prices')).toBeVisible();

  // Replay EUR/USD from OANDA: place a trade, play to its target, and save it as a practice trade with candles on its picture.
  await page.goto('/practice/replay');
  await page.getByLabel(/^Market/).fill('EUR/USD');
  await page.getByLabel(/^Start from/).fill('2024-03-05T12:00');
  await page.getByRole('button', { name: 'Start replay' }).click();
  await expect(page.getByText('Candles: OANDA · EUR/USD · mid prices')).toBeVisible();
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Entry price/).fill('1.0845');
  await page.getByLabel(/^Stop price/).fill('1.082');
  await page.getByLabel(/^Target price/).fill('1.087');
  await page.getByLabel(/^Quantity/).fill('10000');
  await page.getByRole('button', { name: 'Place trade' }).click();
  const target = page.getByText(/^Your target was reached: out at 1\.087 USD\.$/);
  for (let i = 0; i < 30 && !(await target.isVisible()); i += 1) await page.getByRole('button', { name: 'Next candle' }).click();
  await expect(target).toBeVisible();
  await page.getByRole('button', { name: 'Save to my practice trades' }).click();
  await expect(page.getByText('Saved with your practice trades. It never counts in your Journal.')).toBeVisible();
  await page.getByRole('link', { name: 'See your practice trades' }).click();
  const replayed = page.locator('.kairos-history-card').filter({ hasText: 'From replay' });
  await expect(replayed).toContainText('EURUSD');
  await replayed.scrollIntoViewIfNeeded();
  await expect(replayed.locator('.kairos-trade-picture__candle').first()).toBeVisible();

  // Candles only from the server's forex market (Analysis may ask for the market list before it knows the trade).
  expect(asked.filter(line => line.startsWith('/market/candles')).length).toBeGreaterThan(0);
  expect(asked.filter(line => line !== '/market/symbols null ' && !/^\/market\/candles oanda-forex (EURUSD|XAUUSD)$/.test(line))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('(ad) New trade fields: a futures trade with how much one point is worth, tags and why', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  await page.goto('/journal');
  await page.getByRole('button', { name: 'Quick log' }).click();
  await page.getByLabel(/^Market/).selectOption('futures');
  await page.getByLabel(/^Symbol/).fill('ESZ6');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Entry price/).fill('5000');
  await page.getByLabel(/^Exit price/).fill('5010');
  await page.getByLabel(/^Quantity/).fill('1');
  await page.getByLabel(/^Each point is worth/).fill('50');
  await page.getByRole('button', { name: 'Set opened time to now' }).click();
  await page.getByRole('button', { name: 'Set closed time to now' }).click();
  await page.getByLabel('Currency code').fill('USD');
  await page.getByLabel(/^Tags/).fill('breakout, London open');
  await expect(page.getByRole('list', { name: 'Your tags' }).getByRole('listitem')).toHaveCount(2);
  await page.getByText('Trade plan · Optional').click();
  await page.getByLabel(/^Why I'm taking it/).fill('Retest of the high after the open.');
  const formAxe = await new AxeBuilder({ page }).include('.kairos-trade-form').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(formAxe.violations.map(violation => `${violation.id}: ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();
  // One e-mini point is 50 USD, so 10 points on one contract make 500 USD, not 10.
  const card = page.locator('.kairos-history-card').filter({ hasText: 'ESZ6' });
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.kairos-history-card__outcome')).toContainText('+500 USD');
  await expect(card.getByRole('list', { name: 'Tags' }).getByRole('listitem')).toHaveText(['breakout', 'London open']);
  const cardAxe = await new AxeBuilder({ page }).include('.kairos-history-card').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(cardAxe.violations.map(violation => `${violation.id}: ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);

  // T-056d: a trade saved without how much one point is worth says what to add, gets it once, and shows its result.
  await page.getByLabel(/^Market/).selectOption('futures');
  await page.getByLabel(/^Symbol/).fill('NQZ6');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Entry price/).fill('5000');
  await page.getByLabel(/^Exit price/).fill('5010');
  await page.getByLabel(/^Quantity/).fill('1');
  await page.getByRole('button', { name: 'Set opened time to now' }).click();
  await page.getByRole('button', { name: 'Set closed time to now' }).click();
  await page.getByLabel('Currency code').fill('USD');
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();
  const old = page.locator('.kairos-history-card').filter({ hasText: 'NQZ6' });
  await old.scrollIntoViewIfNeeded();
  await expect(old.getByText('Add how much one point is worth to see this result.')).toBeVisible();
  await old.getByRole('button', { name: 'Add how much one point is worth' }).click();
  await expect(old.getByLabel('Each point is worth')).toBeFocused();
  await page.keyboard.type('20');
  await page.keyboard.press('Enter');
  await expect(old.locator('.kairos-history-card__outcome')).toContainText('+200 USD');
  await expect(old.locator('dl > div').filter({ hasText: 'Result after fees' })).toBeFocused();
  await expect(old.getByRole('button', { name: 'Add how much one point is worth' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test("(ae) Before you save, then the guided flow: past the daily limit a planned trade says so and still saves; then I'm in, close, Review it now", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
  await activate(page);
  await page.goto('/goals');
  // Wait for the page to read your goals: only then does it offer this device's time zone, when none is saved.
  const goals = page.locator('[data-goals-status]');
  await expect(goals).not.toHaveAttribute('data-goals-status', 'loading');
  const deviceZone = page.getByRole('button', { name: /\(this device\)$/ });
  if (await deviceZone.isVisible()) await deviceZone.click();
  await expect(goals).toHaveAttribute('data-goals-status', 'ready');
  await page.getByLabel('Most trades in a day').fill('1');
  await page.getByRole('button', { name: 'Save goals' }).click();
  await expect(page.getByLabel('Most trades in a day')).toHaveValue('1');

  // One trade opened now uses up the day.
  await page.goto('/journal');
  const local = await page.evaluate(() => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; });
  await page.getByLabel(/^Symbol/).fill('BTCUSDT');
  await page.getByLabel(/^Market/).selectOption('crypto');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Status/).selectOption('open');
  await page.getByLabel(/^Opened/).fill(local);
  await page.getByLabel('Currency code').fill('USDT');
  await page.getByText('Trade plan · Optional').click();
  await page.getByLabel('Planned entry').fill('100');
  await page.getByLabel('Planned stop').fill('95');
  await expect(page.getByRole('region', { name: 'Before you save' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();

  // The next planned trade: the box names the limit, a reason is typed, and Save is still one tap.
  await page.getByLabel(/^Symbol/).fill('ETHUSDT');
  await page.getByLabel(/^Market/).selectOption('crypto');
  await page.getByLabel(/^Direction/).selectOption('long');
  await page.getByLabel(/^Status/).selectOption('draft');
  await page.getByLabel('Currency code').fill('USDT');
  // The plan stays open after a save when it was opened by hand.
  if (!(await page.getByLabel('Planned entry').isVisible())) await page.getByText('Trade plan · Optional').click();
  await page.getByLabel('Planned entry').fill('100');
  await page.getByLabel('Planned stop').fill('95');
  const box = page.getByRole('region', { name: 'Before you save' });
  await expect(box.getByRole('listitem')).toHaveText(['This would be trade 2 today. Your most is 1.']);
  await page.getByLabel(/Why save anyway\?/).fill('A clean retest, half size.');
  const formAxe = await new AxeBuilder({ page }).include('.kairos-trade-form').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(formAxe.violations.map(violation => `${violation.id}: ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Save trade' }).click();
  await expect(page.getByText('Trade saved to your journal.')).toBeVisible();
  await expect(box).toHaveCount(0);
  await expect(page.locator('.kairos-history-card').filter({ hasText: 'ETHUSDT' })).toHaveCount(1);

  // T-057e: the planned trade, "I'm in", close it, "Review it now", save the review.
  const eth = page.locator('.kairos-history-card').filter({ hasText: 'ETHUSDT' });
  await eth.getByRole('button', { name: "I'm in" }).click();
  const opening = page.getByRole('region', { name: 'Open ETHUSDT' });
  await opening.getByLabel('Opened date & time').fill(local);
  await opening.getByRole('button', { name: 'Add entry' }).click();
  await opening.getByLabel('Entry 1 price').fill('100');
  await opening.getByLabel('Entry 1 quantity').fill('1');
  await opening.getByLabel('Entry 1 date and time').fill(local);
  await opening.getByRole('button', { name: 'Save opening' }).click();
  await expect(page.getByText(/^ETHUSDT is now open from/)).toBeVisible();
  await eth.getByRole('button', { name: 'Update trade' }).click();
  const update = page.getByRole('region', { name: 'Update ETHUSDT' });
  await update.getByRole('button', { name: 'Add exit' }).click();
  await update.getByLabel('Exit 1 price').fill('110');
  await update.getByLabel('Exit 1 quantity').fill('1');
  await update.getByLabel('Exit 1 date and time').fill(local);
  await update.getByLabel('Trade status').selectOption('closed');
  await update.getByLabel('Closed date & time').fill(local);
  await update.getByRole('button', { name: 'Save update' }).click();
  await expect(page.getByText('Trade closed. How did it go?')).toBeVisible();
  await page.getByRole('button', { name: 'Review it now' }).click();
  const sheet = page.getByRole('dialog', { name: 'After the trade: ETHUSDT' });
  await expect(sheet).toBeVisible();
  const sheetAxe = await new AxeBuilder({ page }).include('.kairos-sheet__panel').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(sheetAxe.violations.map(violation => `${violation.id}: ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
  await sheet.getByRole('checkbox').first().check();
  await sheet.getByRole('button', { name: 'Save review' }).click();
  const reviewed = eth.getByRole('button', { name: /^After the trade: reviewed/ });
  await expect(reviewed).toBeVisible();
  await expect(reviewed).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});
