/**
 * P30: the one owner of how a group of closed trades went, and (T-042b, T-042c) of the trader's patterns. It counts results that already have an owner (the trade's result after fees) and adds up money only through the aggregation owner, in one currency. The share won is its only new number: counts, never money. Below PATTERN_LEAST_TRADES trades with a result, no result is shown. It describes the past; it never predicts.
 */

import type { JournalHistoryEntry } from '../journal/historyQuery';
import { summarizeVisualPnlAggregation, type VisualPnlAggregationSummary } from '../visual-pnl';

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
