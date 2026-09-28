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

describe('P13.8 Journal daily Visual P&L query', () => {
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

  it('reads every closed trade, not only the newest 100', async () => {
    const db = createKairosDatabase(dbName());
    await openKairosDatabase(db);
    const trades = Array.from({ length: 150 }, (_, index) => {
      const closedAt = new Date(Date.UTC(2026, 6, 1, 12) + index * 3_600_000).toISOString();
      return {
        id: createTradeDomainId<TradeId>(), symbol: `T${index}`, marketType: 'stock' as const, side: 'long' as const, status: 'closed' as const,
        source: 'manual' as const, openedAt: '2026-07-01T00:00:00.000Z', closedAt, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: closedAt,
      };
    });
    await db.trades.bulkPut(trades);
    const summary = await listJournalVisualPnlDailySummary(db, 'UTC');
    expect(summary.days.reduce((count, day) => count + day.summary.tradeCount, 0)).toBe(150);
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
