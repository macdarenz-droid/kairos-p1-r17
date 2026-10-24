/**
 * U14 (D257): the one owner of the trade form's minute check: "See the market price at that minute" (the 1-minute
 * candle that holds a time, read by `readContainingMinute`) and the soft "Typo?" when a crypto price is outside that
 * minute's range. It never blocks and never changes a value. Forex gets no "Typo?": OANDA's mid prices can't judge a
 * fill made at the bid or the ask.
 */
import { decimalCompare } from '../../domain/calculations/decimalKernel';
import { parsePositiveDecimalString, type DecimalString, type MarketType } from '../../domain/trades';
import type { MarketDataInstrument, MarketDataUnavailableWhy } from '../../services/market-data/marketDataTypes';
import { describeMarketDataUnavailable, type MarketSourceWords } from '../online/onlineWords';
import { describeFuturesOnlyNotListed } from './cryptoMarket';
import { readContainingMinute } from './estimatedMarketReference';
import { FUTURES_CANDLE_VENUE } from '../trade-visualizer/tradePictureCandles';
import { hasNoFuturesCandles, onSpot, resolveFormMarket, type PriceNowDeps } from './priceNow';

export type MarketMinute =
  | Readonly<{
      ok: true; low: DecimalString; high: DecimalString;
      /** When the minute opened (ISO). */
      at: string;
      source: 'binance' | 'oanda'; market: string; midPrice: boolean;
      /** Read from Binance Futures (a futures trade). */
      futures: boolean;
      /** Read after the minute ended, so its range is final (a server or browser copy of a running minute is not). */
      complete: boolean;
    }>
  | Readonly<{ ok: false; why: 'future' | 'invalid-time' | 'no-price' | 'not-listed' | 'no-source' | 'invalid-symbol' | MarketDataUnavailableWhy; retryAfterSeconds: number | null; note: string | null; source: MarketSourceWords }>;

/** A `datetime-local` value ("2026-10-24T10:32") as an instant in this device's time zone, or null. */
export function localTimeToInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value.trim())) return null;
  const ms = new Date(value.trim()).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** The minute that holds `at` for a typed market, or why there is none. */
export async function readMarketMinute(
  deps: PriceNowDeps, ask: Readonly<{ marketType: MarketType; symbol: string; at: string }>, options: Readonly<{ nowMs: number; signal?: AbortSignal }>,
): Promise<MarketMinute> {
  const signal = options.signal === undefined ? undefined : { signal: options.signal };
  const fail = (why: Extract<MarketMinute, { ok: false }>['why'], source: MarketSourceWords, retryAfterSeconds: number | null = null, note: string | null = null): MarketMinute =>
    Object.freeze({ ok: false as const, why, retryAfterSeconds, note, source });
  try {
    const resolved = await resolveFormMarket(deps, ask, signal);
    if (!resolved.ok) return fail(resolved.why === 'no-candles' ? 'no-price' : resolved.why, resolved.source, resolved.retryAfterSeconds, resolved.note);
    const read = (instrument: MarketDataInstrument) => readContainingMinute(deps.history, { instrument, requestedAt: ask.at }, { now: () => options.nowMs, ...(options.signal ? { signal: options.signal } : {}) });
    let market = resolved;
    let minute = await read(market.instrument);
    // A futures trade with no futures candles reads the same market on Binance Spot once, as the trade picture does.
    const spot = !minute.ok && hasNoFuturesCandles({ reason: minute.reason, why: minute.why ?? null }) ? onSpot(market) : null;
    if (spot !== null) { market = spot; minute = await read(spot.instrument); }
    if (!minute.ok) {
      if (minute.reason === 'future-instant') return fail('future', market.words);
      if (minute.reason === 'invalid-instant') return fail('invalid-time', market.words);
      if (minute.reason === 'no-candle') return fail('no-price', market.words);
      if (minute.reason === 'candle-mismatch') return fail('unreadable', market.words);
      // A futures-only market (D171) Binance Futures doesn't have, or a source without futures candles.
      if (market.futuresOnly !== null && minute.why === 'unknown-market') return fail('not-listed', market.words, null, describeFuturesOnlyNotListed(market.futuresOnly.typed));
      if (market.futuresOnly !== null && minute.reason === 'invalid-request') return fail('not-listed', market.words, null, `${market.futuresOnly.spotNote} Futures candles need the Kairos server.`);
      return fail(minute.why ?? 'source-down', market.words, minute.retryAfterSeconds);
    }
    return Object.freeze({
      ok: true as const, low: minute.candle.low, high: minute.candle.high, at: minute.candle.openTime, source: market.source, market: market.market, midPrice: market.source === 'oanda',
      futures: market.instrument.venue === FUTURES_CANDLE_VENUE,
      // When the source read it (the server's own fetch time, kept with a cached copy), not when this device asked.
      complete: Date.parse(minute.acquiredAt) > Date.parse(minute.candle.closeTime),
    });
  } catch {
    return fail('source-down', { provider: 'binance' });
  }
}

