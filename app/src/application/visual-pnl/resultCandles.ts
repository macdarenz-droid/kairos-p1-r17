/**
 * P13.A3: the total result so far as one candle per day with results. Start = the total before that day, End = the total after it (both from the cumulative owner); Highest and Lowest = the highest and lowest running total after each of that day's closed trades, in close order. Built only after the progress-series owner proves every day is available in one currency: nothing is converted, nothing missing counts as zero. Drawing positions are step counts from the decimal kernel, never money. Zero is always on the scale. At most the last `VISUAL_PNL_RESULT_CANDLES_MAX_DAYS` days are drawn; the total counts every day. `highest` and `lowest` are the highest and lowest total the drawn candles reach, for the picture's value labels.
 */

import { decimalAdd, decimalCompare, decimalScaleToSteps, decimalSubtract } from '../../domain/calculations';
import type { DecimalString } from '../../domain/trades';
import { projectVisualPnlCumulativeRealizedPnl, type VisualPnlCumulativeRealizedPnlProjection } from './cumulativeRealizedPnl';
import type { VisualPnlDailySummaryDay } from './dailySummary';
import { shiftVisualPnlDayKey, shiftVisualPnlMonthKey, visualPnlMondayFirstWeekday } from './dayKeyCalendar';
import { projectVisualPnlProgressSeries } from './progressSeries';

export const VISUAL_PNL_RESULT_CANDLE_STEPS = 1000;
/** The picture draws at most this many days, the most recent ones. */
export const VISUAL_PNL_RESULT_CANDLES_MAX_DAYS = 30;
export type VisualPnlResultCandleDirection = 'up' | 'down' | 'even';
export interface VisualPnlResultCandle {
  readonly dayKey: string;
  readonly open: DecimalString; readonly high: DecimalString; readonly low: DecimalString; readonly close: DecimalString;
  readonly direction: VisualPnlResultCandleDirection;
  readonly tradeCount: number;
  /** 0 = the lowest point drawn, VISUAL_PNL_RESULT_CANDLE_STEPS = the highest: counts, never money. */
  readonly openStep: number; readonly highStep: number; readonly lowStep: number; readonly closeStep: number;
}
export type VisualPnlResultCandlesProjection =
  | Readonly<{ available: true; currency: string; candles: readonly VisualPnlResultCandle[]; zeroStep: number; highest: DecimalString; highestStep: number; lowest: DecimalString; lowestStep: number; total: DecimalString; totalOutcome: 'profit' | 'loss' | 'breakeven'; resultDays: number }>
  | Readonly<{ available: false; reason: Extract<VisualPnlCumulativeRealizedPnlProjection, { available: false }>['reason'] | 'invalid-candle-decimal' }>;

type Unavailable = Extract<VisualPnlResultCandlesProjection, { available: false }>;
const ZERO = '0' as DecimalString;
const invalidCandle: Unavailable = Object.freeze({ available: false as const, reason: 'invalid-candle-decimal' as const });
const unavailableDay: Unavailable = Object.freeze({ available: false as const, reason: 'unavailable-result-day' as const });
const DIRECTION = { profit: 'up', loss: 'down', breakeven: 'even' } as const;

interface DayCandle { readonly dayKey: string; readonly open: DecimalString; readonly high: DecimalString; readonly low: DecimalString; readonly close: DecimalString; readonly direction: VisualPnlResultCandleDirection; readonly tradeCount: number }

/** The running total after each amount, in order, from `start` (D58's running total); null when the kernel refuses one. */
export function projectVisualPnlRunningTotals(start: DecimalString, amounts: readonly DecimalString[]): readonly DecimalString[] | null {
  const totals: DecimalString[] = [];
  let running = start;
  for (const amount of amounts) {
    const next = decimalAdd(running, amount);
    if (!next.ok) return null;
    running = next.value;
    totals.push(running);
  }
  return Object.freeze(totals);
}

