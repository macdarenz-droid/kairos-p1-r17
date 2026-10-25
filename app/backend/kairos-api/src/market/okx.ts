/**
 * P16.A1: reading OKX's public candles, the backup source when Binance refuses, is busy or is down (D157, D158).
 * Instrument names, the bars that open on the same UTC times as Binance's, paging (newest first, 300 a page) and a
 * strict decoder that rebuilds candles from checked values.
 */
import type { UpstreamFetch, UpstreamResult } from '../upstream';
import type { CandleAsk, MarketCandle } from './binance';
import { candleCloseMs, compareDecimalText, isAsciiAssetCode, isDecimalText, isoFromEpochMs, longestCandleMs, type MarketInterval } from './marketValues';

export const OKX_HOST = 'www.okx.com';
export type CandleMarket = 'binance-spot' | 'binance-usdm';

/** OKX's USDT-margined perpetual swap is the nearest match to a Binance USDⓈ-M market. */
export function okxInstrument(market: CandleMarket, base: unknown, quote: unknown): string | null {
  if (!isAsciiAssetCode(base) || !isAsciiAssetCode(quote)) return null;
  return market === 'binance-spot' ? `${base}-${quote}` : `${base}-${quote}-SWAP`;
}

/**
 * OKX bars for Binance intervals. 6H, 12H, 1D, 1W and 1M without "utc" open at UTC+8, so only the utc bars are used;
 * no 8h (OKX has none) and no 3d (its alignment against Binance's is unchecked).
 */
export const OKX_BARS: Readonly<Partial<Record<MarketInterval, string>>> = Object.freeze({
  '1s': '1s', '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6Hutc', '12h': '12Hutc', '1d': '1Dutc', '1w': '1Wutc', '1M': '1Mutc',
});

export const OKX_PAGE_ROWS = 300;
export const OKX_MAX_CALLS = 4;
const OKX_ROW_ITEMS = 9;
/** OKX's code for "Instrument ID does not exist" (sent with HTTP 200). */
const OKX_UNKNOWN_INSTRUMENT = '51001';

/** One page: `after` asks for rows older than that time, `before` for rows newer. */
export function okxPageUrl(instId: string, bar: string, after: number | null, before: number | null): string {
  const params = new URLSearchParams({ instId, bar, limit: String(OKX_PAGE_ROWS) });
  if (after !== null) params.set('after', String(after));
  if (before !== null) params.set('before', String(before));
  return `https://${OKX_HOST}/api/v5/market/history-candles?${params}`;
}

/** The first page's bounds for the asked window. */
export function okxFirstPage(ask: CandleAsk, nowMs: number): { readonly after: number | null; readonly before: number | null } {
  if (ask.startMs !== null) {
    const last = Math.min(ask.endMs ?? nowMs, ask.startMs + ask.limit * longestCandleMs(ask.interval));
    return { after: last + 1, before: ask.startMs - 1 };
  }
  return { after: ask.endMs === null ? null : ask.endMs + 1, before: null };
}

