import { decimalAbs, decimalCompare, decimalScaleToSteps } from '../../domain/calculations';
import type { DecimalString } from '../../domain/trades';
import type { VisualPnlAggregationSummary } from './aggregationSummary';
import type { VisualPnlDailySummary } from './dailySummary';
import { isVisualPnlMonthKey, shiftVisualPnlMonthKey, visualPnlDaysInMonth, visualPnlMondayFirstWeekday } from './dayKeyCalendar';

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

const pad = (value: number) => String(value).padStart(2, '0');
const noScale = (reason: Extract<VisualPnlMonthScale, { kind: 'none' }>['reason']): VisualPnlMonthScale => Object.freeze({ kind: 'none' as const, reason });

function monthScale(summaries: readonly VisualPnlAggregationSummary[]): VisualPnlMonthScale {
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

/**
 * The month calendar model: every calendar day of `monthKey`, Monday first,
 * each with its P13.7 day result and a 1–4 colour strength against the
 * month's largest profit or loss day. It adds up no money and never chooses
 * a time zone: the day summaries already carry both decisions.
 */
export function projectVisualPnlMonthGrid(input: { readonly monthKey: string; readonly days: readonly VisualPnlDailySummary[]; readonly todayKey: string | null }): VisualPnlMonthGridProjection | null {
  const { monthKey, todayKey } = input;
  if (!isVisualPnlMonthKey(monthKey)) return null;
  const byDay = new Map(input.days.filter(day => day.dayKey.startsWith(`${monthKey}-`)).map(day => [day.dayKey, day.summary]));
  const scale = monthScale([...byDay.values()]);
  const count = visualPnlDaysInMonth(monthKey);
  const days: VisualPnlMonthGridDay[] = [];
  for (let dayOfMonth = 1; dayOfMonth <= count; dayOfMonth += 1) {
    const dayKey = `${monthKey}-${pad(dayOfMonth)}`;
    const summary = byDay.get(dayKey) ?? null;
    const result: VisualPnlMonthDayResult = summary === null ? 'no-trades' : !summary.available ? 'unavailable' : summary.outcome;
    let strength: VisualPnlMonthGridDay['strength'] = null;
    if (summary?.available && (result === 'profit' || result === 'loss') && scale.kind === 'one-currency') {
      const absolute = decimalAbs(summary.total);
      const steps = absolute.ok ? decimalScaleToSteps(absolute.value, scale.largestAbsolute, 4) : null;
      strength = steps === null ? null : Math.max(1, steps) as 1 | 2 | 3 | 4;
    }
    days.push(Object.freeze({ dayKey, dayOfMonth, result, summary, strength, isToday: dayKey === todayKey }));
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