interface ScaledCandles<T> {
  readonly candles: readonly (T & Readonly<{ openStep: number; highStep: number; lowStep: number; closeStep: number }>)[];
  readonly zeroStep: number; readonly highest: DecimalString; readonly highestStep: number; readonly lowest: DecimalString; readonly lowestStep: number;
  /** The step of an amount on the drawn scale; null when the kernel refuses it. */
  readonly toStep: (amount: DecimalString) => number | null;
}

/** The last VISUAL_PNL_RESULT_CANDLES_MAX_DAYS candles on one scale that always holds 0: steps, never money. Null when the kernel refuses a value. */
function scaleCandles<T extends Readonly<{ open: DecimalString; high: DecimalString; low: DecimalString; close: DecimalString }>>(built: readonly T[]): ScaledCandles<T> | null {
  const shown = built.slice(-VISUAL_PNL_RESULT_CANDLES_MAX_DAYS);
  let low = ZERO, high = ZERO;
  let highest = shown[0].high, lowest = shown[0].low;
  for (const candle of shown) {
    const belowLow = decimalCompare(candle.low, low), aboveHigh = decimalCompare(candle.high, high);
    const belowLowest = decimalCompare(candle.low, lowest), aboveHighest = decimalCompare(candle.high, highest);
    if (belowLow === null || aboveHigh === null || belowLowest === null || aboveHighest === null) return null;
    if (belowLow < 0) low = candle.low;
    if (aboveHigh > 0) high = candle.high;
    if (belowLowest < 0) lowest = candle.low;
    if (aboveHighest > 0) highest = candle.high;
  }
  const range = decimalSubtract(high, low);
  if (!range.ok) return null;
  const flat = range.value === '0';
  const toStep = (amount: DecimalString): number | null => {
    if (flat) return VISUAL_PNL_RESULT_CANDLE_STEPS / 2;
    const offset = decimalSubtract(amount, low);
    return offset.ok ? decimalScaleToSteps(offset.value, range.value, VISUAL_PNL_RESULT_CANDLE_STEPS) : null;
  };
  const zeroStep = toStep(ZERO);
  if (zeroStep === null) return null;
  const highestStep = toStep(highest), lowestStep = toStep(lowest);
  if (highestStep === null || lowestStep === null) return null;
  const candles: (T & Readonly<{ openStep: number; highStep: number; lowStep: number; closeStep: number }>)[] = [];
  for (const candle of shown) {
    const openStep = toStep(candle.open), highStep = toStep(candle.high), lowStep = toStep(candle.low), closeStep = toStep(candle.close);
    if (openStep === null || highStep === null || lowStep === null || closeStep === null) return null;
    candles.push(Object.freeze({ ...candle, openStep, highStep, lowStep, closeStep }));
  }
  return { candles: Object.freeze(candles), zeroStep, highest, highestStep, lowest, lowestStep, toStep };
}

/** One candle per day with results, before scaling, through the same checks as the cumulative owner; or why there is none. */
function buildDayCandles(days: readonly VisualPnlDailySummaryDay[]): Readonly<{ available: true; built: readonly DayCandle[]; currency: string }> | Unavailable {
  const cumulative = projectVisualPnlCumulativeRealizedPnl(projectVisualPnlProgressSeries(days));
  if (!cumulative.available) return Object.freeze({ available: false as const, reason: cumulative.reason });
  if (cumulative.points.length !== days.length || days.length === 0) return invalidCandle;

  const built: DayCandle[] = [];
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    const point = cumulative.points[i];
    if (point.dayKey !== day.dayKey || !day.summary.available) return invalidCandle;
    const open = i === 0 ? ZERO : cumulative.points[i - 1].cumulativeAmount;
    const close = point.cumulativeAmount;
    if (day.tradeResults.length === 0) return invalidCandle;
    const amounts: DecimalString[] = [];
    for (const result of day.tradeResults) {
      if (result.amount === null) return unavailableDay;
      amounts.push(result.amount);
    }
    const totals = projectVisualPnlRunningTotals(open, amounts);
    if (totals === null) return invalidCandle;
    let high = open, low = open;
    for (const running of totals) {
      const above = decimalCompare(running, high), below = decimalCompare(running, low);
      if (above === null || below === null) return invalidCandle;
      if (above > 0) high = running;
      if (below < 0) low = running;
    }
    if (decimalCompare(totals[totals.length - 1], close) !== 0) return invalidCandle;
    built.push({ dayKey: day.dayKey, open, high, low, close, direction: DIRECTION[day.summary.outcome], tradeCount: day.summary.tradeCount });
  }
  return { available: true, built, currency: cumulative.currency };
}

