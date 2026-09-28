import type { ExchangeRateRecord } from '../../domain/calculations/currencyConversion';
import type { KairosDatabase } from '../database/KairosDatabase';

/** P33 raw persistence of exchange rates: stable id store, indexed by the UTC day a rate is for; no application rules. */
export class ExchangeRateRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(id: string) { return this.db.exchangeRates.get(id); }
  listAll() { return this.db.exchangeRates.toArray(); }
  listByDays(days: readonly string[]) { return this.db.exchangeRates.where('day').anyOf([...days]).toArray(); }
  put(record: ExchangeRateRecord) { return this.db.exchangeRates.put({ ...record }).then(() => undefined); }
  async replaceAll(records: readonly ExchangeRateRecord[]) {
    await this.db.exchangeRates.clear();
    if (records.length) await this.db.exchangeRates.bulkPut(records.map((record) => ({ ...record })));
  }
}
