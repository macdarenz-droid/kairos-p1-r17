import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { loadTradePatterns } from '../src/application/patterns/loadTradePatterns';
import type { TradePattern, TradePatternsProjection } from '../src/application/patterns/tradePatterns';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { createTradeDomainId, type TradeId, type TradeRecord } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-trade-patterns-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const now = '2026-09-18T12:00:00.000Z';
async function withZone(db: KairosDatabase, zone = 'UTC') { await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, zone, now); }
async function save(db: KairosDatabase, input: Parameters<typeof saveManualTrade>[1]) {
  const saved = await saveManualTrade(db, input);
  if (!saved.ok) throw new Error('fixture');
}
function closed(symbol: string, side: 'long' | 'short', exit: string, openedAt: string, closedAt: string) {
  return {
    symbol, marketType: 'crypto', side, status: 'closed', grossPnlCurrency: 'USDT', openedAt, closedAt,
    executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: openedAt }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
  } as const;
}
async function ready(db: KairosDatabase, scope?: 'real' | 'practice') {
  const result = await loadTradePatterns(db, { now, ...(scope ? { scope } : {}) });
  if (result.kind !== 'ready') throw new Error(result.kind);
  return result;
}
const find = (projection: TradePatternsProjection, kind: TradePattern['kind']) => projection.patterns.find(item => item.kind === kind)!;
const counts = (item: TradePattern) => item.groups.map(group => group.summary.tradeCount);
const steps = (item: TradePattern) => item.groups.map(group => group.barSteps);

