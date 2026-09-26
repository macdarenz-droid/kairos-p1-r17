import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { listJournalHistory } from '../src/application/journal';
import { createTradeDomainId, parsePositiveDecimalString, type TradeExecutionId, type TradeFeeId, type TradeId } from '../src/domain/trades';

const names = new Set<string>();
const dbName = () => { const value = `kairos-p132-${crypto.randomUUID()}`; names.add(value); return value; };
const dec = (value: string) => { const result = parsePositiveDecimalString(value); if (!result.ok) throw new Error('fixture decimal'); return result.value; };

afterEach(async () => {
  for (const name of names) await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(name); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('blocked')); });
  names.clear();
});

describe('P13.2 journal Visual P&L projection wiring', () => {
  it('projects a closed zero-fee profitable trade from authoritative P11 metrics', async () => {
    const db = createKairosDatabase(dbName()); await openKairosDatabase(db); const repos = createKairosRepositories(db);
    const tradeId = createTradeDomainId<TradeId>();
    await repos.trades.put({ id: tradeId, symbol: 'BTCUSD', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', openedAt: '2026-09-02T01:00:00.000Z', closedAt: '2026-09-02T02:00:00.000Z', createdAt: '2026-09-02T01:00:00.000Z', updatedAt: '2026-09-02T02:00:00.000Z' });
    await repos.tradeExecutions.put({ id: createTradeDomainId<TradeExecutionId>(), tradeId, type: 'entry', price: dec('100'), quantity: dec('1'), executedAt: '2026-09-02T01:00:00.000Z', createdAt: '2026-09-02T01:00:00.000Z' });
    await repos.tradeExecutions.put({ id: createTradeDomainId<TradeExecutionId>(), tradeId, type: 'exit', price: dec('110'), quantity: dec('1'), executedAt: '2026-09-02T02:00:00.000Z', createdAt: '2026-09-02T02:00:00.000Z' });
    const history = await listJournalHistory(db);
    expect(history[0]?.metrics?.netPnl).toBe('10');
    expect(history[0]?.visualPnl).toMatchObject({ outcome: 'profit', label: 'Profit', amount: '10', source: 'net-pnl' });
    db.close();
  });

  it('keeps nonzero-fee outcome unavailable when journal has no gross-P&L currency evidence', async () => {
    const db = createKairosDatabase(dbName()); await openKairosDatabase(db); const repos = createKairosRepositories(db);
    const tradeId = createTradeDomainId<TradeId>(); const exitId = createTradeDomainId<TradeExecutionId>();
    await repos.trades.put({ id: tradeId, symbol: 'ETHUSD', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', openedAt: '2026-09-02T01:00:00.000Z', closedAt: '2026-09-02T02:00:00.000Z', createdAt: '2026-09-02T01:00:00.000Z', updatedAt: '2026-09-02T02:00:00.000Z' });
    await repos.tradeExecutions.put({ id: createTradeDomainId<TradeExecutionId>(), tradeId, type: 'entry', price: dec('100'), quantity: dec('1'), executedAt: '2026-09-02T01:00:00.000Z', createdAt: '2026-09-02T01:00:00.000Z' });
    await repos.tradeExecutions.put({ id: exitId, tradeId, type: 'exit', price: dec('110'), quantity: dec('1'), executedAt: '2026-09-02T02:00:00.000Z', createdAt: '2026-09-02T02:00:00.000Z' });
    await repos.tradeFees.put({ id: createTradeDomainId<TradeFeeId>(), tradeId, executionId: exitId, amount: dec('1'), currency: 'USD', createdAt: '2026-09-02T02:00:00.000Z' });
    const history = await listJournalHistory(db);
    expect(history[0]?.metrics?.grossPnl).toBe('10');
    expect(history[0]?.metrics?.netPnl).toBeNull();
    expect(history[0]?.visualPnl).toEqual({ outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' });
    db.close();
  });

  it('projects invalid calculation evidence as unavailable without dropping the journal entry', async () => {
    const db = createKairosDatabase(dbName()); await openKairosDatabase(db); const repos = createKairosRepositories(db); const tradeId = createTradeDomainId<TradeId>();
    await repos.trades.put({ id: tradeId, symbol: 'INVALID', marketType: 'crypto', side: 'long', status: 'open', source: 'manual', openedAt: '2026-09-02T01:00:00.000Z', closedAt: null, createdAt: '2026-09-02T01:00:00.000Z', updatedAt: '2026-09-02T01:00:00.000Z' });
    await repos.tradeExecutions.put({ id: createTradeDomainId<TradeExecutionId>(), tradeId, type: 'exit', price: dec('110'), quantity: dec('1'), executedAt: '2026-09-02T01:10:00.000Z', createdAt: '2026-09-02T01:10:00.000Z' });
    const history = await listJournalHistory(db);
    expect(history[0]?.metricsError).toBe('exit-without-entry');
    expect(history[0]?.visualPnl.outcome).toBe('unavailable');
    db.close();
  });
});
