import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { saveTradeDiscipline } from '../src/application/discipline';
import { loadResultsDashboard, selectResultsEntries, type ResultsDashboardProjection, type ResultsDashboardQueryResult } from '../src/application/performance/resultsDashboard';
import { savePracticeTrade } from '../src/application/practice/savePracticeTrade';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference, type VisualPnlPeriodChoice } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { exchangeRateId } from '../src/domain/calculations/currencyConversion';
import type { DecimalString, TradeId } from '../src/domain/trades';

const NOW = '2026-09-20T12:00:00.000Z';
const now = () => NOW;
const MONTH: VisualPnlPeriodChoice = { kind: 'month', at: null };
const ALL: VisualPnlPeriodChoice = { kind: 'all' };
const AUGUST: VisualPnlPeriodChoice = { kind: 'month', at: '2026-08-01' };

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(zone: string | null = 'UTC'): Promise<KairosDatabase> {
  const name = `kairos-results-dashboard-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  if (zone !== null) expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, zone, NOW)).ok).toBe(true);
  return db;
}

function trade(closedAt: string, exit: string, { currency = 'USDT', symbol = 'BTCUSDT', marketType = 'crypto', entryQuantity = '1', exitQuantity = '1' } = {}): SaveManualTradeInput {
  const openedAt = new Date(Date.parse(closedAt) - 3_600_000).toISOString();
  return {
    symbol, marketType, side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: currency,
    plan: { plannedEntryPrice: null, plannedStopPrice: null, plannedTargetPrice: null, plannedQuantity: null },
    executions: [{ type: 'entry', price: '100', quantity: entryQuantity, executedAt: openedAt }, { type: 'exit', price: exit, quantity: exitQuantity, executedAt: closedAt }],
    fees: [],
  } as SaveManualTradeInput;
}
async function save(db: KairosDatabase, input: SaveManualTradeInput, practice = false): Promise<TradeId> {
  const saved = practice ? await savePracticeTrade(db, input) : await saveManualTrade(db, input);
  if (!saved.ok) throw new Error(`fixture: ${JSON.stringify(saved)}`);
  return saved.tradeId;
}
function ready(result: ResultsDashboardQueryResult): ResultsDashboardProjection {
  if (result.kind !== 'ready') throw new Error(`not ready: ${JSON.stringify(result)}`);
  return result.dashboard;
}
const load = (db: KairosDatabase, choice: VisualPnlPeriodChoice, scope?: 'real' | 'practice') => loadResultsDashboard(db, { choice, now: NOW, ...(scope ? { scope } : {}) });

/** +10, −5, +20 USDT in September and +7 USDT in August. */
async function fourTrades(db: KairosDatabase) {
  const plus10 = await save(db, trade('2026-09-02T10:00:00.000Z', '110'));
  const minus5 = await save(db, trade('2026-09-03T10:00:00.000Z', '95'));
  const plus20 = await save(db, trade('2026-09-05T10:00:00.000Z', '120'));
  const august = await save(db, trade('2026-08-15T10:00:00.000Z', '107'));
  return { plus10, minus5, plus20, august };
}

describe('T-051a the dashboard read', () => {
  it('needs a saved time zone, for all time too', async () => {
    const db = await database(null);
    expect(await load(db, MONTH)).toEqual({ kind: 'time-zone-unconfigured' });
    expect(await load(db, ALL)).toEqual({ kind: 'time-zone-unconfigured' });
  });

  it("gives the period's trades in close order, its total, the U4 numbers and the calendar's months", async () => {
    const db = await database();
    const { plus10, minus5, plus20 } = await fourTrades(db);
    const month = ready(await load(db, MONTH));
    expect(month.entries.map(entry => entry.trade.id)).toEqual([plus10, minus5, plus20]);
    expect(month.total).toEqual({ available: true, currency: 'USDT', total: '25', outcome: 'profit', tradeCount: 3 });
    expect(month.totalBlockers).toEqual({ noResult: [], noCurrency: [], missingRate: [] });
    expect(month.summary.outcomes.won).toBe(2);
    expect(month.calendarMonths).toEqual(['2026-09']);
    expect(month).toMatchObject({ scope: 'real', timeZone: 'UTC', todayKey: '2026-09-20', period: { label: 'September 2026' }, conversions: null });
    expect(month.tradeDays[plus10]).toBe('2026-09-02');
    expect(month.days.days.map(day => day.dayKey)).toEqual(['2026-09-02', '2026-09-03', '2026-09-05']);

    const all = ready(await load(db, ALL));
    expect(all.entries).toHaveLength(4);
    expect(all.total).toMatchObject({ available: true, total: '32', tradeCount: 4 });
    expect(all.calendarMonths).toEqual(['2026-08', '2026-09']);
  });

  it("never offers a calendar month after today's month", async () => {
    const db = await database();
    await fourTrades(db);
    const year = ready(await load(db, { kind: 'year', at: null }));
    expect(year.calendarMonths).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    const empty = ready(await load(await database(), ALL));
    expect(empty.calendarMonths).toEqual(['2026-09']);
  });

  it('passes on a refused period with the zone and today', async () => {
    const db = await database();
    expect(await load(db, { kind: 'custom', firstDayKey: '2026-09-21', lastDayKey: '2026-09-22' })).toEqual({ kind: 'invalid-period', reason: 'after-today', timeZone: 'UTC', todayKey: '2026-09-20' });
  });

  it('names the trades that block the total, and still gives the averages', async () => {
    const db = await database();
    await fourTrades(db);
    const partly = await save(db, trade('2026-09-10T10:00:00.000Z', '110', { entryQuantity: '2', exitQuantity: '1' }));
    const month = ready(await load(db, MONTH));
    expect(month.total).toMatchObject({ available: false, reason: 'unavailable-trade-outcome' });
    expect(month.totalBlockers).toEqual({ noResult: [partly], noCurrency: [], missingRate: [] });
    expect(month.summary.averageWin).toMatchObject({ available: true });
  });

  it('counts in the home currency, and names a trade that still needs a rate', async () => {
    const db = await database();
    await save(db, trade('2026-09-18T10:00:00.000Z', '102', { currency: 'EUR', symbol: 'BTCEUR' }));
    const dollar = await save(db, trade('2026-09-18T11:00:00.000Z', '110', { currency: 'USD', symbol: 'AAPL', marketType: 'stock' }));
    expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);

    const missing = ready(await load(db, MONTH));
    expect(missing.total).toMatchObject({ available: false, reason: 'mixed-currencies' });
    expect(missing.totalBlockers.missingRate).toEqual([dollar]);
    expect(missing.conversions?.[dollar]).toMatchObject({ kind: 'missing-rate', from: 'USD', to: 'EUR' });
    expect(missing.inHomeCurrency).toMatchObject({ homeCurrency: 'EUR', tradesMissingRate: 1 });

    await db.exchangeRates.put({ id: exchangeRateId('ecb', 'EUR', 'USD', '2026-09-18'), source: 'ecb', from: 'EUR', to: 'USD', day: '2026-09-18', rateDay: '2026-09-18', rate: '1.25' as DecimalString, savedAt: NOW });
    const converted = ready(await load(db, MONTH));
    expect(converted.total).toMatchObject({ available: true, currency: 'EUR', tradeCount: 2 });
    expect(converted.conversions?.[dollar]).toMatchObject({ kind: 'converted', currency: 'EUR' });
    expect(converted.totalBlockers).toEqual({ noResult: [], noCurrency: [], missingRate: [] });
  });

  it('gives the current streak over all time, only for a period that holds today', async () => {
    const db = await database();
    await save(db, trade('2026-08-31T10:00:00.000Z', '110'));
    await save(db, trade('2026-09-01T10:00:00.000Z', '105'));
    const streak = { outcome: 'profit', length: 2, startDayKey: '2026-08-31', endDayKey: '2026-09-01' };
    expect(ready(await load(db, MONTH)).currentStreak).toEqual(streak);
    expect(ready(await load(db, ALL)).currentStreak).toEqual(streak);
    expect(ready(await load(db, AUGUST)).currentStreak).toBeNull();
  });

  it("gives the discipline ring over the period's closed trades", async () => {
    const db = await database();
    const first = await save(db, trade('2026-09-02T10:00:00.000Z', '110'));
    await save(db, trade('2026-09-03T10:00:00.000Z', '95'));
    await save(db, trade('2026-08-15T10:00:00.000Z', '107'));
    const reviewed = await saveTradeDiscipline(db, { tradeId: first, scope: 'real', half: 'review', answers: [{ itemId: 'followed-plan', answer: 'yes' }], mistakeIds: [], note: '' }, { now });
    expect(reviewed.ok).toBe(true);
    expect(ready(await load(db, MONTH)).discipline).toMatchObject({ kind: 'ready', score: { available: true, review: { reviewedCount: 1, closedCount: 2 } } });
    expect(ready(await load(db, AUGUST)).discipline).toMatchObject({ kind: 'ready', score: { available: true, review: { reviewedCount: 0, closedCount: 1 } } });
    expect(ready(await load(await database(), MONTH)).discipline).toEqual({ kind: 'ready', score: { available: false, reason: 'no-closed-trades' } });
  });

  it('reads only practice trades for the practice scope', async () => {
    const db = await database();
    const real = await save(db, trade('2026-09-02T10:00:00.000Z', '110'));
    const practice = await save(db, trade('2026-09-04T10:00:00.000Z', '90'), true);
    expect(ready(await load(db, MONTH)).entries.map(entry => entry.trade.id)).toEqual([real]);
    const practiceMonth = ready(await load(db, MONTH, 'practice'));
    expect(practiceMonth.entries.map(entry => entry.trade.id)).toEqual([practice]);
    expect(practiceMonth.scope).toBe('practice');
  });

  it('picks trades for a tap by days or by ids, in close order, without a new read', async () => {
    const db = await database();
    const { plus10, minus5, plus20 } = await fourTrades(db);
    const sameDay = await save(db, trade('2026-09-02T15:00:00.000Z', '101'));
    const month = ready(await load(db, MONTH));
    expect(selectResultsEntries(month, { fromDayKey: '2026-09-02', toDayKey: '2026-09-03' }).map(entry => entry.trade.id)).toEqual([plus10, sameDay]);
    expect(selectResultsEntries(month, { tradeIds: [plus20, minus5] }).map(entry => entry.trade.id)).toEqual([minus5, plus20]);
    expect(selectResultsEntries(month, { fromDayKey: '2026-09-10', toDayKey: '2026-09-11' })).toEqual([]);
  });

  it('is frozen', async () => {
    const db = await database();
    await fourTrades(db);
    const result = await load(db, MONTH);
    const month = ready(result);
    expect(Object.isFrozen(result)).toBe(true);
    for (const part of [month, month.entries, month.tradeDays, month.totalBlockers, month.calendarMonths, month.discipline, month.period]) expect(Object.isFrozen(part)).toBe(true);
  });
});
