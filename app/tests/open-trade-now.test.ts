import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { listJournalHistory, type JournalHistoryEntry } from '../src/application/journal/historyQuery';
import type { PriceNowResult } from '../src/application/market-reference/priceNow';
import { describeTimesRisked } from '../src/application/performance/tradeRisk';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { projectOpenTradeNow } from '../src/application/trades/openTradeNow';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { DecimalString } from '../src/domain/trades';

const OPENED = '2026-10-24T08:00:00.000Z';
const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });

async function database(): Promise<KairosDatabase> {
  const name = `kairos-open-trade-now-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}

type Fill = readonly [type: 'entry' | 'exit', price: string, quantity: string];
function open(fills: readonly Fill[], options: { side?: 'long' | 'short'; stop?: string | null; currency?: string | null; marketType?: SaveManualTradeInput['marketType']; symbol?: string; fees?: { amount: string; currency: string }[]; contractSize?: string } = {}): SaveManualTradeInput {
  return {
    symbol: options.symbol ?? 'BTCUSDT', marketType: options.marketType ?? 'crypto', side: options.side ?? 'long', status: 'open', openedAt: OPENED,
    grossPnlCurrency: options.currency === undefined ? 'USDT' : options.currency,
    plan: { plannedEntryPrice: null, plannedStopPrice: options.stop ?? null, plannedTargetPrice: null, plannedQuantity: null },
    executions: fills.map(([type, price, quantity], index) => ({ type, price, quantity, executedAt: new Date(Date.parse(OPENED) + index * 60_000).toISOString() })),
    fees: options.fees ?? [],
    ...(options.contractSize === undefined ? {} : { contractSize: options.contractSize }),
  };
}

/** The trade as the Journal reads it back: the saved rows and their metrics. */
async function saved(input: SaveManualTradeInput, db?: KairosDatabase): Promise<JournalHistoryEntry> {
  const store = db ?? await database();
  const result = await saveManualTrade(store, input);
  if (!result.ok) throw new Error(`fixture: ${JSON.stringify(result)}`);
  const entry = (await listJournalHistory(store, { status: 'open' })).find(item => item.trade.id === result.tradeId);
  if (entry === undefined) throw new Error('fixture: not read back');
  return entry;
}

function price(value: string, quote: string | null = 'USDT'): PriceNowResult {
  return { ok: true, price: value as DecimalString, at: '2026-10-25T11:59:00.000Z', source: 'binance', market: 'BTCUSDT', midPrice: false, futures: false, quote };
}

describe('T-061c an open trade at the price now (D268)', () => {
  it('a long trade: the result after fees if the open part closed at the price now, and × what you risked', async () => {
    const entry = await saved(open([['entry', '64000', '0.1']], { stop: '62000' }));
    const now = projectOpenTradeNow(entry, price('64210.5'));
    expect(now).toEqual({ ok: true, amount: '21.05', currency: 'USDT', outcome: 'profit', timesRisked: '0.10525' });
    if (!now.ok || now.timesRisked === null) return;
    expect(describeTimesRisked(now.timesRisked)).toBe('+0.11× what you risked');
  });

  it('a short trade gains when the price falls and loses when it rises', async () => {
    const entry = await saved(open([['entry', '2500', '2']], { side: 'short', stop: '2600', symbol: 'ETHUSDT' }));
    expect(projectOpenTradeNow(entry, price('2450'))).toEqual({ ok: true, amount: '100', currency: 'USDT', outcome: 'profit', timesRisked: '0.5' });
    expect(projectOpenTradeNow(entry, price('2650'))).toEqual({ ok: true, amount: '-300', currency: 'USDT', outcome: 'loss', timesRisked: '-1.5' });
    expect(projectOpenTradeNow(entry, price('2500'))).toMatchObject({ ok: true, amount: '0', outcome: 'breakeven' });
  });

  it('a partly closed trade closes only what is still open, and keeps the part already closed', async () => {
    const entry = await saved(open([['entry', '100', '2'], ['exit', '110', '1']], { stop: '95' }));
    // 110 for the first coin, 120 for the second, 200 paid: +30.
    expect(projectOpenTradeNow(entry, price('120'))).toEqual({ ok: true, amount: '30', currency: 'USDT', outcome: 'profit', timesRisked: '3' });
  });

  it('takes off the fees saved so far; the closing fee is not known, so none is made up', async () => {
    const entry = await saved(open([['entry', '100', '2'], ['exit', '110', '1']], { stop: '95', fees: [{ amount: '1', currency: 'USDT' }, { amount: '0.5', currency: 'USDT' }] }));
    expect(projectOpenTradeNow(entry, price('120'))).toEqual({ ok: true, amount: '28.5', currency: 'USDT', outcome: 'profit', timesRisked: '2.85' });
  });

  it('has no result when a fee is in another currency', async () => {
    const entry = await saved(open([['entry', '64000', '0.1']], { stop: '62000', fees: [{ amount: '0.01', currency: 'BNB' }] }));
    expect(projectOpenTradeNow(entry, price('64210.5'))).toEqual({ ok: false, reason: 'no-result' });
  });

  it('works nothing out when the price is in another currency than the trade, or either currency is unknown', async () => {
    const entry = await saved(open([['entry', '64000', '0.1']], { stop: '62000' }));
    expect(projectOpenTradeNow(entry, price('64210.5', 'USDC'))).toEqual({ ok: false, reason: 'different-currency' });
    expect(projectOpenTradeNow(entry, price('64210.5', null))).toEqual({ ok: false, reason: 'different-currency' });
    const noCurrency = await saved(open([['entry', '64000', '0.1']], { currency: null }));
    expect(projectOpenTradeNow(noCurrency, price('64210.5'))).toEqual({ ok: false, reason: 'different-currency' });
  });

  it('a futures trade needs how much one point is worth; a stablecoin perpetual or a saved point value has it', async () => {
    const db = await database();
    const noPoint = await saved(open([['entry', '5000', '2']], { marketType: 'futures', symbol: 'ESZ6', currency: 'USD', stop: '4990' }), db);
    expect(projectOpenTradeNow(noPoint, price('5010', 'USD'))).toEqual({ ok: false, reason: 'no-result' });
    const pointValue = await saved(open([['entry', '5000', '2']], { marketType: 'futures', symbol: 'ESZ6', currency: 'USD', stop: '4990', contractSize: '50' }), db);
    expect(projectOpenTradeNow(pointValue, price('5010', 'USD'))).toEqual({ ok: true, amount: '1000', currency: 'USD', outcome: 'profit', timesRisked: '1' });
    const perpetual = await saved(open([['entry', '64000', '0.1']], { marketType: 'futures' }), db);
    expect(projectOpenTradeNow(perpetual, price('64210.5'))).toMatchObject({ ok: true, amount: '21.05', currency: 'USDT' });
  });

  it('gives the result without × what you risked when no stop is set', async () => {
    const entry = await saved(open([['entry', '64000', '0.1']]));
    expect(projectOpenTradeNow(entry, price('63000'))).toEqual({ ok: true, amount: '-100', currency: 'USDT', outcome: 'loss', timesRisked: null });
  });

  it('says why there is nothing: a failed price, or no open part', async () => {
    const entry = await saved(open([['entry', '64000', '0.1']], { stop: '62000' }));
    expect(projectOpenTradeNow(entry, { ok: false, why: 'offline', retryAfterSeconds: null, note: null, source: { provider: 'binance' } })).toEqual({ ok: false, reason: 'price-unavailable' });
    const noEntry = await saved(open([]));
    expect(projectOpenTradeNow(noEntry, price('64210.5'))).toEqual({ ok: false, reason: 'no-open-part' });
  });

  it('stores nothing and changes nothing it was given', async () => {
    const db = await database();
    const entry = await saved(open([['entry', '100', '2'], ['exit', '110', '1']], { stop: '95' }), db);
    const before = { executions: await db.tradeExecutions.count(), fees: await db.tradeFees.count(), trades: await db.trades.toArray() };
    const rows = [...entry.executions];
    const metrics = entry.metrics;
    expect(projectOpenTradeNow(entry, price('120'))).toMatchObject({ ok: true, amount: '30' });
    expect(projectOpenTradeNow(entry, price('120'))).toMatchObject({ ok: true, amount: '30' });
    expect(entry.executions).toEqual(rows);
    expect(entry.metrics).toBe(metrics);
    expect(entry.metrics?.remainingQuantity).toBe('1');
    expect({ executions: await db.tradeExecutions.count(), fees: await db.tradeFees.count(), trades: await db.trades.toArray() }).toEqual(before);
    const [again] = await listJournalHistory(db, { status: 'open' });
    expect(again?.metrics?.netPnl).toBeNull();
  });
});
