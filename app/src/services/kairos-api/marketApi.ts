/**
 * U2 (P16.A1): the app's market data from the Kairos server (/market/symbols, /market/tickers, /market/candles).
 * Transport and strict decoding only, over the one server client (kairosApi.ts): the server-backed market ports, the
 * device copy of the market list, and what a server failure means (`why`). The words are onlineWords.ts's.
 */
import { decimalCompare } from '../../domain/calculations/decimalKernel';
import { parseDecimalString, parsePositiveDecimalString, type DecimalString } from '../../domain/trades';
import type { LiveMarketSummaryBaselineAcquisitionPort, LiveMarketSummaryBaselineAcquisitionResult } from '../market-data/LiveMarketSummaryBaselineAcquisitionPort';
import type { LiveMarketUniverseInstrumentMetadataAcquisitionPort, LiveMarketUniverseInstrumentMetadataAcquisitionResult } from '../market-data/LiveMarketUniverseInstrumentMetadataAcquisitionPort';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../market-data/liveMarketUniverseInstrumentMetadataFact';
import { validateLiveMarketSummaryBaselineSuccess } from '../market-data/liveMarketSummaryBaselineAcquisitionSemantics';
import { validateLiveMarketSummaryFact } from '../market-data/liveMarketSummaryFactSemantics';
import type { MarketCandle, MarketCandleHistoryPort, MarketCandleHistoryRequest, MarketCandleOrigin } from '../market-data/MarketCandleHistoryPort';
import { BINANCE_USDM_VENUE, type LiveMarketSummaryFact, type MarketDataUnavailable, type MarketDataUnavailableWhy } from '../market-data/marketDataTypes';
import type { KairosApiClient, KairosApiFailure, KairosApiQuery } from './kairosApi';

/** A device copy of the market list younger than this is used without asking the server. */
export const MARKET_LIST_FRESH_MS = 6 * 60 * 60 * 1000;
/** When the server fails, a device copy up to this old is still used. */
export const MARKET_LIST_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
export const MARKET_LIST_MAX_MARKETS = 5_000;
export const MARKET_TICKERS_MAX_SYMBOLS = 100;
export const MARKET_TICKERS_MAX_QUERY = 3_000;
const MARKET_LIST_CACHE = 'kairos-market-list';
const MARKET_LIST_KEY = '/kairos-market-list/binance-spot';
const SPOT_VENUE = 'binance-spot';

export interface ServerMarket {
  readonly symbol: string;
  readonly base: string;
  readonly quote: string;
  readonly tickSize: DecimalString;
  readonly stepSize: DecimalString;
}

