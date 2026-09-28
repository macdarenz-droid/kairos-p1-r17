import type { TradeDisciplineId, TradeDisciplineRecord } from '../../domain/discipline';
import type { TradeId } from '../../domain/trades';
import type { KairosDatabase } from '../database/KairosDatabase';

/** P36.1 raw persistence of the trade discipline record: stable id store, indexed by tradeId (one record per trade) and updatedAt; no application orchestration. */
export class TradeDisciplineRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(id: TradeDisciplineId) { return this.db.tradeDiscipline.get(id); }
  getByTradeId(tradeId: TradeId) { return this.db.tradeDiscipline.where('tradeId').equals(tradeId).first(); }
  listAll() { return this.db.tradeDiscipline.toArray(); }
  listByTradeIds(ids: readonly TradeId[]) { return this.db.tradeDiscipline.where('tradeId').anyOf([...ids]).toArray(); }
  put(record: TradeDisciplineRecord) { return this.db.tradeDiscipline.put(structuredClone(record)).then(() => undefined); }
  delete(id: TradeDisciplineId) { return this.db.tradeDiscipline.delete(id); }
  /** Deletes the trade's discipline record, if any; returns how many were deleted. */
  deleteByTradeId(tradeId: TradeId) { return this.db.tradeDiscipline.where('tradeId').equals(tradeId).delete(); }
  async replaceAll(records: readonly TradeDisciplineRecord[]) {
    await this.db.tradeDiscipline.clear();
    if (records.length) await this.db.tradeDiscipline.bulkPut(records.map((record) => structuredClone(record)));
  }
}
