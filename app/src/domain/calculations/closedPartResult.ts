/**
 * U4 (P11.A1, D191): the result of the closed part of a partly closed trade. First in, first out, in time order, before fees and exact (no division).
 * It never feeds the trade's result or any total: the full result stays with `grossRealizedPnl.ts`, which keeps refusing a partly closed trade.
 */

import type { DecimalString, TradeExecutionRecord, TradeSide } from '../trades';
import { decimalAdd, decimalCompare, decimalMultiply, decimalSubtract, type DecimalKernelResult } from './decimalKernel';
import { assessExecutionBalance } from './executionBalance';

export type ClosedPartResult =
  | { readonly ok: true; readonly available: true; readonly resultBeforeFees: DecimalString; readonly closedQuantity: DecimalString; readonly enteredQuantity: DecimalString; readonly openQuantity: DecimalString }
  | { readonly ok: true; readonly available: false; readonly reason: 'not-partly-closed' }
  | { readonly ok: false; readonly reason: 'invalid-execution-decimal' | 'exit-without-entry' | 'over-exited' | 'exit-before-entry' | 'invalid-time' };

type Failure = Extract<ClosedPartResult, { readonly ok: false }>;
interface OpenLot { readonly price: DecimalString; quantity: DecimalString }

const INVALID_DECIMAL: Failure = Object.freeze({ ok: false, reason: 'invalid-execution-decimal' });

function value(result: DecimalKernelResult): DecimalString | null {
  return result.ok ? result.value : null;
}

/** Fills in time order; at the same instant entries come first, otherwise the saved order stays. Null when a time can't be read. */
function inTimeOrder(executions: readonly TradeExecutionRecord[]): TradeExecutionRecord[] | null {
  const timed = executions.map((execution, index) => ({ execution, index, time: Date.parse(execution.executedAt) }));
  if (timed.some((fill) => Number.isNaN(fill.time))) return null;
  return timed
    .sort((a, b) => a.time - b.time || (a.execution.type === b.execution.type ? 0 : a.execution.type === 'entry' ? -1 : 1) || a.index - b.index)
    .map((fill) => fill.execution);
}

export function calculateClosedPartResult(side: TradeSide, executions: readonly TradeExecutionRecord[]): ClosedPartResult {
  const balance = assessExecutionBalance(executions);
  if (!balance.ok) return Object.freeze({ ok: false, reason: balance.reason });
  if (balance.state !== 'partially-exited') return Object.freeze({ ok: true, available: false, reason: 'not-partly-closed' });

  const ordered = inTimeOrder(executions);
  if (!ordered) return Object.freeze({ ok: false, reason: 'invalid-time' });

  const lots: OpenLot[] = [];
  let result = '0' as DecimalString;
  for (const fill of ordered) {
    if (fill.type === 'entry') {
      lots.push({ price: fill.price, quantity: fill.quantity });
      continue;
    }
    let left: DecimalString = fill.quantity;
    for (;;) {
      const sign = decimalCompare(left, '0');
      if (sign === null) return INVALID_DECIMAL;
      if (sign <= 0) break;
      const lot = lots[0];
      if (!lot) return Object.freeze({ ok: false, reason: 'exit-before-entry' });
      const lotFirst = decimalCompare(lot.quantity, left);
      if (lotFirst === null) return INVALID_DECIMAL;
      const piece = lotFirst <= 0 ? lot.quantity : left;
      const move = value(side === 'long' ? decimalSubtract(fill.price, lot.price) : decimalSubtract(lot.price, fill.price));
      const part = move === null ? null : value(decimalMultiply(move, piece));
      const total = part === null ? null : value(decimalAdd(result, part));
      const lotLeft = value(decimalSubtract(lot.quantity, piece));
      const exitLeft = value(decimalSubtract(left, piece));
      if (total === null || lotLeft === null || exitLeft === null) return INVALID_DECIMAL;
      result = total;
      left = exitLeft;
      if (decimalCompare(lotLeft, '0') === 0) lots.shift();
      else lot.quantity = lotLeft;
    }
  }

  const { entry, exit, netQuantity } = balance.aggregate;
  return Object.freeze({
    ok: true,
    available: true,
    resultBeforeFees: result,
    closedQuantity: exit.quantity,
    enteredQuantity: entry.quantity,
    openQuantity: netQuantity,
  });
}
