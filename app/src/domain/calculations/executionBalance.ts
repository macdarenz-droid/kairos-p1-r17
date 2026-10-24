import type { DecimalString, TradeExecutionRecord } from '../trades';
import {
  aggregateTradeExecutions,
  type TradeExecutionAggregate,
} from './executionAggregation';

export type ExecutionBalanceState =
  | 'empty'
  | 'open'
  | 'partially-exited'
  | 'flat';

export type ExecutionBalanceResult =
  | {
      readonly ok: true;
      readonly state: ExecutionBalanceState;
      readonly aggregate: TradeExecutionAggregate;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'invalid-execution-decimal'
        | 'exit-without-entry'
        | 'over-exited';
      readonly aggregate: TradeExecutionAggregate | null;
    };

function isNegative(value: DecimalString): boolean {
  return value.startsWith('-') && value !== '0';
}

export function assessExecutionBalance(
  executions: readonly TradeExecutionRecord[],
): ExecutionBalanceResult {
  const aggregated = aggregateTradeExecutions(executions);
  if (!aggregated.ok) {
    return {
      ok: false,
      reason: 'invalid-execution-decimal',
      aggregate: null,
    };
  }

  const { entry, exit, netQuantity } = aggregated.value;

  if (entry.quantity === '0' && exit.quantity === '0') {
    return {
      ok: true,
      state: 'empty',
      aggregate: aggregated.value,
    };
  }

  if (entry.quantity === '0' && exit.quantity !== '0') {
    return {
      ok: false,
      reason: 'exit-without-entry',
      aggregate: aggregated.value,
    };
  }

  if (isNegative(netQuantity)) {
    return {
      ok: false,
      reason: 'over-exited',
      aggregate: aggregated.value,
    };
  }

  if (netQuantity === '0') {
    return {
      ok: true,
      state: 'flat',
      aggregate: aggregated.value,
    };
  }

  if (exit.quantity === '0') {
    return {
      ok: true,
      state: 'open',
      aggregate: aggregated.value,
    };
  }

  return {
    ok: true,
    state: 'partially-exited',
    aggregate: aggregated.value,
  };
}
