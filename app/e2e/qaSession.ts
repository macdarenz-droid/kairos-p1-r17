import { expect, type Locator, type Page } from '@playwright/test';
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ACTIVATION_URL = 'https://activation.qa.invalid/v1/activate';
const THEME_KEY = 'kairos.theme.preference.v1';
const SERVER_HOST = 'api.qa.invalid';
const MARKET_FETCHED_AT = '2026-09-20T04:00:00.000Z';
const serverAnswer = (data: unknown) => JSON.stringify({ apiVersion: 1, ok: true, data });
/** The two fixed market answers of `server: 'fixed-market'`, in the Kairos server's shapes (smoke case (q)). */
const FIXED_MARKET: Readonly<Record<string, string>> = {
  '/market/symbols': serverAnswer({ source: 'binance-spot', fetchedAt: MARKET_FETCHED_AT, markets: [
    { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', tickSize: '0.01', stepSize: '0.00001' },
    { symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT', tickSize: '0.01', stepSize: '0.0001' },
  ], leftOut: 0 }),
  '/market/tickers?symbols=BTCUSDT,ETHUSDT': serverAnswer({ source: 'binance-spot', fetchedAt: MARKET_FETCHED_AT, tickers: [
    { symbol: 'BTCUSDT', lastPrice: '61000', openPrice: '60000', highPrice: '61500', lowPrice: '59800', volume: '1000', quoteVolume: '61000000', openTime: '2026-09-19T04:00:00.000Z', closeTime: '2026-09-20T03:59:59.999Z' },
    { symbol: 'ETHUSDT', lastPrice: '2450', openPrice: '2500', highPrice: '2520', lowPrice: '2440', volume: '1000', quoteVolume: '2450000', openTime: '2026-09-19T04:00:00.000Z', closeTime: '2026-09-20T03:59:59.999Z' },
  ] }),
};

/** T-061c: the price of each fixed market's 1-minute candles (the "Price now" of an open trade), the same every minute. */
const FIXED_MINUTE_PRICES: Readonly<Record<string, string>> = { BTCUSDT: '61000', ETHUSDT: '2450' };
/** T-061e: the candle sizes the market sheet's line asks for (1 hour, 24 hours, 7 days). */
const FIXED_INTERVAL_MS: Readonly<Record<string, number>> = { '1m': 60_000, '15m': 900_000, '1h': 3_600_000 };

/**
 * `/market/candles` for a fixed market at its fixed price: 1-minute candles for every minute of the asked window, or
 * (T-061e, the sheet's line) the newest page of 1-minute, 15-minute or 1-hour candles up to the fixed market time; null otherwise.
 */
function fixedMinuteCandles(url: URL): string | null {
  const query = url.searchParams;
  const symbol = query.get('symbol') ?? '';
  const price = FIXED_MINUTE_PRICES[symbol];
  const interval = query.get('interval') ?? '';
  const step = FIXED_INTERVAL_MS[interval];
  const limit = Number(query.get('limit'));
  if (url.pathname !== '/market/candles' || step === undefined || query.get('market') !== 'binance-spot' || price === undefined || !Number.isSafeInteger(limit)) return null;
  const newest = !query.has('start') && !query.has('end');
  const start = newest ? Date.parse(MARKET_FETCHED_AT) - (limit - 1) * step : Number(query.get('start'));
  const end = newest ? Date.parse(MARKET_FETCHED_AT) : Number(query.get('end'));
  if ((!newest && interval !== '1m') || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  const candles: unknown[] = [];
  for (let openMs = start; openMs <= end && candles.length < limit; openMs += step) {
    candles.push({ openTime: new Date(openMs).toISOString(), closeTime: new Date(openMs + step - 1).toISOString(), open: price, high: price, low: price, close: price, volume: '1' });
  }
  return serverAnswer({ source: { provider: 'binance', market: 'spot', symbol }, backup: null, interval, fetchedAt: MARKET_FETCHED_AT, candles, next: null });
}

/** T-061e: `/market/moves` for the two fixed markets: BTC up 1.67% in the window, ETH down 2%, whatever the window. */
function fixedMoves(url: URL): string | null {
  const window = url.searchParams.get('window');
  if (url.pathname !== '/market/moves' || url.searchParams.get('symbols') !== 'BTCUSDT,ETHUSDT' || (window !== '1h' && window !== '7d')) return null;
  const openTime = new Date(Date.parse(MARKET_FETCHED_AT) - (window === '1h' ? 3_600_000 : 604_800_000)).toISOString();
  return serverAnswer({ source: 'binance-spot', window, fetchedAt: MARKET_FETCHED_AT, moves: [
    { symbol: 'BTCUSDT', openPrice: '60000', lastPrice: '61000', openTime, closeTime: MARKET_FETCHED_AT },
    { symbol: 'ETHUSDT', openPrice: '2500', lastPrice: '2450', openTime, closeTime: MARKET_FETCHED_AT },
  ] });
}

/** T-061f: a 32 × 32 PNG (an orange disc), BTC's logo as the Kairos server sends it: a data address, never a web address. */
export const FIXED_BTC_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAhklEQVR42u2XQQ5AEQxEneNf22Etv73QSWl1JG1iR+dRtC3lNWv1+6URIuoKMzpFZgahFTYFQcKrI0dzj8S18d+GsBCXfFwTV0PMFp2KS/7g7q3EV365ADxir7oL3ruHp5AACUAHcP0Z5k9IkYzC0zFFQUJRkoUXpRRlOUVjQtOaUTSnntYBe6AymewLZucAAAAASUVORK5CYII=';

/** T-061f: `/market/coin-logos` for the two fixed markets: a logo for BTC only (ETH keeps its drawn mark). */
function fixedLogos(url: URL): string | null {
  if (url.pathname !== '/market/coin-logos' || url.searchParams.get('symbols') !== 'BTC,ETH') return null;
  return serverAnswer({ source: 'coingecko', fetchedAt: MARKET_FETCHED_AT, logos: [{ symbol: 'BTC', image: FIXED_BTC_LOGO }] });
}

/**
 * Opens the QA build signed in: the theme choice (if given) is stored before the app starts, the activation request
 * gets a fixed signed receipt, and every other https request is aborted (no network in design checks).
 * `fixedClock` freezes the page's clock before the first load; `server: 'fixed-market'` answers the market list, the
 * two 24-hour prices, their 1-hour and 7-day moves, their candles and BTC's logo with fixed values (anything else still
 * aborted), so screenshots never change with the time.
 */
/** T-053d: a fresh install opens the setup (D222); `setup: 'show'` leaves it open, otherwise "Skip for now" is tapped. */
export async function openKairos(page: Page, options: Readonly<{ theme?: string; fixedClock?: string; server?: 'offline' | 'fixed-market'; setup?: 'skip' | 'show' }> = {}): Promise<void> {
  if (options.fixedClock !== undefined) await page.clock.setFixedTime(new Date(options.fixedClock));
  const fixedMarket = options.server === 'fixed-market';
  if (options.theme !== undefined) {
    await page.addInitScript(([key, theme]) => { window.localStorage.setItem(key!, theme!); }, [THEME_KEY, options.theme]);
  }
  const key = createPrivateKey(readFileSync('e2e/.qa/qa-key.pem'));
  const activationId = 'qa-design', issuedAt = '2026-09-20T00:00:00.000Z';
  const verifierPayload = JSON.stringify({ proofVersion: 1, purpose: 'kairos-activation', receiptVersion: 1, activationId, issuedAt });
  const verifierSignature = sign('sha256', Buffer.from(verifierPayload), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  await page.route(url => url.protocol === 'https:', async route => {
    const url = new URL(route.request().url());
    if (fixedMarket && url.hostname === SERVER_HOST) {
      const body = FIXED_MARKET[url.pathname + decodeURIComponent(url.search)] ?? fixedMinuteCandles(url) ?? fixedMoves(url) ?? fixedLogos(url);
      if (body === undefined || body === null) return route.abort();
      return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body });
    }
    if (route.request().url() !== ACTIVATION_URL) return route.abort();
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, receipt: { receiptVersion: 1, activationId, issuedAt, verifierPayload, verifierSignature } }),
    });
  });
  await page.goto('/');
  await page.getByLabel('Invite code').fill('QA-INVITE-001');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.kairos-shell')).toBeVisible();
  if (options.setup === 'show') return;
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  // The pointer leaves the button it pressed, so a later screen never shows what lies under that spot as hovered.
  await page.mouse.move(0, 0);
}