async function fixture(db: KairosDatabase) {
  await withZone(db);
  for (let i = 0; i < 12; i += 1) {
    const exit = i <= 6 ? '110' : i <= 10 ? '95' : '100';
    await save(db, closed('BTCUSDT', 'long', exit, '2026-09-14T09:00:00.000Z', `2026-09-14T10:${String(i).padStart(2, '0')}:00.000Z`));
  }
  for (let i = 0; i < 3; i += 1) await save(db, closed('ETHUSDT', 'short', '90', '2026-09-16T21:00:00.000Z', `2026-09-16T22:0${i}:00.000Z`));
  await save(db, closed('SOLUSDT', 'long', '90', '2026-06-20T23:00:00.000Z', '2026-06-21T01:00:00.000Z'));
  await save(db, closed('ADAUSDT', 'long', '110', '2026-06-20T08:00:00.000Z', '2026-06-20T10:00:00.000Z'));
  await save(db, { symbol: 'DOTUSDT', marketType: 'crypto', side: 'long', status: 'open', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', executions: [{ type: 'entry', price: '5', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }] });
}

describe('T-042b day, time of day and direction', () => {
  it('reads the last 90 days and groups them by day, time of day and direction', async () => {
    const db = await database();
    await fixture(db);
    const before = [await db.trades.count(), await db.tradeDiscipline.count(), await db.metadata.count()];
    const result = await ready(db);
    expect([await db.trades.count(), await db.tradeDiscipline.count(), await db.metadata.count()]).toEqual(before);
    expect(result).toMatchObject({ timeZone: 'UTC', firstDayKey: '2026-06-21', lastDayKey: '2026-09-18' });
    const { projection } = result;
    expect(projection.overall).toMatchObject({ tradeCount: 16, won: 10, lost: 5, breakEven: 1, resultCount: 16, enough: true, wonPercent: 63 });
    expect(projection.overall.total).toMatchObject({ available: true, currency: 'USDT', total: '70' });

    const weekday = find(projection, 'weekday');
    expect(weekday.groups.map(group => group.key)).toEqual(['weekday:0', 'weekday:1', 'weekday:2', 'weekday:3', 'weekday:4', 'weekday:5', 'weekday:6']);
    expect(counts(weekday)).toEqual([12, 0, 3, 0, 0, 1, 0]);
    expect(steps(weekday)).toEqual([10, 0, 3, 0, 0, 1, 0]);
    expect(weekday.unplaced).toBe(0);
    expect(weekday.groups[0]!.summary).toMatchObject({ won: 7, lost: 4, breakEven: 1, wonPercent: 58 });
    expect(weekday.groups[0]!.summary.total).toMatchObject({ total: '50' });
    expect(weekday.groups[2]!.summary).toMatchObject({ enough: false, wonPercent: null, total: null, won: 3 });
    expect(weekday.groups.every(group => group.name === null)).toBe(true);

    const hours = find(projection, 'time-of-day');
    expect(hours.groups.map(group => group.key)).toEqual(['hours:0', 'hours:1', 'hours:2', 'hours:3', 'hours:4', 'hours:5']);
    expect(counts(hours)).toEqual([0, 0, 12, 0, 0, 4]);
    expect(steps(hours)).toEqual([0, 0, 10, 0, 0, 3]);

    const direction = find(projection, 'direction');
    expect(direction.groups.map(group => group.key)).toEqual(['long', 'short']);
    expect(counts(direction)).toEqual([13, 3]);
    expect(steps(direction)).toEqual([10, 2]);
    expect(direction.groups[0]!.summary).toMatchObject({ won: 7, lost: 5, breakEven: 1, wonPercent: 54 });
    expect(direction.groups[0]!.summary.total).toMatchObject({ total: '40' });
    expect(direction.groups[1]!.summary.enough).toBe(false);

    expect(Object.isFrozen(projection) && Object.isFrozen(projection.patterns)).toBe(true);
    for (const item of projection.patterns) {
      expect(Object.isFrozen(item) && Object.isFrozen(item.groups)).toBe(true);
      for (const group of item.groups) expect(Object.isFrozen(group)).toBe(true);
    }
  });

  it('reads days and hours in the saved time zone', async () => {
    const db = await database();
    await fixture(db);
    await withZone(db, 'Asia/Manila');
    const { projection } = await ready(db);
    expect(counts(find(projection, 'weekday'))).toEqual([12, 0, 0, 3, 0, 0, 1]);
    expect(counts(find(projection, 'time-of-day'))).toEqual([0, 4, 0, 0, 12, 0]);
    expect(projection.overall.tradeCount).toBe(16);
  });

  it('leaves out a trade whose opening time cannot be read', async () => {
    const db = await database();
    await withZone(db);
    await save(db, closed('XRPUSDT', 'long', '110', '2026-09-15T09:00:00Z', '2026-09-15T10:00:00.000Z'));
    const { projection } = await ready(db);
    expect(projection.overall.tradeCount).toBe(1);
    for (const kind of ['weekday', 'time-of-day'] as const) {
      expect(counts(find(projection, kind)).every(count => count === 0)).toBe(true);
      expect(find(projection, kind).unplaced).toBe(1);
    }
    expect(counts(find(projection, 'direction'))).toEqual([1, 0]);
  });

  it('keeps practice apart', async () => {
    const db = await database();
    await fixture(db);
    expect((await savePracticeTrade(db, closed('BTCUSDT', 'long', '110', '2026-09-14T09:00:00.000Z', '2026-09-14T10:00:00.000Z'))).ok).toBe(true);
    expect((await ready(db)).projection.overall.tradeCount).toBe(16);
    expect((await ready(db, 'practice')).projection.overall.tradeCount).toBe(1);
  });

  it('reads every trade of the period, past the history page limit', async () => {
    const db = await database();
    await withZone(db);
    const record = (openedAt: string, closedAt: string): TradeRecord => ({ id: createTradeDomainId<TradeId>(), symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', openedAt, closedAt, createdAt: openedAt, updatedAt: closedAt });
    const start = Date.parse('2026-07-01T00:30:00.000Z');
    const inPeriod = Array.from({ length: 600 }, (_, i) => record(new Date(start + i * 3 * 3_600_000 - 3_600_000).toISOString(), new Date(start + i * 3 * 3_600_000).toISOString()));
    const january = Array.from({ length: 400 }, (_, i) => record(new Date(Date.parse('2026-01-02T00:00:00.000Z') + i * 60_000).toISOString(), new Date(Date.parse('2026-01-02T01:00:00.000Z') + i * 60_000).toISOString()));
    await db.trades.bulkPut([...inPeriod, ...january]);
    const startedAt = performance.now();
    const { projection } = await ready(db);
    expect(performance.now() - startedAt).toBeLessThan(5_000);
    expect(projection.overall).toMatchObject({ tradeCount: 600, noResult: 600 });
  });

  it('refuses without a time zone or a valid time, and is empty without trades', async () => {
    const db = await database();
    expect(await loadTradePatterns(db, { now })).toEqual({ kind: 'time-zone-unconfigured' });
    await withZone(db);
    expect(await loadTradePatterns(db, { now: 'not a time' })).toEqual({ kind: 'unavailable', reason: 'invalid-now' });
    const { projection } = await ready(db);
    expect(projection.overall.tradeCount).toBe(0);
    const weekday = find(projection, 'weekday');
    expect(counts(weekday).every(count => count === 0) && steps(weekday).every(step => step === 0)).toBe(true);
  });
});
