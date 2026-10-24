import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { createTradeDisciplineId } from '../../domain/discipline';
import { createTradeDomainId, validateTradeRecord, type TradeRecord } from '../../domain/trades';
import { prepareManualTrade, writePreparedTrade, type SaveManualTradeDependencies, type SaveManualTradeInput, type SaveManualTradeResult } from '../trades/saveManualTrade';

export const PRACTICE_TRADE_SOURCE = 'paper' as const;

export type PracticeTradeSource = 'paper' | 'replay';

export interface SavePracticeTradeInput extends SaveManualTradeInput {
  /** P27: 'replay' marks a trade whose entries and exits came from replayed candles; the default is 'paper'. */
  readonly source?: PracticeTradeSource;
}
export type SavePracticeTradeDependencies = SaveManualTradeDependencies;
export type SavePracticeTradeResult =
  | (Extract<SaveManualTradeResult, { ok: true }> & { readonly source: PracticeTradeSource })
  | Extract<SaveManualTradeResult, { ok: false; type: 'validation-error' }>
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'practice-trade-save-failed' };

/**
 * P29.1 practice trade application command.
 *
 * Owns only the recording of one practice (paper) trade: the released P10
 * `prepareManualTrade` validates and normalises the input exactly as the
 * Journal does, the trade record is re-stamped with its practice source
 * (`paper`, or `replay` for a trade played on past candles) and re-validated,
 * and the aggregate is written by the Journal's own writer, with what was ticked
 * before the trade (U12, D241). A practice command can never write a real
 * source. No manual trade is read or touched.
 */
export async function savePracticeTrade(
  db: KairosDatabase,
  input: SavePracticeTradeInput,
  dependencies: SavePracticeTradeDependencies = {},
): Promise<SavePracticeTradeResult> {
  const source = input.source ?? PRACTICE_TRADE_SOURCE;
  if (source !== 'paper' && source !== 'replay') return { ok: false, type: 'validation-error', field: 'trade', reason: 'practice-source-invalid' };
  const now = dependencies.now ?? (() => new Date().toISOString());
  const createId = dependencies.createId ?? createTradeDomainId;
  const prepared = prepareManualTrade(input, now, createId);
  if ('ok' in prepared) return prepared;

  const trade: TradeRecord = Object.freeze({ ...prepared.trade, source });
  const validation = validateTradeRecord(trade);
  if (!validation.ok) return { ok: false, type: 'validation-error', field: 'trade', reason: validation.reason };

  try {
    const written = await writePreparedTrade(db, { ...prepared, trade }, input.discipline, dependencies.createDisciplineId ?? createTradeDisciplineId);
    if (written !== null) return written;
  } catch {
    return { ok: false, type: 'storage-error', reason: 'practice-trade-save-failed' };
  }

  return {
    ok: true,
    tradeId: trade.id,
    source,
    persisted: Object.freeze({ plans: prepared.plan ? 1 : 0, executions: prepared.executions.length, fees: prepared.fees.length }),
  };
}
