/**
 * U4 (P11.A1, D190): the one owner of a trade's money at risk (which entry, stop and size) and its × what you risked. Every market uses price × size, the same basis as its result, until U11 adds the contract size to all of them together. The stop is the latest plan's. Money is never converted.
 */

import { decimalRound } from '../../domain/calculations/decimalKernel';
import { aggregateTradeExecutions } from '../../domain/calculations/executionAggregation';
import { calculateRMultiple } from '../../domain/calculations/rMultipleCalculator';
import { calculateMoneyAtRisk, calculateMoneyAtRiskFromPrice } from '../../domain/calculations/riskCalculator';
import type { TradeMetrics } from '../../domain/calculations/tradeMetrics';
import type { DecimalString, TradeExecutionRecord, TradePlanRecord, TradeRecord } from '../../domain/trades';
import { latestTradePlan } from '../trade-visualizer/tradeVisualizerFacts';

export interface TradeRiskInput { readonly trade: TradeRecord; readonly plans: readonly TradePlanRecord[]; readonly executions: readonly TradeExecutionRecord[]; readonly metrics: TradeMetrics | null }
export type TradeRiskBasis = 'as-traded' | 'as-planned';
export type TradeMoneyAtRiskReason = 'no-stop' | 'no-entry' | 'no-size' | 'stop-at-entry' | 'stop-not-on-loss-side' | 'invalid-decimal';
export type TradeMoneyAtRisk =
  | Readonly<{ available: true; basis: TradeRiskBasis; entryPrice: DecimalString; stopPrice: DecimalString; size: DecimalString; amount: DecimalString; currency: string | null }>
  | Readonly<{ available: false; basis: TradeRiskBasis; reason: TradeMoneyAtRiskReason }>;
export type TradeTimesRisked =
  | Readonly<{ available: true; value: DecimalString; result: DecimalString; moneyAtRisk: DecimalString }>
  | Readonly<{ available: false; reason: 'no-result' | TradeMoneyAtRiskReason }>;

/** D60: ratios are shown to 2 places, half up. The one definition; the picture's TRADE_PICTURE_RATIO_PLACES reads it. */
export const TIMES_RISKED_PLACES = 2;

type Worked =
  | Readonly<{ ok: true; basis: TradeRiskBasis; entryPrice: DecimalString; stopPrice: DecimalString; size: DecimalString; amount: DecimalString }>
  | Readonly<{ ok: false; basis: TradeRiskBasis; reason: TradeMoneyAtRiskReason }>;

/** Money at risk as traded (from the entries) or, with no entries, as planned. */
function workOut(input: TradeRiskInput): Worked {
  const plan = latestTradePlan(input.plans);
  const stop = plan?.plannedStopPrice ?? null;
  const aggregate = aggregateTradeExecutions(input.executions);
  // Entries that cannot be added up still count as entries: their reason is 'invalid-decimal'.
  const traded = aggregate.ok ? aggregate.value.entry.quantity !== '0' : input.executions.some(fill => fill.type === 'entry');
  const basis: TradeRiskBasis = traded ? 'as-traded' : 'as-planned';
  if (stop === null) return { ok: false, basis, reason: 'no-stop' };
  if (traded) {
    if (!aggregate.ok) return { ok: false, basis, reason: 'invalid-decimal' };
    const entry = aggregate.value.entry;
    if (entry.weightedAveragePrice === null) return { ok: false, basis, reason: 'no-entry' };
    const money = calculateMoneyAtRisk(input.trade.side, entry.notional, stop, entry.quantity);
    return money.ok
      ? { ok: true, basis, entryPrice: entry.weightedAveragePrice, stopPrice: stop, size: entry.quantity, amount: money.amount }
      : { ok: false, basis, reason: money.reason };
  }
  const entryPrice = plan?.plannedEntryPrice ?? null;
  if (entryPrice === null) return { ok: false, basis, reason: 'no-entry' };
  const size = plan?.plannedQuantity ?? null;
  if (size === null) return { ok: false, basis, reason: 'no-size' };
  const money = calculateMoneyAtRiskFromPrice(input.trade.side, entryPrice, stop, size);
  return money.ok
    ? { ok: true, basis, entryPrice, stopPrice: stop, size, amount: money.amount }
    : { ok: false, basis, reason: money.reason };
}

export function projectTradeMoneyAtRisk(input: TradeRiskInput): TradeMoneyAtRisk {
  const worked = workOut(input);
  if (!worked.ok) return Object.freeze({ available: false, basis: worked.basis, reason: worked.reason });
  return Object.freeze({
    available: true,
    basis: worked.basis,
    entryPrice: worked.entryPrice,
    stopPrice: worked.stopPrice,
    size: worked.size,
    amount: worked.amount,
    currency: input.trade.grossPnlCurrency || null,
  });
}

/** Result after fees ÷ money at risk as traded. */
export function projectTradeTimesRisked(input: TradeRiskInput): TradeTimesRisked {
  const worked = workOut(input);
  if (worked.basis !== 'as-traded') return Object.freeze({ available: false, reason: 'no-result' });
  if (!worked.ok) return Object.freeze({ available: false, reason: worked.reason });
  const result = input.metrics?.netPnl ?? null;
  if (result === null) return Object.freeze({ available: false, reason: 'no-result' });
  const ratio = calculateRMultiple(result, worked.amount);
  if (!ratio.ok) return Object.freeze({ available: false, reason: 'invalid-decimal' });
  return Object.freeze({ available: true, value: ratio.value, result, moneyAtRisk: worked.amount });
}

/** "+1.95", "-0.11", and "0" for a zero (never "+0"). */
export function signedText(value: DecimalString): string {
  return value.startsWith('-') || value === '0' ? value : `+${value}`;
}

/** "+1.95× what you risked", "-0.11× what you risked", "0× what you risked"; null when the kernel refuses the value. */
export function describeTimesRisked(value: DecimalString): string | null {
  const rounded = decimalRound(value, TIMES_RISKED_PLACES, 'half-up');
  return rounded.ok ? `${signedText(rounded.value)}× what you risked` : null;
}
