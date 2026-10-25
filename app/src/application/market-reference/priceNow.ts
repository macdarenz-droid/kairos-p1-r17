/**
 * U14 (D256): the one owner of "Price now" in the trade form: the latest 1-minute candle up to now, through the same
 * history port and market list as the trade picture. Crypto (spot, or futures for a futures trade) from Binance through
 * the Kairos server, where the open minute's close is the last trade; forex and metals from OANDA, mid prices. The price
 * is the candle's close as the source wrote it; nothing is rounded or made up.
 */
import type { DecimalString, MarketType } from '../../domain/trades';
import type { LiveMarketUniverseInstrumentMetadataAcquisitionPort } from '../../services/market-data/LiveMarketUniverseInstrumentMetadataAcquisitionPort';
import type { MarketCandleHistoryPort, MarketCandleHistoryResult } from '../../services/market-data/MarketCandleHistoryPort';
import type { MarketDataInstrument, MarketDataUnavailableWhy } from '../../services/market-data/marketDataTypes';
import { parseForexPair } from '../markets/forexPair';
import { describeMarketDataUnavailable, type MarketSourceWords } from '../online/onlineWords';
import { FOREX_CANDLE_VENUE, FUTURES_CANDLE_VENUE, tradePictureCandleSource } from '../trade-visualizer/tradePictureCandles';
import { describeFuturesOnlyNotListed, futuresOnlyMarket, matchCryptoMarket } from './cryptoMarket';

export interface PriceNowDeps {
  /** The Binance Spot venue the market list names. */
  readonly venue: string;
  readonly history: MarketCandleHistoryPort;
  readonly metadata: LiveMarketUniverseInstrumentMetadataAcquisitionPort;
}

/** `no-source`: stocks, a forex symbol that is not a pair, options and other markets (D233, D235). `invalid-symbol`: nothing typed. */
export type PriceNowFailure = 'no-source' | 'invalid-symbol' | 'not-listed' | 'no-candles' | MarketDataUnavailableWhy;

export type PriceNowResult =
  | Readonly<{
      ok: true; price: DecimalString;
      /** When that minute opened (ISO). */
      at: string;
      source: 'binance' | 'oanda';
      /** The market as the trader reads it: BTCUSDT, EUR/USD. */
      market: string;
      /** OANDA's mid price, between the bid and the ask. */
      midPrice: boolean;
      /** Read from Binance Futures (a futures trade). */
      futures: boolean;
      /**
       * U16 (D268): the currency the price is in: the Binance pair's quote (USDT), or a forex pair's when it is one of the
       * eight currencies Kairos knows (quoteKnown); null when Kairos does not know it (a futures-only market read by its name).
       */
      quote: string | null;
    }>
  | Readonly<{ ok: false; why: PriceNowFailure; retryAfterSeconds: number | null; note: string | null; source: MarketSourceWords }>;

const MINUTE_MS = 60_000;
/** A few minutes back, so a quiet market's last minute is still found. */
const LOOK_BACK_MINUTES = 5;

/**
 * Whether the form offers market prices for this market: crypto and futures (Binance) and forex pairs (OANDA). Not
 * stocks (D233), and not options or other markets, whose prices are not the market's own price.
 */
export function hasPriceNow(marketType: MarketType | '', symbol: string): boolean {
  if (marketType !== 'crypto' && marketType !== 'futures' && marketType !== 'forex') return false;
  return symbol.trim() !== '' && tradePictureCandleSource(marketType, symbol) !== null;
}

/** Why a candle read failed, in the form's words. A futures-only market the source doesn't have is "not listed" (D171). */
export function formMarketReadFailure(market: Extract<FormMarketSource, { ok: true }>, result: Extract<MarketCandleHistoryResult, { ok: false }>): Extract<PriceNowResult, { ok: false }> {
  const failure = result as { readonly reason: string; readonly why?: MarketDataUnavailableWhy; readonly retryAfterSeconds?: number | null };
  if (market.futuresOnly !== null) {
    if (failure.reason === 'unavailable' && failure.why === 'unknown-market') return Object.freeze({ ok: false as const, why: 'not-listed' as const, retryAfterSeconds: null, note: describeFuturesOnlyNotListed(market.futuresOnly.typed), source: market.words });
    if (failure.reason === 'invalid-request') return Object.freeze({ ok: false as const, why: 'not-listed' as const, retryAfterSeconds: null, note: `${market.futuresOnly.spotNote} Futures candles need the Kairos server.`, source: market.words });
  }
  const why = failure.reason === 'unavailable' && failure.why !== undefined ? failure.why : 'source-down';
  return Object.freeze({ ok: false as const, why, retryAfterSeconds: failure.retryAfterSeconds ?? null, note: null, source: market.words });
}

