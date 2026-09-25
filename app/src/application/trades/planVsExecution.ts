/**
 * P29: the one owner of how one trade's plan compares with what was done. It gives verdicts only, from numbers that already have owners: the latest plan (latestTradePlan) and the trade's metrics (calculateTradeMetrics, through the history entry). It makes no new number. Missing facts give 'unknown'. Replay trades are never judged: their entries and exits came from the candles (D65, D66).
 */

import { decimalCompare } from '../../domain/calculations/decimalKernel';
import type { TradeMetrics } from '../../domain/calculations/tradeMetrics';
import type { DecimalString, TradePlanRecord, TradeRecord } from '../../domain/trades';
import { latestTradePlan } from '../trade-visualizer/tradeVisualizerFacts';

export type TradeSizeVersusPlan =
  | Readonly<{ verdict: 'bigger' | 'as-planned' | 'smaller'; planned: DecimalString; traded: DecimalString }>
  | Readonly<{ verdict: 'unknown'; reason: 'from-candles' | 'no-planned-size' | 'no-entries' | 'not-comparable' }>;
export type TradeStopVersusPlan =
  | Readonly<{ verdict: 'kept' | 'passed'; stop: DecimalString; averageExit: DecimalString }>
  | Readonly<{ verdict: 'unknown'; reason: 'from-candles' | 'not-closed' | 'no-stop' | 'no-exits' | 'stop-not-on-loss-side' | 'not-comparable' }>;
export interface TradePlanVsExecution {
  readonly size: TradeSizeVersusPlan;
  readonly stop: TradeStopVersusPlan;
}

const SIZE_VERDICTS = { 1: 'bigger', 0: 'as-planned', [-1]: 'smaller' } as const;

function sizeVersusPlan(trade: TradeRecord, planned: DecimalString | null | undefined, metrics: TradeMetrics | null): TradeSizeVersusPlan {
  if (trade.source === 'replay') return { verdict: 'unknown', reason: 'from-candles' };
  if (planned === null || planned === undefined) return { verdict: 'unknown', reason: 'no-planned-size' };
  if (metrics === null || metrics.totalEnteredQuantity === '0') return { verdict: 'unknown', reason: 'no-entries' };
  const order = decimalCompare(metrics.totalEnteredQuantity, planned);
  if (order === null) return { verdict: 'unknown', reason: 'not-comparable' };
  return { verdict: SIZE_VERDICTS[order], planned, traded: metrics.totalEnteredQuantity };
}

function stopVersusPlan(trade: TradeRecord, stop: DecimalString | null | undefined, metrics: TradeMetrics | null): TradeStopVersusPlan {
  if (trade.source === 'replay') return { verdict: 'unknown', reason: 'from-candles' };
  if (trade.status !== 'closed') return { verdict: 'unknown', reason: 'not-closed' };
  if (stop === null || stop === undefined) return { verdict: 'unknown', reason: 'no-stop' };
  if (metrics === null || metrics.state !== 'realized' || metrics.averageEntryPrice === null || metrics.averageExitPrice === null) return { verdict: 'unknown', reason: 'no-exits' };
  // The stop must sit on the loss side of where the trade got in.
  const side = decimalCompare(stop, metrics.averageEntryPrice);
  if (side === null) return { verdict: 'unknown', reason: 'not-comparable' };
  const lossSide = trade.side === 'long' ? -1 : 1;
  if (side !== lossSide) return { verdict: 'unknown', reason: 'stop-not-on-loss-side' };
  const beyond = decimalCompare(metrics.averageExitPrice, stop);
  if (beyond === null) return { verdict: 'unknown', reason: 'not-comparable' };
  return { verdict: beyond === lossSide ? 'passed' : 'kept', stop, averageExit: metrics.averageExitPrice };
}

export function projectTradePlanVsExecution(trade: TradeRecord, plans: readonly TradePlanRecord[], metrics: TradeMetrics | null): TradePlanVsExecution {
  const plan = latestTradePlan(plans);
  return Object.freeze({
    size: Object.freeze(sizeVersusPlan(trade, plan?.plannedQuantity, metrics)),
    stop: Object.freeze(stopVersusPlan(trade, plan?.plannedStopPrice, metrics)),
  });
}
