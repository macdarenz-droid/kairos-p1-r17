import type { KairosDatabase } from '../../data/database/KairosDatabase';
import { runKairosAtomicWrite } from '../../data/database/transactions';
import { createTradeDomainId, type TradeExecutionRecord, type TradeFeeRecord, type TradeRecord, type TradeSource } from '../../domain/trades';
import { prepareManualTrade, type ManualTradeExecutionInput, type ManualTradeFeeInput, type SaveManualTradeDependencies, type SaveManualTradeResult } from './saveManualTrade';

export interface DraftTradeSnapshot {
  readonly trade: TradeRecord;
  readonly executions: readonly TradeExecutionRecord[];
  readonly fees: readonly TradeFeeRecord[];
}

export interface OpenDraftTradeInput {
  readonly expected: DraftTradeSnapshot;
  readonly openedAt: string;
  readonly grossPnlCurrency?: string | null;
  readonly executions: readonly ManualTradeExecutionInput[];
  readonly fees: readonly ManualTradeFeeInput[];
  /** P35.1: which trade sources this activation may touch. Defaults to `['manual']`, so every released caller is unchanged; a caller must name `'paper'` explicitly to open a practice draft. */
  readonly allowedSources?: readonly TradeSource[];
}

export type OpenDraftTradeResult = SaveManualTradeResult | {
  readonly ok: false;
  readonly type: 'update-conflict';
  readonly reason: 'trade-changed' | 'trade-not-draft-manual' | 'identity-conflict';
};

// The same revision the P10.4 open-trade update uses: header plus children, so
// a stale form can never be applied twice. Prices stay strings.
function revision({ trade: t, executions, fees }: DraftTradeSnapshot): string {
  return JSON.stringify([
    [t.id, t.symbol, t.marketType, t.side, t.status, t.source, t.openedAt, t.closedAt, t.createdAt, t.updatedAt, t.grossPnlCurrency ?? null],
    [...executions].sort((a, b) => a.id.localeCompare(b.id)).map(e => [e.id, e.tradeId, e.type, e.price, e.quantity, e.executedAt, e.createdAt]),
    [...fees].sort((a, b) => a.id.localeCompare(b.id)).map(f => [f.id, f.tradeId, f.executionId, f.amount, f.currency, f.createdAt]),
  ]);
}

/**
 * P31.1 draft activation application command.
 *
 * Moves one saved manual draft to open: the released P10 preparation validates
 * the opened moment, the optional first fills, fees and price currency exactly
 * as a new open trade, and one atomic write re-reads the draft, checks the
 * revision, keeps its id and plan, sets the status and opened moment and
 * appends the new children. Never replaces a recorded fact; never touches an
 * open trade (P10.4). Restricted to manual drafts by default; P35.1 lets a
 * caller name `'paper'` explicitly to open a practice draft.
 */
export async function openDraftTrade(
  db: KairosDatabase,
  input: OpenDraftTradeInput,
  dependencies: SaveManualTradeDependencies = {},
): Promise<OpenDraftTradeResult> {
  const { trade } = input.expected;
  const allowedSources = input.allowedSources ?? (['manual'] as const);
  if (!allowedSources.includes(trade.source) || trade.status !== 'draft') {
    return { ok: false, type: 'update-conflict', reason: 'trade-not-draft-manual' };
  }
  if (input.grossPnlCurrency != null && typeof input.grossPnlCurrency !== 'string') {
    return { ok: false, type: 'validation-error', field: 'grossPnlCurrency', reason: 'invalid-pnl-currency' };
  }
  const requestedCurrency = input.grossPnlCurrency?.trim().toUpperCase() || null;
  if (trade.grossPnlCurrency && requestedCurrency && requestedCurrency !== trade.grossPnlCurrency) {
    return { ok: false, type: 'validation-error', field: 'grossPnlCurrency', reason: 'recorded-currency-immutable' };
  }
  const addsCurrency = !trade.grossPnlCurrency && requestedCurrency !== null;
  const prepared = prepareManualTrade({
    symbol: trade.symbol, marketType: trade.marketType, side: trade.side,
    status: 'open', openedAt: input.openedAt, closedAt: null,
    executions: input.executions, fees: input.fees,
    grossPnlCurrency: addsCurrency ? requestedCurrency : null,
  }, dependencies.now ?? (() => new Date().toISOString()), dependencies.createId ?? createTradeDomainId);
  if ('ok' in prepared) return prepared;
  const executions = prepared.executions.map(e => ({ ...e, tradeId: trade.id }));
  const fees = prepared.fees.map(f => ({ ...f, tradeId: trade.id }));
  if (new Set(executions.map(e => e.id)).size !== executions.length || new Set(fees.map(f => f.id)).size !== fees.length) {
    return { ok: false, type: 'update-conflict', reason: 'identity-conflict' };
  }
  try {
    return await runKairosAtomicWrite(db, ['trades', 'tradeExecutions', 'tradeFees'], async ({ repositories: r }): Promise<OpenDraftTradeResult> => {
      const current = await r.trades.get(trade.id);
      if (!current || !allowedSources.includes(current.source) || current.status !== 'draft') {
        return { ok: false, type: 'update-conflict', reason: 'trade-not-draft-manual' };
      }
      const currentExecutions = await r.tradeExecutions.listByTradeId(trade.id);
      const currentFees = await r.tradeFees.listByTradeId(trade.id);
      if (revision({ trade: current, executions: currentExecutions, fees: currentFees }) !== revision(input.expected)) {
        return { ok: false, type: 'update-conflict', reason: 'trade-changed' };
      }
      for (const e of executions) if (await r.tradeExecutions.get(e.id)) return { ok: false, type: 'update-conflict', reason: 'identity-conflict' };
      for (const f of fees) if (await r.tradeFees.get(f.id)) return { ok: false, type: 'update-conflict', reason: 'identity-conflict' };
      await r.trades.put({ ...current, status: 'open', openedAt: prepared.trade.openedAt, closedAt: null, ...(addsCurrency ? { grossPnlCurrency: prepared.trade.grossPnlCurrency } : {}), updatedAt: prepared.trade.updatedAt });
      for (const e of executions) await r.tradeExecutions.put(e);
      for (const f of fees) await r.tradeFees.put(f);
      return { ok: true, tradeId: trade.id, persisted: { plans: 0, executions: executions.length, fees: fees.length } };
    });
  } catch {
    return { ok: false, type: 'storage-error', reason: 'trade-save-failed' };
  }
}
