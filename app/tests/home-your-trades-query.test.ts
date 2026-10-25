import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { loadHomeYourTrades, type HomeYourTrade, type HomeYourTradesResult } from '../src/application/dashboard/homeDashboardYourTradesQuery';
import { savePracticeTrade } from '../src/application/practice/savePracticeTrade';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference, type VisualPnlPeriodChoice } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { exchangeRateId } from '../src/domain/calculations/currencyConversion';
import type { DecimalString, TradeId } from '../src/domain/trades';

// Sunday 25 October 2026, noon UTC: this week is 19–25 October.
const NOW = '2026-10-25T12:00:00.000Z';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(zone: string | null = 'UTC'): Promise<KairosDatabase> {
  const name = `kairos-home-your-trades-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  if (zone !== null) expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, zone, NOW)).ok).toBe(true);
  return db;
}

function closed(closedAt: string, exit: string, { currency = 'USDT' as string | null, symbol = 'BTCUSDT', marketType = 'crypto', exitQuantity = '1' }: { currency?: string | null; symbol?: string; marketType?: SaveManualTradeInput['marketType']; exitQuantity?: string } = {}): SaveManualTradeInput {
  const openedAt = new Date(Date.parse(closedAt) - 3_600_000).toISOString();
  return {
    symbol, marketType, side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: currency,
    executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: openedAt }, { type: 'exit', price: exit, quantity: exitQuantity, executedAt: closedAt }],
    fees: [],
  } as SaveManualTradeInput;
}
async function save(db: KairosDatabase, input: SaveManualTradeInput): Promise<TradeId> {
  const saved = await saveManualTrade(db, input);
  if (!saved.ok) throw new Error(`fixture: ${JSON.stringify(saved)}`);
  return saved.tradeId as TradeId;
}
type Ready = Extract<HomeYourTradesResult, { kind: 'ready' }>;
function ready(result: HomeYourTradesResult): Ready {
  if (result.kind !== 'ready') throw new Error(`not ready: ${JSON.stringify(result)}`);
  return result;
}
const MONTH: VisualPnlPeriodChoice = { kind: 'month', at: null };
const load = (db: KairosDatabase, choice: VisualPnlPeriodChoice = MONTH, now = NOW) => loadHomeYourTrades(db, { choice, now });
const ids = (trades: readonly HomeYourTrade[]) => trades.map(trade => trade.id);

describe('T-061d the "Your Trades" read', () => {
  it('puts a trade on its close day in the saved zone, also at the edge of a month', async () => {
    const db = await database('Asia/Manila');
    // 30 September 17:00 UTC is 1 October 01:00 in Manila: October. 15:00 UTC is still 30 September there.
    const october = await save(db, closed('2026-09-30T17:00:00.000Z', '120'));
    const september = await save(db, closed('2026-09-30T15:00:00.000Z', '110'));

    const month = ready(await load(db));
    expect(month).toMatchObject({ timeZone: 'Asia/Manila', todayKey: '2026-10-25', homeCurrency: null, hasTrades: true });
    expect(month.period).toMatchObject({ kind: 'month', fromDayKey: '2026-10-01', toDayKey: '2026-11-01', label: 'October 2026' });
    expect(ids(month.trades)).toEqual([october]);
    expect(month.trades[0]).toMatchObject({ closedAt: '2026-09-30T17:00:00.000Z', closeDayKey: '2026-10-01' });

    const before = ready(await load(db, { kind: 'month', at: '2026-09-15' }));
    expect(ids(before.trades)).toEqual([september]);
    expect(before.trades[0]!.closeDayKey).toBe('2026-09-30');
  });

  it('reads each period: week, month, 3 months, year and all time, newest close first', async () => {
    const db = await database();
    const thisWeek = await save(db, closed('2026-10-20T10:00:00.000Z', '110'));
    const thisMonth = await save(db, closed('2026-10-05T10:00:00.000Z', '90'));
    const august = await save(db, closed('2026-08-15T10:00:00.000Z', '130'));
    const march = await save(db, closed('2026-03-01T10:00:00.000Z', '105'));
    const lastYear = await save(db, closed('2025-12-31T10:00:00.000Z', '80'));

    const read = async (choice: VisualPnlPeriodChoice) => ready(await load(db, choice));
    const week = await read({ kind: 'week', at: null });
    expect(week.period).toMatchObject({ kind: 'week', fromDayKey: '2026-10-19', toDayKey: '2026-10-26' });
    expect(ids(week.trades)).toEqual([thisWeek]);
    expect(ids((await read(MONTH)).trades)).toEqual([thisWeek, thisMonth]);
    expect(ids((await read({ kind: 'three-months', at: null })).trades)).toEqual([thisWeek, thisMonth, august]);
    expect(ids((await read({ kind: 'year', at: null })).trades)).toEqual([thisWeek, thisMonth, august, march]);
    const all = await read({ kind: 'all' });
    expect(all.period).toMatchObject({ kind: 'all', fromDayKey: null, toDayKey: null, label: 'All time' });
    expect(ids(all.trades)).toEqual([thisWeek, thisMonth, august, march, lastYear]);
  });

  it('gives each trade its recorded result after fees, and compares it as recorded when no home currency is chosen', async () => {
    const db = await database();
    const win = await save(db, closed('2026-10-20T10:00:00.000Z', '150'));
    const loss = await save(db, closed('2026-10-21T10:00:00.000Z', '60', { currency: 'EUR', symbol: 'BTCEUR' }));
    const noCurrency = await save(db, closed('2026-10-22T10:00:00.000Z', '120', { currency: null }));
    const noResult = await save(db, closed('2026-10-23T10:00:00.000Z', '120', { exitQuantity: '0.5' }));

    const trades = new Map(ready(await load(db)).trades.map(trade => [trade.id, trade]));
    expect(trades.get(win)).toMatchObject({ symbol: 'BTCUSDT', side: 'long', outcome: 'profit', resultLabel: 'Profit', amount: '50', currency: 'USDT', compared: { kind: 'compared', amount: '50', currency: 'USDT', converted: false } });
    expect(trades.get(loss)).toMatchObject({ outcome: 'loss', amount: '-40', currency: 'EUR', compared: { kind: 'compared', amount: '-40', currency: 'EUR', converted: false } });
    // Missing is not zero: a result with no currency is not compared, and a trade with no result has none.
    expect(trades.get(noCurrency)).toMatchObject({ outcome: 'profit', amount: '20', currency: null, compared: { kind: 'not-compared', reason: 'unknown-currency' } });
    expect(trades.get(noResult)).toMatchObject({ outcome: 'unavailable', resultLabel: 'Not available', amount: null, compared: { kind: 'no-result' } });
  });

  it('compares in the home currency: as recorded, converted with the rate of its day, or not compared when a rate is missing', async () => {
    const db = await database();
    const euro = await save(db, closed('2026-10-20T10:00:00.000Z', '102', { currency: 'EUR', symbol: 'BTCEUR' }));
    const converted = await save(db, closed('2026-10-20T11:00:00.000Z', '110', { currency: 'USD', symbol: 'AAPL', marketType: 'stock' }));
    const unconverted = await save(db, closed('2026-10-21T11:00:00.000Z', '130', { currency: 'USD', symbol: 'MSFT', marketType: 'stock' }));
    expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now: () => NOW })).ok).toBe(true);
    await db.exchangeRates.put({ id: exchangeRateId('ecb', 'EUR', 'USD', '2026-10-20'), source: 'ecb', from: 'EUR', to: 'USD', day: '2026-10-20', rateDay: '2026-10-20', rate: '1.25' as DecimalString, savedAt: NOW });

    const read = ready(await load(db));
    expect(read.homeCurrency).toBe('EUR');
    const trades = new Map(read.trades.map(trade => [trade.id, trade]));
    expect(trades.get(euro)).toMatchObject({ amount: '2', currency: 'EUR', compared: { kind: 'compared', amount: '2', currency: 'EUR', converted: false } });
    // The recorded result stays as recorded; only the compared one is in EUR.
    expect(trades.get(converted)).toMatchObject({ amount: '10', currency: 'USD', compared: { kind: 'compared', amount: '8', currency: 'EUR', converted: true } });
    expect(trades.get(unconverted)).toMatchObject({ amount: '30', currency: 'USD', compared: { kind: 'not-compared', reason: 'missing-rate' } });
  });

  it('leaves out open, planned and cancelled trades and practice trades; says whether the journal holds any trade', async () => {
    const db = await database();
    const real = await save(db, closed('2026-10-20T10:00:00.000Z', '110'));
    await save(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-10-21T10:00:00.000Z', grossPnlCurrency: 'USDT', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-10-21T10:00:00.000Z' }], fees: [] } as SaveManualTradeInput);
    await save(db, { symbol: 'SOLUSDT', marketType: 'crypto', side: 'short', status: 'draft' } as SaveManualTradeInput);
    expect((await savePracticeTrade(db, closed('2026-10-22T10:00:00.000Z', '140'))).ok).toBe(true);
    expect(ids(ready(await load(db, { kind: 'all' })).trades)).toEqual([real]);

    const onlyOpen = await database();
    await save(onlyOpen, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-10-21T10:00:00.000Z' } as SaveManualTradeInput);
    expect(ready(await load(onlyOpen))).toMatchObject({ trades: [], hasTrades: true });
    expect(ready(await load(await database()))).toMatchObject({ trades: [], hasTrades: false });
  });

  it('needs a saved time zone, even for all time, and writes nothing', async () => {
    const db = await database(null);
    await save(db, closed('2026-10-20T10:00:00.000Z', '110'));
    const tables = async () => JSON.stringify(await Promise.all(db.tables.map(table => table.toArray())));
    const before = await tables();
    expect(await load(db)).toEqual({ kind: 'time-zone-unconfigured' });
    expect(await load(db, { kind: 'all' })).toEqual({ kind: 'time-zone-unconfigured' });
    expect(await tables()).toBe(before);

    const zoned = await database();
    await save(zoned, closed('2026-10-20T10:00:00.000Z', '110'));
    const zonedBefore = JSON.stringify(await Promise.all(zoned.tables.map(table => table.toArray())));
    ready(await load(zoned));
    expect(JSON.stringify(await Promise.all(zoned.tables.map(table => table.toArray())))).toBe(zonedBefore);
  });

  it('refuses a period that starts after today and a moment it cannot read, never throwing', async () => {
    const db = await database();
    expect(await load(db, { kind: 'month', at: '2026-11-03' })).toEqual({ kind: 'unavailable', reason: 'invalid-period' });
    expect(await load(db, MONTH, 'not a time')).toEqual({ kind: 'unavailable', reason: 'invalid-now' });
  });
});
