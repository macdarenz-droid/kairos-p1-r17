import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { saveManualTrade } from '../src/application/trades';
import type { TradeExecutionId, TradeFeeId, TradeId, TradePlanId } from '../src/domain/trades';

const databaseNames = new Set<string>();
function databaseName(label: string) {
  const value = `kairos-p101-${label}-${crypto.randomUUID()}`;
  databaseNames.add(value);
  return value;
}

afterEach(async () => {
  for (const name of databaseNames) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked'));
    });
  }
  databaseNames.clear();
});

function deterministicIdFactory() {
  let index = 0;
  return <T extends TradeId | TradePlanId | TradeExecutionId | TradeFeeId>() => `p10-id-${++index}` as T;
}

describe('P10.1 manual trade save command', () => {
  it('normalizes and atomically persists one manual trade aggregate', async () => {
    const db = createKairosDatabase(databaseName('save'));
    await openKairosDatabase(db);

    const result = await saveManualTrade(db, {
      symbol: ' btcusdt ',
      marketType: 'crypto',
      side: 'long',
      status: 'open',
      openedAt: '2026-09-01T05:00:00.000Z',
      plan: {
        plannedEntryPrice: ' 100.2500 ',
        plannedStopPrice: '95',
        plannedTargetPrice: '110',
        plannedQuantity: '2.5',
      },
      executions: [
        { type: 'entry', price: '101.25', quantity: '1', executedAt: '2026-09-01T05:01:00.000Z' },
        { type: 'entry', price: '102', quantity: '1.5', executedAt: '2026-09-01T05:02:00.000Z' },
      ],
      fees: [{ amount: '0.5', currency: ' usdt ' }],
    }, {
      now: () => '2026-09-01T05:03:00.000Z',
      createId: deterministicIdFactory(),
    });

    expect(result).toMatchObject({ ok: true, persisted: { plans: 1, executions: 2, fees: 1 } });
    expect(await db.trades.toArray()).toEqual([
      expect.objectContaining({ symbol: 'BTCUSDT', source: 'manual', status: 'open' }),
    ]);
    expect(await db.tradePlans.toArray()).toEqual([
      expect.objectContaining({ plannedEntryPrice: '100.2500', plannedQuantity: '2.5' }),
    ]);
    expect(await db.tradeExecutions.count()).toBe(2);
    expect(await db.tradeFees.toArray()).toEqual([
      expect.objectContaining({ amount: '0.5', currency: 'USDT', executionId: null }),
    ]);
    db.close();
  });

  it('rejects invalid financial input before any persistence starts', async () => {
    const db = createKairosDatabase(databaseName('validation'));
    await openKairosDatabase(db);

    const result = await saveManualTrade(db, {
      symbol: 'ETHUSD',
      marketType: 'crypto',
      side: 'long',
      status: 'draft',
      plan: { plannedEntryPrice: '0' },
    });

    expect(result).toEqual({
      ok: false,
      type: 'validation-error',
      field: 'plan.plannedEntryPrice',
      reason: 'must-be-positive',
    });
    expect(await db.trades.count()).toBe(0);
    expect(await db.tradePlans.count()).toBe(0);
    db.close();
  });

  it('returns a typed storage error and rolls back all required records on write failure', async () => {
    const db = createKairosDatabase(databaseName('rollback'));
    await openKairosDatabase(db);
    db.tradePlans.hook('creating', () => { throw new Error('synthetic-write-failure'); });

    const result = await saveManualTrade(db, {
      symbol: 'AAPL',
      marketType: 'stock',
      side: 'long',
      status: 'draft',
      plan: { plannedEntryPrice: '100' },
    }, { createId: deterministicIdFactory() });

    expect(result).toEqual({ ok: false, type: 'storage-error', reason: 'trade-save-failed' });
    expect(await db.trades.count()).toBe(0);
    expect(await db.tradePlans.count()).toBe(0);
    db.close();
  });

  it('does not silently convert missing optional financial values to zero', async () => {
    const db = createKairosDatabase(databaseName('missing'));
    await openKairosDatabase(db);

    const result = await saveManualTrade(db, {
      symbol: 'EURUSD',
      marketType: 'forex',
      side: 'short',
      status: 'draft',
      plan: {},
    }, { createId: deterministicIdFactory() });

    expect(result.ok).toBe(true);
    expect(await db.tradePlans.toArray()).toEqual([
      expect.objectContaining({
        plannedEntryPrice: null,
        plannedStopPrice: null,
        plannedTargetPrice: null,
        plannedQuantity: null,
      }),
    ]);
    db.close();
  });
});
