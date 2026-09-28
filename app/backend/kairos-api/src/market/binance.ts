/**
 * P16.A1: reading Binance's public market data. The hosts that serve market data from the US (D156; never
 * api.binance.com, which answers 451 there), what a failed answer means, and strict decoders that rebuild small JSON
 * from checked values: nothing Binance sends is passed through.
 */
import type { RouteAnswer } from '../router';
import type { UpstreamResult } from '../upstream';
import { candleCloseMs, compareDecimalText, isAssetCode, isDecimalText, isMarketSymbol, isoFromEpochMs, type MarketInterval } from './marketValues';

export const BINANCE_SPOT_HOST = 'data-api.binance.vision';
export const BINANCE_USDM_HOST = 'fapi.binance.com';

export type BinanceFailure =
  | Readonly<{ kind: 'unknown-market' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{ kind: 'busy'; retryAfterSeconds: number | null }>
  | Readonly<{ kind: 'down' }>;

const RETRY_AFTER_MAX_SECONDS = 3_600;
/** Binance's code for "Invalid symbol." */
const INVALID_SYMBOL = -1121;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

/** What a failed Binance answer means: no such market, a refused place, a request to wait, or down. */
export function binanceFailure(result: Extract<UpstreamResult, { ok: false }>): BinanceFailure {
  if (result.failure === 'status' && result.status === 400 && result.errorText !== undefined) {
    const body = parseJson(result.errorText);
    if (isRecord(body) && body.code === INVALID_SYMBOL) return { kind: 'unknown-market' };
  }
  if (result.failure === 'status' && (result.status === 451 || result.status === 403)) return { kind: 'refused' };
  if (result.failure === 'status' && (result.status === 429 || result.status === 418)) {
    return { kind: 'busy', retryAfterSeconds: result.retryAfterSeconds === undefined ? null : Math.min(result.retryAfterSeconds, RETRY_AFTER_MAX_SECONDS) };
  }
  return { kind: 'down' };
}

/** The server's answer for a Binance failure. */
export function failureAnswer(failure: BinanceFailure): RouteAnswer {
  switch (failure.kind) {
    case 'unknown-market': return { ok: false, reason: 'unknown-market' };
    case 'refused': return { ok: false, reason: 'source-refused' };
    case 'busy': return { ok: false, reason: 'source-busy', retryAfter: failure.retryAfterSeconds ?? 60 };
    case 'down': return { ok: false, reason: 'source-unavailable' };
  }
}

export interface BinanceMarket {
  readonly symbol: string;
  readonly base: string;
  readonly quote: string;
  readonly tickSize: string;
  readonly stepSize: string;
}

export const BINANCE_MAX_SYMBOLS = 5_000;

/** The one filter of this type with a positive decimal field, else null (none, two, or a bad value). */
function onlyFilterValue(filters: unknown, type: string, field: string): string | null {
  if (!Array.isArray(filters)) return null;
  const matching = filters.filter((filter) => isRecord(filter) && filter.filterType === type);
  if (matching.length !== 1) return null;
  const value = (matching[0] as Record<string, unknown>)[field];
  return isDecimalText(value, { positive: true }) ? value : null;
}

/** Binance's exchangeInfo as the markets open for trading, ascending by symbol in code-point order; the rest is counted in leftOut. */
export function decodeBinanceExchangeInfo(text: string): { readonly markets: readonly BinanceMarket[]; readonly leftOut: number } | null {
  const body = parseJson(text);
  if (!isRecord(body) || !Array.isArray(body.symbols) || body.symbols.length > BINANCE_MAX_SYMBOLS) return null;
  const kept = new Map<string, BinanceMarket>();
  let leftOut = 0;
  for (const item of body.symbols as unknown[]) {
    if (!isRecord(item)) { leftOut += 1; continue; }
    const { symbol, status, baseAsset, quoteAsset, filters } = item;
    const tickSize = onlyFilterValue(filters, 'PRICE_FILTER', 'tickSize');
    const stepSize = onlyFilterValue(filters, 'LOT_SIZE', 'stepSize');
    if (!isMarketSymbol(symbol) || status !== 'TRADING' || !isAssetCode(baseAsset) || !isAssetCode(quoteAsset) || baseAsset + quoteAsset !== symbol
      || tickSize === null || stepSize === null || kept.has(symbol)) {
      leftOut += 1;
      continue;
    }
    kept.set(symbol, Object.freeze({ symbol, base: baseAsset, quote: quoteAsset, tickSize, stepSize }));
  }
  const markets = [...kept.values()].sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
  return Object.freeze({ markets: Object.freeze(markets), leftOut });
}

export interface BinanceTicker {
  readonly symbol: string;
  readonly lastPrice: string;
  readonly openPrice: string;
  readonly highPrice: string;
  readonly lowPrice: string;
  readonly volume: string;
  readonly quoteVolume: string;
  readonly openTime: string;
  readonly closeTime: string;
}

const TICKER_TEXT_FIELDS = ['lastPrice', 'openPrice', 'highPrice', 'lowPrice', 'volume', 'quoteVolume'] as const;

/** Binance's 24-hour MINI tickers in the requested order; null unless every requested symbol is there exactly once and nothing else. */
export function decodeBinanceTickers(text: string, requested: readonly string[]): readonly BinanceTicker[] | null {
  const body = parseJson(text);
  if (!Array.isArray(body) || body.length !== requested.length) return null;
  const bySymbol = new Map<string, BinanceTicker>();
  for (const item of body as unknown[]) {
    if (!isRecord(item) || !isMarketSymbol(item.symbol) || !requested.includes(item.symbol) || bySymbol.has(item.symbol)) return null;
    if (!TICKER_TEXT_FIELDS.every((field) => isDecimalText(item[field]))) return null;
    const openTime = isoFromEpochMs(item.openTime);
    const closeTime = isoFromEpochMs(item.closeTime);
    if (openTime === null || closeTime === null || (item.openTime as number) > (item.closeTime as number)) return null;
    bySymbol.set(item.symbol, Object.freeze({
      symbol: item.symbol,
      lastPrice: item.lastPrice as string,
      openPrice: item.openPrice as string,
      highPrice: item.highPrice as string,
      lowPrice: item.lowPrice as string,
      volume: item.volume as string,
      quoteVolume: item.quoteVolume as string,
      openTime,
      closeTime,
    }));
  }
  const tickers = requested.map((symbol) => bySymbol.get(symbol));
  return tickers.every((ticker): ticker is BinanceTicker => ticker !== undefined) ? Object.freeze(tickers) : null;
}

export interface MarketCandle {
  readonly openTime: string;
  readonly closeTime: string;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
}

/** The checked candles query: startMs and endMs are open times, inclusive, or null. */
export interface CandleAsk {
  readonly interval: MarketInterval;
  readonly limit: number;
  readonly startMs: number | null;
  readonly endMs: number | null;
}

const KLINE_ROW_ITEMS = 12;

/**
 * Binance's klines (spot and USDⓈ-M share the row shape) as candles with volume, the same rules as the app's decoder
 * (binanceSpotCandleHistoryResponse.ts) plus volume; null unless every row is whole, in order, inside the window and
 * no more than the limit.
 */
export function decodeBinanceKlines(text: string, ask: CandleAsk): readonly MarketCandle[] | null {
  const body = parseJson(text);
  if (!Array.isArray(body) || body.length > ask.limit) return null;
  const candles: MarketCandle[] = [];
  let previousOpenMs = -1;
  for (const row of body as unknown[]) {
    if (!Array.isArray(row) || row.length !== KLINE_ROW_ITEMS) return null;
    const [openMs, open, high, low, close, volume, closeMs] = row as unknown[];
    const openTime = isoFromEpochMs(openMs);
    const closeTime = isoFromEpochMs(closeMs);
    if (openTime === null || closeTime === null) return null;
    const openAt = openMs as number;
    if (closeMs !== candleCloseMs(openAt, ask.interval) || openAt <= previousOpenMs) return null;
    if ((ask.startMs !== null && openAt < ask.startMs) || (ask.endMs !== null && openAt > ask.endMs)) return null;
    if (!isDecimalText(open, { positive: true }) || !isDecimalText(high, { positive: true }) || !isDecimalText(low, { positive: true })
      || !isDecimalText(close, { positive: true }) || !isDecimalText(volume)) return null;
    if (compareDecimalText(high, open) < 0 || compareDecimalText(high, close) < 0 || compareDecimalText(low, open) > 0 || compareDecimalText(low, close) > 0) return null;
    previousOpenMs = openAt;
    candles.push(Object.freeze({ openTime, closeTime, open, high, low, close, volume }));
  }
  return Object.freeze(candles);
}
