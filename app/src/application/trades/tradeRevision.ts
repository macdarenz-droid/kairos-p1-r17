import type { TradeExecutionRecord, TradeFeeRecord, TradeRecord } from '../../domain/trades';

/** A trade as the user saw it when opening a form: header plus saved entries, exits and fees. */
export interface SavedTradeSnapshot {
  readonly trade: TradeRecord;
  readonly executions: readonly TradeExecutionRecord[];
  readonly fees: readonly TradeFeeRecord[];
}

// Include the saved children as well as the header: two edits in the same
// millisecond still cannot apply the same stale form twice. Prices stay strings.
export function tradeRevision({ trade: t, executions, fees }: SavedTradeSnapshot): string {
  return JSON.stringify([
    [t.id, t.symbol, t.marketType, t.side, t.status, t.source, t.openedAt, t.closedAt, t.createdAt, t.updatedAt, t.grossPnlCurrency ?? null],
    [...executions].sort((a, b) => a.id.localeCompare(b.id)).map(e => [e.id, e.tradeId, e.type, e.price, e.quantity, e.executedAt, e.createdAt]),
    [...fees].sort((a, b) => a.id.localeCompare(b.id)).map(f => [f.id, f.tradeId, f.executionId, f.amount, f.currency, f.createdAt]),
  ]);
}
