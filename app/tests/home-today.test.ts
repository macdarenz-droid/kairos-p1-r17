import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { loadHomeToday, type HomeTodayProjection, type HomeTodayResult } from '../src/application/dashboard/homeToday';
import { savePracticeTrade } from '../src/application/practice/savePracticeTrade';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { loadVisualPnlTimeZone, writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { exchangeRateId } from '../src/domain/calculations/currencyConversion';
import type { DecimalString, TradeId } from '../src/domain/trades';

const NOW = '2026-10-25T12:00:00.000Z';
const now = () => NOW;

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(zone: string | null = 'UTC'): Promise<KairosDatabase> {
  const name = `kairos-home-today-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  if (zone !== null) expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, zone, NOW)).ok).toBe(true);
  return db;
}

function closed(closedAt: string, exit: string, { currency = 'USDT', symbol = 'BTCUSDT', marketType = 'crypto' }: { currency?: string; symbol?: string; marketType?: SaveManualTradeInput['marketType'] } = {}): SaveManualTradeInput {
  const openedAt = new Date(Date.parse(closedAt) - 3_600_000).toISOString();
  return {
    symbol, marketType, side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: currency,
    executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: openedAt }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
    fees: [],
  } as SaveManualTradeInput;
}
function open(symbol: string, openedAt: string, plan: { stop?: string; target?: string } = {}, entry: string | null = '64000'): SaveManualTradeInput {
  return {
    symbol, marketType: 'crypto', side: 'long', status: 'open', openedAt, grossPnlCurrency: 'USDT',
    plan: { plannedEntryPrice: null, plannedStopPrice: plan.stop ?? null, plannedTargetPrice: plan.target ?? null, plannedQuantity: null },
    executions: entry === null ? [] : [{ type: 'entry', price: entry, quantity: '0.1', executedAt: openedAt }],
    fees: [],
  } as SaveManualTradeInput;
}
async function save(db: KairosDatabase, input: SaveManualTradeInput, practice = false): Promise<TradeId> {
  const saved = practice ? await savePracticeTrade(db, input) : await saveManualTrade(db, input);
  if (!saved.ok) throw new Error(`fixture: ${JSON.stringify(saved)}`);
  return saved.tradeId as TradeId;
}
function ready(result: HomeTodayResult): HomeTodayProjection {
  if (result.kind !== 'ready') throw new Error(`not ready: ${JSON.stringify(result)}`);
  return result.projection;
}
const load = (db: KairosDatabase, at = NOW) => loadHomeToday(db, { now: at });

describe('T-061b the "Today" read', () => {
  it("gives today's result, this month's, and the month as a calendar, by close day in the saved zone", async () => {
    const db = await database('Asia/Manila');
    // 25 October in Manila: 01:00 and 18:00 local. 24 October 23:30 UTC is already the 25th there.
    await save(db, closed('2026-10-24T17:00:00.000Z', '130'));
    await save(db, closed('2026-10-25T10:00:00.000Z', '115.2'));
    await save(db, closed('2026-10-03T04:00:00.000Z', '95'));
    // September: not this month.
    await save(db, closed('2026-09-28T04:00:00.000Z', '200'));

    const today = ready(await load(db));
    expect(today).toMatchObject({ timeZone: 'Asia/Manila', todayKey: '2026-10-25', hasTrades: true });
    expect(today.today).toEqual({ available: true, currency: 'USDT', total: '45.2', outcome: 'profit', tradeCount: 2 });
    expect(today.month.total).toEqual({ available: true, currency: 'USDT', total: '40.2', outcome: 'profit', tradeCount: 3 });
    expect(today.month.label).toBe('October 2026');
    expect(today.month.totalBlockers).toEqual({ noResult: [], noCurrency: [], missingRate: [] });
    expect(today.month.inHomeCurrency).toMatchObject({ homeCurrency: null });
    expect(today.calendar.monthKey).toBe('2026-10');
    const day = (n: number) => today.calendar.days[n - 1]!;
    expect(day(25)).toMatchObject({ result: 'profit', isToday: true });
    expect(day(3)).toMatchObject({ result: 'loss', isToday: false });
    expect(day(4)).toMatchObject({ result: 'no-trades', strength: null });
    expect(day(25).strength).toBe(4);
    expect(today.calendar.days.filter(cell => cell.summary !== null)).toHaveLength(2);
  });

  it('has no day for today when nothing closed today', async () => {
    const db = await database();
    await save(db, closed('2026-10-03T10:00:00.000Z', '110'));
    const today = ready(await load(db));
    expect(today.today).toBeNull();
    expect(today.month.total).toMatchObject({ available: true, total: '10', tradeCount: 1 });
  });

  it('counts the month in the home currency', async () => {
    const db = await database();
    await save(db, closed('2026-10-20T10:00:00.000Z', '102', { currency: 'EUR', symbol: 'BTCEUR' }));
    await save(db, closed('2026-10-20T11:00:00.000Z', '110', { currency: 'USD', symbol: 'AAPL', marketType: 'stock' }));
    expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);
    await db.exchangeRates.put({ id: exchangeRateId('ecb', 'EUR', 'USD', '2026-10-20'), source: 'ecb', from: 'EUR', to: 'USD', day: '2026-10-20', rateDay: '2026-10-20', rate: '1.25' as DecimalString, savedAt: NOW });

    const today = ready(await load(db));
    expect(today.month.total).toEqual({ available: true, currency: 'EUR', total: '10', outcome: 'profit', tradeCount: 2 });
    expect(today.month.inHomeCurrency).toMatchObject({ homeCurrency: 'EUR', convertedTrades: 1, tradesMissingRate: 0 });
  });

  it('blocks a month in different currencies, and names a trade that still needs a rate', async () => {
    const db = await database();
    await save(db, closed('2026-10-20T10:00:00.000Z', '102', { currency: 'EUR', symbol: 'BTCEUR' }));
    const dollar = await save(db, closed('2026-10-20T11:00:00.000Z', '110', { currency: 'USD', symbol: 'AAPL', marketType: 'stock' }));

    const mixed = ready(await load(db));
    expect(mixed.month.total).toMatchObject({ available: false, reason: 'mixed-currencies', tradeCount: 2 });
    expect(mixed.month.inHomeCurrency).toMatchObject({ homeCurrency: null });

    expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);
    const missing = ready(await load(db));
    expect(missing.month.total).toMatchObject({ available: false, reason: 'mixed-currencies' });
    expect(missing.month.totalBlockers.missingRate).toEqual([dollar]);
    expect(missing.month.inHomeCurrency).toMatchObject({ homeCurrency: 'EUR', tradesMissingRate: 1 });
  });

  it('gives the current streak over all time', async () => {
    const db = await database();
    await save(db, closed('2026-09-30T10:00:00.000Z', '110'));
    await save(db, closed('2026-10-01T10:00:00.000Z', '105'));
    expect(ready(await load(db)).streak).toEqual({ outcome: 'profit', length: 2, startDayKey: '2026-09-30', endDayKey: '2026-10-01' });
  });

  it('gives the 3 newest open trades with their plan as saved, and how many are open', async () => {
    const db = await database();
    await save(db, open('ETHUSDT', '2026-10-01T08:00:00.000Z'));
    const newest = await save(db, open('BTCUSDT', '2026-10-24T08:00:00.000Z', { stop: '62000', target: '70000.50' }));
    const second = await save(db, open('SOLUSDT', '2026-10-20T08:00:00.000Z', { target: '200' }, null));
    const third = await save(db, open('XRPUSDT', '2026-10-10T08:00:00.000Z', { stop: '0.5' }, '0.62'));
    await save(db, open('ADAUSDT', '2026-10-05T08:00:00.000Z'));
    // Not open, or practice: never counted.
    await save(db, closed('2026-10-24T10:00:00.000Z', '110'));
    await save(db, { ...open('DOGEUSDT', '2026-10-24T09:00:00.000Z'), status: 'draft', openedAt: null, executions: [] });
    await save(db, open('LTCUSDT', '2026-10-24T09:30:00.000Z'), true);

    const { openTrades } = ready(await load(db));
    expect(openTrades.count).toBe(5);
    expect(openTrades.shown.map(trade => trade.entry.trade.id)).toEqual([newest, second, third]);
    expect(openTrades.shown.map(({ inAt, stop, target }) => ({ inAt, stop, target }))).toEqual([
      { inAt: '64000', stop: '62000', target: '70000.50' },
      { inAt: null, stop: null, target: '200' },
      { inAt: '0.62', stop: '0.5', target: null },
    ]);
  });

  it("gives the coach's first note, none, or that the coach could not be read while the rest still shows", async () => {
    const quiet = await database();
    await save(quiet, open('BTCUSDT', '2026-10-24T08:00:00.000Z'));
    expect(ready(await load(quiet)).coach).toBeNull();

    const db = await database();
    await save(db, closed('2026-10-20T10:00:00.000Z', '110'));
    const noted = ready(await load(db));
    expect(noted.coach).toMatchObject({ kind: 'reviews-missing', reviewedCount: 0, closedCount: 1 });

    const failing = await database();
    await save(failing, open('BTCUSDT', '2026-10-01T08:00:00.000Z', { stop: '60000' }));
    await save(failing, closed('2026-10-20T10:00:00.000Z', '110'));
    vi.spyOn(failing.tradeDiscipline, 'where').mockImplementation(() => { throw new Error('storage'); });
    const rest = ready(await load(failing));
    expect(rest.coach).toBe('unavailable');
    expect(rest.month.total).toMatchObject({ available: true, total: '10' });
    expect(rest.openTrades.count).toBe(1);
  });

  it('needs a saved time zone and never saves one', async () => {
    const db = await database(null);
    await save(db, closed('2026-10-20T10:00:00.000Z', '110'));
    expect(await load(db)).toEqual({ kind: 'time-zone-unconfigured' });
    expect(await loadVisualPnlTimeZone(db)).toBeNull();
  });

  it('says when the journal holds no trade yet, and an open or planned trade counts as one', async () => {
    const db = await database();
    const empty = ready(await load(db));
    expect(empty).toMatchObject({ hasTrades: false, today: null, coach: null, streak: { outcome: null, length: 0 } });
    expect(empty.openTrades).toEqual({ shown: [], count: 0 });
    expect(empty.month.total).toMatchObject({ available: false, reason: 'no-trades', tradeCount: 0 });

    await save(db, open('DOGEUSDT', '2026-08-24T09:00:00.000Z', {}, null), true);
    expect(ready(await load(db)).hasTrades).toBe(false);
    await save(db, { ...open('DOGEUSDT', '2026-08-24T09:00:00.000Z'), status: 'draft', openedAt: null, executions: [] });
    expect(ready(await load(db)).hasTrades).toBe(true);
  });

  it('says a bad clock is unavailable', async () => {
    const db = await database();
    expect(await load(db, 'not a time')).toMatchObject({ kind: 'unavailable' });
  });

  it('writes nothing', async () => {
    const db = await database();
    await save(db, closed('2026-10-25T10:00:00.000Z', '110'));
    await save(db, open('BTCUSDT', '2026-10-24T08:00:00.000Z', { stop: '62000' }));
    let writes = 0;
    const count = () => { writes += 1; };
    for (const table of db.tables) { table.hook('creating', count); table.hook('updating', count); table.hook('deleting', count); }
    ready(await load(db));
    expect(writes).toBe(0);
  });
});
