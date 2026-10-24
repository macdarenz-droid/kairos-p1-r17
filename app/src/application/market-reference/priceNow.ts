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
import { matchCryptoMarket } from './cryptoMarket';

export interface PriceNowDeps {
  /** The Binance Spot venue the market list names. */
  readonly venue: string;
  readonly history: MarketCandleHistoryPort;
  readonly metadata: LiveMarketUniverseInstrumentMetadataAcquisitionPort;
}

export type PriceNowFailure = 'not-listed' | 'no-candles' | MarketDataUnavailableWhy;

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

function fromCandles(
  result: MarketCandleHistoryResult, source: 'binance' | 'oanda', market: string, words: MarketSourceWords, note: string | null,
): PriceNowResult {
  if (!result.ok) {
    const failure = result as { readonly reason: string; readonly why?: MarketDataUnavailableWhy; readonly retryAfterSeconds?: number | null };
    const why = failure.reason === 'unavailable' && failure.why !== undefined ? failure.why : 'source-down';
    return Object.freeze({ ok: false as const, why, retryAfterSeconds: failure.retryAfterSeconds ?? null, note, source: words });
  }
  const last = result.snapshot.candles[result.snapshot.candles.length - 1];
  if (last === undefined) return Object.freeze({ ok: false as const, why: 'no-candles' as const, retryAfterSeconds: null, note, source: words });
  return Object.freeze({ ok: true as const, price: last.close, at: last.openTime, source, market, midPrice: source === 'oanda' });
}

/** A typed market as the candle source names it, or why it has none: the shared first step of "Price now" and the minute check (D256, D257). */
export type FormMarketSource =
  | Readonly<{ ok: true; instrument: MarketDataInstrument; pair: Readonly<{ base: string; quote: string }> | null; source: 'binance' | 'oanda'; market: string; words: MarketSourceWords }>
  | Extract<PriceNowResult, { ok: false }>;

export async function resolveFormMarket(
  deps: PriceNowDeps, ask: Readonly<{ marketType: MarketType; symbol: string }>, signal: Readonly<{ signal: AbortSignal }> | undefined,
): Promise<FormMarketSource> {
  const binance: MarketSourceWords = { provider: 'binance' };
  if (tradePictureCandleSource(ask.marketType, ask.symbol) === 'forex') {
    const parsed = parseForexPair(ask.symbol);
    if (!parsed.ok) return Object.freeze({ ok: false as const, why: 'unknown-market' as const, retryAfterSeconds: null, note: null, source: binance });
    const pair = parsed.pair;
    return Object.freeze({ ok: true as const, instrument: { venue: FOREX_CANDLE_VENUE, symbol: pair.symbol }, pair: null, source: 'oanda' as const, market: pair.label, words: { provider: 'oanda' as const, pair: pair.label } });
  }
  const listed = await deps.metadata.acquireInstrumentMetadata(signal);
  if (!listed.ok) {
    const failure = listed as { readonly reason: string; readonly why?: MarketDataUnavailableWhy; readonly retryAfterSeconds?: number | null };
    const why = failure.reason === 'unavailable' && failure.why !== undefined ? failure.why : 'source-down';
    return Object.freeze({ ok: false as const, why, retryAfterSeconds: failure.retryAfterSeconds ?? null, note: null, source: binance });
  }
  const match = matchCryptoMarket(ask.symbol, ask.marketType, listed.facts);
  if (!match.ok) return Object.freeze({ ok: false as const, why: 'not-listed' as const, retryAfterSeconds: null, note: match.note, source: binance });
  const venue = match.candles === 'usdm-futures' ? FUTURES_CANDLE_VENUE : deps.venue;
  return Object.freeze({ ok: true as const, instrument: { venue, symbol: match.symbol }, pair: { base: match.base, quote: match.quote }, source: 'binance' as const, market: match.symbol, words: binance });
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
    const request = market.pair === null ? { instrument: market.instrument, ...window } : { instrument: market.instrument, ...window, pair: market.pair };
    return fromCandles(await deps.history.acquireHistory(request, signal), market.source, market.market, market.words, null);
  } catch {
    return Object.freeze({ ok: false as const, why: 'source-down' as const, retryAfterSeconds: null, note: null, source: { provider: 'binance' as const } });
  }
}

const clock = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** The line under a filled price: "Binance · BTCUSDT · 10:32" or "OANDA · EUR/USD · mid price · 10:31", in this device's time. */
export function describePriceNowSource(result: Extract<PriceNowResult, { ok: true }>): string {
  return result.source === 'oanda' ? `OANDA · ${result.market} · mid price · ${clock(result.at)}` : `Binance · ${result.market} · ${clock(result.at)}`;
}

/** Why there is no price now, in the words of every "Unavailable" box, and whether "Try again" can help. */
export function describePriceNowFailure(result: Extract<PriceNowResult, { ok: false }>): Readonly<{ message: string; retry: boolean }> {
  if (result.why === 'not-listed') return Object.freeze({ message: `Price now: ${result.note ?? 'Binance doesn\'t list this market.'}`, retry: false });
  if (result.why === 'no-candles') return Object.freeze({ message: 'Price now: no price in the last few minutes. Try again in a moment.', retry: true });
  const words = describeMarketDataUnavailable({ ok: false, reason: 'unavailable', why: result.why, retryAfterSeconds: result.retryAfterSeconds }, 'Price now', result.source);
  return Object.freeze({ message: words.message, retry: words.retryLabel !== null });
}
