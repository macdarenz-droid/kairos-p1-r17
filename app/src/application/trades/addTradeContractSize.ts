import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';
import { resolveContractSize } from '../../domain/calculations/contractSize';
import { parsePositiveDecimalString, validateTradeRecord, type DecimalString, type TradeId, type TradeRecord } from '../../domain/trades';
import { plansToCompare, tradeRevision, type SavedTradeSnapshot } from './tradeRevision';

export interface AddTradeContractSizeInput {
  /** The trade as shown when the trader typed the value: a stale one is refused. */
  readonly expected: SavedTradeSnapshot;
  /** How much one point is worth, as typed. */
  readonly contractSize: string;
}

export type AddTradeContractSizeResult =
  | { readonly ok: true; readonly tradeId: TradeId; readonly contractSize: DecimalString }
  | { readonly ok: false; readonly type: 'validation-error'; readonly field: 'contractSize'; readonly reason: string }
  | { readonly ok: false; readonly type: 'update-conflict'; readonly reason: 'trade-not-found' | 'trade-changed' | 'not-futures-or-options' | 'contract-size-recorded' | 'not-needed' }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'trade-save-failed' };

/** Whether a trade can be given how much one point is worth: a futures or options trade with none, and no stablecoin price that makes it 1. */
export function canAddTradeContractSize(trade: TradeRecord): boolean {
  return (trade.marketType === 'futures' || trade.marketType === 'options') && trade.contractSize == null && !resolveContractSize(trade).ok;
}

/**
 * U11 (D237): adds how much one point is worth to a saved futures or options trade that has none. Like a missing price
 * currency, it can be added once and never changed. Nothing else on the trade changes; one atomic write.
 */
export async function addTradeContractSize(
  db: KairosDatabase,
  input: AddTradeContractSizeInput,
  now: () => string = () => new Date().toISOString(),
): Promise<AddTradeContractSizeResult> {
  const { trade } = input.expected;
  if (trade.marketType !== 'futures' && trade.marketType !== 'options') return { ok: false, type: 'update-conflict', reason: 'not-futures-or-options' };
  if (trade.contractSize != null) return { ok: false, type: 'update-conflict', reason: 'contract-size-recorded' };
  // The one rule of where it is offered: a futures trade priced in a stablecoin is already 1 a point (D237).
  if (!canAddTradeContractSize(trade)) return { ok: false, type: 'update-conflict', reason: 'not-needed' };
  const parsed = parsePositiveDecimalString(input.contractSize);
  if (!parsed.ok) return { ok: false, type: 'validation-error', field: 'contractSize', reason: parsed.reason };
  try {
    return await runKairosAtomicWrite(db, ['trades', 'tradePlans', 'tradeExecutions', 'tradeFees'], async ({ repositories: r }): Promise<AddTradeContractSizeResult> => {
      const current = await r.trades.get(trade.id);
      if (!current) return { ok: false, type: 'update-conflict', reason: 'trade-not-found' };
      if (current.contractSize != null) return { ok: false, type: 'update-conflict', reason: 'contract-size-recorded' };
      const [executions, fees] = await Promise.all([r.tradeExecutions.listByTradeId(trade.id), r.tradeFees.listByTradeId(trade.id)]);
      if (tradeRevision({ trade: current, executions, fees, ...await plansToCompare(input.expected, () => r.tradePlans.listByTradeId(trade.id)) }) !== tradeRevision(input.expected)) return { ok: false, type: 'update-conflict', reason: 'trade-changed' };
      const next = { ...current, contractSize: parsed.value, updatedAt: now() };
      const checked = validateTradeRecord(next);
      if (!checked.ok) return { ok: false, type: 'validation-error', field: 'contractSize', reason: checked.reason };
      await r.trades.put(next);
      return { ok: true, tradeId: trade.id, contractSize: parsed.value };
    });
  } catch {
    return { ok: false, type: 'storage-error', reason: 'trade-save-failed' };
  }
}
