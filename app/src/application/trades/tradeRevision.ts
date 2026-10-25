import type { TradeExecutionRecord, TradeFeeRecord, TradePlanRecord, TradeRecord } from '../../domain/trades';

/** A trade as the user saw it when opening a form: header plus saved entries, exits and fees. */
export interface SavedTradeSnapshot {
  readonly trade: TradeRecord;
  readonly executions: readonly TradeExecutionRecord[];
  readonly fees: readonly TradeFeeRecord[];
  /**
   * U15 (D263): the plan versions the form saw, so a plan changed in another tab is caught. A snapshot without them
   * is checked on the rest only: the command then compares no plans.
   */
  readonly plans?: readonly TradePlanRecord[];
}

// Include the saved children as well as the header: two edits in the same
// millisecond still cannot apply the same stale form twice. Prices stay strings.
export function tradeRevision({ trade: t, executions, fees, plans }: SavedTradeSnapshot): string {
  return JSON.stringify([
    [t.id, t.symbol, t.marketType, t.side, t.status, t.source, t.openedAt, t.closedAt, t.createdAt, t.updatedAt, t.grossPnlCurrency ?? null,
      t.contractSize ?? null, t.exchange ?? null, t.tags ?? [], t.leverage ?? null, t.note ?? null],
    [...executions].sort((a, b) => a.id.localeCompare(b.id)).map(e => [e.id, e.tradeId, e.type, e.price, e.quantity, e.executedAt, e.createdAt]),
    [...fees].sort((a, b) => a.id.localeCompare(b.id)).map(f => [f.id, f.tradeId, f.executionId, f.amount, f.currency, f.createdAt]),
    plans === undefined ? null : [...plans].sort((a, b) => a.id.localeCompare(b.id)).map(p => [p.id, p.tradeId, p.plannedEntryPrice, p.plannedStopPrice,
      p.plannedTargetPrice, p.plannedQuantity, p.reason ?? null, p.createdAt, p.updatedAt]),
  ]);
}

/** The plan versions a command compares: read inside its write only when the form's snapshot carries them. */
export async function plansToCompare(expected: SavedTradeSnapshot, read: () => Promise<readonly TradePlanRecord[]>): Promise<Pick<SavedTradeSnapshot, 'plans'>> {
  return expected.plans === undefined ? {} : { plans: await read() };
}