export interface ServerMarketList {
  readonly fetchedAt: string;
  readonly markets: readonly ServerMarket[];
  readonly leftOut: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCanonicalIso = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';
const positive = (value: unknown): DecimalString | null => {
  if (typeof value !== 'string') return null;
  const parsed = parsePositiveDecimalString(value);
  return parsed.ok && parsed.value === value ? parsed.value : null;
};
const nonNegative = (value: unknown): DecimalString | null => {
  if (typeof value !== 'string') return null;
  const parsed = parseDecimalString(value);
  return parsed.ok && parsed.value === value && !value.startsWith('-') ? parsed.value : null;
};

function decodeMarket(value: unknown): ServerMarket | null {
  if (!isRecord(value)) return null;
  const { symbol, base, quote } = value;
  const tickSize = positive(value.tickSize);
  const stepSize = positive(value.stepSize);
  if (!isText(symbol) || !isText(base) || !isText(quote) || base + quote !== symbol || tickSize === null || stepSize === null) return null;
  return Object.freeze({ symbol, base, quote, tickSize, stepSize });
}

/** The /market/symbols data, or null when any part breaks the server's rules (the whole answer is refused). */
export function decodeMarketSymbols(data: unknown): ServerMarketList | null {
  if (!isRecord(data) || data.source !== 'binance-spot' || !isCanonicalIso(data.fetchedAt)) return null;
  const { markets, leftOut } = data;
  if (!Array.isArray(markets) || markets.length > MARKET_LIST_MAX_MARKETS || typeof leftOut !== 'number' || !Number.isSafeInteger(leftOut) || leftOut < 0) return null;
  const decoded: ServerMarket[] = [];
  for (const item of markets as unknown[]) {
    const market = decodeMarket(item);
    // Ascending and unique, as the server sends them.
    if (market === null || (decoded.length > 0 && !(decoded[decoded.length - 1].symbol < market.symbol))) return null;
    decoded.push(market);
  }
  return Object.freeze({ fetchedAt: data.fetchedAt, markets: Object.freeze(decoded), leftOut });
}

/** The /market/tickers data as summary facts in the requested order, or null for any fault (the batch is unreadable). */
export function decodeMarketTickers(data: unknown, requested: readonly string[]): readonly LiveMarketSummaryFact[] | null {
  if (!isRecord(data) || data.source !== 'binance-spot' || !isCanonicalIso(data.fetchedAt) || !Array.isArray(data.tickers)) return null;
  const tickers = data.tickers as unknown[];
  if (tickers.length !== requested.length) return null;
  const facts: LiveMarketSummaryFact[] = [];
  for (const [index, item] of tickers.entries()) {
    if (!isRecord(item) || item.symbol !== requested[index] || !isCanonicalIso(item.openTime) || !isCanonicalIso(item.closeTime)) return null;
    const [lastPrice, openPrice, highPrice, lowPrice, volume, quoteVolume] = (['lastPrice', 'openPrice', 'highPrice', 'lowPrice', 'volume', 'quoteVolume'] as const).map((field) => nonNegative(item[field]));
    if (lastPrice === null || openPrice === null || highPrice === null || lowPrice === null || volume === null || quoteVolume === null) return null;
    const fact: LiveMarketSummaryFact = {
      instrument: { venue: SPOT_VENUE, symbol: requested[index] },
      lastPrice, open24h: openPrice, high24h: highPrice, low24h: lowPrice, baseVolume24h: volume, quoteVolume24h: quoteVolume,
      // The server's read time, so Home's freshness check stays honest.
      observedAt: data.fetchedAt,
      sourceTimestamp: item.closeTime,
    };
    const validated = validateLiveMarketSummaryFact(fact);
    if (!validated.ok) return null;
    facts.push(Object.freeze(validated.fact));
  }
  return Object.freeze(facts);
}

const PROVIDERS = ['binance', 'okx'] as const;
const MARKETS = ['spot', 'usdm-futures', 'perpetual-swap'] as const;
const BACKUPS = ['refused', 'busy', 'down'] as const;
const atLeast = (a: DecimalString, b: DecimalString) => { const order = decimalCompare(a, b); return order !== null && order >= 0; };

export interface ServerCandlePage {
  readonly fetchedAt: string;
  readonly origin: MarketCandleOrigin;
  readonly candles: readonly MarketCandle[];
  readonly next: number | null;
}

/** The /market/candles data for this request, or null for any fault. */
export function decodeMarketCandles(data: unknown, request: MarketCandleHistoryRequest): ServerCandlePage | null {
  if (!isRecord(data) || !isRecord(data.source) || !isCanonicalIso(data.fetchedAt) || data.interval !== request.interval || !Array.isArray(data.candles)) return null;
  const { provider, market, symbol } = data.source;
  const backup = data.backup;
  if (!PROVIDERS.includes(provider as never) || !MARKETS.includes(market as never) || !isText(symbol)) return null;
  if (backup !== null && !BACKUPS.includes(backup as never)) return null;
  const rows = data.candles as unknown[];
  if (rows.length > request.limit) return null;
  const candles: MarketCandle[] = [];
  let previousOpenMs = -Infinity;
  for (const row of rows) {
    if (!isRecord(row) || !isCanonicalIso(row.openTime) || !isCanonicalIso(row.closeTime)) return null;
    const openMs = Date.parse(row.openTime);
    const closeMs = Date.parse(row.closeTime);
    if (openMs <= previousOpenMs || closeMs <= openMs) return null;
    if ((request.startTimeMs !== undefined && openMs < request.startTimeMs) || (request.endTimeMs !== undefined && openMs > request.endTimeMs)) return null;
    const open = positive(row.open), high = positive(row.high), low = positive(row.low), close = positive(row.close);
    const volume = nonNegative(row.volume);
    if (open === null || high === null || low === null || close === null || volume === null) return null;
    if (!atLeast(high, open) || !atLeast(high, close) || !atLeast(open, low) || !atLeast(close, low)) return null;
    candles.push(Object.freeze({ openTime: row.openTime, closeTime: row.closeTime, open, high, low, close, volume }));
    previousOpenMs = openMs;
  }
  const next = data.next;
  if (next !== null && !(typeof next === 'number' && Number.isSafeInteger(next) && (candles.length === 0 || next > previousOpenMs))) return null;
  const origin: MarketCandleOrigin = Object.freeze({
    provider: provider as MarketCandleOrigin['provider'],
    market: market as MarketCandleOrigin['market'],
    symbol,
    backup: backup as MarketCandleOrigin['backup'],
  });
  return Object.freeze({ fetchedAt: data.fetchedAt, origin, candles: Object.freeze(candles), next: next as number | null });
}

const unavailable = (why: MarketDataUnavailableWhy, retryAfterSeconds: number | null = null): MarketDataUnavailable =>
  Object.freeze({ ok: false as const, reason: 'unavailable' as const, why, retryAfterSeconds });

/** What a server client failure means for market data. */
export function marketDataUnavailableOf(failure: KairosApiFailure, isOnline: () => boolean = () => globalThis.navigator?.onLine !== false): MarketDataUnavailable {
  switch (failure.reason) {
    case 'not-set-up': return unavailable('not-set-up');
    // The server or the network path failed while the device is online.
    case 'transport-failed': return unavailable(isOnline() ? 'source-down' : 'offline');
    case 'invalid-response': return unavailable('unreadable');
    case 'unavailable': {
      const retry = failure.retryAfterSeconds;
      switch (failure.serverReason) {
        case 'rate-limited':
        case 'source-busy': return unavailable('busy', retry);
        case 'source-refused': return unavailable('region', retry);
        case 'unknown-market': return unavailable('unknown-market', retry);
        case 'not-set-up':
        case 'device-not-recognised': return unavailable('not-set-up', retry);
        default: return unavailable('source-down', retry);
      }
    }
  }
}

/** The device copy of the market list; read and write never throw. */
export interface MarketListStore {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

/** Cache Storage `kairos-market-list` (the service worker deletes only kairos-app-shell-* caches); null without Cache Storage. */
export function browserMarketListStore(): MarketListStore | null {
  const storage = globalThis.caches;
  if (storage === undefined) return null;
  const key = () => new Request(MARKET_LIST_KEY);
  return Object.freeze({
    async read() {
      try {
        const cache = await storage.open(MARKET_LIST_CACHE);
        const response = await cache.match(key());
        return response === undefined ? null : await response.text();
      } catch { return null; }
    },
    async write(text: string) {
      try {
        const cache = await storage.open(MARKET_LIST_CACHE);
        await cache.put(key(), new Response(text, { headers: { 'content-type': 'application/json' } }));
      } catch { /* a copy that cannot be kept is only a slower next start */ }
    },
  });
}

interface DeviceCopy { readonly storedAt: number; readonly markets: readonly ServerMarket[] }

/** The stored text checked with the server's rules again; a bad copy reads as null. */
function decodeDeviceCopy(text: string | null): DeviceCopy | null {
  if (text === null) return null;
  let body: unknown;
  try { body = JSON.parse(text); } catch { return null; }
  if (!isRecord(body) || typeof body.storedAt !== 'number' || !Number.isSafeInteger(body.storedAt)) return null;
  const list = decodeMarketSymbols({ source: 'binance-spot', fetchedAt: new Date(0).toISOString(), markets: body.markets, leftOut: 0 });
  return list === null || list.markets.length === 0 ? null : { storedAt: body.storedAt, markets: list.markets };
}

const factsOf = (markets: readonly ServerMarket[]): readonly LiveMarketUniverseInstrumentMetadataFact[] =>
  Object.freeze(markets.map((market) => Object.freeze({
    instrument: Object.freeze({ venue: SPOT_VENUE, symbol: market.symbol }),
    baseAsset: market.base,
    quoteAsset: market.quote,
    tradingEnabled: true,
    tickSize: market.tickSize,
    stepSize: market.stepSize,
  })));

type MetadataResult = LiveMarketUniverseInstrumentMetadataAcquisitionResult;
type InFlight = { promise: Promise<MetadataResult>; readonly controller: AbortController; waiters: number };

export interface KairosMarketDataPorts {
  readonly history: MarketCandleHistoryPort;
  readonly metadata: LiveMarketUniverseInstrumentMetadataAcquisitionPort;
  readonly baseline: LiveMarketSummaryBaselineAcquisitionPort;
}

export interface KairosMarketDataPortOptions {
  readonly store: MarketListStore | null;
  readonly now?: () => number;
  readonly isOnline?: () => boolean;
}

/** One ticker batch: at most 100 symbols and at most 3,000 characters of encoded query. */
function tickerBatches(symbols: readonly string[]): readonly (readonly string[])[] {
  const batches: string[][] = [];
  let current: string[] = [];
  for (const symbol of symbols) {
    const candidate = [...current, symbol];
    const length = new URLSearchParams({ symbols: candidate.join(',') }).toString().length;
    if (current.length > 0 && (candidate.length > MARKET_TICKERS_MAX_SYMBOLS || length > MARKET_TICKERS_MAX_QUERY)) {
      batches.push(current);
      current = [symbol];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function createKairosMarketDataPorts(client: KairosApiClient, options: KairosMarketDataPortOptions): KairosMarketDataPorts {
  const now = options.now ?? (() => Date.now());
  const isOnline = options.isOnline ?? (() => globalThis.navigator?.onLine !== false);
  const failed = (failure: KairosApiFailure) => marketDataUnavailableOf(failure, isOnline);
  let session: { readonly facts: readonly LiveMarketUniverseInstrumentMetadataFact[]; readonly storedAt: number } | null = null;
  let inFlight: InFlight | null = null;
  const ageOk = (storedAt: number, limit: number) => { const age = now() - storedAt; return age >= 0 && age <= limit; };

  const history: MarketCandleHistoryPort = {
    async acquireHistory(request, callerOptions) {
      const { venue, symbol } = request.instrument;
      if (venue !== SPOT_VENUE && venue !== BINANCE_USDM_VENUE) return { ok: false, reason: 'invalid-request', detail: 'venue-mismatch' };
      const signal = callerOptions?.signal;
      if (signal?.aborted) return { ok: false, reason: 'cancelled' };
      const query: Record<string, string> = { market: venue, symbol, interval: request.interval, limit: String(request.limit) };
      if (request.startTimeMs !== undefined) query.start = String(request.startTimeMs);
      if (request.endTimeMs !== undefined) query.end = String(request.endTimeMs);
      if (request.pair !== undefined) { query.base = request.pair.base; query.quote = request.pair.quote; }
      const result = await client.request('/market/candles', query as KairosApiQuery, (data) => decodeMarketCandles(data, request), signal === undefined ? undefined : { signal });
      if (signal?.aborted) return { ok: false, reason: 'cancelled' };
      if (!result.ok) return failed(result);
      const page = result.value;
      return { ok: true, snapshot: Object.freeze({ source: 'market-reference' as const, timeZone: 'UTC' as const, request, observedAt: page.fetchedAt, candles: page.candles, origin: page.origin }) };
    },
  };

  /** One /market/symbols request shared by every caller; a failure falls back to a device copy up to 7 days old. */
  function startSharedRequest(): InFlight {
    const controller = new AbortController();
    const entry: InFlight = { controller, waiters: 0, promise: Promise.resolve({ ok: false, reason: 'acquisition-failed' }) };
    entry.promise = (async (): Promise<MetadataResult> => {
      const result = await client.request('/market/symbols', {}, decodeMarketSymbols, { signal: controller.signal });
      if (result.ok && result.value.markets.length > 0) {
        const storedAt = now();
        const facts = factsOf(result.value.markets);
        if (inFlight === entry) session = { facts, storedAt };
        await options.store?.write(JSON.stringify({ storedAt, markets: result.value.markets }));
        return { ok: true, facts };
      }
      const copy = decodeDeviceCopy((await options.store?.read()) ?? null);
      if (copy !== null && ageOk(copy.storedAt, MARKET_LIST_KEEP_MS)) return { ok: true, facts: factsOf(copy.markets) };
      // An empty list is never kept: it would hide every market.
      return result.ok ? unavailable('unreadable') : failed(result);
    })().finally(() => { if (inFlight === entry) inFlight = null; });
    return entry;
  }

  /** A caller's abort ends only its own wait; the request stops when every waiter has left. */
  function waitFor(entry: InFlight, signal: AbortSignal | undefined): Promise<MetadataResult> {
    entry.waiters += 1;
    return new Promise((resolve) => {
      let settled = false;
      const leave = () => { settled = true; entry.waiters -= 1; signal?.removeEventListener('abort', onAbort); };
      const onAbort = () => {
        if (settled) return;
        leave();
        if (entry.waiters === 0) {
          if (inFlight === entry) inFlight = null;
          entry.controller.abort();
        }
        resolve({ ok: false, reason: 'acquisition-failed' });
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      void entry.promise.then((result) => { if (!settled) { leave(); resolve(result); } });
    });
  }

  const metadata: LiveMarketUniverseInstrumentMetadataAcquisitionPort = {
    async acquireInstrumentMetadata(callerOptions) {
      const signal = callerOptions?.signal;
      if (signal?.aborted) return { ok: false, reason: 'acquisition-failed' };
      if (session !== null && ageOk(session.storedAt, MARKET_LIST_FRESH_MS)) return { ok: true, facts: session.facts };
      if (inFlight === null) {
        const copy = decodeDeviceCopy((await options.store?.read()) ?? null);
        if (copy !== null && ageOk(copy.storedAt, MARKET_LIST_FRESH_MS)) {
          session = { facts: factsOf(copy.markets), storedAt: copy.storedAt };
          return { ok: true, facts: session.facts };
        }
      }
      if (signal?.aborted) return { ok: false, reason: 'acquisition-failed' };
      if (inFlight === null) inFlight = startSharedRequest();
      return waitFor(inFlight, signal);
    },
  };

  const baseline: LiveMarketSummaryBaselineAcquisitionPort = {
    async acquireBaseline(scope, callerOptions): Promise<LiveMarketSummaryBaselineAcquisitionResult> {
      const symbols = scope.map((instrument) => instrument.symbol);
      if (scope.some((instrument) => instrument.venue !== SPOT_VENUE) || new Set(symbols).size !== symbols.length) return { ok: false, reason: 'acquisition-failed' };
      const signal = callerOptions?.signal;
      const bySymbol = new Map<string, LiveMarketSummaryFact>();
      // One ascending order means one cache key for every device.
      const ascending = [...symbols].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      for (const batch of tickerBatches(ascending)) {
        if (signal?.aborted) return { ok: false, reason: 'acquisition-failed' };
        const result = await client.request('/market/tickers', { symbols: batch.join(',') }, (data) => decodeMarketTickers(data, batch), signal === undefined ? undefined : { signal });
        if (!result.ok) return failed(result);
        for (const fact of result.value) bySymbol.set(fact.instrument.symbol, fact);
      }
      const facts = scope.map((instrument) => bySymbol.get(instrument.symbol) as LiveMarketSummaryFact);
      const validated = validateLiveMarketSummaryBaselineSuccess(scope, { completeness: 'complete-for-scope', scope: [...scope], facts });
      return validated.ok ? { ok: true, delivery: validated.delivery } : unavailable('unreadable');
    },
  };

  return Object.freeze({ history, metadata, baseline });
}
