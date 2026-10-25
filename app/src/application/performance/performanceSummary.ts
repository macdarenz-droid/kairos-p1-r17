/**
 * U4 (P11.A1): the one owner of the period numbers, starting with how a group of closed trades went (moved from patterns, D188). Imported by path; this folder has no index barrel (D187). Counts, never money: money is added up only through the visual-pnl aggregation owner, in one currency.
 */

import { decimalAbs, decimalCompare, decimalDivide, decimalPlaces, decimalRound, decimalSubtract, decimalSum } from '../../domain/calculations/decimalKernel';
import type { DecimalString, TradeId } from '../../domain/trades';
import type { JournalHistoryEntry } from '../journal/historyQuery';
import { tradePictureTimes } from '../trade-visualizer/tradePictureCandles';
import { assessVisualPnlAggregationEligibility, type VisualPnlAggregationBlockReason } from '../visual-pnl/aggregationEligibility';
import { summarizeVisualPnlAggregation } from '../visual-pnl/aggregationSummary';
import type { VisualPnlOutcomeProjection } from '../visual-pnl/outcomeProjection';
import { projectVisualPnlRunningTotals } from '../visual-pnl/resultCandles';
import { projectVisualPnlLongestTradeStreaks, type VisualPnlTradeStreak } from '../visual-pnl/tradeStreaks';
import { projectTradeDurationMs } from './tradeDuration';
import { TIMES_RISKED_PLACES, projectTradeTimesRisked } from './tradeRisk';

/** A group shows how it went only from this many trades with a result (D89). */
export const PERFORMANCE_LEAST_TRADES = 10;

export interface TradeOutcomeSummary {
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
  /** resultCount >= PERFORMANCE_LEAST_TRADES. */
  readonly enough: boolean;
  /** won ÷ resultCount as a whole percent, half up; null unless enough. */
  readonly wonPercent: number | null;
}

// Counts, never money (as disciplineScore.ts).
const percentHalfUp = (n: number, d: number): number => Math.floor((200 * n + d) / (2 * d));

export function summarizeTradeOutcomes(entries: readonly Readonly<{ visualPnl: VisualPnlOutcomeProjection }>[]): TradeOutcomeSummary {
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
  const enough = resultCount >= PERFORMANCE_LEAST_TRADES;
  return Object.freeze({
    tradeCount: entries.length,
    won,
    lost,
    breakEven,
    noResult,
    resultCount,
    enough,
    wonPercent: enough ? percentHalfUp(won, resultCount) : null,
  });
}

export type PerformanceMoneyReason = 'no-trades' | 'mixed-currencies' | 'missing-currency-evidence' | 'invalid-decimal';
export type PerformanceMoney =
  | Readonly<{ available: true; amount: DecimalString; shown: DecimalString; currency: string; tradeCount: number }>
  | Readonly<{ available: false; reason: PerformanceMoneyReason; tradeCount: number }>;
export type PerformanceRatio =
  | Readonly<{ available: true; value: DecimalString; shown: DecimalString; tradeCount: number }>
  | Readonly<{ available: false; reason: PerformanceMoneyReason | 'no-losses'; tradeCount: number }>;
export type PerformanceTrade =
  | Readonly<{ available: true; tradeId: TradeId; symbol: string; closedAt: string | null; amount: DecimalString; currency: string; tradeCount: number }>
  | Readonly<{ available: false; reason: PerformanceMoneyReason; tradeCount: number }>;
export type PerformanceTime =
  | Readonly<{ available: true; averageMs: number; tradeCount: number; tradesWithBadTimes: number }>
  | Readonly<{ available: false; reason: 'no-trades'; tradeCount: 0; tradesWithBadTimes: number }>;
export type PerformanceDip =
  | Readonly<{ available: true; amount: DecimalString; currency: string; fromTradeId: TradeId | null; toTradeId: TradeId | null; tradeCount: number }>
  | Readonly<{ available: false; reason: VisualPnlAggregationBlockReason | 'invalid-decimal'; tradeCount: number }>;
