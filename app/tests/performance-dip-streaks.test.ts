import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { listJournalClosedTradesInPeriod } from '../src/application/journal/closedTradePeriodQuery';
import type { JournalHistoryEntry } from '../src/application/journal/historyQuery';
import { summarizePerformance } from '../src/application/performance/performanceSummary';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-performance-dip-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

interface TradeSpec { exit: string; currency?: string; exited?: string }

let order = 0;
/** Each trade enters 1 at 100 and closes one day after the one before, so the exit price minus 100 is its result. */
async function entriesFor(specs: readonly TradeSpec[]): Promise<JournalHistoryEntry[]> {
  const db = await database();
  for (const spec of specs) {
    order += 1;
    const opened = new Date(Date.UTC(2026, 8, 14, 0, 0) + order * 86_400_000);
    const closed = new Date(opened.getTime() + 3_600_000);
    const currency = spec.currency ?? 'USDT';
    const saved = await saveManualTrade(db, {
      symbol: currency === 'EUR' ? 'BTCEUR' : 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed',
      openedAt: opened.toISOString(), closedAt: closed.toISOString(), grossPnlCurrency: currency,
      executions: [
        { type: 'entry', price: '100', quantity: '1', executedAt: opened.toISOString() },
        { type: 'exit', price: spec.exit, quantity: spec.exited ?? '1', executedAt: closed.toISOString() },
      ],
    });
    if (!saved.ok) throw new Error(`fixture ${JSON.stringify(saved)}`);
  }
  const listed = await listJournalClosedTradesInPeriod(db, { timeZone: 'UTC', fromDayKey: null, toDayKey: null });
  if (!listed.ok) throw new Error('fixture');
  return [...listed.entries];
}
const results = (exits: readonly string[]): TradeSpec[] => exits.map(exit => ({ exit }));

describe('T-050e your numbers for a period, part 2: the biggest dip and the most wins and losses in a row', () => {
  it('finds the biggest fall from a high point, from the trade at the high to the trade at the low', async () => {
    const entries = await entriesFor(results(['110', '95', '120', '70', '105']));
    const summary = summarizePerformance(entries);
    expect(summary.biggestDip).toEqual({ available: true, amount: '30', currency: 'USDT', fromTradeId: entries[2].trade.id, toTradeId: entries[3].trade.id, tradeCount: 5 });
    expect(summary.longestWinStreak).toEqual({ available: true, length: 1, firstTradeId: entries[0].trade.id, lastTradeId: entries[0].trade.id, tradeCount: 5, tradesWithoutResult: 0 });
    expect(summary.longestLossStreak).toEqual({ available: true, length: 1, firstTradeId: entries[1].trade.id, lastTradeId: entries[1].trade.id, tradeCount: 5, tradesWithoutResult: 0 });
  });

  it('measures a fall from the start of the period', async () => {
    const entries = await entriesFor(results(['90', '95']));
    const summary = summarizePerformance(entries);
    expect(summary.biggestDip).toMatchObject({ available: true, amount: '15', fromTradeId: null, toTradeId: entries[1].trade.id });
    expect(summary.longestLossStreak).toMatchObject({ available: true, length: 2, firstTradeId: entries[0].trade.id, lastTradeId: entries[1].trade.id });
    expect(summary.longestWinStreak).toMatchObject({ available: true, length: 0, firstTradeId: null, lastTradeId: null });
  });

  it('gives a dip of 0 with no trades named when there are only wins', async () => {
    expect(summarizePerformance(await entriesFor(results(['110', '120']))).biggestDip)
      .toEqual({ available: true, amount: '0', currency: 'USDT', fromTradeId: null, toTradeId: null, tradeCount: 2 });
  });

  it('works from one trade', async () => {
    const entries = await entriesFor(results(['96']));
    const summary = summarizePerformance(entries);
    expect(summary.biggestDip).toMatchObject({ available: true, amount: '4', fromTradeId: null, toTradeId: entries[0].trade.id, tradeCount: 1 });
    expect(summary.longestLossStreak).toMatchObject({ available: true, length: 1, tradeCount: 1 });
  });

  it('gives no dip when a trade has no result or the results are not in one currency', async () => {
    const partly = summarizePerformance(await entriesFor([{ exit: '110' }, { exit: '110', exited: '0.5' }]));
    expect(partly.biggestDip).toEqual({ available: false, reason: 'unavailable-trade-outcome', tradeCount: 2 });
    expect(partly.longestWinStreak).toMatchObject({ available: true, length: 1, tradeCount: 2, tradesWithoutResult: 1 });
    const mixed = summarizePerformance(await entriesFor([{ exit: '110' }, { exit: '90', currency: 'EUR' }]));
    expect(mixed.biggestDip).toEqual({ available: false, reason: 'mixed-currencies', tradeCount: 2 });
  });

  it('gives no run at all, never a length of 0, when no trade has a result', async () => {
    const summary = summarizePerformance(await entriesFor([{ exit: '110', exited: '0.5' }, { exit: '90', exited: '0.5' }]));
    expect(summary.longestWinStreak).toEqual({ available: false, reason: 'no-trades', tradeCount: 2, tradesWithoutResult: 2 });
    expect(summary.longestLossStreak).toEqual({ available: false, reason: 'no-trades', tradeCount: 2, tradesWithoutResult: 2 });
  });
});