function fromCandles(result: MarketCandleHistoryResult, market: Extract<FormMarketSource, { ok: true }>, nowMs: number): PriceNowResult {
  if (!result.ok) return formMarketReadFailure(market, result);
  // Binance's open minute closes at the last trade; OANDA's open minute is not a finished mid price yet (D256).
  const candles = market.source === 'oanda' ? result.snapshot.candles.filter(candle => Date.parse(candle.closeTime) < nowMs) : result.snapshot.candles;
  const last = candles[candles.length - 1];
  if (last === undefined) return Object.freeze({ ok: false as const, why: 'no-candles' as const, retryAfterSeconds: null, note: null, source: market.words });
  return Object.freeze({ ok: true as const, price: last.close, at: last.openTime, source: market.source, market: market.market, midPrice: market.source === 'oanda', futures: market.instrument.venue === FUTURES_CANDLE_VENUE, quote: market.quote });
}

/** A typed market as the candle source names it, or why it has none: the shared first step of "Price now" and the minute check (D256, D257). */
export type FormMarketSource =
  | Readonly<{
      ok: true; instrument: MarketDataInstrument; pair: Readonly<{ base: string; quote: string }> | null; source: 'binance' | 'oanda'; market: string; words: MarketSourceWords;
      /** The currency the market's price is in, when Kairos knows it (PriceNowResult.quote). */
      quote: string | null;
      /** A futures-only market (D171), read from Binance Futures by its name alone: what was typed and the spot list's note. */
      futuresOnly: Readonly<{ typed: string; spotNote: string }> | null;
      /** A futures trade on a market Binance Spot also lists: its spot venue, read once when there are no futures candles. */
      spotVenue: string | null;
    }>
  | Extract<PriceNowResult, { ok: false }>;

export async function resolveFormMarket(
  deps: PriceNowDeps, ask: Readonly<{ marketType: MarketType; symbol: string }>, signal: Readonly<{ signal: AbortSignal }> | undefined,
): Promise<FormMarketSource> {
  const binance: MarketSourceWords = { provider: 'binance' };
  const none = (why: 'no-source' | 'invalid-symbol') => Object.freeze({ ok: false as const, why, retryAfterSeconds: null, note: null, source: binance });
  if (ask.symbol.trim() === '') return none('invalid-symbol');
  if (!hasPriceNow(ask.marketType, ask.symbol)) return none('no-source');
  if (tradePictureCandleSource(ask.marketType, ask.symbol) === 'forex') {
    const parsed = parseForexPair(ask.symbol);
    if (!parsed.ok) return none('no-source');
    const pair = parsed.pair;
    return Object.freeze({ ok: true as const, instrument: { venue: FOREX_CANDLE_VENUE, symbol: pair.symbol }, pair: null, source: 'oanda' as const, market: pair.label, words: { provider: 'oanda' as const, pair: pair.label }, quote: pair.quoteKnown ? pair.quote : null, futuresOnly: null, spotVenue: null });
  }
  const listed = await deps.metadata.acquireInstrumentMetadata(signal);
  if (!listed.ok) {
    const failure = listed as { readonly reason: string; readonly why?: MarketDataUnavailableWhy; readonly retryAfterSeconds?: number | null };
    const why = failure.reason === 'unavailable' && failure.why !== undefined ? failure.why : 'source-down';
    return Object.freeze({ ok: false as const, why, retryAfterSeconds: failure.retryAfterSeconds ?? null, note: null, source: binance });
  }
  const match = matchCryptoMarket(ask.symbol, ask.marketType, listed.facts);
  if (!match.ok) {
    // A futures-only market (D171) is read from Binance Futures by its name, as the trade picture does.
    const futuresOnly = match.why === 'not-listed' ? futuresOnlyMarket(ask.symbol, ask.marketType) : null;
    if (futuresOnly === null) return Object.freeze({ ok: false as const, why: 'not-listed' as const, retryAfterSeconds: null, note: match.note, source: binance });
    return Object.freeze({ ok: true as const, instrument: { venue: FUTURES_CANDLE_VENUE, symbol: futuresOnly }, pair: null, source: 'binance' as const, market: futuresOnly, words: binance, quote: null, futuresOnly: { typed: ask.symbol, spotNote: match.note }, spotVenue: null });
  }
  const venue = match.candles === 'usdm-futures' ? FUTURES_CANDLE_VENUE : deps.venue;
  return Object.freeze({
    ok: true as const, instrument: { venue, symbol: match.symbol }, pair: { base: match.base, quote: match.quote }, source: 'binance' as const, market: match.symbol, words: binance, quote: match.quote, futuresOnly: null,
    spotVenue: venue === FUTURES_CANDLE_VENUE ? deps.venue : null,
  });
}

