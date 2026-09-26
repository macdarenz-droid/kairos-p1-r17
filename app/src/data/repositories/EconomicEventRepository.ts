import type { EconomicEventRecord } from "../../domain/economic-calendar/economicEvent";
import type { KairosDatabase } from "../database/KairosDatabase";

/** P34 raw persistence of saved news events: stable id store, indexed by the instant each is scheduled; no application rules. */
export class EconomicEventRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(id: string) {
    return this.db.economicEvents.get(id);
  }
  count() {
    return this.db.economicEvents.count();
  }
  /** Typed news only: ids start with 'typed:'. */
  countTyped() {
    return this.db.economicEvents.where("id").startsWith("typed:").count();
  }
  listAll() {
    return this.db.economicEvents.toArray();
  }
  /** Events scheduled from `from` to `to` (canonical UTC instants, which sort as text), both included. */
  listStartingBetween(from: string, to: string) {
    return this.db.economicEvents
      .where("startsAt")
      .between(from, to, true, true)
      .toArray();
  }
  put(record: EconomicEventRecord) {
    return this.db.economicEvents.put({ ...record }).then(() => undefined);
  }
  delete(id: string) {
    return this.db.economicEvents.delete(id);
  }
  async replaceAll(records: readonly EconomicEventRecord[]) {
    await this.db.economicEvents.clear();
    if (records.length)
      await this.db.economicEvents.bulkPut(
        records.map((record) => ({ ...record })),
      );
  }
}
