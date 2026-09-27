/**
 * P16.A1: the checks on market text the server trusts: symbols, asset codes, decimal text and its exact order, candle
 * intervals and close times. Prices stay text from source to app: nothing here turns a price into a number.
 */

/** Uppercase A–Z, digits, or a CJK ideograph (U+4E00–U+9FFF): Binance lists markets such as 币安人生USDT. */
const MARKET_TEXT = /^[A-Z0-9一-鿿]{1,20}$/u;
const ASCII_ASSET = /^[A-Z0-9]{1,20}$/;
const DECIMAL_TEXT = /^[0-9]{1,30}(?:[.][0-9]{1,30})?$/;

export function isMarketSymbol(text: unknown): text is string {
  return typeof text === 'string' && MARKET_TEXT.test(text);
}

export function isAssetCode(text: unknown): text is string {
  return typeof text === 'string' && MARKET_TEXT.test(text);
}

export function isAsciiAssetCode(text: unknown): text is string {
  return typeof text === 'string' && ASCII_ASSET.test(text);
}

/** Plain decimal text such as "84403.98000000"; `positive` also refuses a value whose digits are all zeros. */
export function isDecimalText(text: unknown, options: { readonly positive?: boolean } = {}): text is string {
  if (typeof text !== 'string' || !DECIMAL_TEXT.test(text)) return false;
  return options.positive !== true || /[1-9]/.test(text);
}

function normalise(text: string): { readonly whole: string; readonly fraction: string } {
  const [whole, fraction = ''] = text.split('.');
  return { whole: whole.replace(/^0+/, ''), fraction: fraction.replace(/0+$/, '') };
}

/** -1, 0 or 1, exact, for two decimal texts: "1.10" equals "1.1", "0.009" is below "0.01", "10" is above "9.99". */
export function compareDecimalText(a: string, b: string): -1 | 0 | 1 {
  const left = normalise(a);
  const right = normalise(b);
  if (left.whole.length !== right.whole.length) return left.whole.length < right.whole.length ? -1 : 1;
  if (left.whole !== right.whole) return left.whole < right.whole ? -1 : 1;
  if (left.fraction !== right.fraction) return left.fraction < right.fraction ? -1 : 1;
  return 0;
}

const LATEST_MS = 8_640_000_000_000_000;

/** An epoch-ms instant as ISO 8601 UTC; null unless it is a safe integer from 0 to the latest date JavaScript can show. */
export function isoFromEpochMs(ms: unknown): string | null {
  if (typeof ms !== 'number' || !Number.isSafeInteger(ms) || ms < 0 || ms > LATEST_MS) return null;
  return new Date(ms).toISOString();
}

export const MARKET_INTERVALS = ['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'] as const;
export type MarketInterval = (typeof MARKET_INTERVALS)[number];

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const INTERVAL_MS: Readonly<Record<Exclude<MarketInterval, '1M'>, number>> = Object.freeze({
  '1s': SECOND, '1m': MINUTE, '3m': 3 * MINUTE, '5m': 5 * MINUTE, '15m': 15 * MINUTE, '30m': 30 * MINUTE,
  '1h': HOUR, '2h': 2 * HOUR, '4h': 4 * HOUR, '6h': 6 * HOUR, '8h': 8 * HOUR, '12h': 12 * HOUR,
  '1d': DAY, '3d': 3 * DAY, '1w': 7 * DAY,
});

export function isMarketInterval(text: unknown): text is MarketInterval {
  return typeof text === 'string' && (MARKET_INTERVALS as readonly string[]).includes(text);
}

/** The last instant of a candle that opened at openMs: open + length - 1; a month candle ends at the next month's first instant (UTC) minus 1. */
export function candleCloseMs(openMs: number, interval: MarketInterval): number {
  if (interval === '1M') {
    const open = new Date(openMs);
    return Date.UTC(open.getUTCFullYear(), open.getUTCMonth() + 1, 1) - 1;
  }
  return openMs + INTERVAL_MS[interval] - 1;
}

/** The longest a candle of this interval can last (a month: 31 days). */
export function longestCandleMs(interval: MarketInterval): number {
  return interval === '1M' ? 31 * DAY : INTERVAL_MS[interval];
}

/**
 * A page that ends at endMs holds only closed candles once a full candle has passed since endMs: the candle holding
 * endMs began at or before it and lasts at most longestCandleMs, so this needs no knowledge of how a source aligns candles.
 */
export function isSettled(endMs: number | null, interval: MarketInterval, nowMs: number): boolean {
  return endMs !== null && nowMs - endMs >= longestCandleMs(interval);
}
