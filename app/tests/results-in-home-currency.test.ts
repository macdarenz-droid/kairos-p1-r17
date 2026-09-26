import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { loadMissingExchangeRates, loadResultsInHomeCurrency } from '../src/application/currency/resultsInHomeCurrency';
import { loadGoalsProgress, writeGoalsPreference } from '../src/application/goals';
import { listJournalClosedTradesInPeriod, listJournalHistory, listJournalVisualPnlDailySummary } from '../src/application/journal';
import { loadTradePatterns } from '../src/application/patterns/loadTradePatterns';
import { loadPracticeMoney, savePracticeMoney } from '../src/application/practice/practiceMoney';
import { savePracticeTrade } from '../src/application/practice/savePracticeTrade';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { exchangeRateId, type ExchangeRateRecord } from '../src/domain/calculations/currencyConversion';
import type { DecimalString, TradeId } from '../src/domain/trades';

const NOW = '2026-09-20T12:00:00.000Z';
const openedAt = '2026-09-18T09:00:00.000Z';
const closedAt = '2026-09-18T10:00:00.000Z';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-home-totals-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', NOW)).ok).toBe(true);
  return db;
}

function trade(symbol: string, marketType: SaveManualTradeInput['marketType'], currency: string | null, quantity: string, entry: string, exit: string): SaveManualTradeInput {
  return {
    symbol, marketType, side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: currency,
    plan: { plannedEntryPrice: null, plannedStopPrice: null, plannedTargetPrice: null, plannedQuantity: null },
    executions: [{ type: 'entry', price: entry, quantity, executedAt: openedAt }, { type: 'exit', price: exit, quantity, executedAt: closedAt }],
    fees: [],
  } as SaveManualTradeInput;
}
const EURO = trade('BTCEUR', 'crypto', 'EUR', '10', '100', '102.45');
const PENCE = trade('VOD.L', 'stock', 'GBX', '1000', '70', '75');
const COIN = trade('BTCUSDT', 'crypto', 'USDT', '1', '100', '112.5');
const DOLLAR = trade('AAPL', 'stock', 'USD', '10', '187.5', '190');

async function save(db: KairosDatabase, input: SaveManualTradeInput): Promise<TradeId> {
  const saved = await saveManualTrade(db, input);
  if (!saved.ok) throw new Error(`fixture ${input.symbol}: ${JSON.stringify(saved)}`);
  return saved.tradeId;
}
async function practice(db: KairosDatabase, input: SaveManualTradeInput): Promise<void> {
  const saved = await savePracticeTrade(db, input);
  if (!saved.ok) throw new Error(`practice fixture ${input.symbol}`);
}
const bank = (to: string, rate: string, day = '2026-09-18'): ExchangeRateRecord => ({ id: exchangeRateId('ecb', 'EUR', to, day), source: 'ecb', from: 'EUR', to, day, rateDay: day, rate: rate as DecimalString, savedAt: NOW });
async function fourTrades(db: KairosDatabase, rateDay = '2026-09-18') {
  const ids = { euro: await save(db, EURO), pence: await save(db, PENCE), coin: await save(db, COIN), dollar: await save(db, DOLLAR) };
  await db.exchangeRates.bulkPut([bank('USD', '1.146', rateDay), bank('GBP', '0.8588', rateDay)]);
  return ids;
}
async function closedEntries(db: KairosDatabase) {
  const period = await listJournalClosedTradesInPeriod(db, { timeZone: 'UTC', fromDayKey: null, toDayKey: null });
  if (!period.ok) throw new Error(period.reason);
  return period.entries;
}
const home = (db: KairosDatabase, currency: string, usdStablecoins: string[] = []) => saveHomeCurrency(db, { currency, usdStablecoins }, { now: () => NOW });

describe('T-045e results in the home currency', () => {
  it('changes nothing without a home currency', async () => {
    const db = await database();
    await fourTrades(db);
    const entries = await closedEntries(db);
    const result = await loadResultsInHomeCurrency(db, entries);
    expect(result.homeCurrency).toBeNull();
    expect(result.entries).toBe(entries);
    expect(result.missing).toEqual([]);
    const daily = await listJournalVisualPnlDailySummary(db, 'UTC');
    expect(daily.days[0]!.summary).toMatchObject({ available: false, reason: 'mixed-currencies' });
    expect(daily.inHomeCurrency).toEqual({ homeCurrency: null, convertedTrades: 0, tradesMissingRate: 0, missing: [] });
  });

  it('converts with the day rates and lists what is missing', async () => {
    const db = await database();
    const ids = await fourTrades(db);
    await home(db, 'USD');
    const result = await loadResultsInHomeCurrency(db, await closedEntries(db));
    expect(result.byTrade[ids.euro]).toMatchObject({ kind: 'converted', amount: '28.08', currency: 'USD' });
    expect(result.byTrade[ids.pence]).toMatchObject({ kind: 'converted', amount: '66.72', currency: 'USD' });
    expect(result.byTrade[ids.coin]).toEqual({ kind: 'missing-rate', from: 'USDT', to: 'USD', day: '2026-09-18' });
    expect(result.byTrade[ids.dollar]).toEqual({ kind: 'home' });
    expect(result.missing).toEqual([{ from: 'USDT', to: 'USD', day: '2026-09-18', trades: 1 }]);
    expect(result).toMatchObject({ convertedTrades: 2, tradesMissingRate: 1 });
    expect(result.entries.find((entry) => entry.trade.id === ids.euro)!.visualPnl).toEqual({ outcome: 'profit', label: 'Profit', amount: '28.08', currency: 'USD', source: 'net-pnl' });
    const history = await listJournalHistory(db);
    expect(history.find((entry) => entry.trade.id === ids.euro)!.visualPnl).toMatchObject({ amount: '24.5', currency: 'EUR' });
    expect((await listJournalVisualPnlDailySummary(db, 'UTC')).days[0]!.summary).toMatchObject({ available: false, reason: 'mixed-currencies' });
  });

  it('adds up one total when every result converts', async () => {
    const db = await database();
    await fourTrades(db);
    await home(db, 'USD', ['USDT']);
    const daily = await listJournalVisualPnlDailySummary(db, 'UTC');
    expect(daily.days[0]!.summary).toMatchObject({ available: true, currency: 'USD', total: '132.3', tradeCount: 4 });
    expect(daily.inHomeCurrency).toEqual({ homeCurrency: 'USD', convertedTrades: 3, tradesMissingRate: 0, missing: [] });
  });

  it('never uses another day', async () => {
    const db = await database();
    const ids = await fourTrades(db, '2026-09-17');
    await home(db, 'USD');
    const result = await loadResultsInHomeCurrency(db, await closedEntries(db));
    expect(result.byTrade[ids.euro]).toMatchObject({ kind: 'missing-rate', day: '2026-09-18' });
    expect(result.byTrade[ids.pence]).toMatchObject({ kind: 'missing-rate', day: '2026-09-18' });
  });

  it('leaves results with no or a damaged currency out of the missing list', async () => {
    const db = await database();
    const none = await save(db, trade('ETHEUR', 'crypto', null, '1', '100', '110'));
    const odd = await save(db, trade('SOLEUR', 'crypto', 'EUR', '1', '100', '110'));
    const stored = (await db.trades.get(odd))!;
    await db.trades.put({ ...stored, grossPnlCurrency: '50 USD' });
    await home(db, 'USD');
    const result = await loadResultsInHomeCurrency(db, await closedEntries(db));
    expect(result.byTrade[none]).toEqual({ kind: 'not-convertible' });
    expect(result.byTrade[odd]).toEqual({ kind: 'not-convertible' });
    expect(result.missing).toEqual([]);
  });
});