export type PerformanceStreak =
  | Readonly<{ available: true; length: number; firstTradeId: TradeId | null; lastTradeId: TradeId | null; tradeCount: number; tradesWithoutResult: number }>
  | Readonly<{ available: false; reason: 'no-trades'; tradeCount: number; tradesWithoutResult: number }>;
export interface PerformanceSummary {
  readonly tradeCount: number;
  readonly outcomes: TradeOutcomeSummary;
  readonly averageWin: PerformanceMoney;
  readonly averageLoss: PerformanceMoney;
  readonly averageResult: PerformanceMoney;
  readonly profitFactor: PerformanceRatio;
  readonly bestTrade: PerformanceTrade;
  readonly worstTrade: PerformanceTrade;
  readonly averageTimesRisked: PerformanceRatio;
  readonly averageTime: PerformanceTime;
  readonly biggestDip: PerformanceDip;
  readonly longestWinStreak: PerformanceStreak;
  readonly longestLossStreak: PerformanceStreak;
}

/** Money averages are shown to the most decimal places among the averaged results, at most this many (D193). */
const MOST_SHOWN_PLACES = 20;

type Unavailable = Readonly<{ available: false; reason: PerformanceMoneyReason; tradeCount: number }>;
const unavailable = (reason: PerformanceMoneyReason, tradeCount: number): Unavailable => Object.freeze({ available: false, reason, tradeCount });
const noTrades = (): Unavailable => unavailable('no-trades', 0);

function gateReason(reason: VisualPnlAggregationBlockReason | 'invalid-aggregate-decimal'): PerformanceMoneyReason {
  return reason === 'mixed-currencies' || reason === 'missing-currency-evidence' || reason === 'no-trades' ? reason : 'invalid-decimal';
}

/** The exact sum and currency of a subset, through the one aggregation owner. */
function sumOf(subset: readonly JournalHistoryEntry[]): Readonly<{ ok: true; total: DecimalString; currency: string }> | Readonly<{ ok: false; reason: PerformanceMoneyReason }> {
  const summary = summarizeVisualPnlAggregation(subset.map(entry => entry.visualPnl));
  return summary.available ? { ok: true, total: summary.total, currency: summary.currency } : { ok: false, reason: gateReason(summary.reason) };
}

function average(subset: readonly JournalHistoryEntry[]): PerformanceMoney {
  if (subset.length === 0) return noTrades();
  const sum = sumOf(subset);
  if (!sum.ok) return unavailable(sum.reason, subset.length);
  let places = 0;
  for (const entry of subset) {
    const entryPlaces = decimalPlaces(entry.visualPnl.amount ?? '');
    if (entryPlaces === null) return unavailable('invalid-decimal', subset.length);
    places = Math.max(places, entryPlaces);
  }
  const amount = decimalDivide(sum.total, String(subset.length));
  const shown = amount.ok ? decimalRound(amount.value, Math.min(places, MOST_SHOWN_PLACES), 'half-up') : amount;
  if (!amount.ok || !shown.ok) return unavailable('invalid-decimal', subset.length);
  return Object.freeze({ available: true, amount: amount.value, shown: shown.value, currency: sum.currency, tradeCount: subset.length });
}

