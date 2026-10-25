/**
 * P16.A1: the market data routes. Public and rate-limited like the news routes: the data is public, keyless and the
 * same for every trader. Each reads one fixed host; no request value becomes a host.
 */
import type { RouteCachePolicy } from '../cache';
import type { KairosApiEnv } from '../env';
import type { KairosApiRoute, RouteAnswer } from '../router';
import type { UpstreamFetch } from '../upstream';
import {
  BINANCE_SPOT_HOST, BINANCE_USDM_HOST, binanceFailure, decodeBinanceExchangeInfo, decodeBinanceKlines, decodeBinanceTickers, failureAnswer, type MarketCandle,
} from './binance';
import { isMarketInterval, isSettled, type MarketInterval } from './marketValues';
import { decodeOkxCandles, OKX_BARS, OKX_HOST, okxInstrument, readOkxPages, type CandleMarket } from './okx';
import { COINGECKO_DEMO_HOST, COINGECKO_PRO_HOST, coinDataPlan, coinGeckoFailure, coinNamesRequest, decodeCoinGeckoMarkets } from './coinGecko';
import { decodeOandaCandles, forexSource, OANDA_GRANULARITY, OANDA_LIVE_HOST, OANDA_PRACTICE_HOST, oandaCandlesUrl, oandaFailure, oandaHost, oandaInstrument } from './oanda';

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

/**
 * T-061e (D271): the 1-hour and 7-day moves of up to 100 markets, from Binance's rolling-window ticker: 30 seconds for
 * the 1-hour window (Home reads it every 30 s while chosen), 5 minutes for the 7-day one (read every 5 minutes); never KV.
 * One version: the 7-day answer carries its own policy (router.ts keeps and labels it with that).
 */
export const MARKET_MOVES_CACHE: RouteCachePolicy = Object.freeze({ version: 1, edgeSeconds: 30, memorySeconds: 30, kvSeconds: null });
export const MARKET_MOVES_WEEK_CACHE: RouteCachePolicy = Object.freeze({ version: 1, edgeSeconds: 300, memorySeconds: 300, kvSeconds: null });

const marketMovesRoute: KairosApiRoute = {
  id: 'market-moves',
  path: '/market/moves',
  access: 'public',
  rateLimited: true,
  // The same list as /market/tickers; Binance's rolling window takes 100 symbols a request (weight 4 each, capped at 200).
  query: { symbols: marketTickersRoute.query.symbols, window: { pattern: /^(?:1h|7d)$/, required: true } },
  maxQueryLength: 4_096,
  upstreamHosts: [BINANCE_SPOT_HOST],
  cache: MARKET_MOVES_CACHE,
  async handle({ query, upstream, now }) {
    const list = (query.get('symbols') ?? '').split(',');
    const windowSize = query.get('window') === '7d' ? '7d' : '1h';
    // Strictly ascending (so no repeats): one order means one cache key for every device.
    if (list.length > MAX_TICKER_SYMBOLS || list.some((symbol, index) => index > 0 && !(list[index - 1] < symbol))) return { ok: false, reason: 'bad-request' };
    const url = `https://${BINANCE_SPOT_HOST}/api/v3/ticker?symbols=${encodeURIComponent(JSON.stringify(list))}&windowSize=${windowSize}&type=MINI`;
    const result = await upstream(url, { accept: 'application/json', readErrorBody: true });
    if (!result.ok) return failureAnswer(binanceFailure(result));
    // The rolling-window MINI rows have the 24-hour rows' shape; only what a move needs is answered.
    const tickers = decodeBinanceTickers(result.text, list);
    if (tickers === null) return { ok: false, reason: 'source-unavailable' };
    const moves = tickers.map(({ symbol, openPrice, lastPrice, openTime, closeTime }) => ({ symbol, openPrice, lastPrice, openTime, closeTime }));
    const data = { source: 'binance-spot', window: windowSize, fetchedAt: now.toISOString(), moves };
    return windowSize === '7d' ? { ok: true, data, cache: MARKET_MOVES_WEEK_CACHE } : { ok: true, data };
  },
};

/**
 * A candles page that may still move: 10 seconds in Workers Cache and memory, never in KV. Version 2 since U10: a
 * candle's volume may be null (D232), so no page cached in the old shape is read again.
 */
