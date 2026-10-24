/**
 * U4 (P11.A1, D191): the one owner of a trade's closed part — its result before fees (first in, first out), its own currency (never converted, D116),
 * what is left, and the fees paid so far. Fees saved with the form are not tied to a fill, so they can't be split between the two parts.
 * The result is times how much one point is worth (D237); with none for a futures or options trade it is not given.
 * It never changes `visualPnl`, `metrics` or any total.
 */

import { calculateClosedPartResult } from '../../domain/calculations/closedPartResult';
import { resolveContractSize } from '../../domain/calculations/contractSize';
import { decimalCompare, decimalMultiply } from '../../domain/calculations/decimalKernel';
import { calculateTotalFees } from '../../domain/calculations/feeCalculator';
import type { DecimalString, TradeExecutionRecord, TradeFeeRecord, TradeRecord } from '../../domain/trades';

export type TradeClosedPart =
  | Readonly<{ available: true; outcome: 'profit' | 'loss' | 'breakeven'; resultBeforeFees: DecimalString; currency: string | null; closedQuantity: DecimalString; enteredQuantity: DecimalString; openQuantity: DecimalString; rest: 'still-open' | 'exit-missing'; feesSoFar: Readonly<{ amount: DecimalString; currency: string }> | null }>
  | Readonly<{ available: false; reason: 'not-partly-closed' | 'not-readable' | 'needs-contract-size' }>;

function feesSoFar(fees: readonly TradeFeeRecord[]): Readonly<{ amount: DecimalString; currency: string }> | null {
  const total = calculateTotalFees(fees);
  if (!total.ok || total.currency === null || decimalCompare(total.totalFees, '0') === 0) return null;
  return Object.freeze({ amount: total.totalFees, currency: total.currency });
}

export function projectTradeClosedPart(entry: Readonly<{ trade: TradeRecord; executions: readonly TradeExecutionRecord[]; fees: readonly TradeFeeRecord[] }>): TradeClosedPart {
  const closed = calculateClosedPartResult(entry.trade.side, entry.executions);
  if (!closed.ok) return Object.freeze({ available: false, reason: 'not-readable' });
  if (!closed.available) return Object.freeze({ available: false, reason: closed.reason });
  const contractSize = resolveContractSize(entry.trade);
  if (!contractSize.ok) return Object.freeze({ available: false, reason: contractSize.reason });
  const result = decimalMultiply(closed.resultBeforeFees, contractSize.value);
  const sign = result.ok ? decimalCompare(result.value, '0') : null;
  if (!result.ok || sign === null) return Object.freeze({ available: false, reason: 'not-readable' });
  return Object.freeze({
    available: true,
    outcome: sign > 0 ? 'profit' : sign < 0 ? 'loss' : 'breakeven',
    resultBeforeFees: result.value,
    currency: entry.trade.grossPnlCurrency || null,
    closedQuantity: closed.closedQuantity,
    enteredQuantity: closed.enteredQuantity,
    openQuantity: closed.openQuantity,
    rest: entry.trade.status === 'open' ? 'still-open' : 'exit-missing',
    feesSoFar: feesSoFar(entry.fees),
  });
}
