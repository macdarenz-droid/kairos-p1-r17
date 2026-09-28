/**
 * U4 (P11.A1): the one owner of how long a trade lasted, and its words. Start and end come from tradePictureTimes; an open trade is still running, so it ends at now, even after a partial exit. Times, not money: plain numbers are right here.
 */

import type { TradeExecutionRecord, TradeRecord } from '../../domain/trades';
import { tradePictureTimes } from '../trade-visualizer/tradePictureCandles';

/** Milliseconds from the start to the end of a closed or open trade; null for other trades or unknown times. */
export function projectTradeDurationMs(trade: TradeRecord, executions: readonly TradeExecutionRecord[], nowMs: number): number | null {
  if (trade.status !== 'closed' && trade.status !== 'open') return null;
  const times = tradePictureTimes(trade, executions, nowMs);
  const end = trade.status === 'open' ? nowMs : times.endMs;
  if (times.startMs === null || !Number.isFinite(times.startMs) || !Number.isFinite(end)) return null;
  return Math.max(0, end - times.startMs);
}

/** "45 min", "3 h 5 min", "2 days 5 h". */
export function describeTradeDuration(durationMs: number): string {
  const minutes = Math.round(durationMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), restMinutes = minutes % 60;
  if (hours < 48) return restMinutes === 0 ? `${hours} h` : `${hours} h ${restMinutes} min`;
  const days = Math.floor(hours / 24), restHours = hours % 24;
  return restHours === 0 ? `${days} days` : `${days} days ${restHours} h`;
}
