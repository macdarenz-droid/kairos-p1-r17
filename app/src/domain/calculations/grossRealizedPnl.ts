import type {
  DecimalString,
  TradeExecutionRecord,
  TradeSide,
} from '../trades';
import { decimalSubtract } from './decimalKernel';
import { assessExecutionBalance } from './executionBalance';

export type GrossRealizedPnlUnavailableReason =
  | 'empty'
  | 'open'
  | 'partially-exited';

export type GrossRealizedPnlResult =
  | {
      readonly ok: true;
      readonly available: true;
      readonly grossRealizedPnl: DecimalString;
    }
  | {
      readonly ok: true;
      readonly available: false;
      readonly reason: GrossRealizedPnlUnavailableReason;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'invalid-execution-decimal'
        | 'exit-without-entry'
        | 'over-exited';
    };

export function calculateFlatTradeGrossRealizedPnl(
  side: TradeSide,
  executions: readonly TradeExecutionRecord[],
): GrossRealizedPnlResult {
  const balance = assessExecutionBalance(executions);

  if (!balance.ok) {
    return { ok: false, reason: balance.reason };
  }

  if (balance.state !== 'flat') {
    return {
      ok: true,
      available: false,
      reason: balance.state,
    };
  }

  const { entry, exit } = balance.aggregate;
  const pnl = side === 'long'
    ? decimalSubtract(exit.notional, entry.notional)
    : decimalSubtract(entry.notional, exit.notional);

  if (!pnl.ok) {
    return { ok: false, reason: 'invalid-execution-decimal' };
  }

  return {
    ok: true,
    available: true,
    grossRealizedPnl: pnl.value,
  };
}