describe('T-045e goals, practice money and patterns', () => {
  it('counts a goal set in the home currency with converted results', async () => {
    const db = await database();
    await fourTrades(db);
    await home(db, 'USD', ['USDT']);
    const metadata = createKairosRepositories(db).metadata;
    expect((await writeGoalsPreference(metadata, { monthlyResultTargetAmount: '200', monthlyResultTargetCurrency: 'USD' }, NOW)).ok).toBe(true);
    const goals = await loadGoalsProgress(db, NOW);
    if (goals.kind !== 'ready') throw new Error(goals.kind);
    expect(goals.progress).toMatchObject({ monthlyResult: { kind: 'progress', current: '132.3', remaining: '67.7' } });
    expect(goals.inHomeCurrency?.convertedTrades).toBe(3);
    await writeGoalsPreference(metadata, { monthlyResultTargetAmount: '200', monthlyResultTargetCurrency: 'EUR' }, NOW);
    const euro = await loadGoalsProgress(db, NOW);
    if (euro.kind !== 'ready') throw new Error(euro.kind);
    expect(euro.progress).toMatchObject({ monthlyResult: { kind: 'unavailable', reason: 'no-comparable-days' } });
    expect(euro.inHomeCurrency).toBeNull();
  });

  it('keeps goals as today with no home currency', async () => {
    const db = await database();
    await fourTrades(db);
    await writeGoalsPreference(createKairosRepositories(db).metadata, { monthlyResultTargetAmount: '200', monthlyResultTargetCurrency: 'USD' }, NOW);
    const goals = await loadGoalsProgress(db, NOW);
    if (goals.kind !== 'ready') throw new Error(goals.kind);
    expect(goals.progress).toMatchObject({ monthlyResult: { kind: 'unavailable', reason: 'no-comparable-days' } });
    expect(goals.inHomeCurrency).toBeNull();
  });

  it('counts practice money in the home currency', async () => {
    const db = await database();
    await practice(db, EURO);
    await db.exchangeRates.put(bank('USD', '1.146'));
    expect((await savePracticeMoney(db, { startAmount: '1000', currency: 'USD' })).ok).toBe(true);
    await home(db, 'USD');
    expect(await loadPracticeMoney(db)).toMatchObject({ kind: 'ready', resultSoFar: '28.08', currentAmount: '1028.08' });
    await home(db, 'EUR');
    expect(await loadPracticeMoney(db)).toMatchObject({ kind: 'unavailable', reason: 'other-currency' });
  });

  it('gives patterns results in the home currency', async () => {
    const db = await database();
    await fourTrades(db);
    for (let index = 0; index < 10; index += 1) await save(db, EURO);
    await home(db, 'USD', ['USDT']);
    const patterns = await loadTradePatterns(db, { now: NOW });
    if (patterns.kind !== 'ready') throw new Error(patterns.kind);
    expect(patterns.inHomeCurrency.homeCurrency).toBe('USD');
    expect(patterns.projection.overall.total).toMatchObject({ available: true, currency: 'USD' });
  });

  it('lists the missing rates of real and practice trades', async () => {
    const db = await database();
    await fourTrades(db);
    await home(db, 'EUR');
    expect(await loadMissingExchangeRates(db)).toEqual({ homeCurrency: 'EUR', convertedTrades: 2, tradesMissingRate: 1, missing: [{ from: 'USDT', to: 'EUR', day: '2026-09-18', trades: 1 }] });
    await practice(db, trade('7203.T', 'stock', 'JPY', '100', '2500', '2510'));
    expect((await loadMissingExchangeRates(db)).missing).toEqual([
      { from: 'JPY', to: 'EUR', day: '2026-09-18', trades: 1 },
      { from: 'USDT', to: 'EUR', day: '2026-09-18', trades: 1 },
    ]);
  });
});
