/**
 * P27: the past candles for one replay. One candle page on demand: 60 candles before the chosen moment and up to 240 after it, finished candles only, from Binance for crypto or from OANDA through the Kairos server for a forex pair or metal (U10, D236). Candles are market reference held in memory by the page (D15); nothing is stored or cached here. The live price and the trade stream are never read.
 */

import { decimalNormalize } from '../../domain/calculations/decimalKernel';
import type { LiveMarketUniverseInstrumentMetadataAcquisitionPort } from '../../services/market-data/LiveMarketUniverseInstrumentMetadataAcquisitionPort';
import type { MarketCandle, MarketCandleHistoryPort, MarketCandleOrigin } from '../../services/market-data/MarketCandleHistoryPort';
import type { MarketDataUnavailableWhy } from '../../services/market-data/marketDataTypes';
import { describeCandleSource, matchCryptoMarket, matchNoteFor } from '../market-reference/cryptoMarket';
import { normalizeTradeSymbol } from '../../domain/trades';
import { plainForexPair, type ForexPair } from '../markets/forexPair';
import { FOREX_CANDLE_VENUE } from '../trade-visualizer/tradePictureCandles';
import { isPriceCurrencyInput } from '../trades/priceCurrencyInput';

export const REPLAY_HISTORY_CANDLES = 60;
export const REPLAY_FUTURE_CANDLES = 240;
export const REPLAY_CANDLE_SIZES = Object.freeze([
  Object.freeze({ interval: '15m', label: '15 minutes', ms: 15 * 60_000 }),
  Object.freeze({ interval: '1h', label: '1 hour', ms: 60 * 60_000 }),
  Object.freeze({ interval: '4h', label: '4 hours', ms: 4 * 60 * 60_000 }),
  Object.freeze({ interval: '1d', label: '1 day', ms: 24 * 60 * 60_000 }),
] as const);
export type ReplayCandleSize = (typeof REPLAY_CANDLE_SIZES)[number];
/** The market venue and its ports; the composition root passes the app's Binance ports. */
export interface ReplayMarketDeps {
  readonly venue: string;
  readonly history: MarketCandleHistoryPort;
  readonly metadata: LiveMarketUniverseInstrumentMetadataAcquisitionPort;
  readonly nowMs?: () => number;
  readonly signal?: AbortSignal;
}
export interface ReplayRequest { readonly market: string; readonly candleSize: string; readonly startAt: string }
export interface LoadedReplay {
  readonly symbol: string;
  /** The market's quote asset, the currency its prices are in; null when it is not a plain code. */
  readonly quoteAsset: string | null;
  readonly candleSize: ReplayCandleSize;
  readonly candles: readonly MarketCandle[];
  /** How many candles are shown when the replay starts. */
  readonly startIndex: number;
  /** Where the candles came from ("Candles: Binance Spot · BTC/USDT"). */
  readonly source: string;
  /** How the typed market was matched, when it was not typed exactly; null otherwise. */
  readonly note: string | null;
  /** 'forex' for a forex pair or metal from OANDA (D236); crypto when absent. */
  readonly marketType?: 'crypto' | 'forex';
}
/** 'forex-not-listed': OANDA has no such pair; 'needs-server': this build has no Kairos server, so no forex candles. */
export type ReplayLoadFailure =
  | 'market-required' | 'candle-size-invalid' | 'start-invalid' | 'start-in-future' | 'unknown-market' | 'forex-not-listed' | 'needs-server' | 'no-history' | 'no-future' | 'unavailable';
export type ReplayLoadResult =
  | { readonly ok: true; readonly replay: LoadedReplay }
  | { readonly ok: false; readonly reason: ReplayLoadFailure; readonly why?: MarketDataUnavailableWhy; readonly retryAfterSeconds?: number | null };

const fail = (reason: ReplayLoadFailure): ReplayLoadResult => Object.freeze({ ok: false as const, reason });