interface OkxRow {
  readonly openMs: number;
  readonly candle: MarketCandle;
  readonly confirmed: boolean;
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One OKX page as checked rows (newest first, as sent), `{ unknown: true }` for an instrument that does not exist, else null. */
function decodeOkxPage(text: string, interval: MarketInterval, market: CandleMarket): readonly OkxRow[] | { readonly unknown: true } | null {
  const body = parseJson(text);
  if (!isRecord(body)) return null;
  if (body.code === OKX_UNKNOWN_INSTRUMENT) return { unknown: true };
  if (body.code !== '0' || !Array.isArray(body.data) || body.data.length > OKX_PAGE_ROWS) return null;
  const rows: OkxRow[] = [];
  for (const row of body.data as unknown[]) {
    if (!Array.isArray(row) || row.length !== OKX_ROW_ITEMS || !row.every((item) => typeof item === 'string')) return null;
    const [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm] = row as string[];
    if (!/^[0-9]{1,16}$/.test(ts)) return null;
    const openMs = parseInt(ts, 10);
    const openTime = isoFromEpochMs(openMs);
    const closeMs = candleCloseMs(openMs, interval);
    const closeTime = isoFromEpochMs(closeMs);
    if (openTime === null || closeTime === null) return null;
    if (!isDecimalText(open, { positive: true }) || !isDecimalText(high, { positive: true }) || !isDecimalText(low, { positive: true })
      || !isDecimalText(close, { positive: true }) || !isDecimalText(vol) || !isDecimalText(volCcy) || !isDecimalText(volCcyQuote)) return null;
    if (compareDecimalText(high, open) < 0 || compareDecimalText(high, close) < 0 || compareDecimalText(low, open) > 0 || compareDecimalText(low, close) > 0) return null;
    if (confirm !== '0' && confirm !== '1') return null;
    // Volume in the base currency: spot `vol`, swap `volCcy` (OKX's docs).
    const volume = market === 'binance-spot' ? vol : volCcy;
    rows.push({ openMs, candle: Object.freeze({ openTime, closeTime, open, high, low, close, volume }), confirmed: confirm === '1' });
  }
  return rows;
}

/**
 * OKX's pages as candles in the window [start, end] (end defaults to now), one per open time, ascending: the first
 * `limit` when start is given, else the last `limit`. `closed` is false when any kept candle is still forming.
 */
export function decodeOkxCandles(texts: readonly string[], ask: CandleAsk, market: CandleMarket, nowMs: number):
  { readonly candles: readonly MarketCandle[]; readonly closed: boolean } | { readonly unknown: true } | null {
  const byOpen = new Map<number, OkxRow>();
  const lastMs = ask.endMs ?? nowMs;
  for (const text of texts) {
    const page = decodeOkxPage(text, ask.interval, market);
    if (page === null || 'unknown' in page) return page;
    for (const row of page) {
      if ((ask.startMs !== null && row.openMs < ask.startMs) || row.openMs > lastMs || byOpen.has(row.openMs)) continue;
      byOpen.set(row.openMs, row);
    }
  }
  const ascending = [...byOpen.values()].sort((a, b) => a.openMs - b.openMs);
  const kept = ask.startMs !== null ? ascending.slice(0, ask.limit) : ascending.slice(-ask.limit);
  return Object.freeze({ candles: Object.freeze(kept.map((row) => row.candle)), closed: kept.every((row) => row.confirmed) });
}

/**
 * Reads OKX pages for the window, walking back while a page was full and, with start, the oldest is still after start
 * (without start, while fewer than `limit` candles are in the window); at most OKX_MAX_CALLS calls. The page texts, `{ unknown: true }`, or null on any failure.
 */
export async function readOkxPages(upstream: UpstreamFetch, instId: string, bar: string, ask: CandleAsk, market: CandleMarket, nowMs: number):
  Promise<readonly string[] | { readonly unknown: true } | null> {
  const texts: string[] = [];
  const inWindow = new Set<number>();
  const lastMs = ask.endMs ?? nowMs;
  let { after } = okxFirstPage(ask, nowMs);
  const { before } = okxFirstPage(ask, nowMs);
  for (let call = 0; call < OKX_MAX_CALLS; call += 1) {
    const result = await upstream(okxPageUrl(instId, bar, after, before), { accept: 'application/json' });
    if (!result.ok) return null;
    const page = decodeOkxPage(result.text, ask.interval, market);
    if (page === null || 'unknown' in page) return page;
    texts.push(result.text);
    for (const row of page) {
      if ((ask.startMs === null || row.openMs >= ask.startMs) && row.openMs <= lastMs) inWindow.add(row.openMs);
    }
    if (page.length < OKX_PAGE_ROWS) break;
    const oldest = Math.min(...page.map((row) => row.openMs));
    if (ask.startMs !== null ? oldest <= ask.startMs : inWindow.size >= ask.limit) break;
    after = oldest;
  }
  return texts;
}

/** What a failed OKX answer means: 429 (OKX codes 50011 and 50013) asks to wait; anything else is down. */
export function okxFailure(result: Extract<UpstreamResult, { ok: false }>): 'busy' | 'down' {
  return result.failure === 'status' && result.status === 429 ? 'busy' : 'down';
}
