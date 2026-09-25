/**
 * P27 replay rules. `cursor` is how many candles are shown. Everything here reads only `candles.slice(0, cursor)`, so the future stays hidden. A planned trade is judged on the candles shown after it was placed.
 *
 * The careful rule: a candle that opens at or past a level fills at its opening price. The stop is checked before the target, so a candle that reaches both counts the stop. When the entry filled during a candle, only the stop counts on that candle. Each fill takes its candle's opening time. No fees.
 */

import { decimalCompare } from '../../domain/calculations/decimalKernel';
import { parsePositiveDecimalString, type DecimalString, type TradeSide } from '../../domain/trades';
import type { MarketCandle } from '../../services/market-data/MarketCandleHistoryPort';
import { projectPlannedRewardToRisk } from '../risk-reward/plannedRewardToRisk';

/** The replay chart shows at most this many of the shown candles. */
export const REPLAY_WINDOW_CANDLES = 60;
export interface ReplayOrderInput { readonly side: TradeSide | ''; readonly entryPrice: string; readonly stopPrice: string; readonly targetPrice: string; readonly quantity: string }
export interface ReplayOrder {
  readonly side: TradeSide;
  readonly entryPrice: DecimalString;
  readonly stopPrice: DecimalString;
  readonly targetPrice: DecimalString;
  readonly quantity: DecimalString;
  /** How many candles were shown when the trade was placed: only candles from this index on can reach it. */
  readonly placedAt: number;
  /** The close of the last shown candle when the trade was placed: the price now. */
  readonly placedPrice: DecimalString;
}
export type ReplayOrderInvalidReason = 'no-candle-shown' | 'no-candle-left' | 'side-required' | 'entry-invalid' | 'stop-invalid' | 'target-invalid' | 'quantity-invalid' | 'levels-not-ordered';
export type PlaceReplayOrderResult = { readonly ok: true; readonly order: ReplayOrder } | { readonly ok: false; readonly reason: ReplayOrderInvalidReason };
export interface ReplayFill {
  readonly price: DecimalString;
  /** The opening time of the candle it happened in, exactly as the candle holds it. */
  readonly at: string;
  /** It happened at that candle's opening price: the candle opened at or past the level, or the entry was the price now. */
  readonly atOpen: boolean;
  /** The price is not the planned level: the candle opened past it. */
  readonly jumped: boolean;
}
export type ReplayOutcome =
  | Readonly<{ kind: 'waiting' }>
  | Readonly<{ kind: 'open'; entry: ReplayFill }>
  | Readonly<{ kind: 'closed'; entry: ReplayFill; exit: ReplayFill; reason: 'stop' | 'target' }>;
export interface ReplayView {
  /** What the chart draws: the last REPLAY_WINDOW_CANDLES shown candles, reaching back to the candle a trade was placed on. */
  readonly window: readonly MarketCandle[];
  /** The last shown candle. */
  readonly last: MarketCandle;
  /** The moment right after the last shown candle (its close time + 1 ms), UTC ISO. */
  readonly replayTime: string;
  readonly candlesLeft: number;
  /** Null when no trade is placed. */
  readonly outcome: ReplayOutcome | null;
}

const validCursor = (candles: readonly MarketCandle[], cursor: number) => Number.isInteger(cursor) && cursor >= 1 && cursor <= candles.length;

export function placeReplayOrder(candles: readonly MarketCandle[], cursor: number, input: ReplayOrderInput): PlaceReplayOrderResult {
  const fail = (reason: ReplayOrderInvalidReason): PlaceReplayOrderResult => Object.freeze({ ok: false as const, reason });
  if (!validCursor(candles, cursor)) return fail('no-candle-shown');
  if (cursor === candles.length) return fail('no-candle-left');
  if (input.side === '') return fail('side-required');
  const entry = parsePositiveDecimalString(input.entryPrice);
  if (!entry.ok) return fail('entry-invalid');
  const stop = parsePositiveDecimalString(input.stopPrice);
  if (!stop.ok) return fail('stop-invalid');
  const target = parsePositiveDecimalString(input.targetPrice);
  if (!target.ok) return fail('target-invalid');
  const quantity = parsePositiveDecimalString(input.quantity);
  if (!quantity.ok) return fail('quantity-invalid');
  if (!projectPlannedRewardToRisk(input.side, entry.value, stop.value, target.value).ok) return fail('levels-not-ordered');
  const order: ReplayOrder = Object.freeze({
    side: input.side, entryPrice: entry.value, stopPrice: stop.value, targetPrice: target.value, quantity: quantity.value,
    placedAt: cursor, placedPrice: candles[cursor - 1].close,
  });
  return Object.freeze({ ok: true as const, order });
}

