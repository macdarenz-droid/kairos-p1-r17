/**
 * U5 (P13.A4, D198): the one owner of which days a chosen results period covers: its first day and the day after its
 * last, the months it touches, the periods before and after it, its words, and how it is written in the address.
 * It works on calendar day keys only, through `dayKeyCalendar`, never on instants, so no time zone is involved here.
 */

import {
  isVisualPnlDayKey,
  shiftVisualPnlDayKey,
  shiftVisualPnlMonthKey,
  visualPnlMondayFirstWeekday,
} from './dayKeyCalendar';

export const VISUAL_PNL_PERIOD_KINDS = Object.freeze(['week', 'month', 'three-months', 'year', 'all', 'custom'] as const);
export type VisualPnlPeriodKind = (typeof VISUAL_PNL_PERIOD_KINDS)[number];
export type VisualPnlPeriodChoice =
  | Readonly<{ kind: 'week' | 'month' | 'three-months' | 'year'; at: string | null }>
  | Readonly<{ kind: 'all' }>
  | Readonly<{ kind: 'custom'; firstDayKey: string; lastDayKey: string }>;
export const VISUAL_PNL_DEFAULT_PERIOD: VisualPnlPeriodChoice = Object.freeze({ kind: 'month', at: null });

export interface VisualPnlPeriod {
  readonly choice: VisualPnlPeriodChoice;
  readonly kind: VisualPnlPeriodKind;
  /** First day, included (the period query's fromDayKey); null only for 'all'. */
  readonly fromDayKey: string | null;
  /** The day after the last day, not included (the period query's toDayKey); null only for 'all'. */
  readonly toDayKey: string | null;
  /** Calendar months (YYYY-MM) the period touches, oldest first; empty for 'all'. */
  readonly monthKeys: readonly string[];
  readonly holdsToday: boolean;
  readonly previous: VisualPnlPeriodChoice | null;
  readonly next: VisualPnlPeriodChoice | null;
  /** "21 – 27 September 2026", "September 2026", "July – September 2026", "2026", "All time", "3 – 20 September 2026". */
  readonly label: string;
}

export type VisualPnlPeriodProblem = 'invalid-day-key' | 'last-before-first' | 'after-today';
export type VisualPnlPeriodResult = Readonly<{ ok: true; period: VisualPnlPeriod }> | Readonly<{ ok: false; reason: VisualPnlPeriodProblem }>;

// English names in code, not Intl, so every device shows the same words (as the results calendar).
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

const MONTH_NUMBERS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] as const;

const monthName = (monthKey: string): string => MONTH_NAMES[MONTH_NUMBERS.indexOf(monthKey.slice(5, 7) as (typeof MONTH_NUMBERS)[number])];
const yearOf = (key: string): string => key.slice(0, 4);
/** "3" for "2026-09-03". */
const dayOf = (dayKey: string): string => dayKey.slice(8, 10).replace(/^0/, '');
const firstOfMonth = (monthKey: string): string => `${monthKey}-01`;

/** "20 September 2026"; "21 – 27 September 2026"; "29 September – 5 October 2026"; "29 December 2025 – 4 January 2026". */
function dayRangeLabel(firstDayKey: string, lastDayKey: string): string {
  const last = `${dayOf(lastDayKey)} ${monthName(lastDayKey.slice(0, 7))} ${yearOf(lastDayKey)}`;
  if (firstDayKey === lastDayKey) return last;
  if (yearOf(firstDayKey) !== yearOf(lastDayKey)) return `${dayOf(firstDayKey)} ${monthName(firstDayKey.slice(0, 7))} ${yearOf(firstDayKey)} – ${last}`;
  if (firstDayKey.slice(0, 7) !== lastDayKey.slice(0, 7)) return `${dayOf(firstDayKey)} ${monthName(firstDayKey.slice(0, 7))} – ${last}`;
  return `${dayOf(firstDayKey)} – ${last}`;
}

