import type { KairosDatabase } from '../database/KairosDatabase';
import type { DatabaseTradeExecutionRecord, DatabaseTradeFeeRecord, DatabaseTradePlanRecord, DatabaseTradeRecord } from '../database/schema';
import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId, TradeRecord, TradeSource, TradeStatus } from '../../domain/trades';

export class TradeRepository {
  constructor(private readonly db: KairosDatabase) {}
  get(id: TradeId) { return this.db.trades.get(id); }
  listAll() { return this.db.trades.toArray(); }
  /** Every trade, of any source. */
  count() { return this.db.trades.count(); }
  /** Trades of any source created after an instant (U8, D226: trades since the last backup). */
  countCreatedAfter(instant: string) {
    // A trade's updatedAt is never before its createdAt, so the updatedAt index narrows the read first.
    const after = Date.parse(instant);
    return this.db.trades.where('updatedAt').aboveOrEqual(instant).filter(trade => Date.parse(trade.createdAt) > after).count();
  }
  listRecentByUpdatedAt(limit: number) { return this.db.trades.orderBy('updatedAt').reverse().limit(limit).toArray(); }
  /** P29.2: the same indexed newest-first bounded paths, restricted to the given trade sources while the cursor walks the index. */
  scopedBySource(sources: readonly TradeSource[]) { return new SourceScopedTradeRepository(this.db, new Set(sources)); }
  /** The database stamps the Journal's order on every write (D259, `KairosDatabase`). */
  put(record: TradeRecord) { return this.db.trades.put(record).then(() => undefined); }
  delete(id: TradeId) { return this.db.trades.delete(id); }
  async replaceAll(records: readonly TradeRecord[]) { await this.db.trades.clear(); if (records.length) await this.db.trades.bulkPut([...records]); }
}
/** Two index keys of text parts in the store's order (each part as text, then the shorter key first). */
function compareTextKeys(a: readonly string[], b: readonly string[]): number {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! < b[index]! ? -1 : 1;
  }
  return a.length - b.length;
}
/** Read-only source-scoped view over the trades store: index order and the bound are unchanged, records outside the scope are skipped by the cursor. */
/** Up to this many trades of one symbol are read whole; past it, the newest closes are walked instead (measured in Chromium, U12). */
const SYMBOL_READ_WHOLE_MAX = 500;

export class SourceScopedTradeRepository {
  constructor(private readonly db: KairosDatabase, private readonly sources: ReadonlySet<TradeSource>) {}
  listRecentByUpdatedAt(limit: number) { return this.db.trades.orderBy('updatedAt').reverse().filter(trade => this.sources.has(trade.source)).limit(limit).toArray(); }
  /**
   * U15 (D259): one page in the Journal's order, latest first (when the trade was opened, else planned), strictly before
   * the cursor (journalAt, then id), through the `[journalAt+id]` index, or `[status+journalAt+id]` for one status.
   */
  listPageByJournalAt(status: TradeStatus | null, before: { readonly journalAt: string; readonly id: TradeId } | null, limit: number) {
    const start = status !== null
      ? this.db.trades.where('[status+journalAt+id]').between([status, '', ''], before === null ? [status, '\uffff', '\uffff'] : [status, before.journalAt, before.id], true, false)
      : before === null ? this.db.trades.orderBy('[journalAt+id]') : this.db.trades.where('[journalAt+id]').below([before.journalAt, before.id]);
    return start.reverse().filter(trade => this.sources.has(trade.source) && (status === null || trade.status === status)).limit(limit).toArray();
  }
  /**
   * U15 (D262): a page in the Journal's order like `listPageByJournalAt`, between two Journal dates (stored text, either
   * end open), keeping only the trades `keep` accepts while the cursor walks.
   */
  listPageByJournalAtWhere(
    status: TradeStatus | null,
    before: { readonly journalAt: string; readonly id: TradeId } | null,
    dates: { readonly from: string | null; readonly to: string | null },
    keep: (trade: TradeRecord) => boolean,
    limit: number,
  ) {
    const prefix = status === null ? [] : [status];
    const lower = [...prefix, dates.from ?? '', ''];
    // The nearer end: the page's cursor (left out) or the last date (kept).
    const cursorFirst = before !== null && (dates.to === null || before.journalAt <= dates.to);
    const upper = cursorFirst ? [...prefix, before.journalAt, before.id] : [...prefix, dates.to ?? '\uffff', '\uffff'];
    if (compareTextKeys(lower, upper) > 0) return Promise.resolve([] as TradeRecord[]);
    return this.db.trades.where(status === null ? '[journalAt+id]' : '[status+journalAt+id]').between(lower, upper, true, !cursorFirst)
      .reverse().filter(trade => this.sources.has(trade.source) && (status === null || trade.status === status) && keep(trade)).limit(limit).toArray();
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
  /**
   * U12: one symbol's latest closed trades in scope, newest close first, at most `limit`. A symbol with few trades is read
   * whole through the symbol index; a busy one is found walking [status+closedAt] from the newest close, which stops early.
   */
  async listRecentClosedBySymbol(symbol: string, limit: number) {
    const symbolTrades = this.db.trades.where('symbol').equals(symbol);
    const count = await symbolTrades.count();
    if (count === 0) return [];
    if (count <= SYMBOL_READ_WHOLE_MAX) {
      const trades = await symbolTrades.toArray();
      return trades
        .filter(trade => trade.status === 'closed' && this.sources.has(trade.source))
        .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))
        .slice(0, limit);
    }
    return this.db.trades
      .where('[status+closedAt]')
      .between(['closed', ''], ['closed', '\uffff'])
      .reverse()
      .filter(trade => trade.symbol === symbol && this.sources.has(trade.source))
      .limit(limit)
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