const outcomeOf = (total: DecimalString) => total === '0' ? 'breakeven' as const : total.startsWith('-') ? 'loss' as const : 'profit' as const;

export function projectVisualPnlResultCandles(days: readonly VisualPnlDailySummaryDay[]): VisualPnlResultCandlesProjection {
  const day = buildDayCandles(days);
  if (!day.available) return day;
  const { built, currency } = day;
  const scaled = scaleCandles(built);
  if (scaled === null) return invalidCandle;
  const { zeroStep, highest, highestStep, lowest, lowestStep } = scaled;
  const candles = scaled.candles as VisualPnlResultCandle[];
  const total = built[built.length - 1].close;
  return Object.freeze({ available: true as const, currency, candles: Object.freeze(candles), zeroStep, highest, highestStep, lowest, lowestStep, total, totalOutcome: outcomeOf(total), resultDays: days.length });
}

/** U5 (D205): candles per day, per week (Monday first) or per month over the whole period. */
export type VisualPnlResultCandleUnit = 'day' | 'week' | 'month';
/** A point of the total to mark on the picture: the total `amount` after the trade `afterTradeId` (null: at the start, before any trade). */
export interface VisualPnlResultCandleMark { readonly key: string; readonly amount: DecimalString; readonly afterTradeId: string | null }
export interface VisualPnlUnitCandle extends VisualPnlResultCandle {
  /** dayKey = fromDayKey: the day, the week's Monday or the month's first day. */
  readonly fromDayKey: string;
  readonly toDayKey: string;
  readonly tradeIds: readonly string[];
}
export type VisualPnlUnitCandlesProjection =
  | Readonly<{
    available: true; unit: VisualPnlResultCandleUnit; currency: string; candles: readonly VisualPnlUnitCandle[]; zeroStep: number;
    highest: DecimalString; highestStep: number; lowest: DecimalString; lowestStep: number; total: DecimalString; totalOutcome: 'profit' | 'loss' | 'breakeven';
    resultDays: number; unitCount: number;
    marks: readonly Readonly<{ key: string; step: number | null; candleIndex: number | null; atStart: boolean }>[];
  }>
  | Readonly<{ available: false; reason: Extract<VisualPnlResultCandlesProjection, { available: false }>['reason'] }>;

/** The first day of `dayKey`'s group and the first day after it. */
function groupOf(dayKey: string, unit: VisualPnlResultCandleUnit): Readonly<{ fromDayKey: string; toDayKey: string }> {
  if (unit === 'day') return { fromDayKey: dayKey, toDayKey: shiftVisualPnlDayKey(dayKey, 1) };
  if (unit === 'week') {
    const monday = shiftVisualPnlDayKey(dayKey, -visualPnlMondayFirstWeekday(dayKey));
    return { fromDayKey: monday, toDayKey: shiftVisualPnlDayKey(monday, 7) };
  }
  const month = dayKey.slice(0, 7);
  return { fromDayKey: `${month}-01`, toDayKey: `${shiftVisualPnlMonthKey(month, 1)}-01` };
}

type UnitCandleBuild = Omit<VisualPnlUnitCandle, 'openStep' | 'highStep' | 'lowStep' | 'closeStep'>;