/** "July – September 2026"; "November 2025 – January 2026". */
function monthRangeLabel(firstMonthKey: string, lastMonthKey: string): string {
  const last = `${monthName(lastMonthKey)} ${yearOf(lastMonthKey)}`;
  if (yearOf(firstMonthKey) !== yearOf(lastMonthKey)) return `${monthName(firstMonthKey)} ${yearOf(firstMonthKey)} – ${last}`;
  return `${monthName(firstMonthKey)} – ${last}`;
}

/** Every month from the month of `fromDayKey` to the month of the day before `toDayKey`, oldest first. */
function monthKeysBetween(fromDayKey: string, toDayKey: string): readonly string[] {
  const lastMonth = shiftVisualPnlDayKey(toDayKey, -1).slice(0, 7);
  const months: string[] = [];
  for (let month = fromDayKey.slice(0, 7); month <= lastMonth; month = shiftVisualPnlMonthKey(month, 1)) months.push(month);
  return Object.freeze(months);
}

const refused = (reason: VisualPnlPeriodProblem): VisualPnlPeriodResult => Object.freeze({ ok: false as const, reason });

function bounded(
  choice: VisualPnlPeriodChoice,
  fromDayKey: string,
  toDayKey: string,
  todayKey: string,
  previous: VisualPnlPeriodChoice | null,
  next: VisualPnlPeriodChoice | null,
  label: string,
): VisualPnlPeriodResult {
  const period: VisualPnlPeriod = Object.freeze({
    choice,
    kind: choice.kind,
    fromDayKey,
    toDayKey,
    monthKeys: monthKeysBetween(fromDayKey, toDayKey),
    holdsToday: fromDayKey <= todayKey && todayKey < toDayKey,
    previous,
    next,
    label,
  });
  return Object.freeze({ ok: true as const, period });
}

type StepKind = 'week' | 'month' | 'three-months' | 'year';
const stepChoice = (kind: StepKind, at: string): VisualPnlPeriodChoice => Object.freeze({ kind, at });
/** The next period, only when the day it is chosen by is not after today. */
const nextIfStarted = (kind: StepKind, at: string, todayKey: string): VisualPnlPeriodChoice | null => (at <= todayKey ? stepChoice(kind, at) : null);