export type EdgeContrast = Readonly<{ againstFill: number; againstOutside: number }>;

/**
 * The element's top edge colour against its own fill (the nearest painted ancestor's when the fill is transparent)
 * and against what is around it (the nearest painted ancestor). Translucent layers are laid over the ones below,
 * down to the page colour; the ratio is the WCAG one used by `contrastRatio`.
 */
export async function contrastInPage(page: Page, locator: Locator): Promise<EdgeContrast> {
  void page;
  return locator.evaluate(element => {
    type Rgba = { r: number; g: number; b: number; a: number };
    const parse = (value: string): Rgba | null => {
      const match = /rgba?\(([^)]*)\)/.exec(value);
      if (!match) return null;
      const [r, g, b, a = 1] = match[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: r!, g: g!, b: b!, a };
    };
    const over = (top: Rgba, below: Rgba): Rgba => ({ r: top.r * top.a + below.r * (1 - top.a), g: top.g * top.a + below.g * (1 - top.a), b: top.b * top.a + below.b * (1 - top.a), a: 1 });
    const luminance = ({ r, g, b }: Rgba) => {
      const linear = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    };
    const ratio = (fg: Rgba, bg: Rgba) => { const a = luminance(over(fg, bg)), b = luminance(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
    const pageColour = (): Rgba => {
      const probe = document.createElement('div');
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--kairos-background-base').trim();
      document.body.append(probe);
      const colour = parse(getComputedStyle(probe).color) ?? { r: 0, g: 0, b: 0, a: 1 };
      probe.remove();
      return { ...colour, a: 1 };
    };
    /** The colour painted behind `start` (itself included), laying translucent layers over the ones below. */
    const paintedFrom = (start: Element | null): Rgba => {
      const layers: Rgba[] = [];
      for (let node = start; node !== null; node = node.parentElement) {
        const colour = parse(getComputedStyle(node).backgroundColor);
        if (colour === null || colour.a === 0) continue;
        layers.push(colour);
        if (colour.a === 1) break;
      }
      let result = layers.length > 0 && layers[layers.length - 1]!.a === 1 ? layers.pop()! : pageColour();
      for (const layer of layers.reverse()) result = over(layer, result);
      return result;
    };
    const edge = parse(getComputedStyle(element).borderTopColor)!;
    return { againstFill: ratio(edge, paintedFrom(element)), againstOutside: ratio(edge, paintedFrom(element.parentElement)) };
  });
}