/** Whether a candle read failed only because the source has no futures candles for the market (or none at all, without the Kairos server). */
export function hasNoFuturesCandles(failure: Readonly<{ reason: string; why?: MarketDataUnavailableWhy | null }>): boolean {
  // A history failure carries `why` only when it is 'unavailable'; a stored minute failure keeps the same `why`.
  return failure.why === 'unknown-market' || failure.reason === 'invalid-request';
}

/** The same market read from Binance Spot: what a futures trade falls back to when there are no futures candles, as the trade picture does. */
export function onSpot(market: Extract<FormMarketSource, { ok: true }>): Extract<FormMarketSource, { ok: true }> | null {
  return market.spotVenue === null ? null : Object.freeze({ ...market, instrument: { venue: market.spotVenue, symbol: market.instrument.symbol }, spotVenue: null });
}

/** The price now for a typed market, or why there is none. Never called for a market with no source (hasPriceNow). */
export async function readPriceNow(
  deps: PriceNowDeps, ask: Readonly<{ marketType: MarketType; symbol: string }>, options: Readonly<{ nowMs: number; signal?: AbortSignal }>,
): Promise<PriceNowResult> {
  const window = { interval: '1m', limit: LOOK_BACK_MINUTES + 1, startTimeMs: (Math.floor(options.nowMs / MINUTE_MS) - LOOK_BACK_MINUTES) * MINUTE_MS, endTimeMs: options.nowMs };
  const signal = options.signal === undefined ? undefined : { signal: options.signal };
  try {
    const market = await resolveFormMarket(deps, ask, signal);
    if (!market.ok) return market;
    const readCandles = (read: Extract<FormMarketSource, { ok: true }>) => deps.history.acquireHistory(read.pair === null ? { instrument: read.instrument, ...window } : { instrument: read.instrument, ...window, pair: read.pair }, signal);
    const result = await readCandles(market);
    const spot = !result.ok && hasNoFuturesCandles(result) ? onSpot(market) : null;
    return spot === null ? fromCandles(result, market, options.nowMs) : fromCandles(await readCandles(spot), spot, options.nowMs);
  } catch {
    return Object.freeze({ ok: false as const, why: 'source-down' as const, retryAfterSeconds: null, note: null, source: { provider: 'binance' as const } });
  }
}

const clock = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** The line under a filled price: "Binance · BTCUSDT · 10:32", "Binance Futures · …" or "OANDA · EUR/USD · mid price · 10:31", in this device's time. */
export function describePriceNowSource(result: Extract<PriceNowResult, { ok: true }>): string {
  return result.source === 'oanda' ? `OANDA · ${result.market} · mid price · ${clock(result.at)}` : `${result.futures ? 'Binance Futures' : 'Binance'} · ${result.market} · ${clock(result.at)}`;
}

/** Why there is no price now, in the words of every "Unavailable" box, and whether "Try again" can help. */
export function describePriceNowFailure(result: Extract<PriceNowResult, { ok: false }>): Readonly<{ message: string; retry: boolean }> {
  if (result.why === 'no-source') return Object.freeze({ message: 'Price now: Kairos has no market price for this market.', retry: false });
  if (result.why === 'invalid-symbol') return Object.freeze({ message: 'Price now: type a symbol first.', retry: false });
  // It never fills by itself, so it never says it will try again by itself.
  if (result.why === 'offline') return Object.freeze({ message: "Price now: you're offline. Try again when you're back online.", retry: true });
  if (result.why === 'not-listed') return Object.freeze({ message: `Price now: ${result.note ?? 'Binance doesn\'t list this market.'}`, retry: false });
  if (result.why === 'no-candles') return Object.freeze({ message: 'Price now: no price in the last few minutes. Try again in a moment.', retry: true });
  const words = describeMarketDataUnavailable({ ok: false, reason: 'unavailable', why: result.why, retryAfterSeconds: result.retryAfterSeconds }, 'Price now', result.source);
  return Object.freeze({ message: words.message, retry: words.retryLabel !== null });
}