/** Which days `choice` covers when today is `todayKey`, or why it can't be shown. */
export function projectVisualPnlPeriod(choice: VisualPnlPeriodChoice, todayKey: string): VisualPnlPeriodResult {
  if (!isVisualPnlDayKey(todayKey)) return refused('invalid-day-key');
  const frozenChoice = Object.freeze({ ...choice }) as VisualPnlPeriodChoice;

  if (frozenChoice.kind === 'all') {
    const period: VisualPnlPeriod = Object.freeze({
      choice: frozenChoice,
      kind: 'all' as const,
      fromDayKey: null,
      toDayKey: null,
      monthKeys: Object.freeze([]),
      holdsToday: true,
      previous: null,
      next: null,
      label: 'All time',
    });
    return Object.freeze({ ok: true as const, period });
  }

  if (frozenChoice.kind === 'custom') {
    const { firstDayKey, lastDayKey } = frozenChoice;
    if (!isVisualPnlDayKey(firstDayKey) || !isVisualPnlDayKey(lastDayKey)) return refused('invalid-day-key');
    if (lastDayKey < firstDayKey) return refused('last-before-first');
    if (lastDayKey > todayKey) return refused('after-today');
    return bounded(frozenChoice, firstDayKey, shiftVisualPnlDayKey(lastDayKey, 1), todayKey, null, null, dayRangeLabel(firstDayKey, lastDayKey));
  }

  const at = frozenChoice.at ?? todayKey;
  if (!isVisualPnlDayKey(at)) return refused('invalid-day-key');
  if (at > todayKey) return refused('after-today');
  const month = at.slice(0, 7);

  switch (frozenChoice.kind) {
    case 'week': {
      const monday = shiftVisualPnlDayKey(at, -visualPnlMondayFirstWeekday(at));
      const nextMonday = shiftVisualPnlDayKey(monday, 7);
      return bounded(frozenChoice, monday, nextMonday, todayKey, stepChoice('week', shiftVisualPnlDayKey(monday, -7)), nextIfStarted('week', nextMonday, todayKey), dayRangeLabel(monday, shiftVisualPnlDayKey(nextMonday, -1)));
    }
    case 'month': {
      const from = firstOfMonth(month);
      const to = firstOfMonth(shiftVisualPnlMonthKey(month, 1));
      return bounded(frozenChoice, from, to, todayKey, stepChoice('month', firstOfMonth(shiftVisualPnlMonthKey(month, -1))), nextIfStarted('month', to, todayKey), `${monthName(month)} ${yearOf(month)}`);
    }
    case 'three-months': {
      const firstMonth = shiftVisualPnlMonthKey(month, -2);
      const from = firstOfMonth(firstMonth);
      const to = firstOfMonth(shiftVisualPnlMonthKey(month, 1));
      // A period kept in an old address can end before today's 3 months: when the next 3 months have begun but would end
      // after today, "next" is the 3 months up to today (D210).
      const next = nextIfStarted('three-months', firstOfMonth(shiftVisualPnlMonthKey(month, 3)), todayKey)
        ?? (to <= todayKey ? Object.freeze({ kind: 'three-months' as const, at: null }) : null);
      return bounded(frozenChoice, from, to, todayKey, stepChoice('three-months', shiftVisualPnlDayKey(from, -1)), next, monthRangeLabel(firstMonth, month));
    }
    case 'year': {
      const january = `${yearOf(at)}-01`;
      const from = firstOfMonth(january);
      const to = firstOfMonth(shiftVisualPnlMonthKey(january, 12));
      return bounded(frozenChoice, from, to, todayKey, stepChoice('year', firstOfMonth(shiftVisualPnlMonthKey(january, -12))), nextIfStarted('year', to, todayKey), yearOf(at));
    }
  }
}

const PERIOD_KEYS = ['period', 'at', 'first', 'last'] as const;
const isPeriodKind = (value: string | null): value is VisualPnlPeriodKind => value !== null && (VISUAL_PNL_PERIOD_KINDS as readonly string[]).includes(value);

/** The period chosen in the address (`period`, `at`, `first`, `last`); the default month when it is missing or unknown. Day keys are checked by `projectVisualPnlPeriod`, not here. */
export function readVisualPnlPeriodChoice(params: URLSearchParams): VisualPnlPeriodChoice {
  const kind = params.get('period');
  if (!isPeriodKind(kind)) return VISUAL_PNL_DEFAULT_PERIOD;
  if (kind === 'all') return Object.freeze({ kind });
  if (kind === 'custom') {
    const firstDayKey = params.get('first');
    const lastDayKey = params.get('last');
    if (firstDayKey === null || lastDayKey === null) return VISUAL_PNL_DEFAULT_PERIOD;
    return Object.freeze({ kind, firstDayKey, lastDayKey });
  }
  return Object.freeze({ kind, at: params.get('at') });
}

/** A copy of `params` with the period's four keys set or removed; every other key is kept. */
export function writeVisualPnlPeriodChoice(choice: VisualPnlPeriodChoice, params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of PERIOD_KEYS) next.delete(key);
  next.set('period', choice.kind);
  if (choice.kind === 'custom') {
    next.set('first', choice.firstDayKey);
    next.set('last', choice.lastDayKey);
  } else if (choice.kind !== 'all' && choice.at !== null) {
    next.set('at', choice.at);
  }
  return next;
}

export function describeVisualPnlPeriodProblem(reason: VisualPnlPeriodProblem): string {
  switch (reason) {
    case 'invalid-day-key':
      return 'Choose a first and a last day.';
    case 'last-before-first':
      return 'The last day is before the first day.';
    case 'after-today':
      return 'The last day can be today at the latest.';
  }
}
