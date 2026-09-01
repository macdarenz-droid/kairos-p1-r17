import type { KairosDatabase } from '../database/KairosDatabase';
import type { DatabaseTradeExecutionRecord, DatabaseTradeFeeRecord, DatabaseTradePlanRecord, DatabaseTradeRecord } from '../database/schema';
import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId } from '../../domain/trades';

export class TradeRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(id: TradeId) { return this.db.trades.get(id); }
  listAll() { return this.db.trades.toArray(); }
  put(record: DatabaseTradeRecord) { return this.db.trades.put(record).then(() => undefined); }
  delete(id: TradeId) { return this.db.trades.delete(id); }
  async replaceAll(records: readonly DatabaseTradeRecord[]) { await this.db.trades.clear(); if (records.length) await this.db.trades.bulkPut([...records]); }
}
export class TradePlanRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(id: TradePlanId) { return this.db.tradePlans.get(id); }
  listAll() { return this.db.tradePlans.toArray(); }
  listByTradeId(tradeId: TradeId) { return this.db.tradePlans.where('tradeId').equals(tradeId).toArray(); }
  put(record: DatabaseTradePlanRecord) { return this.db.tradePlans.put(record).then(() => undefined); }
  delete(id: TradePlanId) { return this.db.tradePlans.delete(id); }
  async replaceAll(records: readonly DatabaseTradePlanRecord[]) { await this.db.tradePlans.clear(); if (records.length) await this.db.tradePlans.bulkPut([...records]); }
}
export class TradeExecutionRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(id: TradeExecutionId) { return this.db.tradeExecutions.get(id); }
  listAll() { return this.db.tradeExecutions.toArray(); }
  listByTradeId(tradeId: TradeId) { return this.db.tradeExecutions.where('tradeId').equals(tradeId).sortBy('executedAt'); }
  put(record: DatabaseTradeExecutionRecord) { return this.db.tradeExecutions.put(record).then(() => undefined); }
  delete(id: TradeExecutionId) { return this.db.tradeExecutions.delete(id); }
  async replaceAll(records: readonly DatabaseTradeExecutionRecord[]) { await this.db.tradeExecutions.clear(); if (records.length) await this.db.tradeExecutions.bulkPut([...records]); }
}
export class TradeFeeRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(id: TradeFeeId) { return this.db.tradeFees.get(id); }
  listAll() { return this.db.tradeFees.toArray(); }
  listByTradeId(tradeId: TradeId) { return this.db.tradeFees.where('tradeId').equals(tradeId).toArray(); }
  put(record: DatabaseTradeFeeRecord) { return this.db.tradeFees.put(record).then(() => undefined); }
  delete(id: TradeFeeId) { return this.db.tradeFees.delete(id); }
  async replaceAll(records: readonly DatabaseTradeFeeRecord[]) { await this.db.tradeFees.clear(); if (records.length) await this.db.tradeFees.bulkPut([...records]); }
}
