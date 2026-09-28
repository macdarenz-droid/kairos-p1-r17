import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { loadPerformanceSummary } from '../src/application/performance/loadPerformanceSummary';
import { savePracticeTrade } from '../src/application/practice/savePracticeTrade';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { exchangeRateId, type ExchangeRateRecord } from '../src/domain/calculations/currencyConversion';
import type { DecimalString } from '../src/domain/trades';

const NOW = '2026-10-20T12:00:00.000Z';
const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(timeZone: string | null = 'UTC'): Promise<KairosDatabase> {
  const name = `kairos-load-performance-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  if (timeZone !== null) expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, timeZone, NOW)).ok).toBe(true);
  return db;
}

function trade(symbol: string, currency: string, entry: string, exit: string, closed: string): SaveManualTradeInput {
  const open = new Date(Date.parse(closed) - 3_600_000).toISOString();
  return {
    symbol, marketType: symbol === 'AAPL' ? 'stock' : 'crypto', side: 'long', status: 'closed', openedAt: open, closedAt: closed, grossPnlCurrency: currency,
    executions: [{ type: 'entry', price: entry, quantity: '1', executedAt: open }, { type: 'exit', price: exit, quantity: '1', executedAt: closed }],
  } as SaveManualTradeInput;
}
const AUGUST = trade('BTCUSDT', 'USDT', '100', '90', '2026-08-31T10:00:00.000Z');
const SEPT_A = trade('BTCUSDT', 'USDT', '100', '110', '2026-09-01T10:00:00.000Z');
const SEPT_B = trade('BTCUSDT', 'USDT', '100', '95', '2026-09-30T10:00:00.000Z');
const OCTOBER = trade('BTCUSDT', 'USDT', '100', '130', '2026-10-01T10:00:00.000Z');
const bank = (to: string, rate: string, day = '2026-09-18'): ExchangeRateRecord => ({ id: exchangeRateId('ecb', 'EUR', to, day), source: 'ecb', from: 'EUR', to, day, rateDay: day, rate: rate as DecimalString, savedAt: NOW });

async function saveAll(db: KairosDatabase, inputs: readonly SaveManualTradeInput[], practice = false): Promise<void> {
  for (const input of inputs) {
    const saved = practice ? await savePracticeTrade(db, input) : await saveManualTrade(db, input);
    if (!saved.ok) throw new Error(`fixture ${input.symbol}: ${JSON.stringify(saved)}`);
  }
}

describe('T-050e reading a period for your numbers', () => {
  it('needs a saved time zone only for a bounded period', async () => {
    const db = await database(null);
    await saveAll(db, [SEPT_A]);
    expect(await loadPerformanceSummary(db, { fromDayKey: '2026-09-01', toDayKey: null })).toEqual({ kind: 'time-zone-unconfigured' });
    const all = await loadPerformanceSummary(db, { fromDayKey: null, toDayKey: null });
    expect(all).toMatchObject({ kind: 'ready', timeZone: null, fromDayKey: null, toDayKey: null, summary: { tradeCount: 1 } });
  });

  it('holds only the trades closed in the period, in the saved time zone', async () => {
    const db = await database();
    await saveAll(db, [AUGUST, SEPT_A, SEPT_B, OCTOBER]);
    const september = await loadPerformanceSummary(db, { fromDayKey: '2026-09-01', toDayKey: '2026-10-01' });
    if (september.kind !== 'ready') throw new Error(september.kind);
    expect(september.timeZone).toBe('UTC');
    expect(september.summary.tradeCount).toBe(2);
    expect(september.summary.averageResult).toMatchObject({ available: true, amount: '2.5', currency: 'USDT', tradeCount: 2 });
    expect(september.summary.biggestDip).toMatchObject({ available: true, amount: '5' });
  });

  it('refuses a badly written day without throwing', async () => {
    const db = await database();
    expect(await loadPerformanceSummary(db, { fromDayKey: '2026-9-1', toDayKey: null })).toEqual({ kind: 'unavailable', reason: 'invalid-day-key' });
  });

  it('reads only practice trades for the practice scope', async () => {
    const db = await database();
    await saveAll(db, [SEPT_A]);
    await saveAll(db, [SEPT_B, OCTOBER], true);
    const practice = await loadPerformanceSummary(db, { fromDayKey: null, toDayKey: null, scope: 'practice' });
    if (practice.kind !== 'ready') throw new Error(practice.kind);
    expect(practice.summary.tradeCount).toBe(2);
    expect(practice.summary.bestTrade).toMatchObject({ available: true, amount: '30' });
    const real = await loadPerformanceSummary(db, { fromDayKey: null, toDayKey: null });
    expect(real).toMatchObject({ kind: 'ready', summary: { tradeCount: 1 } });
  });

  it('puts the money numbers in the home currency when the rate is saved, and not across currencies without it', async () => {
    const trades = [trade('BTCEUR', 'EUR', '100', '110', '2026-09-18T10:00:00.000Z'), trade('AAPL', 'USD', '100', '111.46', '2026-09-18T11:00:00.000Z')];
    const withRate = await database();
    await saveAll(withRate, trades);
    await withRate.exchangeRates.bulkPut([bank('USD', '1.146')]);
    expect((await saveHomeCurrency(withRate, { currency: 'EUR', usdStablecoins: [] }, { now: () => NOW })).ok).toBe(true);
    const converted = await loadPerformanceSummary(withRate, { fromDayKey: null, toDayKey: null });
    if (converted.kind !== 'ready') throw new Error(converted.kind);
    expect(converted.inHomeCurrency).toMatchObject({ homeCurrency: 'EUR', convertedTrades: 1, tradesMissingRate: 0 });
    expect(converted.summary.averageResult).toMatchObject({ available: true, currency: 'EUR', tradeCount: 2 });

    const withoutRate = await database();
    await saveAll(withoutRate, trades);
    expect((await saveHomeCurrency(withoutRate, { currency: 'EUR', usdStablecoins: [] }, { now: () => NOW })).ok).toBe(true);
    const missing = await loadPerformanceSummary(withoutRate, { fromDayKey: null, toDayKey: null });
    if (missing.kind !== 'ready') throw new Error(missing.kind);
    expect(missing.inHomeCurrency).toMatchObject({ convertedTrades: 0, tradesMissingRate: 1 });
    expect(missing.summary.averageResult).toMatchObject({ available: false, reason: 'mixed-currencies' });
    expect(missing.summary.biggestDip).toMatchObject({ available: false, reason: 'mixed-currencies' });
  });
});
