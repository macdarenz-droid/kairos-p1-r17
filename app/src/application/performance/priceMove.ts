/**
 * U4 (P11.A1, D192): how far price went for and against you while you were in a trade, measured from your average entry over the candles that overlap the time in the trade. "About" when the extreme's candle runs past the entry or the exit time; "so far" for an open trade. Candles stay in memory only (D15). Kernel only.
 */

import { decimalCompare, decimalPlaces, decimalRound, decimalSubtract } from '../../domain/calculations/decimalKernel';
import { aggregateTradeExecutions } from '../../domain/calculations/executionAggregation';
import type { DecimalString, TradeExecutionRecord, TradeSide } from '../../domain/trades';
import type { MarketCandle } from '../../services/market-data/MarketCandleHistoryPort';

export interface PriceMoveInput { readonly side: TradeSide; readonly executions: readonly TradeExecutionRecord[]; readonly startMs: number | null; readonly endMs: number; readonly stillOpen: boolean; readonly candles: readonly MarketCandle[] | null }
export type PriceMoveReason = 'no-candles' | 'no-entry' | 'no-start' | 'no-candles-in-trade' | 'entry-outside-candles' | 'invalid-decimal';
export type PriceMove =
  | Readonly<{ available: true; averageEntry: DecimalString; highest: DecimalString; highestAt: string; lowest: DecimalString; lowestAt: string;
      forYou: DecimalString; againstYou: DecimalString; shownForYou: DecimalString; shownAgainstYou: DecimalString;
      forYouIsAbout: boolean; againstYouIsAbout: boolean; soFar: boolean; candleCount: number }>
  | Readonly<{ available: false; reason: PriceMoveReason }>;

/** Shown values go to at most this many places (D193). */
const MOST_SHOWN_PLACES = 20;

interface TimedCandle { readonly candle: MarketCandle; readonly openMs: number; readonly closeMs: number; readonly inside: boolean }

const unavailable = (reason: PriceMoveReason): PriceMove => Object.freeze({ available: false, reason });

/** The candle with the most extreme price (direction 1: highest high, -1: lowest low); on a tie one wholly inside the trade, then the earliest. Null when a price is not a decimal. */
function extremeCandle(candles: readonly TimedCandle[], direction: 1 | -1): TimedCandle | null {
  let pick: TimedCandle | null = null;
  for (const timed of candles) {
    const price = direction === 1 ? timed.candle.high : timed.candle.low;
    if (decimalPlaces(price) === null) return null;
    if (pick === null) { pick = timed; continue; }
    const order = decimalCompare(price, direction === 1 ? pick.candle.high : pick.candle.low);
    if (order === null) return null;
    if (order === direction) { pick = timed; continue; }
    if (order !== 0) continue;
    if (timed.inside !== pick.inside ? timed.inside : timed.openMs < pick.openMs) pick = timed;
  }
  return pick;
}

export function projectPriceMove(input: PriceMoveInput): PriceMove {
  const { side, executions, startMs, endMs, stillOpen, candles } = input;
  if (candles === null || candles.length === 0) return unavailable('no-candles');
  const aggregate = aggregateTradeExecutions(executions);
  if (!aggregate.ok) return unavailable('invalid-decimal');
  const averageEntry = aggregate.value.entry.weightedAveragePrice;
  if (aggregate.value.entry.quantity === '0' || averageEntry === null) return unavailable('no-entry');
  if (startMs === null) return unavailable('no-start');

  const during: TimedCandle[] = [];
  for (const candle of candles) {
    const openMs = Date.parse(candle.openTime), closeMs = Date.parse(candle.closeTime);
    if (!Number.isFinite(openMs) || !Number.isFinite(closeMs)) continue;
    const overlaps = startMs === endMs ? openMs <= startMs && closeMs >= startMs : openMs < endMs && closeMs >= startMs;
    if (overlaps) during.push({ candle, openMs, closeMs, inside: openMs >= startMs && closeMs <= endMs });
  }
  if (during.length === 0) return unavailable('no-candles-in-trade');

  const high = extremeCandle(during, 1), low = extremeCandle(during, -1);
  if (high === null || low === null) return unavailable('invalid-decimal');
  const highest = high.candle.high, lowest = low.candle.low;
  const up = decimalSubtract(highest, averageEntry), down = decimalSubtract(averageEntry, lowest);
  if (!up.ok || !down.ok) return unavailable('invalid-decimal');
  const long = side === 'long';
  const forYou = long ? up.value : down.value, againstYou = long ? down.value : up.value;
  const forCandle = long ? high : low, againstCandle = long ? low : high;
  if (decimalCompare(forYou, '0') === -1 || decimalCompare(againstYou, '0') === -1) return unavailable('entry-outside-candles');

  let entryPlaces = 0;
  for (const fill of executions) {
    if (fill.type !== 'entry') continue;
    const places = decimalPlaces(fill.price);
    if (places === null) return unavailable('invalid-decimal');
    entryPlaces = Math.max(entryPlaces, places);
  }
  const shown = (value: DecimalString, extreme: DecimalString): DecimalString | null => {
    const places = decimalPlaces(extreme);
    if (places === null) return null;
    const rounded = decimalRound(value, Math.min(Math.max(entryPlaces, places), MOST_SHOWN_PLACES), 'half-up');
    return rounded.ok ? rounded.value : null;
  };
  const shownForYou = shown(forYou, long ? highest : lowest), shownAgainstYou = shown(againstYou, long ? lowest : highest);
  if (shownForYou === null || shownAgainstYou === null) return unavailable('invalid-decimal');
  const isAbout = (timed: TimedCandle) => timed.openMs < startMs || timed.closeMs > endMs;

  return Object.freeze({
    available: true,
    averageEntry,
    highest,
    highestAt: high.candle.openTime,
    lowest,
    lowestAt: low.candle.openTime,
    forYou,
    againstYou,
    shownForYou,
    shownAgainstYou,
    forYouIsAbout: isAbout(forCandle),
    againstYouIsAbout: isAbout(againstCandle),
    soFar: stillOpen,
    candleCount: during.length,
  });
}