/** Where a price sits against a minute's range; null when the text is not a price. Equal to the low or the high is inside. */
export function checkPriceAtMinute(minute: Readonly<{ low: DecimalString; high: DecimalString }>, priceText: string): 'inside' | 'below' | 'above' | null {
  const price = parsePositiveDecimalString(priceText.trim());
  if (!price.ok) return null;
  const low = decimalCompare(price.value, minute.low), high = decimalCompare(price.value, minute.high);
  if (low === null || high === null) return null;
  return low < 0 ? 'below' : high > 0 ? 'above' : 'inside';
}

const clock = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** "At 10:32 BTCUSDT traded between 64980 and 65120 (Binance, 1-minute candle)." The prices are the source's own text. */
export function describeMarketMinute(minute: Extract<MarketMinute, { ok: true }>): string {
  const from = minute.source === 'oanda' ? 'OANDA, 1-minute candle, mid prices' : `${minute.futures ? 'Binance Futures' : 'Binance'}, 1-minute candle`;
  return `At ${clock(minute.at)} ${minute.market} traded between ${minute.low} and ${minute.high} (${from}).`;
}

/** Why there is no minute, and whether "Try again" can help. */
export function describeMarketMinuteFailure(minute: Extract<MarketMinute, { ok: false }>): Readonly<{ message: string; retry: boolean }> {
  switch (minute.why) {
    case 'future': return Object.freeze({ message: "That time hasn't happened yet.", retry: false });
    case 'invalid-time': return Object.freeze({ message: 'Enter a date and time first.', retry: false });
    case 'no-price': return Object.freeze({ message: 'There is no market price for that minute. The market may have been closed.', retry: false });
    case 'not-listed': return Object.freeze({ message: minute.note ?? "Binance doesn't list this market.", retry: false });
    case 'no-source': return Object.freeze({ message: 'Kairos has no market price for this market.', retry: false });
    case 'invalid-symbol': return Object.freeze({ message: 'Type a symbol first.', retry: false });
    // Nothing is read again by itself, so the words never say so.
    case 'offline': return Object.freeze({ message: "The market price at that minute: you're offline. Try again when you're back online.", retry: true });
    default: {
      const words = describeMarketDataUnavailable({ ok: false, reason: 'unavailable', why: minute.why, retryAfterSeconds: minute.retryAfterSeconds }, 'The market price at that minute', minute.source);
      return Object.freeze({ message: words.message, retry: words.retryLabel !== null });
    }
  }
}

/** "BTCUSDT did not trade at 6500 at 10:32 (it traded between 64980 and 65120). Typo?" */
export function describeTypo(minute: Extract<MarketMinute, { ok: true }>, priceText: string): string {
  return `${minute.market} did not trade at ${priceText.trim()} at ${clock(minute.at)} (it traded between ${minute.low} and ${minute.high}). Typo?`;
}