export function projectReplayView(candles: readonly MarketCandle[], cursor: number, order: ReplayOrder | null): ReplayView | null {
  if (!validCursor(candles, cursor)) return null;
  const shown = candles.slice(0, cursor);
  const candlesLeft = candles.length - cursor;
  const from = Math.max(0, Math.min(cursor - REPLAY_WINDOW_CANDLES, order === null ? cursor : order.placedAt - 1));
  const last = shown[cursor - 1];
  return Object.freeze({
    window: Object.freeze(shown.slice(from)),
    last,
    replayTime: new Date(Date.parse(last.closeTime) + 1).toISOString(),
    candlesLeft,
    outcome: order === null ? null : judgeReplayOrder(order, shown),
  });
}

// A kernel null (never expected: the decoder checks every price) counts as "not reached".
const atOrAbove = (value: DecimalString, level: DecimalString) => { const order = decimalCompare(value, level); return order !== null && order >= 0; };
const atOrBelow = (value: DecimalString, level: DecimalString) => { const order = decimalCompare(value, level); return order !== null && order <= 0; };
const same = (value: DecimalString, level: DecimalString) => decimalCompare(value, level) === 0;

function fill(price: DecimalString, level: DecimalString, candle: MarketCandle, atOpen: boolean): ReplayFill {
  return Object.freeze({ price, at: candle.openTime, atOpen, jumped: decimalCompare(price, level) !== 0 });
}

/** The entry on this candle, or null. `before` is the price just before the candle opened. */
function entryOn(candle: MarketCandle, before: DecimalString, entry: DecimalString): ReplayFill | null {
  if (same(before, entry)) return fill(candle.open, entry, candle, true);
  if (decimalCompare(before, entry) === -1) {
    if (atOrAbove(candle.open, entry)) return fill(candle.open, entry, candle, true);
    if (atOrAbove(candle.high, entry)) return fill(entry, entry, candle, false);
    return null;
  }
  if (decimalCompare(before, entry) === 1) {
    if (atOrBelow(candle.open, entry)) return fill(candle.open, entry, candle, true);
    if (atOrBelow(candle.low, entry)) return fill(entry, entry, candle, false);
  }
  return null;
}

/** The exit on this candle, or null. `stopOnly`: the entry filled during this candle, so only the stop counts. */
function exitOn(order: ReplayOrder, candle: MarketCandle, stopOnly: boolean): { readonly exit: ReplayFill; readonly reason: 'stop' | 'target' } | null {
  const s = order.stopPrice, t = order.targetPrice;
  const long = order.side === 'long';
  const pastStop = long ? atOrBelow : atOrAbove, pastTarget = long ? atOrAbove : atOrBelow;
  if (!stopOnly) {
    if (pastStop(candle.open, s)) return { exit: fill(candle.open, s, candle, true), reason: 'stop' };
    if (pastTarget(candle.open, t)) return { exit: fill(candle.open, t, candle, true), reason: 'target' };
  }
  if (pastStop(long ? candle.low : candle.high, s)) return { exit: fill(s, s, candle, false), reason: 'stop' };
  if (stopOnly) return null;
  if (pastTarget(long ? candle.high : candle.low, t)) return { exit: fill(t, t, candle, false), reason: 'target' };
  return null;
}

function judgeReplayOrder(order: ReplayOrder, shown: readonly MarketCandle[]): ReplayOutcome {
  let entry: ReplayFill | null = null;
  for (let index = order.placedAt; index < shown.length; index += 1) {
    const candle = shown[index];
    let stopOnly = false;
    if (entry === null) {
      const before = index === order.placedAt ? order.placedPrice : shown[index - 1].close;
      entry = entryOn(candle, before, order.entryPrice);
      if (entry === null) continue;
      stopOnly = !entry.atOpen;
    }
    const exit = exitOn(order, candle, stopOnly);
    if (exit !== null) return Object.freeze({ kind: 'closed' as const, entry, exit: exit.exit, reason: exit.reason });
  }
  return entry === null ? Object.freeze({ kind: 'waiting' as const }) : Object.freeze({ kind: 'open' as const, entry });
}