/** A port failure as 'unavailable' with its reason: the typed one when the port gave it, else "the source didn't answer". */
const unavailable = (result?: { readonly reason: string; readonly why?: MarketDataUnavailableWhy; readonly retryAfterSeconds?: number | null }): ReplayLoadResult =>
  Object.freeze(result !== undefined && result.reason === 'unavailable' && result.why !== undefined
    ? { ok: false as const, reason: 'unavailable' as const, why: result.why, retryAfterSeconds: result.retryAfterSeconds ?? null }
    : { ok: false as const, reason: 'unavailable' as const, why: 'source-down' as const, retryAfterSeconds: null });

/** One candle with every price (and the volume, when there is one) in its shortest exact form, or null when one is not a decimal. */
function normalizeCandle(candle: MarketCandle): MarketCandle | null {
  const open = decimalNormalize(candle.open), high = decimalNormalize(candle.high), low = decimalNormalize(candle.low), close = decimalNormalize(candle.close);
  if (!open.ok || !high.ok || !low.ok || !close.ok) return null;
  const prices = { openTime: candle.openTime, closeTime: candle.closeTime, open: open.value, high: high.value, low: low.value, close: close.value };
  if (candle.volume === undefined) return Object.freeze(prices);
  const volume = decimalNormalize(candle.volume);
  return volume.ok ? Object.freeze({ ...prices, volume: volume.value }) : null;
}

/** The page's finished candles in their shortest exact form, and how many come before the start; null when a price is not a decimal. */
function finishedCandles(candles: readonly MarketCandle[], alignedStart: number, nowMs: number): { readonly candles: readonly MarketCandle[]; readonly startIndex: number } | null {
  // The last candle of a page may still be forming: only finished candles are replayed.
  const finished: MarketCandle[] = [];
  for (const candle of candles) {
    if (!(Date.parse(candle.closeTime) < nowMs)) continue;
    const normalized = normalizeCandle(candle);
    if (normalized === null) return null;
    finished.push(normalized);
  }
  // Weekends and holidays have no candles: the replay steps over them as over any gap.
  return { candles: Object.freeze(finished), startIndex: finished.filter(candle => Date.parse(candle.openTime) < alignedStart).length };
}

/**
 * A forex pair or metal's candles from OANDA through the Kairos server (D236): no market list, no backup, mid prices.
 * Forex closes at weekends, so the 60 candles before the moment and the 240 after it are read by count, not by time:
 * a replay started on a Sunday still gets Friday's candles before it.
 */
async function loadForexReplay(
  pair: ForexPair, size: ReplayCandleSize, alignedStart: number, nowMs: number, deps: ReplayMarketDeps, options: { readonly signal?: AbortSignal } | undefined,
): Promise<ReplayLoadResult> {
  const instrument = { venue: FOREX_CANDLE_VENUE, symbol: pair.symbol };
  const [before, after] = await Promise.all([
    deps.history.acquireHistory({ instrument, interval: size.interval, limit: REPLAY_HISTORY_CANDLES, endTimeMs: alignedStart - 1 }, options),
    // An end with room for weekends lets the server keep a settled page for days (D232's 7-day cache).
    deps.history.acquireHistory({ instrument, interval: size.interval, limit: REPLAY_FUTURE_CANDLES, startTimeMs: alignedStart, endTimeMs: Math.min(alignedStart + 2 * REPLAY_FUTURE_CANDLES * size.ms - 1, nowMs) }, options),
  ]);
  for (const page of [before, after]) {
    if (page.ok) continue;
    if (page.reason === 'invalid-request' && page.detail === 'venue-mismatch') return fail('needs-server');
    if (page.reason === 'unavailable' && page.why === 'unknown-market') return fail('forex-not-listed');
    return unavailable(page);
  }
  if (!before.ok || !after.ok) return unavailable();
  const finished = finishedCandles([...before.snapshot.candles, ...after.snapshot.candles], alignedStart, nowMs);
  if (finished === null) return Object.freeze({ ok: false as const, reason: 'unavailable' as const, why: 'unreadable' as const, retryAfterSeconds: null });
  if (finished.startIndex === 0) return fail('no-history');
  if (finished.startIndex === finished.candles.length) return fail('no-future');
  const origin: MarketCandleOrigin = after.snapshot.origin ?? before.snapshot.origin ?? { provider: 'oanda', market: 'forex', symbol: pair.symbol, backup: null };
  return Object.freeze({ ok: true as const, replay: Object.freeze({
    symbol: pair.symbol, quoteAsset: pair.quote, candleSize: size, candles: finished.candles, startIndex: finished.startIndex,
    source: describeCandleSource(origin, pair, 'spot'), note: null, marketType: 'forex' as const,
  }) });
}

