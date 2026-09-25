/**
 * P30: the one owner of how a group of closed trades went, and (T-042b, T-042c) of the trader's patterns. It counts results that already have an owner (the trade's result after fees) and adds up money only through the aggregation owner, in one currency. The share won is its only new number: counts, never money. Below PATTERN_LEAST_TRADES trades with a result, no result is shown. It describes the past; it never predicts.
 */

import type { TradeDisciplineRecord } from '../../domain/discipline';
import { checkSavedTradeStrategy } from '../discipline/strategyCheck';
import type { JournalHistoryEntry } from '../journal/historyQuery';
import { projectTradePlanVsExecution } from '../trades/planVsExecution';
import { projectVisualPnlDayKey, projectVisualPnlHourOfDay, summarizeVisualPnlAggregation, visualPnlMondayFirstWeekday, type VisualPnlAggregationSummary } from '../visual-pnl';

/** A group shows how it went only from this many trades with a result. */
export const PATTERN_LEAST_TRADES = 10;

export interface PatternTradesSummary {
  /** Trades in the group. */
  readonly tradeCount: number;
  /** Result after fees above zero. */
  readonly won: number;
  readonly lost: number;
  readonly breakEven: number;
  /** Trades whose result is not known (visualPnl 'unavailable'). */
  readonly noResult: number;
  /** won + lost + breakEven: the sample every result of the group rests on. */
  readonly resultCount: number;
  /** resultCount >= PATTERN_LEAST_TRADES. */
  readonly enough: boolean;
  /** won ÷ resultCount as a whole percent, half up; null unless enough. */
  readonly wonPercent: number | null;
  /** The group's result after fees (summarizeVisualPnlAggregation over every trade of the group); null unless enough. */
  readonly total: VisualPnlAggregationSummary | null;
}

// Counts, never money (as disciplineScore.ts).
const percentHalfUp = (n: number, d: number): number => Math.floor((200 * n + d) / (2 * d));

export function summarizePatternTrades(entries: readonly JournalHistoryEntry[]): PatternTradesSummary {
  let won = 0;
  let lost = 0;
  let breakEven = 0;
  let noResult = 0;
  for (const entry of entries) {
    const outcome = entry.visualPnl.outcome;
    if (outcome === 'profit') won += 1;
    else if (outcome === 'loss') lost += 1;
    else if (outcome === 'breakeven') breakEven += 1;
    else noResult += 1;
  }
  const resultCount = won + lost + breakEven;
  const enough = resultCount >= PATTERN_LEAST_TRADES;
  return Object.freeze({
    tradeCount: entries.length,
    won,
    lost,
    breakEven,
    noResult,
    resultCount,
    enough,
    wonPercent: enough ? percentHalfUp(won, resultCount) : null,
    total: enough ? summarizeVisualPnlAggregation(entries.map(entry => entry.visualPnl)) : null,
  });
}

/** The patterns, in the order they are shown. */
export const TRADE_PATTERN_KINDS = Object.freeze(['plan', 'after-result', 'strategy', 'weekday', 'time-of-day', 'direction'] as const);
export type TradePatternKind = (typeof TRADE_PATTERN_KINDS)[number];
/** Bars are drawn out of this many steps. */
export const PATTERN_BAR_STEPS = 10;
/** Hours in one time-of-day group: six groups, 00–03, 04–07, … 20–23, in the saved time zone. */
export const PATTERN_HOURS_PER_GROUP = 4;

