import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { listJournalHistory } from '../src/application/journal';
import { createTradeDomainId, parsePositiveDecimalString, type TradeExecutionId, type TradeFeeId, type TradeId } from '../src/domain/trades';

const names = new Set<string>();
const dbName = () => { const value = `kairos-p121-${crypto.randomUUID()}`; names.add(value); return value; };
const dec = (value: string) => { const result = parsePositiveDecimalString(value); if (!result.ok) throw new Error('fixture decimal'); return result.value; };

afterEach(async () => {
  for (const name of names) await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(name); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('blocked')); });
  names.clear();
});

describe('P12.1 journal history query foundation', () => {
  it('reads persisted trade aggregates through existing repositories, newest first', async () => {
    const db = createKairosDatabase(dbName()); await openKairosDatabase(db); const repos = createKairosRepositories(db);
    const older = createTradeDomainId<TradeId>(); const newer = createTradeDomainId<TradeId>();
    await repos.trades.put({ id: older, symbol: 'AAPL', marketType: 'stock', side: 'long', status: 'draft', source: 'manual', openedAt: null, closedAt: null, createdAt: '2026-09-01T01:00:00.000Z', updatedAt: '2026-09-01T01:00:00.000Z' });
    await repos.trades.put({ id: newer, symbol: 'BTCUSD', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', openedAt: '2026-09-02T01:00:00.000Z', closedAt: '2026-09-02T02:00:00.000Z', createdAt: '2026-09-02T01:00:00.000Z', updatedAt: '2026-09-02T02:00:00.000Z' });
    const entryId = createTradeDomainId<TradeExecutionId>(); const exitId = createTradeDomainId<TradeExecutionId>();
    await repos.tradeExecutions.put({ id: entryId, tradeId: newer, type: 'entry', price: dec('100'), quantity: dec('2'), executedAt: '2026-09-02T01:00:00.000Z', createdAt: '2026-09-02T01:00:00.000Z' });
    await repos.tradeExecutions.put({ id: exitId, tradeId: newer, type: 'exit', price: dec('120'), quantity: dec('2'), executedAt: '2026-09-02T02:00:00.000Z', createdAt: '2026-09-02T02:00:00.000Z' });
    await repos.tradeFees.put({ id: createTradeDomainId<TradeFeeId>(), tradeId: newer, executionId: exitId, amount: dec('5'), currency: 'USD', createdAt: '2026-09-02T02:00:00.000Z' });
    const history = await listJournalHistory(db);
    expect(history.map((entry) => entry.trade.symbol)).toEqual(['BTCUSD', 'AAPL']);
    expect(history[0].executions).toHaveLength(2); expect(history[0].fees).toHaveLength(1);
    expect(history[0].metrics?.grossPnl).toBe('40'); expect(history[0].metrics?.totalFees).toBe('5');
    expect(history[0].metrics?.netPnl).toBeNull(); // no gross-P&L currency evidence: never guess FX/comparability
    db.close();
  });

  it('keeps invalid persisted calculation evidence visible as an error instead of dropping the trade', async () => {
    const db = createKairosDatabase(dbName()); await openKairosDatabase(db); const repos = createKairosRepositories(db); const tradeId = createTradeDomainId<TradeId>();
    await repos.trades.put({ id: tradeId, symbol: 'ETHUSD', marketType: 'crypto', side: 'long', status: 'open', source: 'manual', openedAt: '2026-09-02T01:00:00.000Z', closedAt: null, createdAt: '2026-09-02T01:00:00.000Z', updatedAt: '2026-09-02T01:00:00.000Z' });
    await repos.tradeExecutions.put({ id: createTradeDomainId<TradeExecutionId>(), tradeId, type: 'exit', price: dec('120'), quantity: dec('1'), executedAt: '2026-09-02T01:10:00.000Z', createdAt: '2026-09-02T01:10:00.000Z' });
    const history = await listJournalHistory(db);
    expect(history).toHaveLength(1); expect(history[0].metrics).toBeNull(); expect(history[0].metricsError).toBe('exit-without-entry');
    db.close();
  });

  it('uses indexed updatedAt chronology and bounds trade selection before child evidence loading', async () => {
    const db = createKairosDatabase(dbName());
    await openKairosDatabase(db);
    const repos = createKairosRepositories(db);
    const first = createTradeDomainId<TradeId>();
    const second = createTradeDomainId<TradeId>();
    const third = createTradeDomainId<TradeId>();
    await repos.trades.put({ id: first, symbol: 'OLD', marketType: 'stock', side: 'long', status: 'draft', source: 'manual', openedAt: null, closedAt: null, createdAt: '2026-09-02T03:00:00.000Z', updatedAt: '2026-09-02T01:00:00.000Z' });
    await repos.trades.put({ id: second, symbol: 'MID', marketType: 'stock', side: 'long', status: 'draft', source: 'manual', openedAt: null, closedAt: null, createdAt: '2026-09-01T01:00:00.000Z', updatedAt: '2026-09-02T02:00:00.000Z' });
    await repos.trades.put({ id: third, symbol: 'NEW', marketType: 'stock', side: 'long', status: 'draft', source: 'manual', openedAt: null, closedAt: null, createdAt: '2026-08-01T01:00:00.000Z', updatedAt: '2026-09-02T03:00:00.000Z' });
    const history = await listJournalHistory(db, { limit: 2 });
    expect(history.map((entry) => entry.trade.id)).toEqual([third, second]);
    db.close();
  });

  it('rejects invalid limits instead of permitting an unbounded journal scan', async () => {
    const db = createKairosDatabase(dbName());
    await openKairosDatabase(db);
    await expect(listJournalHistory(db, { limit: 0 })).rejects.toBeInstanceOf(RangeError);
    await expect(listJournalHistory(db, { limit: 501 })).rejects.toBeInstanceOf(RangeError);
    await expect(listJournalHistory(db, { limit: 1.5 })).rejects.toBeInstanceOf(RangeError);
    db.close();
  });

  it('uses the indexed status + updatedAt path and applies the bound before child evidence hydration', async () => {
    const db = createKairosDatabase(dbName());
    await openKairosDatabase(db);
    const repos = createKairosRepositories(db);
    const trades = [
      { id: createTradeDomainId<TradeId>(), symbol: 'DRAFT-OLD', marketType: 'crypto', side: 'long', status: 'draft', source: 'manual', openedAt: null, closedAt: null, createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' },
      { id: createTradeDomainId<TradeId>(), symbol: 'OPEN-NEW', marketType: 'crypto', side: 'long', status: 'open', source: 'manual', openedAt: '2026-09-02T03:00:00.000Z', closedAt: null, createdAt: '2026-09-02T03:00:00.000Z', updatedAt: '2026-09-02T03:00:00.000Z' },
      { id: createTradeDomainId<TradeId>(), symbol: 'DRAFT-NEW', marketType: 'crypto', side: 'short', status: 'draft', source: 'manual', openedAt: null, closedAt: null, createdAt: '2026-09-02T02:00:00.000Z', updatedAt: '2026-09-02T02:00:00.000Z' },
    ] as const;
    for (const trade of trades) await repos.trades.put(trade);

    const history = await listJournalHistory(db, { status: 'draft', limit: 1 });
    expect(history).toHaveLength(1);
    expect(history[0]?.trade.symbol).toBe('DRAFT-NEW');
    db.close();
  });

});
