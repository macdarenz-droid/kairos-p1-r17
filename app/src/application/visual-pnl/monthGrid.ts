import { decimalAbs, decimalCompare, decimalScaleToSteps } from '../../domain/calculations';
import type { DecimalString } from '../../domain/trades';
import { summarizeVisualPnlAggregation, type VisualPnlAggregationSummary } from './aggregationSummary';
import type { VisualPnlDailySummary, VisualPnlDailySummaryDay } from './dailySummary';
import { isVisualPnlMonthKey, shiftVisualPnlDayKey, shiftVisualPnlMonthKey, visualPnlDaysInMonth, visualPnlMondayFirstWeekday } from './dayKeyCalendar';

export type VisualPnlMonthDayResult = 'profit' | 'loss' | 'breakeven' | 'unavailable' | 'no-trades';
export interface VisualPnlMonthGridDay {
  readonly dayKey: string;
  readonly dayOfMonth: number;
  readonly result: VisualPnlMonthDayResult;
  /** The P13.7 day summary; null when no closed trade fell on this day. */
  readonly summary: VisualPnlAggregationSummary | null;
  /** 1–4 against the month's largest profit or loss day; null when there is no size to show. */
  readonly strength: 1 | 2 | 3 | 4 | null;
  readonly isToday: boolean;
  /** U5: inside the chosen results period; a day outside it shows no result. True when no period is given. */
  readonly inPeriod: boolean;
}
export type VisualPnlMonthScale =
  | Readonly<{ kind: 'one-currency'; currency: string; largestAbsolute: DecimalString }>
  | Readonly<{ kind: 'none'; reason: 'no-profit-or-loss-days' | 'mixed-currencies' | 'invalid-scale-decimal' }>;
export interface VisualPnlMonthGridProjection {
  readonly monthKey: string;
  readonly leadingEmptyCells: number;
  readonly days: readonly VisualPnlMonthGridDay[];
  readonly previousMonthKey: string;
  readonly nextMonthKey: string;
  readonly scale: VisualPnlMonthScale;
}

export interface VisualPnlMonthWeek {
  /** The days of this calendar row that are in the month and in the period, oldest first; empty when none is. */
  readonly dayKeys: readonly string[];
  readonly fromDayKey: string | null;
  readonly toDayKey: string | null;
  /** null: no closed trade on those days. */
  readonly summary: VisualPnlAggregationSummary | null;
  readonly strength: 1 | 2 | 3 | 4 | null;
}
export interface VisualPnlMonthTotals {
  readonly monthKey: string;
  /** One per calendar row of projectVisualPnlMonthGrid (Monday first), in order. */
  readonly weeks: readonly VisualPnlMonthWeek[];
  readonly month: VisualPnlAggregationSummary | null;
  readonly monthFromDayKey: string | null;
  readonly monthToDayKey: string | null;
}
type ResultsPeriodBounds = Readonly<{ fromDayKey: string | null; toDayKey: string | null }>;

const pad = (value: number) => String(value).padStart(2, '0');
const noScale = (reason: Extract<VisualPnlMonthScale, { kind: 'none' }>['reason']): VisualPnlMonthScale => Object.freeze({ kind: 'none' as const, reason });
const inPeriodOf = (period: ResultsPeriodBounds | undefined) => (dayKey: string): boolean =>
  period === undefined || ((period.fromDayKey === null || dayKey >= period.fromDayKey) && (period.toDayKey === null || dayKey < period.toDayKey));

/** The colour scale of a set of totals: their largest profit or loss, in one currency (sizes in different currencies are never compared). */
export function projectVisualPnlStrengthScale(summaries: readonly VisualPnlAggregationSummary[]): VisualPnlMonthScale {
  const sized = summaries.filter((summary): summary is Extract<VisualPnlAggregationSummary, { available: true }> => summary.available && (summary.outcome === 'profit' || summary.outcome === 'loss'));
  if (sized.length === 0) return noScale('no-profit-or-loss-days');
  const currency = sized[0].currency;
  // Sizes in different currencies are never compared; there is no FX.
  if (sized.some(summary => summary.currency !== currency)) return noScale('mixed-currencies');
  let largest: DecimalString | null = null;
  for (const summary of sized) {
    const absolute = decimalAbs(summary.total);
    if (!absolute.ok) return noScale('invalid-scale-decimal');
    if (largest === null) { largest = absolute.value; continue; }
    const order = decimalCompare(absolute.value, largest);
    if (order === null) return noScale('invalid-scale-decimal');
    if (order > 0) largest = absolute.value;
  }
  return Object.freeze({ kind: 'one-currency' as const, currency, largestAbsolute: largest as DecimalString });
}

/** 1–4 against the scale's largest size, for a profit or a loss; null when there is no size to show. */
export function visualPnlStrengthOf(summary: VisualPnlAggregationSummary | null, scale: VisualPnlMonthScale): 1 | 2 | 3 | 4 | null {
  if (!summary?.available || (summary.outcome !== 'profit' && summary.outcome !== 'loss') || scale.kind !== 'one-currency') return null;
  const absolute = decimalAbs(summary.total);
  const steps = absolute.ok ? decimalScaleToSteps(absolute.value, scale.largestAbsolute, 4) : null;
  return steps === null ? null : Math.max(1, steps) as 1 | 2 | 3 | 4;
}

