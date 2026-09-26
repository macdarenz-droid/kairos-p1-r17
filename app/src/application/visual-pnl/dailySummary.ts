import type { JournalHistoryEntry } from '../journal';
import {
  projectVisualPnlDayKey,
  type VisualPnlDayKeyBlockReason,
} from './dayBucket';
import {
  summarizeVisualPnlAggregation,
  type VisualPnlAggregationSummary,
} from './aggregationSummary';
import type { VisualPnlOutcomeProjection } from './outcomeProjection';

export type VisualPnlDailySummaryBlockReason =
  | VisualPnlDayKeyBlockReason
  | 'non-closed-trade';

export interface VisualPnlDailySummary {
  readonly dayKey: string;
  readonly timeZone: string;
  readonly summary: VisualPnlAggregationSummary;
}

/** A day of the daily summary with the result of each of its closed trades, in the order the caller listed them. */
export interface VisualPnlDailySummaryDay extends VisualPnlDailySummary {
  readonly tradeResults: readonly VisualPnlOutcomeProjection[];
}

export interface VisualPnlDailySummaryBlockedTrade {
  readonly tradeId: string;
  readonly reason: VisualPnlDailySummaryBlockReason;
}

export interface VisualPnlDailySummaryProjection {
  readonly days: readonly VisualPnlDailySummaryDay[];
  readonly blockedTrades: readonly VisualPnlDailySummaryBlockedTrade[];
}

interface DayAccumulator {
  readonly dayKey: string;
  readonly projections: JournalHistoryEntry['visualPnl'][];
}

/**
 * Groups already-authoritative Journal History Visual P&L projections by the
 * P13.6 closed-at calendar-day contract, then delegates monetary composition to
 * the P13.5 aggregation summary owner.
 *
 * This function performs no financial arithmetic and does not choose a time
 * zone. Non-closed or unassignable trades remain explicit blocked evidence.
 * Each day also keeps its trades' results in the order given; for
 * `listJournalVisualPnlDailySummary` that is oldest close first.
 */
export function summarizeVisualPnlByDay(
  entries: readonly JournalHistoryEntry[],
  timeZone: string,
): VisualPnlDailySummaryProjection {
  const buckets = new Map<string, DayAccumulator>();
  const blocked: VisualPnlDailySummaryBlockedTrade[] = [];

  for (const entry of entries) {
    if (entry.trade.status !== 'closed') {
      blocked.push(Object.freeze({ tradeId: entry.trade.id, reason: 'non-closed-trade' }));
      continue;
    }

    const day = projectVisualPnlDayKey(entry.trade.closedAt, timeZone);
    if (!day.available) {
      blocked.push(Object.freeze({ tradeId: entry.trade.id, reason: day.reason }));
      continue;
    }

    const existing = buckets.get(day.dayKey);
    if (existing) {
      existing.projections.push(entry.visualPnl);
    } else {
      buckets.set(day.dayKey, { dayKey: day.dayKey, projections: [entry.visualPnl] });
    }
  }

  const days = [...buckets.values()]
    .sort((left, right) => left.dayKey.localeCompare(right.dayKey))
    .map((bucket) => {
      const results = Object.freeze([...bucket.projections]);
      return Object.freeze({
        dayKey: bucket.dayKey,
        timeZone,
        summary: summarizeVisualPnlAggregation(results),
        tradeResults: results,
      });
    });

  return Object.freeze({
    days: Object.freeze(days),
    blockedTrades: Object.freeze(blocked),
  });
}
