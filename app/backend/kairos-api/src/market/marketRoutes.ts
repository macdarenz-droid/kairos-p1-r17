/**
 * P16.A1: the market data routes. Public and rate-limited like the news routes: the data is public, keyless and the
 * same for every trader. Each reads one fixed host; no request value becomes a host.
 */
import type { RouteCachePolicy } from '../cache';
import type { KairosApiRoute, RouteAnswer } from '../router';
import {
  BINANCE_SPOT_HOST, BINANCE_USDM_HOST, binanceFailure, decodeBinanceExchangeInfo, decodeBinanceKlines, decodeBinanceTickers, failureAnswer, type MarketCandle,
} from './binance';
import { isMarketInterval, isSettled, type MarketInterval } from './marketValues';
import { decodeOkxCandles, OKX_BARS, OKX_HOST, okxInstrument, readOkxPages, type CandleMarket } from './okx';

/** The market list changes a few times a day: 1 hour in Workers Cache and memory, 6 hours in KV. */
export const MARKET_SYMBOLS_CACHE: RouteCachePolicy = Object.freeze({ version: 1, edgeSeconds: 3_600, memorySeconds: 3_600, kvSeconds: 21_600 });
/** 24-hour prices move every second: 5 seconds in Workers Cache and memory, never in KV. */
export const MARKET_TICKERS_CACHE: RouteCachePolicy = Object.freeze({ version: 1, edgeSeconds: 5, memorySeconds: 5, kvSeconds: null });

const EXCHANGE_INFO_URL = `https://${BINANCE_SPOT_HOST}/api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING&showPermissionSets=false`;
/** Binance's exchangeInfo is about 2.5 MB. */
const EXCHANGE_INFO_MAX_BYTES = 6_291_456;
const EXCHANGE_INFO_TIMEOUT_MS = 15_000;
export const MAX_TICKER_SYMBOLS = 100;

const marketSymbolsRoute: KairosApiRoute = {
  id: 'market-symbols',
  path: '/market/symbols',
  access: 'public',
  rateLimited: true,
  query: {},
  upstreamHosts: [BINANCE_SPOT_HOST],
  cache: MARKET_SYMBOLS_CACHE,
  async handle({ upstream, now }) {
    const result = await upstream(EXCHANGE_INFO_URL, { accept: 'application/json', maxBytes: EXCHANGE_INFO_MAX_BYTES, timeoutMs: EXCHANGE_INFO_TIMEOUT_MS, readErrorBody: true });
    if (!result.ok) return failureAnswer(binanceFailure(result));
    const decoded = decodeBinanceExchangeInfo(result.text);
    if (decoded === null || decoded.markets.length === 0) return { ok: false, reason: 'source-unavailable' };
    return { ok: true, data: { source: 'binance-spot', fetchedAt: now.toISOString(), markets: decoded.markets, leftOut: decoded.leftOut } };
  },
};

const marketTickersRoute: KairosApiRoute = {
  id: 'market-tickers',
  path: '/market/tickers',
  access: 'public',
  rateLimited: true,
  query: { symbols: { pattern: /^[A-Z0-9一-鿿]{1,20}(?:,[A-Z0-9一-鿿]{1,20}){0,99}$/u, required: true } },
  maxQueryLength: 4_096,
  upstreamHosts: [BINANCE_SPOT_HOST],
  cache: MARKET_TICKERS_CACHE,
  async handle({ query, upstream, now }) {
    const list = (query.get('symbols') ?? '').split(',');
    // Strictly ascending (so no repeats): one order means one cache key for every device.
    if (list.length > MAX_TICKER_SYMBOLS || list.some((symbol, index) => index > 0 && !(list[index - 1] < symbol))) return { ok: false, reason: 'bad-request' };
    const url = `https://${BINANCE_SPOT_HOST}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(list))}&type=MINI`;
    const result = await upstream(url, { accept: 'application/json', readErrorBody: true });
    if (!result.ok) return failureAnswer(binanceFailure(result));
    const tickers = decodeBinanceTickers(result.text, list);
    if (tickers === null) return { ok: false, reason: 'source-unavailable' };
    return { ok: true, data: { source: 'binance-spot', fetchedAt: now.toISOString(), tickers } };
  },
};

/** A candles page that may still move: 10 seconds in Workers Cache and memory, never in KV. */
export const MARKET_CANDLES_OPEN_CACHE: RouteCachePolicy = Object.freeze({ version: 1, edgeSeconds: 10, memorySeconds: 10, kvSeconds: null });
/** A settled page (only closed candles) never changes: 7 days in Workers Cache (and the browser), 1 hour in memory, never in KV. */
export const MARKET_CANDLES_SETTLED_CACHE: RouteCachePolicy = Object.freeze({ version: 1, edgeSeconds: 604_800, memorySeconds: 3_600, kvSeconds: null });
export const MAX_CANDLES = 1_000;

const MARKET_TEXT_RULE = /^[A-Z0-9一-鿿]{1,20}$/u;
const EPOCH_MS_RULE = /^[0-9]{1,13}$/;

/** Digits already checked by the query rules (at most 13), so the value is a safe integer. */
function digits(text: string | null): number | null {
  return text === null ? null : parseInt(text, 10);
}

