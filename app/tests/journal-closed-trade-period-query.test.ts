import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGoalsProgress, writeGoalsPreference } from '../src/application/goals';
import { getJournalHistoryEntry, listJournalClosedTradesInPeriod } from '../src/application/journal';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { TradeId, TradeRecord, TradeSource, TradeStatus } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-period-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

let counter = 0;
function trade(closedAt: string | null, options: { status?: TradeStatus; source?: TradeSource; openedAt?: string } = {}): TradeRecord {
  counter += 1;
  const opened = options.openedAt ?? '2026-08-01T00:00:00.000Z';
  return {
    id: `t-${String(counter).padStart(5, '0')}` as TradeId, symbol: `S${counter}`, marketType: 'crypto', side: 'long',
    status: options.status ?? 'closed', source: options.source ?? 'manual', openedAt: opened, closedAt,
    createdAt: opened, updatedAt: closedAt ?? opened,
  } as TradeRecord;
}
const september = { fromDayKey: '2026-09-01', toDayKey: '2026-10-01' };
async function closedIn(db: KairosDatabase, timeZone: string, period: { fromDayKey: string | null; toDayKey: string | null } = september, scope?: 'real' | 'practice') {
  const result = await listJournalClosedTradesInPeriod(db, { timeZone, ...period, scope });
  if (!result.ok) throw new Error(result.reason);
  return result.entries.map(entry => entry.trade.closedAt);
}

describe('listJournalClosedTradesInPeriod', () => {
  it('places each close on the calendar day of the chosen time zone', async () => {
    const db = await database();
    const closes = ['2026-08-31T23:30:00.000Z', '2026-09-01T00:30:00.000Z', '2026-09-30T23:30:00.000Z', '2026-10-01T00:30:00.000Z'];
    await db.trades.bulkPut(closes.map(at => trade(at)));
    expect(await closedIn(db, 'UTC')).toEqual([closes[1], closes[2]]);
    expect(await closedIn(db, 'Australia/Sydney')).toEqual([closes[0], closes[1]]);
    expect(await closedIn(db, 'America/New_York')).toEqual([closes[2], closes[3]]);
  });

  it('reads one padded day on each side, so the widest zones still fit', async () => {
    const db = await database();
    await db.trades.bulkPut([trade('2026-08-31T10:30:00.000Z'), trade('2026-10-01T11:30:00.000Z')]);
    expect(await closedIn(db, 'Pacific/Kiritimati')).toEqual(['2026-08-31T10:30:00.000Z']);
    expect(await closedIn(db, 'Etc/GMT+12')).toEqual(['2026-10-01T11:30:00.000Z']);
  });

  it('keeps open, cancelled and practice trades out of real totals', async () => {
    const db = await database();
    await db.trades.bulkPut([
      trade(null, { status: 'open' }),
      trade('2026-09-10T00:00:00.000Z', { status: 'cancelled' }),
      trade('2026-09-11T00:00:00.000Z', { source: 'paper' }),
      trade('2026-09-12T00:00:00.000Z', { source: 'replay' }),
      trade('2026-09-13T00:00:00.000Z'),
    ]);
    expect(await closedIn(db, 'UTC')).toEqual(['2026-09-13T00:00:00.000Z']);
    expect(await closedIn(db, 'UTC', september, 'practice')).toEqual(['2026-09-11T00:00:00.000Z', '2026-09-12T00:00:00.000Z']);
  });

  it('returns every closed trade for all time, oldest close first', async () => {
    const db = await database();
    const trades = Array.from({ length: 150 }, (_, index) => trade(new Date(Date.UTC(2026, 0, 1) + (149 - index) * 86_400_000).toISOString()));
    await db.trades.bulkPut(trades);
    const closes = await closedIn(db, 'UTC', { fromDayKey: null, toDayKey: null });
    expect(closes).toHaveLength(150);
    expect(closes).toEqual([...closes].sort());
  });

  it('refuses a bad zone, a bad day key and an empty period', async () => {
    const db = await database();
    expect(await listJournalClosedTradesInPeriod(db, { timeZone: 'Not/AZone', ...september })).toEqual({ ok: false, reason: 'invalid-time-zone' });
    expect(await listJournalClosedTradesInPeriod(db, { timeZone: 'UTC', fromDayKey: '2026-02-30', toDayKey: null })).toEqual({ ok: false, reason: 'invalid-day-key' });
    expect(await listJournalClosedTradesInPeriod(db, { timeZone: 'UTC', fromDayKey: '2026-09-01', toDayKey: '2026-09-01' })).toEqual({ ok: false, reason: 'empty-period' });
  });

  it('loads each trade exactly as the single-trade read does', async () => {
    const db = await database();
    const saved = await saveManualTrade(db, {
      symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT',
      openedAt: '2026-09-02T00:00:00.000Z', closedAt: '2026-09-02T03:00:00.000Z',
      plan: { plannedEntryPrice: '99', plannedStopPrice: '90', plannedTargetPrice: '125', plannedQuantity: '2' },
      executions: [
        { type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-02T01:00:00.000Z' },
        { type: 'entry', price: '101', quantity: '1', executedAt: '2026-09-02T01:00:00.000Z' },
        { type: 'exit', price: '120', quantity: '2', executedAt: '2026-09-02T03:00:00.000Z' },
      ],
      fees: [{ amount: '0.5', currency: 'USDT' }, { amount: '0.25', currency: 'USDT' }],
    });
    if (!saved.ok) throw new Error('save failed');
    await db.trades.put(trade('2026-09-03T00:00:00.000Z'));
    const result = await listJournalClosedTradesInPeriod(db, { timeZone: 'UTC', ...september });
    if (!result.ok) throw new Error(result.reason);
    const entry = result.entries.find(item => item.trade.id === saved.tradeId);
    expect(entry).toEqual(await getJournalHistoryEntry(db, saved.tradeId));
  });
});

describe('goals read the whole month', () => {
  it('counts every closed trade this month and every trade opened today', async () => {
    const db = await database();
    const now = '2026-09-18T12:00:00.000Z';
    const { metadata } = createKairosRepositories(db);
    await writeVisualPnlTimeZonePreference(metadata, 'UTC', now);
    await writeGoalsPreference(metadata, { tradesPerMonthTarget: '600', maxTradesPerDay: '3' }, now);
    const month = Array.from({ length: 520 }, (_, index) => trade(new Date(Date.UTC(2026, 8, 1) + index * 60_000).toISOString(), { openedAt: '2026-09-01T00:00:00.000Z' }));
    await db.trades.bulkPut([
      ...month,
      trade(null, { status: 'open', openedAt: '2026-09-18T09:00:00.000Z' }),
      trade('2026-08-20T00:00:00.000Z', { openedAt: '2026-08-19T00:00:00.000Z' }),
      trade(null, { status: 'open', source: 'paper', openedAt: '2026-09-18T10:00:00.000Z' }),
    ]);
    const result = await loadGoalsProgress(db, now);
    expect(result).toMatchObject({ kind: 'ready', progress: { kind: 'ready', tradesPerMonth: { current: 520 }, maxTradesPerDay: { today: 1 } } });
  });
});