export interface TradePatternGroup {
  /** Stable within its pattern: 'kept' | 'broken'; 'after-win' | 'after-loss'; 'strategy:<strategy id>' | 'no-strategy'; 'weekday:0'…'weekday:6' (Monday first); 'hours:0'…'hours:5'; 'long' | 'short'. */
  readonly key: string;
  /** The strategy's name for a strategy group (T-042c); null for every other group. */
  readonly name: string | null;
  readonly summary: PatternTradesSummary;
  /** For drawing only: this group's trade count against the pattern's largest group, 0…PATTERN_BAR_STEPS; at least 1 when the group has a trade. */
  readonly barSteps: number;
}
export interface TradePattern {
  readonly kind: TradePatternKind;
  readonly groups: readonly TradePatternGroup[];
  /** Trades of the period this pattern could not place in a group. */
  readonly unplaced: number;
}
export interface TradePatternsInput {
  /** Every closed trade of one scope in the period (listJournalClosedTradesInPeriod), oldest close first. */
  readonly entries: readonly JournalHistoryEntry[];
  /** The saved time zone: days and hours are read in it. */
  readonly timeZone: string;
  /** Their saved discipline records by trade id (loadTradeDiscipline). */
  readonly records: ReadonlyMap<string, TradeDisciplineRecord>;
}
export interface TradePatternsProjection {
  /** summarizePatternTrades over every entry. */
  readonly overall: PatternTradesSummary;
  /** One pattern per TRADE_PATTERN_KINDS entry, in that order. */
  readonly patterns: readonly TradePattern[];
}

/** Every key becomes a group, in order, even with no trades; members keep the entries' order. */
function buildGroups(keys: readonly string[], members: ReadonlyMap<string, readonly JournalHistoryEntry[]>, names?: ReadonlyMap<string, string>): readonly TradePatternGroup[] {
  const counts = keys.map(key => members.get(key)?.length ?? 0);
  const largest = Math.max(0, ...counts);
  return Object.freeze(keys.map((key, index) => {
    const count = counts[index]!;
    // Whole steps, half up; counts, not money.
    const barSteps = count === 0 ? 0 : Math.max(1, Math.floor((2 * PATTERN_BAR_STEPS * count + largest) / (2 * largest)));
    return Object.freeze({ key, name: names?.get(key) ?? null, summary: summarizePatternTrades(members.get(key) ?? []), barSteps });
  }));
}

function groupBy(entries: readonly JournalHistoryEntry[], keyOf: (entry: JournalHistoryEntry, index: number) => string | null): { members: Map<string, JournalHistoryEntry[]>; unplaced: number } {
  const members = new Map<string, JournalHistoryEntry[]>();
  let unplaced = 0;
  entries.forEach((entry, index) => {
    const key = keyOf(entry, index);
    if (key === null) { unplaced += 1; return; }
    const list = members.get(key);
    if (list) list.push(entry); else members.set(key, [entry]);
  });
  return { members, unplaced };
}

const pattern = (kind: TradePatternKind, keys: readonly string[], grouped: { members: Map<string, JournalHistoryEntry[]>; unplaced: number }, names?: ReadonlyMap<string, string>): TradePattern =>
  Object.freeze({ kind, groups: buildGroups(keys, grouped.members, names), unplaced: grouped.unplaced });

/** Kept or went against the plan: a passed stop, a bigger size or a broken rule is "broken"; otherwise one known kept fact is "kept". */
function planKey(entry: JournalHistoryEntry, record: TradeDisciplineRecord | null): 'kept' | 'broken' | null {
  const plan = projectTradePlanVsExecution(entry.trade, entry.plans, entry.metrics);
  const check = checkSavedTradeStrategy(entry.trade, entry.plans, record);
  if (plan.stop.verdict === 'passed' || plan.size.verdict === 'bigger' || (check !== null && check.broken > 0)) return 'broken';
  if (plan.stop.verdict === 'kept' || plan.size.verdict === 'as-planned' || plan.size.verdict === 'smaller' || (check !== null && check.kept > 0)) return 'kept';
  return null;
}

/** How many of `closes` (sorted by closedAt) closed at or before `at`. */
function closedBy(closes: readonly JournalHistoryEntry[], at: string): number {
  let low = 0;
  let high = closes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (closes[middle]!.trade.closedAt! <= at) low = middle + 1; else high = middle;
  }
  return low;
}

