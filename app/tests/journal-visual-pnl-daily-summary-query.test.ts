import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { listJournalVisualPnlDailySummary } from '../src/application/journal';
import {
  createTradeDomainId,
  parsePositiveDecimalString,
  type TradeExecutionId,
  type TradeId,
} from '../src/domain/trades';

const names = new Set<string>();
const dbName = () => {
  const value = `kairos-p138-${crypto.randomUUID()}`;
  names.add(value);
  return value;
};
const dec = (value: string) => {
  const result = parsePositiveDecimalString(value);
  if (!result.ok) throw new Error('fixture decimal');
  return result.value;
};

afterEach(async () => {
  for (const name of names) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked'));
    });
  }
  names.clear();
});

describe('P13.8 bounded Journal daily Visual P&L query', () => {
  it('uses the closed-trade Journal History path and explicit caller timezone', async () => {
    const db = createKairosDatabase(dbName());
    await openKairosDatabase(db);
    const repos = createKairosRepositories(db);

    const closedId = createTradeDomainId<TradeId>();
    const openId = createTradeDomainId<TradeId>();

    await repos.trades.put({
      id: closedId,
      symbol: 'CLOSED',
      marketType: 'crypto',
      side: 'long',
      status: 'closed',
      source: 'manual',
      openedAt: '2026-09-02T13:00:00.000Z',
      closedAt: '2026-09-02T14:30:00.000Z',
      createdAt: '2026-09-02T13:00:00.000Z',
      updatedAt: '2026-09-02T14:30:00.000Z',
    });
    await repos.tradeExecutions.put({
      id: createTradeDomainId<TradeExecutionId>(),
      tradeId: closedId,
      type: 'entry',
      price: dec('100'),
      quantity: dec('1'),
      executedAt: '2026-09-02T13:00:00.000Z',
      createdAt: '2026-09-02T13:00:00.000Z',
    });
    await repos.tradeExecutions.put({
      id: createTradeDomainId<TradeExecutionId>(),
      tradeId: closedId,
      type: 'exit',
      price: dec('110'),
      quantity: dec('1'),
      executedAt: '2026-09-02T14:30:00.000Z',
      createdAt: '2026-09-02T14:30:00.000Z',
    });

    await repos.trades.put({
      id: openId,
      symbol: 'OPEN',
      marketType: 'crypto',
      side: 'long',
      status: 'open',
      source: 'manual',
      openedAt: '2026-09-02T15:00:00.000Z',
      closedAt: null,
      createdAt: '2026-09-02T15:00:00.000Z',
      updatedAt: '2026-09-02T15:00:00.000Z',
    });

    const summary = await listJournalVisualPnlDailySummary(db, 'Australia/Sydney');

    expect(summary.days).toHaveLength(1);
    expect(summary.days[0]?.dayKey).toBe('2026-09-03');
    expect(summary.days[0]?.timeZone).toBe('Australia/Sydney');
    expect(summary.days[0]?.summary.tradeCount).toBe(1);
    expect(summary.blockedTrades).toEqual([]);
    db.close();
  });

  it('preserves the existing bounded query contract before hydration and grouping', async () => {
    const db = createKairosDatabase(dbName());
    await openKairosDatabase(db);
    const repos = createKairosRepositories(db);

    for (const [index, closedAt] of [
      ['OLD', '2026-09-01T01:00:00.000Z'],
      ['MID', '2026-09-02T01:00:00.000Z'],
      ['NEW', '2026-09-03T01:00:00.000Z'],
    ] as const) {
      const tradeId = createTradeDomainId<TradeId>();
      await repos.trades.put({
        id: tradeId,
        symbol: index,
        marketType: 'stock',
        side: 'long',
        status: 'closed',
        source: 'manual',
        openedAt: '2026-09-01T00:00:00.000Z',
        closedAt,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: closedAt,
      });
      await repos.tradeExecutions.put({
        id: createTradeDomainId<TradeExecutionId>(),
        tradeId,
        type: 'entry',
        price: dec('100'),
        quantity: dec('1'),
        executedAt: '2026-09-01T00:00:00.000Z',
        createdAt: '2026-09-01T00:00:00.000Z',
      });
      await repos.tradeExecutions.put({
        id: createTradeDomainId<TradeExecutionId>(),
        tradeId,
        type: 'exit',
        price: dec('101'),
        quantity: dec('1'),
        executedAt: closedAt,
        createdAt: closedAt,
      });
    }

    const summary = await listJournalVisualPnlDailySummary(db, 'UTC', { limit: 2 });
    expect(summary.days.map((day) => day.dayKey)).toEqual(['2026-09-02', '2026-09-03']);
    expect(summary.days.reduce((count, day) => count + day.summary.tradeCount, 0)).toBe(2);
    db.close();
  });

  it('reuses Journal History limit validation instead of opening an unbounded path', async () => {
    const db = createKairosDatabase(dbName());
    await openKairosDatabase(db);
    await expect(listJournalVisualPnlDailySummary(db, 'UTC', { limit: 0 })).rejects.toBeInstanceOf(RangeError);
    await expect(listJournalVisualPnlDailySummary(db, 'UTC', { limit: 501 })).rejects.toBeInstanceOf(RangeError);
    db.close();
  });

  it('does not silently substitute a device timezone when the supplied zone is invalid', async () => {
    const db = createKairosDatabase(dbName());
    await openKairosDatabase(db);
    const repos = createKairosRepositories(db);
    const tradeId = createTradeDomainId<TradeId>();

    await repos.trades.put({
      id: tradeId,
      symbol: 'ZONE',
      marketType: 'stock',
      side: 'long',
      status: 'closed',
      source: 'manual',
      openedAt: '2026-09-02T01:00:00.000Z',
      closedAt: '2026-09-02T02:00:00.000Z',
      createdAt: '2026-09-02T01:00:00.000Z',
      updatedAt: '2026-09-02T02:00:00.000Z',
    });

    const summary = await listJournalVisualPnlDailySummary(db, 'Not/A_TimeZone');
    expect(summary.days).toEqual([]);
    expect(summary.blockedTrades).toEqual([{ tradeId, reason: 'invalid-time-zone' }]);
    db.close();
  });
});