/**
 * Past candles around one moment for a replay, always spot (practice is spot). A market that is plainly forex or a metal
 * (plainForexPair) comes from OANDA; any other from Binance's list. It never rejects: any port failure is 'unavailable', with its reason.
 */
export async function loadReplayCandles(request: ReplayRequest, deps: ReplayMarketDeps): Promise<ReplayLoadResult> {
  try {
    if (normalizeTradeSymbol(request.market) === '') return fail('market-required');
    const size = REPLAY_CANDLE_SIZES.find(item => item.interval === request.candleSize);
    if (size === undefined) return fail('candle-size-invalid');
    // A datetime-local value is read in the device's time zone.
    const startMs = new Date(request.startAt.trim()).getTime();
    if (!Number.isFinite(startMs)) return fail('start-invalid');
    const nowMs = (deps.nowMs ?? Date.now)();
    if (startMs > nowMs) return fail('start-in-future');
    // Binance's 15m, 1h, 4h and 1d candles start on these UTC boundaries.
    const alignedStart = Math.floor(startMs / size.ms) * size.ms;
    const fromMs = alignedStart - REPLAY_HISTORY_CANDLES * size.ms;
    if (fromMs < 0) return fail('no-history');

    const options = deps.signal ? { signal: deps.signal } : undefined;
    const forex = plainForexPair(request.market);
    if (forex !== null) return await loadForexReplay(forex, size, alignedStart, nowMs, deps, options);
    const metadata = await deps.metadata.acquireInstrumentMetadata(options);
    if (!metadata.ok) return unavailable(metadata);
    const match = matchCryptoMarket(request.market, 'crypto', metadata.facts);
    if (!match.ok) return fail('unknown-market');
    const symbol = match.symbol;
    const quote = match.quote.trim().toUpperCase();
    const quoteAsset = quote !== '' && isPriceCurrencyInput(quote) ? quote : null;

    const history = await deps.history.acquireHistory({
      instrument: { venue: deps.venue, symbol },
      interval: size.interval,
      limit: REPLAY_HISTORY_CANDLES + REPLAY_FUTURE_CANDLES,
      startTimeMs: fromMs,
      endTimeMs: Math.min(alignedStart + (REPLAY_FUTURE_CANDLES - 1) * size.ms, nowMs),
      pair: { base: match.base, quote: match.quote },
    }, options);
    if (!history.ok) return unavailable(history);
    const finished = finishedCandles(history.snapshot.candles, alignedStart, nowMs);
    if (finished === null) return Object.freeze({ ok: false as const, reason: 'unavailable' as const, why: 'unreadable' as const, retryAfterSeconds: null });
    const { candles, startIndex } = finished;
    if (startIndex === 0) return fail('no-history');
    if (startIndex === candles.length) return fail('no-future');
    return Object.freeze({ ok: true as const, replay: Object.freeze({
      symbol, quoteAsset, candleSize: size, candles, startIndex,
      source: describeCandleSource(history.snapshot.origin, match, 'spot'), note: matchNoteFor(match, 'spot'),
    }) });
  } catch {
    return unavailable();
  }
}
