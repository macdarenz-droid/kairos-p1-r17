/**
 * P13.A3: the total result so far as one candle per day with results. Start = the total before that day, End = the total after it (both from the cumulative owner); Highest and Lowest = the highest and lowest running total after each of that day's closed trades, in close order. Built only after the progress-series owner proves every day is available in one currency: nothing is converted, nothing missing counts as zero. Drawing positions are step counts from the decimal kernel, never money. Zero is always on the scale. At most the last `VISUAL_PNL_RESULT_CANDLES_MAX_DAYS` days are drawn; the total counts every day.
 */

import { decimalAdd, decimalCompare, decimalScaleToSteps, decimalSubtract } from '../../domain/calculations';
import type { DecimalString } from '../../domain/trades';
import { projectVisualPnlCumulativeRealizedPnl, type VisualPnlCumulativeRealizedPnlProjection } from './cumulativeRealizedPnl';
import type { VisualPnlDailySummaryDay } from './dailySummary';
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
  | Readonly<{ available: true; currency: string; candles: readonly VisualPnlResultCandle[]; zeroStep: number; total: DecimalString; totalOutcome: 'profit' | 'loss' | 'breakeven'; resultDays: number }>
  | Readonly<{ available: false; reason: Extract<VisualPnlCumulativeRealizedPnlProjection, { available: false }>['reason'] | 'invalid-candle-decimal' }>;

type Unavailable = Extract<VisualPnlResultCandlesProjection, { available: false }>;
const ZERO = '0' as DecimalString;
const invalidCandle: Unavailable = Object.freeze({ available: false as const, reason: 'invalid-candle-decimal' as const });
const unavailableDay: Unavailable = Object.freeze({ available: false as const, reason: 'unavailable-result-day' as const });
const DIRECTION = { profit: 'up', loss: 'down', breakeven: 'even' } as const;

interface DayCandle { readonly dayKey: string; readonly open: DecimalString; readonly high: DecimalString; readonly low: DecimalString; readonly close: DecimalString; readonly direction: VisualPnlResultCandleDirection; readonly tradeCount: number }

export function projectVisualPnlResultCandles(days: readonly VisualPnlDailySummaryDay[]): VisualPnlResultCandlesProjection {
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
    let running = open, high = open, low = open;
    for (const result of day.tradeResults) {
      if (result.amount === null) return unavailableDay;
      const next = decimalAdd(running, result.amount);
      if (!next.ok) return invalidCandle;
      running = next.value;
      const above = decimalCompare(running, high), below = decimalCompare(running, low);
      if (above === null || below === null) return invalidCandle;
      if (above > 0) high = running;
      if (below < 0) low = running;
    }
    if (decimalCompare(running, close) !== 0) return invalidCandle;
    built.push({ dayKey: day.dayKey, open, high, low, close, direction: DIRECTION[day.summary.outcome], tradeCount: day.summary.tradeCount });
  }

  const shown = built.slice(-VISUAL_PNL_RESULT_CANDLES_MAX_DAYS);
  let low = ZERO, high = ZERO;
  for (const candle of shown) {
    const belowLow = decimalCompare(candle.low, low), aboveHigh = decimalCompare(candle.high, high);
    if (belowLow === null || aboveHigh === null) return invalidCandle;
    if (belowLow < 0) low = candle.low;
    if (aboveHigh > 0) high = candle.high;
  }
  const range = decimalSubtract(high, low);
  if (!range.ok) return invalidCandle;
  const flat = range.value === '0';
  const toStep = (amount: DecimalString): number | null => {
    if (flat) return VISUAL_PNL_RESULT_CANDLE_STEPS / 2;
    const offset = decimalSubtract(amount, low);
    return offset.ok ? decimalScaleToSteps(offset.value, range.value, VISUAL_PNL_RESULT_CANDLE_STEPS) : null;
  };
  const zeroStep = toStep(ZERO);
  if (zeroStep === null) return invalidCandle;
  const candles: VisualPnlResultCandle[] = [];
  for (const candle of shown) {
    const openStep = toStep(candle.open), highStep = toStep(candle.high), lowStep = toStep(candle.low), closeStep = toStep(candle.close);
    if (openStep === null || highStep === null || lowStep === null || closeStep === null) return invalidCandle;
    candles.push(Object.freeze({ ...candle, openStep, highStep, lowStep, closeStep }));
  }
  const total = built[built.length - 1].close;
  const totalOutcome = total === '0' ? 'breakeven' as const : total.startsWith('-') ? 'loss' as const : 'profit' as const;
  return Object.freeze({ available: true as const, currency: cumulative.currency, candles: Object.freeze(candles), zeroStep, total, totalOutcome, resultDays: days.length });
}
