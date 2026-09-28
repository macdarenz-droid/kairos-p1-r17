import { useMemo } from 'react';
import type { JournalHistoryEntry } from '../../application/journal';
import type { ChartVisibleTimeRange } from '../chart';
import { tradeReviewIntervalMs, tradeReviewTimes, tradeReviewVisibleRange } from './tradeReviewInterval';

/**
 * The time window a saved trade's chart opens on: the trade ±20% (at least 20
 * candles each side) for the chosen timeframe, or null without a trade, a
 * start time or a known timeframe. "Now" (an open trade's end) is read once per
 * trade, timeframe and refresh, so the window stays stable across re-renders.
 */
export function useAnalysisTradeFocus(entry: JournalHistoryEntry | null, interval: string, revision: number): ChartVisibleTimeRange | null {
  const times = entry && Array.isArray(entry.executions) ? tradeReviewTimes(entry) : null;
  const tradeId = entry?.trade.id ?? null;
  const startMs = times?.startMs ?? null, endMs = times?.endMs ?? null;
  const intervalMs = tradeReviewIntervalMs(interval);
  return useMemo(() => (
    tradeId === null || startMs === null || intervalMs === null ? null : tradeReviewVisibleRange(startMs, endMs ?? Date.now(), intervalMs)
    // revision re-reads "now" on an explicit refresh.
  ), [tradeId, startMs, endMs, intervalMs, revision]);
}
