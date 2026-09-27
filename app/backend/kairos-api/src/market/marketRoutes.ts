/**
 * P16.A1: the market data routes. Public and rate-limited like the news routes: the data is public, keyless and the
 * same for every trader. Each reads one fixed host; no request value becomes a host.
 */
import type { RouteCachePolicy } from '../cache';
import type { KairosApiRoute } from '../router';
import { BINANCE_SPOT_HOST, binanceFailure, decodeBinanceExchangeInfo, decodeBinanceTickers, failureAnswer } from './binance';

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

export const MARKET_ROUTES: readonly KairosApiRoute[] = Object.freeze([marketSymbolsRoute, marketTickersRoute]);
