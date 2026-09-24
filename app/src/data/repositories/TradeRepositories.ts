import type { KairosDatabase } from '../database/KairosDatabase';
import type { DatabaseTradeExecutionRecord, DatabaseTradeFeeRecord, DatabaseTradePlanRecord, DatabaseTradeRecord } from '../database/schema';
import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId, TradeSource, TradeStatus } from '../../domain/trades';

export class TradeRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(id: TradeId) { return this.db.trades.get(id); }
  listAll() { return this.db.trades.toArray(); }
  listRecentByUpdatedAt(limit: number) { return this.db.trades.orderBy('updatedAt').reverse().limit(limit).toArray(); }
  listRecentByStatusAndUpdatedAt(status: TradeStatus, limit: number) {
    return this.db.trades
      .where('[status+updatedAt]')
      .between([status, ''], [status, '\uffff'])
      .reverse()
      .limit(limit)
      .toArray();
  }
  /** P29.2: the same indexed newest-first bounded paths, restricted to the given trade sources while the cursor walks the index. */
  scopedBySource(sources: readonly TradeSource[]) { return new SourceScopedTradeRepository(this.db, new Set(sources)); }
  put(record: DatabaseTradeRecord) { return this.db.trades.put(record).then(() => undefined); }
  delete(id: TradeId) { return this.db.trades.delete(id); }
  async replaceAll(records: readonly DatabaseTradeRecord[]) { await this.db.trades.clear(); if (records.length) await this.db.trades.bulkPut([...records]); }
}
/** Read-only source-scoped view over the trades store: index order and the bound are unchanged, records outside the scope are skipped by the cursor. */
export class SourceScopedTradeRepository {
  constructor(private readonly db: KairosDatabase, private readonly sources: ReadonlySet<TradeSource>) {}
  listRecentByUpdatedAt(limit: number) { return this.db.trades.orderBy('updatedAt').reverse().filter(trade => this.sources.has(trade.source)).limit(limit).toArray(); }
  listRecentByStatusAndUpdatedAt(status: TradeStatus, limit: number) {
    return this.db.trades
      .where('[status+updatedAt]')
      .between([status, ''], [status, '\uffff'])
      .reverse()
      .filter(trade => this.sources.has(trade.source))
      .limit(limit)
      .toArray();
  }
  /** Every trade of one status in scope, newest edit first, through the [status+updatedAt] index. No limit. */
  listAllByStatus(status: TradeStatus) {
    return this.db.trades
      .where('[status+updatedAt]')
      .between([status, ''], [status, '\uffff'])
      .reverse()
      .filter(trade => this.sources.has(trade.source))
      .toArray();
  }
  /** Closed trades with closedAt in [fromClosedAt, toClosedAt), oldest close first, through the [status+closedAt] index. null = no bound. No limit: this path serves period totals. */
  listClosedByClosedAtRange(fromClosedAt: string | null, toClosedAt: string | null) {
    return this.db.trades
      .where('[status+closedAt]')
      .between(['closed', fromClosedAt ?? ''], ['closed', toClosedAt ?? '\uffff'], true, false)
      .filter(trade => this.sources.has(trade.source))
      .toArray();
  }
}
export class TradePlanRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(id: TradePlanId) { return this.db.tradePlans.get(id); }
  listAll() { return this.db.tradePlans.toArray(); }
  listByTradeId(tradeId: TradeId) { return this.db.tradePlans.where('tradeId').equals(tradeId).toArray(); }
  listByTradeIds(ids: readonly TradeId[]) { return this.db.tradePlans.where('tradeId').anyOf([...ids]).toArray(); }
  put(record: DatabaseTradePlanRecord) { return this.db.tradePlans.put(record).then(() => undefined); }
  delete(id: TradePlanId) { return this.db.tradePlans.delete(id); }
  async replaceAll(records: readonly DatabaseTradePlanRecord[]) { await this.db.tradePlans.clear(); if (records.length) await this.db.tradePlans.bulkPut([...records]); }
}
export class TradeExecutionRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(id: TradeExecutionId) { return this.db.tradeExecutions.get(id); }
  listAll() { return this.db.tradeExecutions.toArray(); }
  listByTradeId(tradeId: TradeId) { return this.db.tradeExecutions.where('tradeId').equals(tradeId).sortBy('executedAt'); }
  listByTradeIds(ids: readonly TradeId[]) { return this.db.tradeExecutions.where('tradeId').anyOf([...ids]).sortBy('executedAt'); }
  put(record: DatabaseTradeExecutionRecord) { return this.db.tradeExecutions.put(record).then(() => undefined); }
  delete(id: TradeExecutionId) { return this.db.tradeExecutions.delete(id); }
  async replaceAll(records: readonly DatabaseTradeExecutionRecord[]) { await this.db.tradeExecutions.clear(); if (records.length) await this.db.tradeExecutions.bulkPut([...records]); }
}
export class TradeFeeRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(id: TradeFeeId) { return this.db.tradeFees.get(id); }
  listAll() { return this.db.tradeFees.toArray(); }
  listByTradeId(tradeId: TradeId) { return this.db.tradeFees.where('tradeId').equals(tradeId).toArray(); }
  listByTradeIds(ids: readonly TradeId[]) { return this.db.tradeFees.where('tradeId').anyOf([...ids]).toArray(); }
  put(record: DatabaseTradeFeeRecord) { return this.db.tradeFees.put(record).then(() => undefined); }
  delete(id: TradeFeeId) { return this.db.tradeFees.delete(id); }
  async replaceAll(records: readonly DatabaseTradeFeeRecord[]) { await this.db.tradeFees.clear(); if (records.length) await this.db.tradeFees.bulkPut([...records]); }
}