export const MARKET_CANDLES_OPEN_CACHE: RouteCachePolicy = Object.freeze({ version: 2, edgeSeconds: 10, memorySeconds: 10, kvSeconds: null });
/** A settled page (only closed candles) never changes: 7 days in Workers Cache (and the browser), 1 hour in memory, never in KV. */
export const MARKET_CANDLES_SETTLED_CACHE: RouteCachePolicy = Object.freeze({ version: 2, edgeSeconds: 604_800, memorySeconds: 3_600, kvSeconds: null });
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
    market: { pattern: /^(?:binance-spot|binance-usdm|oanda-forex)$/, required: true },
    symbol: { pattern: MARKET_TEXT_RULE, required: true },
    interval: { pattern: /^(?:1s|1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w|1M)$/, required: true },
    limit: { pattern: /^[1-9][0-9]{0,3}$/, required: true },
    start: { pattern: EPOCH_MS_RULE, required: false },
    end: { pattern: EPOCH_MS_RULE, required: false },
    // Used by the backup source. The same characters as the symbol (a listed market may be written in Chinese characters); OKX is asked for ASCII codes only.
    base: { pattern: MARKET_TEXT_RULE, required: false },
    quote: { pattern: MARKET_TEXT_RULE, required: false },
  },
  upstreamHosts: [BINANCE_SPOT_HOST, BINANCE_USDM_HOST, OKX_HOST, OANDA_PRACTICE_HOST, OANDA_LIVE_HOST],
  cache: MARKET_CANDLES_OPEN_CACHE,
  async handle({ query, env, upstream, now }) {
    if (query.get('market') === 'oanda-forex') return forexCandles(query, env, upstream, now);
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
 * U10 (D231): forex and metal candles from OANDA with the owner's token. Without the source and the key the answer is
 * "not set up", never a made-up candle. OANDA has no backup source.
 */
async function forexCandles(query: URLSearchParams, env: KairosApiEnv, upstream: UpstreamFetch, now: Date): Promise<RouteAnswer> {
  const instrument = oandaInstrument(query.get('symbol') ?? '');
  const interval = query.get('interval');
  const granularity = isMarketInterval(interval) ? OANDA_GRANULARITY[interval] : undefined;
  const limit = digits(query.get('limit')) ?? 0;
  const startMs = digits(query.get('start'));
  const endMs = digits(query.get('end'));
  if (instrument === null || !isMarketInterval(interval) || granularity === undefined || query.has('base') || query.has('quote')
    || limit > MAX_CANDLES || (startMs !== null && endMs !== null && startMs > endMs)) return { ok: false, reason: 'bad-request' };
  const source = forexSource(env.KAIROS_FOREX_SOURCE);
  const key = env.MARKET_DATA_API_KEY;
  // Not set up until the owner adds the token (O4a): said as such, never as a made-up or empty page.
  if (source === null || key === undefined || key === '') return { ok: false, reason: 'not-set-up' };
  const ask = { interval, limit, startMs, endMs };
  const answerSource = { provider: 'oanda', market: 'forex', symbol: instrument };
  // OANDA refuses a start in the future; there are no candles there yet.
  if (startMs !== null && startMs > now.getTime()) return candlesAnswer(answerSource, null, interval, [], true, ask, now);
  const result = await upstream(oandaCandlesUrl(oandaHost(source), instrument, granularity, ask, now.getTime()), {
    accept: 'application/json', headers: { authorization: `Bearer ${key}` }, readErrorBody: true,
  });
  if (!result.ok) return oandaFailure(result);
  const decoded = decodeOandaCandles(result.text, instrument, granularity, ask);
  if (decoded === null) return { ok: false, reason: 'source-unavailable' };
  return candlesAnswer(answerSource, null, interval, decoded.candles, decoded.closed, ask, now);
}

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

/** Coin names change rarely: a day in Workers Cache and KV, an hour in memory (D255). */
export const MARKET_COIN_NAMES_CACHE: RouteCachePolicy = Object.freeze({ version: 1, edgeSeconds: 86_400, memorySeconds: 3_600, kvSeconds: 86_400 });
/** CoinGecko's 250 coins with their prices and supply are about 200 KB. */
const COIN_NAMES_MAX_BYTES = 2_097_152;

/** U14 (D255): coin names for the symbol search, only with the owner's CoinGecko key (O6); never a guessed name. */
const marketCoinNamesRoute: KairosApiRoute = {
  id: 'market-coin-names',
  path: '/market/coin-names',
  access: 'public',
  rateLimited: true,
  query: {},
  upstreamHosts: [COINGECKO_DEMO_HOST, COINGECKO_PRO_HOST],
  cache: MARKET_COIN_NAMES_CACHE,
  async handle({ env, upstream, now }) {
    const key = env.COIN_DATA_API_KEY;
    // Not set up until the owner adds the key (O6): said as such, never as an empty list.
    if (key === undefined || key === '') return { ok: false, reason: 'not-set-up' };
    const { url, headers } = coinNamesRequest(coinDataPlan(env.COIN_DATA_PLAN), key);
    const result = await upstream(url, { accept: 'application/json', headers, maxBytes: COIN_NAMES_MAX_BYTES, readErrorBody: true });
    if (!result.ok) return coinGeckoFailure(result);
    const names = decodeCoinGeckoMarkets(result.text);
    if (names === null || names.length === 0) return { ok: false, reason: 'source-unavailable' };
    return { ok: true, data: { source: 'coingecko', fetchedAt: now.toISOString(), names } };
  },
};

export const MARKET_ROUTES: readonly KairosApiRoute[] = Object.freeze([marketSymbolsRoute, marketTickersRoute, marketMovesRoute, marketCandlesRoute, marketCoinNamesRoute]);
