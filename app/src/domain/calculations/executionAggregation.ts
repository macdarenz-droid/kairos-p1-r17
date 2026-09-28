import type { DecimalString, TradeExecutionRecord } from '../trades';
import {
  decimalAdd,
  decimalDivide,
  decimalMultiply,
  decimalSubtract,
  type DecimalKernelResult,
} from './decimalKernel';

export interface ExecutionSideAggregate {
  readonly quantity: DecimalString;
  readonly notional: DecimalString;
  readonly weightedAveragePrice: DecimalString | null;
}

export interface TradeExecutionAggregate {
  readonly entry: ExecutionSideAggregate;
  readonly exit: ExecutionSideAggregate;
  readonly netQuantity: DecimalString;
}

export type ExecutionAggregationResult =
  | { readonly ok: true; readonly value: TradeExecutionAggregate }
  | { readonly ok: false; readonly reason: 'invalid-execution-decimal' };

type SuccessfulDecimal = Extract<DecimalKernelResult, { readonly ok: true }>;

function requireDecimal(result: DecimalKernelResult): SuccessfulDecimal | null {
  return result.ok ? result : null;
}

function aggregateSide(executions: readonly TradeExecutionRecord[]): ExecutionSideAggregate | null {
  let quantity: DecimalString = '0' as DecimalString;
  let notional: DecimalString = '0' as DecimalString;

  for (const execution of executions) {
    const nextQuantity = requireDecimal(decimalAdd(quantity, execution.quantity));
    const lineNotional = requireDecimal(decimalMultiply(execution.price, execution.quantity));
    if (!nextQuantity || !lineNotional) return null;

    const nextNotional = requireDecimal(decimalAdd(notional, lineNotional.value));
    if (!nextNotional) return null;

    quantity = nextQuantity.value;
    notional = nextNotional.value;
  }

  if (quantity === '0') {
    return Object.freeze({
      quantity,
      notional,
      weightedAveragePrice: null,
    });
  }

  const average = requireDecimal(decimalDivide(notional, quantity));
  if (!average) return null;

  return Object.freeze({
    quantity,
    notional,
    weightedAveragePrice: average.value,
  });
}

export function aggregateTradeExecutions(
  executions: readonly TradeExecutionRecord[],
): ExecutionAggregationResult {
  const entries = aggregateSide(executions.filter((execution) => execution.type === 'entry'));
  const exits = aggregateSide(executions.filter((execution) => execution.type === 'exit'));

  if (!entries || !exits) {
    return { ok: false, reason: 'invalid-execution-decimal' };
  }

  const netQuantity = requireDecimal(decimalSubtract(entries.quantity, exits.quantity));
  if (!netQuantity) {
    return { ok: false, reason: 'invalid-execution-decimal' };
  }

  return {
    ok: true,
    value: Object.freeze({
      entry: entries,
      exit: exits,
      netQuantity: netQuantity.value,
    }),
  };
}
