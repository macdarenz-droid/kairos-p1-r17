import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';
import { createTradeDomainId, validateTradeRecord, type TradeRecord } from '../../domain/trades';
import { prepareManualTrade, type SaveManualTradeDependencies, type SaveManualTradeInput, type SaveManualTradeResult } from '../trades/saveManualTrade';

export const PRACTICE_TRADE_SOURCE = 'paper' as const;

export type SavePracticeTradeInput = SaveManualTradeInput;
export type SavePracticeTradeDependencies = SaveManualTradeDependencies;
export type SavePracticeTradeResult =
  | (Extract<SaveManualTradeResult, { ok: true }> & { readonly source: typeof PRACTICE_TRADE_SOURCE })
  | Extract<SaveManualTradeResult, { ok: false; type: 'validation-error' }>
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'practice-trade-save-failed' };

/**
 * P29.1 practice trade application command.
 *
 * Owns only the recording of one practice (paper) trade: the released P10
 * `prepareManualTrade` validates and normalises the input exactly as the
 * Journal does, the trade record is re-stamped `source: 'paper'` and
 * re-validated, and the aggregate is written in the same atomic shape. No
 * manual trade is read or touched; no new store, index or field exists.
 */
export async function savePracticeTrade(
  db: KairosDatabase,
  input: SavePracticeTradeInput,
  dependencies: SavePracticeTradeDependencies = {},
): Promise<SavePracticeTradeResult> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const createId = dependencies.createId ?? createTradeDomainId;
  const prepared = prepareManualTrade(input, now, createId);
  if ('ok' in prepared) return prepared;

  const trade: TradeRecord = Object.freeze({ ...prepared.trade, source: PRACTICE_TRADE_SOURCE });
  const validation = validateTradeRecord(trade);
  if (!validation.ok) return { ok: false, type: 'validation-error', field: 'trade', reason: validation.reason };

  const storeNames = [
    'trades' as const,
    ...(prepared.plan ? (['tradePlans'] as const) : []),
    ...(prepared.executions.length ? (['tradeExecutions'] as const) : []),
    ...(prepared.fees.length ? (['tradeFees'] as const) : []),
  ];

  try {
    await runKairosAtomicWrite(db, storeNames, async ({ repositories }) => {
      await repositories.trades.put(trade);
      if (prepared.plan) await repositories.tradePlans.put(prepared.plan);
      for (const execution of prepared.executions) await repositories.tradeExecutions.put(execution);
      for (const fee of prepared.fees) await repositories.tradeFees.put(fee);
    });
  } catch {
    return { ok: false, type: 'storage-error', reason: 'practice-trade-save-failed' };
  }

  return {
    ok: true,
    tradeId: trade.id,
    source: PRACTICE_TRADE_SOURCE,
    persisted: Object.freeze({ plans: prepared.plan ? 1 : 0, executions: prepared.executions.length, fees: prepared.fees.length }),
  };
}
