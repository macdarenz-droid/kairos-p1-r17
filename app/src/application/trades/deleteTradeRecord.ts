import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';
import type { TradeId, TradeSource } from '../../domain/trades';

export type DeleteTradeRecordResult =
  | { readonly ok: true; readonly tradeId: TradeId; readonly source: TradeSource; readonly removed: Readonly<{ plans: number; executions: number; fees: number; discipline: number }> }
  | { readonly ok: false; readonly type: 'not-found'; readonly reason: 'trade-not-found' }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'trade-delete-failed' };

/**
 * P30.1 trade record delete application command.
 *
 * Owns only the removal of one trade record and its own plans, executions,
 * fees and discipline record (checklist and review) by the trade's canonical
 * stable id inside one atomic write: the trade is
 * read and every child is listed and deleted in the same transaction, so a
 * missing trade is an explicit not-found result and never a silent no-op.
 * Nothing else is touched: no other trade, no saved record, no backup.
 */
export async function deleteTradeRecord(db: KairosDatabase, tradeId: TradeId): Promise<DeleteTradeRecordResult> {
  try {
    const outcome = await runKairosAtomicWrite(db, ['trades', 'tradePlans', 'tradeExecutions', 'tradeFees', 'tradeDiscipline'], async ({ repositories }) => {
      const trade = await repositories.trades.get(tradeId);
      if (!trade) return null;
      const [plans, executions, fees] = await Promise.all([
        repositories.tradePlans.listByTradeId(tradeId),
        repositories.tradeExecutions.listByTradeId(tradeId),
        repositories.tradeFees.listByTradeId(tradeId),
      ]);
      for (const plan of plans) await repositories.tradePlans.delete(plan.id);
      for (const execution of executions) await repositories.tradeExecutions.delete(execution.id);
      for (const fee of fees) await repositories.tradeFees.delete(fee.id);
      const discipline = await repositories.tradeDiscipline.deleteByTradeId(tradeId);
      await repositories.trades.delete(tradeId);
      return { source: trade.source, removed: Object.freeze({ plans: plans.length, executions: executions.length, fees: fees.length, discipline }) };
    });
    if (outcome === null) return { ok: false, type: 'not-found', reason: 'trade-not-found' };
    return { ok: true, tradeId, source: outcome.source, removed: outcome.removed };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'trade-delete-failed' };
  }
}
