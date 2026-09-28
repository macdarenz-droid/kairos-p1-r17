import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { listJournalClosedTradesInPeriod } from '../src/application/journal/closedTradePeriodQuery';
import type { JournalHistoryEntry } from '../src/application/journal/historyQuery';
import { summarizePatternTrades } from '../src/application/patterns/tradePatterns';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-pattern-summary-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
async function save(db: KairosDatabase, input: Parameters<typeof saveManualTrade>[1]) {
  const saved = await saveManualTrade(db, input);
  if (!saved.ok) throw new Error('fixture');
}

function closed(symbol: string, currency: string | null, entry: string, exit: string, openedAt: string, closedAt: string, fees?: { amount: string; currency: string }[]) {
  return {
    symbol, marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt, ...(currency ? { grossPnlCurrency: currency } : {}), ...(fees ? { fees } : {}),
    executions: [{ type: 'entry', price: entry, quantity: '1', executedAt: openedAt }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
  } as const;
}

async function fixture(): Promise<{ twelve: JournalHistoryEntry[]; bySymbol: (symbol: string) => JournalHistoryEntry }> {
  const db = await database();
  for (let i = 0; i < 12; i += 1) {
    const exit = i <= 6 ? '110' : i <= 10 ? '95' : '100';
    await save(db, closed('BTCUSDT', 'USDT', '100', exit, '2026-09-14T09:00:00.000Z', `2026-09-14T10:${String(i).padStart(2, '0')}:00.000Z`));
  }
  const later = ['2026-09-15T09:00:00.000Z', '2026-09-15T10:00:00.000Z'] as const;
  await save(db, closed('BTCEUR', 'EUR', '1', '1.1', ...later));
  await save(db, closed('ETHUSDT', null, '100', '110', ...later));
  await save(db, closed('SOLUSDT', 'USDT', '100', '110', ...later, [{ amount: '0.1', currency: 'BNB' }]));
  const result = await listJournalClosedTradesInPeriod(db, { timeZone: 'UTC', fromDayKey: null, toDayKey: null });
  if (!result.ok) throw new Error('fixture');
  const entries = result.entries;
  return { twelve: entries.slice(0, 12), bySymbol: symbol => entries.find(entry => entry.trade.symbol === symbol)! };
}

describe('T-042a how a group of trades went', () => {
  it('counts results, and shows the share won and the total only from 10 trades with a result', async () => {
    const { twelve, bySymbol } = await fixture();
    expect(twelve.every(entry => entry.trade.symbol === 'BTCUSDT')).toBe(true);
    const all = summarizePatternTrades(twelve);
    expect(all).toMatchObject({ tradeCount: 12, won: 7, lost: 4, breakEven: 1, noResult: 0, resultCount: 12, enough: true, wonPercent: 58 });
    expect(all.total).toEqual({ available: true, currency: 'USDT', total: '50', outcome: 'profit', tradeCount: 12 });

    const ten = summarizePatternTrades(twelve.slice(0, 10));
    expect(ten).toMatchObject({ enough: true, wonPercent: 70 });
    expect(ten.total).toMatchObject({ available: true, total: '55' });

    expect(summarizePatternTrades(twelve.slice(0, 9))).toMatchObject({ tradeCount: 9, won: 7, lost: 2, resultCount: 9, enough: false, wonPercent: null, total: null });

    const euro = summarizePatternTrades([...twelve.slice(0, 10), bySymbol('BTCEUR')]);
    expect(euro).toMatchObject({ won: 8, resultCount: 11, wonPercent: 73 });
    expect(euro.total).toMatchObject({ available: false, reason: 'mixed-currencies' });

    const noCurrency = summarizePatternTrades([...twelve.slice(0, 10), bySymbol('ETHUSDT')]);
    expect(noCurrency).toMatchObject({ won: 8 });
    expect(noCurrency.total).toMatchObject({ available: false, reason: 'missing-currency-evidence' });

    const otherFee = summarizePatternTrades([...twelve.slice(0, 10), bySymbol('SOLUSDT')]);
    expect(otherFee).toMatchObject({ noResult: 1, tradeCount: 11, resultCount: 10, wonPercent: 70 });
    expect(otherFee.total).toMatchObject({ available: false, reason: 'unavailable-trade-outcome' });

    for (const summary of [all, ten, euro, noCurrency, otherFee]) expect(Object.isFrozen(summary)).toBe(true);
  });

  it('gives an empty summary for no trades', () => {
    const empty = summarizePatternTrades([]);
    expect(empty).toEqual({ tradeCount: 0, won: 0, lost: 0, breakEven: 0, noResult: 0, resultCount: 0, enough: false, wonPercent: null, total: null });
    expect(Object.isFrozen(empty)).toBe(true);
  });
});