const marketCandlesRoute: KairosApiRoute = {
  id: 'market-candles',
  path: '/market/candles',
  access: 'public',
  rateLimited: true,
  query: {
    market: { pattern: /^(?:binance-spot|binance-usdm)$/, required: true },
    symbol: { pattern: MARKET_TEXT_RULE, required: true },
    interval: { pattern: /^(?:1s|1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w|1M)$/, required: true },
    limit: { pattern: /^[1-9][0-9]{0,3}$/, required: true },
    start: { pattern: EPOCH_MS_RULE, required: false },
    end: { pattern: EPOCH_MS_RULE, required: false },
    // Used by the backup source. The same characters as the symbol (a listed market may be written in Chinese characters); OKX is asked for ASCII codes only.
    base: { pattern: MARKET_TEXT_RULE, required: false },
    quote: { pattern: MARKET_TEXT_RULE, required: false },
  },
  upstreamHosts: [BINANCE_SPOT_HOST, BINANCE_USDM_HOST, OKX_HOST],
  cache: MARKET_CANDLES_OPEN_CACHE,
  async handle({ query, env, upstream, now }) {
    const market = query.get('market') as CandleMarket;
    const symbol = query.get('symbol') ?? '';
    const interval = query.get('interval');
    const limit = digits(query.get('limit')) ?? 0;
    const startMs = digits(query.get('start'));
    const endMs = digits(query.get('end'));
    const base = query.get('base');
    const quote = query.get('quote');
    if (!isMarketInterval(interval) || limit > MAX_CANDLES || (startMs !== null && endMs !== null && startMs > endMs)) return { ok: false, reason: 'bad-request' };
    // USDⓈ-M lists no 1-second candles (Binance's docs).
    if (interval === '1s' && market === 'binance-usdm') return { ok: false, reason: 'bad-request' };
    if ((base === null) !== (quote === null) || (base !== null && base + quote !== symbol)) return { ok: false, reason: 'bad-request' };

    const params = new URLSearchParams({ symbol, interval, limit: String(limit) });
    if (startMs !== null) params.set('startTime', String(startMs));
    if (endMs !== null) params.set('endTime', String(endMs));
    if (market === 'binance-spot') params.set('timeZone', '0');
    const url = market === 'binance-spot' ? `https://${BINANCE_SPOT_HOST}/api/v3/klines?${params}` : `https://${BINANCE_USDM_HOST}/fapi/v1/klines?${params}`;
    const result = await upstream(url, { accept: 'application/json', readErrorBody: true });
    const nowMs = now.getTime();
    if (!result.ok) {
      const failure = binanceFailure(result);
      // Binance's "no such market" is the truth; the backup answers only when Binance refused, was busy or was down.
      if (failure.kind !== 'unknown-market' && env.KAIROS_MARKET_BACKUP === 'okx' && base !== null) {
        const instId = okxInstrument(market, base, quote);
        const bar = OKX_BARS[interval];
        if (instId !== null && bar !== undefined) {
          const ask = { interval, limit, startMs, endMs };
          const texts = await readOkxPages(upstream, instId, bar, ask, market, nowMs);
          const decoded = texts === null || 'unknown' in texts ? null : decodeOkxCandles(texts, ask, market, nowMs);
          // No candles is no backup: an empty chart would be kept as if the window had none.
          if (decoded !== null && !('unknown' in decoded) && decoded.candles.length > 0) {
            const source = { provider: 'okx', market: market === 'binance-spot' ? 'spot' : 'perpetual-swap', symbol: instId };
            return candlesAnswer(source, failure.kind, interval, decoded.candles, decoded.closed, ask, now);
          }
        }
      }
      // OKX's own reason is never shown: the answer is Binance's.
      return failureAnswer(failure);
    }
    const candles = decodeBinanceKlines(result.text, { interval, limit, startMs, endMs });
    if (candles === null) return { ok: false, reason: 'source-unavailable' };
    const source = { provider: 'binance', market: market === 'binance-spot' ? 'spot' : 'usdm-futures', symbol };
    return candlesAnswer(source, null, interval, candles, true, { limit, startMs, endMs }, now);
  },
};

/**
 * The candles answer: the next page start when a page read forward from `start` is full and the window goes on (a page
 * without `start` is the newest candles, so it has no next page); kept 7 days once settled.
 */
function candlesAnswer(
  source: Readonly<{ provider: string; market: string; symbol: string }>, backup: string | null, interval: MarketInterval,
  candles: readonly MarketCandle[], allConfirmed: boolean, ask: Readonly<{ limit: number; startMs: number | null; endMs: number | null }>, now: Date,
): RouteAnswer {
  const { limit, startMs, endMs } = ask;
  const nowMs = now.getTime();
  const lastOpenMs = candles.length === 0 ? null : Date.parse(candles[candles.length - 1].openTime);
  const next = startMs !== null && lastOpenMs !== null && candles.length === limit && (endMs === null || lastOpenMs < endMs) ? lastOpenMs + 1 : null;
  const data = { source, backup, interval, fetchedAt: now.toISOString(), candles, next };
  const settled = allConfirmed && isSettled(endMs, interval, nowMs) && candles.every((candle) => Date.parse(candle.closeTime) < nowMs);
  return settled ? { ok: true, data, cache: MARKET_CANDLES_SETTLED_CACHE } : { ok: true, data };
}

export const MARKET_ROUTES: readonly KairosApiRoute[] = Object.freeze([marketSymbolsRoute, marketTickersRoute, marketCandlesRoute]);