/**
 * The month calendar model: every calendar day of `monthKey`, Monday first,
 * each with its P13.7 day result and a 1–4 colour strength against the
 * month's largest profit or loss day. It adds up no money and never chooses
 * a time zone: the day summaries already carry both decisions. With a
 * `period` (U5), days outside it are marked and show no result.
 */
export function projectVisualPnlMonthGrid(input: { readonly monthKey: string; readonly days: readonly VisualPnlDailySummary[]; readonly todayKey: string | null; readonly period?: Readonly<{ fromDayKey: string | null; toDayKey: string | null }> }): VisualPnlMonthGridProjection | null {
  const { monthKey, todayKey, period } = input;
  if (!isVisualPnlMonthKey(monthKey)) return null;
  const inPeriod = inPeriodOf(period);
  const byDay = new Map(input.days.filter(day => day.dayKey.startsWith(`${monthKey}-`) && inPeriod(day.dayKey)).map(day => [day.dayKey, day.summary]));
  const scale = projectVisualPnlStrengthScale([...byDay.values()]);
  const count = visualPnlDaysInMonth(monthKey);
  const days: VisualPnlMonthGridDay[] = [];
  for (let dayOfMonth = 1; dayOfMonth <= count; dayOfMonth += 1) {
    const dayKey = `${monthKey}-${pad(dayOfMonth)}`;
    const summary = byDay.get(dayKey) ?? null;
    const result: VisualPnlMonthDayResult = summary === null ? 'no-trades' : !summary.available ? 'unavailable' : summary.outcome;
    const strength = visualPnlStrengthOf(summary, scale);
    days.push(Object.freeze({ dayKey, dayOfMonth, result, summary, strength, isToday: dayKey === todayKey, inPeriod: inPeriod(dayKey) }));
  }
  return Object.freeze({
    monthKey,
    leadingEmptyCells: visualPnlMondayFirstWeekday(`${monthKey}-01`),
    days: Object.freeze(days),
    previousMonthKey: shiftVisualPnlMonthKey(monthKey, -1),
    nextMonthKey: shiftVisualPnlMonthKey(monthKey, 1),
    scale,
  });
}

/**
 * U5 (D204): each calendar row's total and the month's, from the trades of the days that are in the month and in the
 * period, so the weeks add up to the month and a week never reaches into the next month. Totals go through the
 * aggregation owner and block with its reason; week colours use a scale of their own. Null for a bad month key.
 */
export function projectVisualPnlMonthTotals(input: Readonly<{ monthKey: string; days: readonly VisualPnlDailySummaryDay[]; period?: ResultsPeriodBounds }>): VisualPnlMonthTotals | null {
  const { monthKey } = input;
  if (!isVisualPnlMonthKey(monthKey)) return null;
  const inPeriod = inPeriodOf(input.period);
  const byDay = new Map(input.days.filter(day => day.dayKey.startsWith(`${monthKey}-`)).map(day => [day.dayKey, day]));
  const summarize = (dayKeys: readonly string[]): VisualPnlAggregationSummary | null => {
    const results = dayKeys.flatMap(dayKey => byDay.get(dayKey)?.tradeResults ?? []);
    return results.length === 0 ? null : summarizeVisualPnlAggregation(results);
  };
  const bounds = (dayKeys: readonly string[]) => dayKeys.length === 0
    ? { fromDayKey: null, toDayKey: null }
    : { fromDayKey: dayKeys[0], toDayKey: shiftVisualPnlDayKey(dayKeys[dayKeys.length - 1], 1) };
  const leading = visualPnlMondayFirstWeekday(`${monthKey}-01`);
  const count = visualPnlDaysInMonth(monthKey);
  const rows: string[][] = [];
  for (let row = 0; row * 7 < leading + count; row += 1) {
    const dayKeys: string[] = [];
    for (let column = 0; column < 7; column += 1) {
      const dayOfMonth = row * 7 + column - leading + 1;
      const dayKey = `${monthKey}-${pad(dayOfMonth)}`;
      if (dayOfMonth >= 1 && dayOfMonth <= count && inPeriod(dayKey)) dayKeys.push(dayKey);
    }
    rows.push(dayKeys);
  }
  const summaries = rows.map(summarize);
  const scale = projectVisualPnlStrengthScale(summaries.filter((summary): summary is VisualPnlAggregationSummary => summary !== null));
  const weeks = rows.map((dayKeys, index) => Object.freeze({ dayKeys: Object.freeze(dayKeys), ...bounds(dayKeys), summary: summaries[index], strength: visualPnlStrengthOf(summaries[index], scale) }));
  const counted = rows.flat();
  const month = bounds(counted);
  return Object.freeze({ monthKey, weeks: Object.freeze(weeks), month: summarize(counted), monthFromDayKey: month.fromDayKey, monthToDayKey: month.toDayKey });
}