function profitFactor(wins: readonly JournalHistoryEntry[], losses: readonly JournalHistoryEntry[]): PerformanceRatio {
  const tradeCount = wins.length + losses.length;
  if (tradeCount === 0) return noTrades();
  if (losses.length === 0) return Object.freeze({ available: false, reason: 'no-losses', tradeCount });
  const lost = sumOf(losses);
  if (!lost.ok) return unavailable(lost.reason, tradeCount);
  const lostSign = decimalCompare(lost.total, '0');
  if (lostSign === null) return unavailable('invalid-decimal', tradeCount);
  if (lostSign === 0) return Object.freeze({ available: false, reason: 'no-losses', tradeCount });
  if (wins.length === 0) return Object.freeze({ available: true, value: '0' as DecimalString, shown: '0' as DecimalString, tradeCount });
  const won = sumOf(wins);
  if (!won.ok) return unavailable(won.reason, tradeCount);
  const lostSize = decimalAbs(lost.total);
  const value = lostSize.ok ? decimalDivide(won.total, lostSize.value) : lostSize;
  const shown = value.ok ? decimalRound(value.value, TIMES_RISKED_PLACES, 'half-up') : value;
  if (!value.ok || !shown.ok) return unavailable('invalid-decimal', tradeCount);
  return Object.freeze({ available: true, value: value.value, shown: shown.value, tradeCount });
}

/** The highest (direction 1) or lowest (-1) result; on a tie, the one that closed first. */
function extremeTrade(set: readonly JournalHistoryEntry[], currency: string, direction: 1 | -1): PerformanceTrade {
  let pick: JournalHistoryEntry | null = null;
  for (const entry of set) {
    if (entry.visualPnl.amount === null) return unavailable('invalid-decimal', set.length);
    if (pick === null) { pick = entry; continue; }
    const order = decimalCompare(entry.visualPnl.amount, pick.visualPnl.amount as DecimalString);
    if (order === null) return unavailable('invalid-decimal', set.length);
    if (order === direction) pick = entry;
  }
  if (pick === null || pick.visualPnl.amount === null) return noTrades();
  return Object.freeze({ available: true, tradeId: pick.trade.id, symbol: pick.trade.symbol, closedAt: pick.trade.closedAt, amount: pick.visualPnl.amount, currency, tradeCount: set.length });
}

function averageTimesRisked(entries: readonly JournalHistoryEntry[]): PerformanceRatio {
  const values: DecimalString[] = [];
  for (const entry of entries) {
    const timesRisked = projectTradeTimesRisked(entry);
    if (timesRisked.available) values.push(timesRisked.value);
  }
  if (values.length === 0) return noTrades();
  const sum = decimalSum(values);
  const value = sum.ok ? decimalDivide(sum.value, String(values.length)) : sum;
  const shown = value.ok ? decimalRound(value.value, TIMES_RISKED_PLACES, 'half-up') : value;
  if (!value.ok || !shown.ok) return unavailable('invalid-decimal', values.length);
  return Object.freeze({ available: true, value: value.value, shown: shown.value, tradeCount: values.length });
}

// Times, not money: plain numbers are right here.
function averageTime(entries: readonly JournalHistoryEntry[]): PerformanceTime {
  let totalMs = 0;
  let tradeCount = 0;
  let tradesWithBadTimes = 0;
  for (const entry of entries) {
    const endOfTrade = Date.parse(entry.trade.closedAt ?? '');
    const times = tradePictureTimes(entry.trade, entry.executions, endOfTrade);
    if (times.startMs !== null && Number.isFinite(times.startMs) && Number.isFinite(times.endMs) && times.endMs < times.startMs) {
      tradesWithBadTimes += 1;
      continue;
    }
    const durationMs = projectTradeDurationMs(entry.trade, entry.executions, endOfTrade);
    if (durationMs === null) continue;
    totalMs += durationMs;
    tradeCount += 1;
  }
  return tradeCount === 0
    ? Object.freeze({ available: false, reason: 'no-trades', tradeCount: 0, tradesWithBadTimes })
    : Object.freeze({ available: true, averageMs: Math.round(totalMs / tradeCount), tradeCount, tradesWithBadTimes });
}