function strategyPattern(entries: readonly JournalHistoryEntry[], records: ReadonlyMap<string, TradeDisciplineRecord>): TradePattern {
  const names = new Map<string, string>();
  const linkedAt = new Map<string, string>();
  const grouped = groupBy(entries, entry => {
    const strategy = records.get(entry.trade.id)?.strategy;
    if (!strategy) return 'no-strategy';
    const key = `strategy:${strategy.strategyId}`;
    // The name of the most recently chosen snapshot; on a tie, the first met.
    const seen = linkedAt.get(key);
    if (seen === undefined || strategy.linkedAt > seen) { linkedAt.set(key, strategy.linkedAt); names.set(key, strategy.name); }
    return key;
  });
  const keys = [...grouped.members.keys()].filter(key => key !== 'no-strategy').sort((a, b) =>
    grouped.members.get(b)!.length - grouped.members.get(a)!.length || names.get(a)!.localeCompare(names.get(b)!) || (a < b ? -1 : a > b ? 1 : 0));
  if (grouped.members.has('no-strategy')) keys.push('no-strategy');
  return pattern('strategy', keys, grouped, names);
}

const WEEKDAY_KEYS = Object.freeze(Array.from({ length: 7 }, (_, day) => `weekday:${day}`));
const HOUR_KEYS = Object.freeze(Array.from({ length: 24 / PATTERN_HOURS_PER_GROUP }, (_, block) => `hours:${block}`));

export function projectTradePatterns(input: TradePatternsInput): TradePatternsProjection {
  const { entries, timeZone } = input;
  // When each trade was opened, in the saved time zone: the moment the trader chose.
  const openings = entries.map(entry => {
    const day = projectVisualPnlDayKey(entry.trade.openedAt, timeZone);
    const hour = projectVisualPnlHourOfDay(entry.trade.openedAt, timeZone);
    return !day.available || hour === null ? null : { weekday: visualPnlMondayFirstWeekday(day.dayKey), hour };
  });
  const records = input.records;
  const closes = entries.filter(entry => entry.trade.closedAt !== null).sort((a, b) => (a.trade.closedAt! < b.trade.closedAt! ? -1 : a.trade.closedAt! > b.trade.closedAt! ? 1 : 0));
  const byKind: Record<TradePatternKind, () => TradePattern> = {
    plan: () => pattern('plan', ['kept', 'broken'], groupBy(entries, entry => planKey(entry, records.get(entry.trade.id) ?? null))),
    'after-result': () => pattern('after-result', ['after-win', 'after-loss'], groupBy(entries, (entry, index) => {
      if (openings[index] === null) return null;
      // The last trade of the period closed at or before this one opened (never itself).
      let at = closedBy(closes, entry.trade.openedAt!) - 1;
      while (at >= 0 && closes[at] === entry) at -= 1;
      const outcome = at >= 0 ? closes[at]!.visualPnl.outcome : null;
      return outcome === 'profit' ? 'after-win' : outcome === 'loss' ? 'after-loss' : null;
    })),
    strategy: () => strategyPattern(entries, records),
    weekday: () => pattern('weekday', WEEKDAY_KEYS, groupBy(entries, (_, index) => {
      const opening = openings[index];
      return opening ? `weekday:${opening.weekday}` : null;
    })),
    'time-of-day': () => pattern('time-of-day', HOUR_KEYS, groupBy(entries, (_, index) => {
      const opening = openings[index];
      return opening ? `hours:${Math.floor(opening.hour / PATTERN_HOURS_PER_GROUP)}` : null;
    })),
    direction: () => pattern('direction', ['long', 'short'], groupBy(entries, entry => entry.trade.side)),
  };
  return Object.freeze({
    overall: summarizePatternTrades(entries),
    patterns: Object.freeze(TRADE_PATTERN_KINDS.map(kind => byKind[kind]())),
  });
}