/** Your total as one candle per `unit` with results. Each candle starts at the total before its group and ends at the total after it; its highest and lowest are those of its days. At most the last VISUAL_PNL_RESULT_CANDLES_MAX_DAYS candles are drawn; the total counts every group. */
export function projectVisualPnlResultCandlesBy(
  days: readonly VisualPnlDailySummaryDay[],
  options: Readonly<{ unit: VisualPnlResultCandleUnit; tradeIdsByDay?: Readonly<Record<string, readonly string[]>>; marks?: readonly VisualPnlResultCandleMark[] }>,
): VisualPnlUnitCandlesProjection {
  const { unit } = options;
  const day = buildDayCandles(days);
  if (!day.available) return day;
  const groups: UnitCandleBuild[] = [];
  for (const candle of day.built) {
    const group = groupOf(candle.dayKey, unit);
    const ids = options.tradeIdsByDay?.[candle.dayKey] ?? [];
    const last = groups[groups.length - 1];
    if (last === undefined || last.fromDayKey !== group.fromDayKey) {
      groups.push({ dayKey: group.fromDayKey, fromDayKey: group.fromDayKey, toDayKey: group.toDayKey, open: candle.open, high: candle.high, low: candle.low, close: candle.close, direction: candle.direction, tradeCount: candle.tradeCount, tradeIds: [...ids] });
      continue;
    }
    const above = decimalCompare(candle.high, last.high), below = decimalCompare(candle.low, last.low), change = decimalCompare(candle.close, last.open);
    if (above === null || below === null || change === null) return invalidCandle;
    groups[groups.length - 1] = {
      ...last,
      high: above > 0 ? candle.high : last.high,
      low: below < 0 ? candle.low : last.low,
      close: candle.close,
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'even',
      tradeCount: last.tradeCount + candle.tradeCount,
      tradeIds: [...last.tradeIds, ...ids],
    };
  }
  const scaled = scaleCandles(groups);
  if (scaled === null) return invalidCandle;
  const candles = scaled.candles.map((candle) => Object.freeze({ ...candle, tradeIds: Object.freeze([...candle.tradeIds]) }));
  // The start of the period is drawn only when every group is.
  const startShown = candles.length === groups.length;
  const marks = (options.marks ?? []).map((mark) => {
    const candleIndex = mark.afterTradeId === null ? -1 : candles.findIndex((candle) => candle.tradeIds.includes(mark.afterTradeId as string));
    const drawn = mark.afterTradeId === null ? startShown : candleIndex >= 0;
    return Object.freeze({ key: mark.key, step: drawn ? scaled.toStep(mark.amount) : null, candleIndex: candleIndex >= 0 ? candleIndex : null, atStart: mark.afterTradeId === null });
  });
  const total = day.built[day.built.length - 1].close;
  return Object.freeze({
    available: true as const, unit, currency: day.currency, candles: Object.freeze(candles), zeroStep: scaled.zeroStep,
    highest: scaled.highest, highestStep: scaled.highestStep, lowest: scaled.lowest, lowestStep: scaled.lowestStep,
    total, totalOutcome: outcomeOf(total), resultDays: days.length, unitCount: groups.length, marks: Object.freeze(marks),
  });
}

/** The smallest unit whose candles fit VISUAL_PNL_RESULT_CANDLES_MAX_DAYS (30); 'month' when none does. */
export function pickVisualPnlResultCandleUnit(days: readonly VisualPnlDailySummaryDay[]): VisualPnlResultCandleUnit {
  if (days.length <= VISUAL_PNL_RESULT_CANDLES_MAX_DAYS) return 'day';
  const weeks = new Set(days.map((day) => groupOf(day.dayKey, 'week').fromDayKey));
  return weeks.size <= VISUAL_PNL_RESULT_CANDLES_MAX_DAYS ? 'week' : 'month';
}