/** The biggest fall of the running total from a high point, over every trade in closing order; the period starts as a high point of 0 (fromTradeId null). */
function biggestDip(entries: readonly JournalHistoryEntry[]): PerformanceDip {
  const tradeCount = entries.length;
  const invalid: PerformanceDip = Object.freeze({ available: false, reason: 'invalid-decimal', tradeCount });
  const gate = assessVisualPnlAggregationEligibility(entries.map(entry => entry.visualPnl));
  if (!gate.eligible) return Object.freeze({ available: false, reason: gate.reason, tradeCount });
  const totals = projectVisualPnlRunningTotals('0' as DecimalString, gate.amounts);
  if (totals === null) return invalid;
  let high = '0' as DecimalString;
  let highId: TradeId | null = null;
  let dip = '0' as DecimalString;
  let fromTradeId: TradeId | null = null;
  let toTradeId: TradeId | null = null;
  for (let i = 0; i < totals.length; i += 1) {
    const total = totals[i];
    const above = decimalCompare(total, high);
    if (above === null) return invalid;
    if (above > 0) { high = total; highId = entries[i].trade.id; continue; }
    const fall = decimalSubtract(high, total);
    if (!fall.ok) return invalid;
    const bigger = decimalCompare(fall.value, dip);
    if (bigger === null) return invalid;
    if (bigger > 0) { dip = fall.value; fromTradeId = highId; toTradeId = entries[i].trade.id; }
  }
  return Object.freeze({ available: true, amount: dip, currency: gate.currency, fromTradeId, toTradeId, tradeCount });
}

function streak(run: VisualPnlTradeStreak, outcomes: TradeOutcomeSummary): PerformanceStreak {
  const counts = { tradeCount: outcomes.tradeCount, tradesWithoutResult: outcomes.noResult };
  if (outcomes.resultCount === 0) return Object.freeze({ available: false, reason: 'no-trades', ...counts });
  return Object.freeze({ available: true, length: run.length, firstTradeId: run.firstId as TradeId | null, lastTradeId: run.lastId as TradeId | null, ...counts });
}

/** Entries are closed trades in closing order (the period query's order), after the home-currency step when there is one. */
export function summarizePerformance(entries: readonly JournalHistoryEntry[]): PerformanceSummary {
  const outcomes = summarizeTradeOutcomes(entries);
  const set = entries.filter(entry => entry.visualPnl.outcome !== 'unavailable');
  const wins = set.filter(entry => entry.visualPnl.outcome === 'profit');
  const losses = set.filter(entry => entry.visualPnl.outcome === 'loss');
  const money = (() => {
    if (set.length === 0) {
      return { averageWin: noTrades(), averageLoss: noTrades(), averageResult: noTrades(), profitFactor: noTrades(), bestTrade: noTrades(), worstTrade: noTrades() };
    }
    const gate = sumOf(set);
    if (!gate.ok) {
      return {
        averageWin: unavailable(gate.reason, outcomes.won),
        averageLoss: unavailable(gate.reason, outcomes.lost),
        averageResult: unavailable(gate.reason, outcomes.resultCount),
        profitFactor: unavailable(gate.reason, outcomes.won + outcomes.lost),
        bestTrade: unavailable(gate.reason, outcomes.resultCount),
        worstTrade: unavailable(gate.reason, outcomes.resultCount),
      };
    }
    return {
      averageWin: average(wins),
      averageLoss: average(losses),
      averageResult: average(set),
      profitFactor: profitFactor(wins, losses),
      bestTrade: extremeTrade(set, gate.currency, 1),
      worstTrade: extremeTrade(set, gate.currency, -1),
    };
  })();
  return Object.freeze({
    tradeCount: entries.length,
    outcomes,
    ...money,
    averageTimesRisked: averageTimesRisked(entries),
    averageTime: averageTime(entries),
    biggestDip: biggestDip(entries),
    ...(() => {
      const runs = projectVisualPnlLongestTradeStreaks(entries.map(entry => ({ id: entry.trade.id, outcome: entry.visualPnl.outcome })));
      return { longestWinStreak: streak(runs.win, outcomes), longestLossStreak: streak(runs.loss, outcomes) };
    })(),
  });
}
