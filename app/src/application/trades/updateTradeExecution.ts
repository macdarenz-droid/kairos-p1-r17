import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';
import { parsePositiveDecimalString, type TradeExecutionId, type TradeExecutionRecord, type TradeFeeId, type TradeFeeRecord, type TradeId, type TradeSource } from '../../domain/trades';
import { isIsoLikeTimestamp } from './saveManualTrade';
import { tradeRevision, type SavedTradeSnapshot } from './tradeRevision';

export interface TradeExecutionCorrection { readonly id: TradeExecutionId; readonly price: string; readonly quantity: string; readonly executedAt: string }
export interface TradeFeeCorrection { readonly id: TradeFeeId; readonly amount: string; readonly currency: string }
export interface UpdateTradeExecutionInput {
  /** What the user saw when opening the form (a JournalHistoryEntry fits). */
  readonly expected: SavedTradeSnapshot;
  readonly execution?: TradeExecutionCorrection;
  readonly fee?: TradeFeeCorrection;
  /** Which trade sources this correction may touch; defaults to `['manual']`, as in the other commands. */
  readonly allowedSources?: readonly TradeSource[];
}
export type UpdateTradeExecutionField = 'execution.price' | 'execution.quantity' | 'execution.executedAt' | 'fee.amount' | 'fee.currency' | 'trade';
export type UpdateTradeExecutionResult =
  | { readonly ok: true; readonly tradeId: TradeId; readonly updated: Readonly<{ executions: number; fees: number }> }
  | { readonly ok: false; readonly type: 'validation-error'; readonly field: UpdateTradeExecutionField; readonly reason: string }
  | { readonly ok: false; readonly type: 'update-conflict'; readonly reason: 'trade-changed' | 'trade-not-editable' | 'row-not-found' }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'trade-save-failed' };

const invalid = (field: UpdateTradeExecutionField, reason: string): UpdateTradeExecutionResult => ({ ok: false, type: 'validation-error', field, reason });
const conflict = (reason: 'trade-changed' | 'trade-not-editable' | 'row-not-found'): UpdateTradeExecutionResult => ({ ok: false, type: 'update-conflict', reason });

/**
 * P10.A4: corrects one saved entry or exit (price, quantity, time) and/or one
 * saved fee (amount, currency) in one atomic write, keeping every id. Values
 * are checked with the same rules as adding. Results are never stored, so
 * nothing else is recomputed here.
 */
export async function updateTradeExecution(
  db: KairosDatabase,
  input: UpdateTradeExecutionInput,
  dependencies: { readonly now?: () => string } = {},
): Promise<UpdateTradeExecutionResult> {
  const { expected, execution, fee } = input;
  const allowedSources = input.allowedSources ?? (['manual'] as const);
  if (!allowedSources.includes(expected.trade.source)) return conflict('trade-not-editable');
  if (!execution && !fee) return invalid('trade', 'no-change');

  let executionValues: Pick<TradeExecutionRecord, 'price' | 'quantity' | 'executedAt'> | null = null;
  if (execution) {
    const price = parsePositiveDecimalString(execution.price);
    if (!price.ok) return invalid('execution.price', price.reason);
    const quantity = parsePositiveDecimalString(execution.quantity);
    if (!quantity.ok) return invalid('execution.quantity', quantity.reason);
    if (typeof execution.executedAt !== 'string' || !isIsoLikeTimestamp(execution.executedAt)) return invalid('execution.executedAt', 'timestamp-required');
    executionValues = { price: price.value, quantity: quantity.value, executedAt: execution.executedAt.trim() };
  }

  let feeValues: Pick<TradeFeeRecord, 'amount' | 'currency'> | null = null;
  if (fee) {
    const amount = parsePositiveDecimalString(fee.amount);
    if (!amount.ok) return invalid('fee.amount', amount.reason);
    const currency = fee.currency.trim().toUpperCase();
    if (!currency) return invalid('fee.currency', 'currency-required');
    feeValues = { amount: amount.value, currency };
  }

  const savedExecution = execution ? expected.executions.find(row => row.id === execution.id) : undefined;
  const savedFee = fee ? expected.fees.find(row => row.id === fee.id) : undefined;
  if ((execution && !savedExecution) || (fee && !savedFee)) return conflict('row-not-found');

  const executionChanged = savedExecution && executionValues
    && (savedExecution.price !== executionValues.price || savedExecution.quantity !== executionValues.quantity || savedExecution.executedAt !== executionValues.executedAt);
  const feeChanged = savedFee && feeValues && (savedFee.amount !== feeValues.amount || savedFee.currency !== feeValues.currency);
  if (!executionChanged && !feeChanged) return invalid('trade', 'no-change');

  const now = dependencies.now ?? (() => new Date().toISOString());
  const tradeId = expected.trade.id;
  try {
    return await runKairosAtomicWrite(db, ['trades', 'tradeExecutions', 'tradeFees'], async ({ repositories: r }): Promise<UpdateTradeExecutionResult> => {
      const current = await r.trades.get(tradeId);
      if (!current || !allowedSources.includes(current.source)) return conflict('trade-not-editable');
      const currentExecutions = await r.tradeExecutions.listByTradeId(tradeId);
      const currentFees = await r.tradeFees.listByTradeId(tradeId);
      if (tradeRevision({ trade: current, executions: currentExecutions, fees: currentFees }) !== tradeRevision(expected)) return conflict('trade-changed');
      if (savedExecution && executionValues) await r.tradeExecutions.put({ ...savedExecution, ...executionValues });
      if (savedFee && feeValues) await r.tradeFees.put({ ...savedFee, ...feeValues });
      await r.trades.put({ ...current, updatedAt: now() });
      return { ok: true, tradeId, updated: { executions: execution ? 1 : 0, fees: fee ? 1 : 0 } };
    });
  } catch {
    return { ok: false, type: 'storage-error', reason: 'trade-save-failed' };
  }
}
