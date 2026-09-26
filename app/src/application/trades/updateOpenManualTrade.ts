import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';
import { createTradeDomainId, type TradeSource } from '../../domain/trades';
import { tradeRevision, type SavedTradeSnapshot } from './tradeRevision';
import { prepareManualTrade, type ManualTradeExecutionInput, type ManualTradeFeeInput, type SaveManualTradeDependencies, type SaveManualTradeResult } from './saveManualTrade';

export type OpenTradeSnapshot = SavedTradeSnapshot;

export interface UpdateOpenManualTradeInput {
  readonly expected: OpenTradeSnapshot;
  readonly grossPnlCurrency?: string | null;
  readonly status: 'open' | 'closed';
  readonly closedAt: string | null;
  readonly executions: readonly ManualTradeExecutionInput[];
  readonly fees: readonly ManualTradeFeeInput[];
  /** P35.1: which trade sources this update may touch. Defaults to `['manual']`, so every released caller is unchanged; a caller must name `'paper'` explicitly to update a practice trade. */
  readonly allowedSources?: readonly TradeSource[];
}

export type UpdateOpenManualTradeResult = SaveManualTradeResult | {
  readonly ok: false;
  readonly type: 'update-conflict';
  readonly reason: 'trade-changed' | 'trade-not-open-manual' | 'identity-conflict';
};

/** Append explicit new facts to one existing open manual trade. Never replace
 * recorded executions/fees or touch its plan. P10 retains input validation;
 * P11/P12 retain result calculation and query ownership. */
export async function updateOpenManualTrade(
  db: KairosDatabase,
  input: UpdateOpenManualTradeInput,
  dependencies: SaveManualTradeDependencies = {},
): Promise<UpdateOpenManualTradeResult> {
  const { trade } = input.expected;
  const allowedSources = input.allowedSources ?? (['manual'] as const);
  if (!allowedSources.includes(trade.source) || trade.status !== 'open') {
    return { ok: false, type: 'update-conflict', reason: 'trade-not-open-manual' };
  }
  if (input.status !== 'open' && input.status !== 'closed') {
    return { ok: false, type: 'validation-error', field: 'trade', reason: 'open-or-closed-required' };
  }
  if (input.grossPnlCurrency != null && typeof input.grossPnlCurrency !== 'string') {
    return { ok: false, type: 'validation-error', field: 'grossPnlCurrency', reason: 'invalid-pnl-currency' };
  }
  const requestedCurrency = input.grossPnlCurrency?.trim().toUpperCase() || null;
  if (trade.grossPnlCurrency && requestedCurrency && requestedCurrency !== trade.grossPnlCurrency) {
    return { ok: false, type: 'validation-error', field: 'grossPnlCurrency', reason: 'recorded-currency-immutable' };
  }
  const addsCurrency = !trade.grossPnlCurrency && requestedCurrency !== null;
  if (input.status === 'open' && input.executions.length === 0 && input.fees.length === 0 && !addsCurrency) {
    return { ok: false, type: 'validation-error', field: 'trade', reason: 'no-new-facts' };
  }
  const prepared = prepareManualTrade({
    symbol: trade.symbol, marketType: trade.marketType, side: trade.side,
    status: input.status, openedAt: trade.openedAt,
    closedAt: input.status === 'closed' ? input.closedAt : null,
    executions: input.executions, fees: input.fees,
    // Validate only newly supplied currency. Existing immutable evidence is
    // preserved by spreading the current record in the guarded write below.
    grossPnlCurrency: addsCurrency ? requestedCurrency : null,
  }, dependencies.now ?? (() => new Date().toISOString()), dependencies.createId ?? createTradeDomainId);
  if ('ok' in prepared) return prepared;
  if (prepared.executions.some(e => e.type !== 'entry' && e.type !== 'exit')) {
    return { ok: false, type: 'validation-error', field: 'trade', reason: 'execution-type-required' };
  }
  const executions = prepared.executions.map(e => ({ ...e, tradeId: trade.id }));
  const fees = prepared.fees.map(f => ({ ...f, tradeId: trade.id }));
  if (new Set(executions.map(e => e.id)).size !== executions.length || new Set(fees.map(f => f.id)).size !== fees.length) {
    return { ok: false, type: 'update-conflict', reason: 'identity-conflict' };
  }
  try {
    return await runKairosAtomicWrite(db, ['trades', 'tradeExecutions', 'tradeFees'], async ({ repositories: r }): Promise<UpdateOpenManualTradeResult> => {
      const current = await r.trades.get(trade.id);
      if (!current || !allowedSources.includes(current.source) || current.status !== 'open') {
        return { ok: false, type: 'update-conflict', reason: 'trade-not-open-manual' };
      }
      const currentExecutions = await r.tradeExecutions.listByTradeId(trade.id);
      const currentFees = await r.tradeFees.listByTradeId(trade.id);
      if (tradeRevision({ trade: current, executions: currentExecutions, fees: currentFees }) !== tradeRevision(input.expected)) {
        return { ok: false, type: 'update-conflict', reason: 'trade-changed' };
      }
      // The existing repository uses put; explicitly reject an ID collision
      // before any write so that an append can never overwrite a saved fact.
      for (const e of executions) if (await r.tradeExecutions.get(e.id)) return { ok: false, type: 'update-conflict', reason: 'identity-conflict' };
      for (const f of fees) if (await r.tradeFees.get(f.id)) return { ok: false, type: 'update-conflict', reason: 'identity-conflict' };
      await r.trades.put({ ...current, status: prepared.trade.status, ...(addsCurrency ? { grossPnlCurrency: prepared.trade.grossPnlCurrency } : {}), closedAt: prepared.trade.closedAt, updatedAt: prepared.trade.updatedAt });
      for (const e of executions) await r.tradeExecutions.put(e);
      for (const f of fees) await r.tradeFees.put(f);
      return { ok: true, tradeId: trade.id, persisted: { plans: 0, executions: executions.length, fees: fees.length } };
    });
  } catch {
    return { ok: false, type: 'storage-error', reason: 'trade-save-failed' };
  }
}
