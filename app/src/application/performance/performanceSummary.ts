/**
 * U4 (P11.A1): the one owner of the period numbers, starting with how a group of closed trades went (moved from patterns, D188). Imported by path; this folder has no index barrel (D187). Counts, never money: money is added up only through the visual-pnl aggregation owner, in one currency.
 */

import type { VisualPnlOutcomeProjection } from '../visual-pnl/outcomeProjection';

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
