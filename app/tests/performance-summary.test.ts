import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { listJournalClosedTradesInPeriod } from '../src/application/journal/closedTradePeriodQuery';
import type { JournalHistoryEntry } from '../src/application/journal/historyQuery';
import { summarizePerformance } from '../src/application/performance/performanceSummary';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { DecimalString } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-performance-summary-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

interface TradeSpec { exit: string; entry?: string; currency?: string | null; stop?: string; minutes?: number; entered?: string; exited?: string; exitFirst?: boolean }

let order = 0;
async function entriesFor(specs: readonly TradeSpec[]): Promise<JournalHistoryEntry[]> {
  const db = await database();
  for (const spec of specs) {
    order += 1;
    const opened = new Date(Date.UTC(2026, 8, 14, 0, 0) + order * 86_400_000);
    const closed = new Date(opened.getTime() + (spec.minutes ?? 60) * 60_000);
    const [entryAt, exitAt] = spec.exitFirst ? [closed.toISOString(), opened.toISOString()] : [opened.toISOString(), closed.toISOString()];
    const currency = spec.currency === undefined ? 'USDT' : spec.currency;
    const saved = await saveManualTrade(db, {
      symbol: currency === 'EUR' ? 'BTCEUR' : 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed',
      openedAt: opened.toISOString(), closedAt: closed.toISOString(), ...(currency ? { grossPnlCurrency: currency } : {}),
      ...(spec.stop ? { plan: { plannedEntryPrice: spec.entry ?? '100', plannedStopPrice: spec.stop, plannedQuantity: '1' } } : {}),
      executions: [
        { type: 'entry', price: spec.entry ?? '100', quantity: spec.entered ?? '1', executedAt: entryAt },
        { type: 'exit', price: spec.exit, quantity: spec.exited ?? '1', executedAt: exitAt },
      ],
    });
    if (!saved.ok) throw new Error(`fixture ${JSON.stringify(saved)}`);
  }
  const listed = await listJournalClosedTradesInPeriod(db, { timeZone: 'UTC', fromDayKey: null, toDayKey: null });
  if (!listed.ok) throw new Error('fixture');
  return [...listed.entries];
}
const results = (exits: readonly string[]): TradeSpec[] => exits.map(exit => ({ exit }));

describe('T-050d your numbers for a period, part 1', () => {
  it('works out the averages, "for every 1 you lost", and the best and worst trade; a trade with no result changes only the counts', async () => {
    const five = await entriesFor(results(['110', '120', '95', '100', '85']));
    const six = await entriesFor([...results(['110', '120', '95', '100', '85']), { exit: '110', entered: '2', exited: '1' }]);
    const summary = summarizePerformance(six);
    expect(summary.tradeCount).toBe(6);
    expect(summary.outcomes).toMatchObject({ won: 2, lost: 2, breakEven: 1, noResult: 1, resultCount: 5, tradeCount: 6 });
    expect(summary.averageWin).toEqual({ available: true, amount: '15', shown: '15', currency: 'USDT', tradeCount: 2 });
    expect(summary.averageLoss).toEqual({ available: true, amount: '-10', shown: '-10', currency: 'USDT', tradeCount: 2 });
    expect(summary.averageResult).toEqual({ available: true, amount: '2', shown: '2', currency: 'USDT', tradeCount: 5 });
    expect(summary.profitFactor).toEqual({ available: true, value: '1.5', shown: '1.5', tradeCount: 4 });
    expect(summary.bestTrade).toMatchObject({ available: true, amount: '20', currency: 'USDT', tradeCount: 5 });
    expect(summary.worstTrade).toMatchObject({ available: true, amount: '-15', currency: 'USDT', tradeCount: 5 });
    expect(Object.isFrozen(summary) && Object.isFrozen(summary.averageWin) && Object.isFrozen(summary.outcomes)).toBe(true);

    const without = summarizePerformance(five);
    const { tradeCount: _a, outcomes: withOutcomes, bestTrade: bestWith, worstTrade: worstWith, averageTime: timeWith, biggestDip: dipWith, longestWinStreak: winsWith, longestLossStreak: lossesWith, ...restWith } = summary;
    const { tradeCount: _b, outcomes: withoutOutcomes, bestTrade: bestWithout, worstTrade: worstWithout, averageTime: timeWithout, biggestDip: dipWithout, longestWinStreak: winsWithout, longestLossStreak: lossesWithout, ...restWithout } = without;
    expect(restWith).toEqual(restWithout);
    // T-050e (D189): the biggest dip needs every result, and the runs count the trade without a result apart.
    expect(dipWith).toEqual({ available: false, reason: 'unavailable-trade-outcome', tradeCount: 6 });
    expect(dipWithout).toMatchObject({ available: true, amount: '20', tradeCount: 5 });
    expect([winsWith, lossesWith]).toMatchObject([{ available: true, length: 2, tradeCount: 6, tradesWithoutResult: 1 }, { available: true, length: 1, tradeCount: 6, tradesWithoutResult: 1 }]);
    expect([winsWithout, lossesWithout]).toMatchObject([{ available: true, length: 2, tradeCount: 5, tradesWithoutResult: 0 }, { available: true, length: 1, tradeCount: 5, tradesWithoutResult: 0 }]);
    // Time is not a result: the partly closed trade has a start and an end, so it is one more timed trade of the same hour.
    expect([timeWith, timeWithout]).toMatchObject([{ averageMs: 3_600_000, tradeCount: 6 }, { averageMs: 3_600_000, tradeCount: 5 }]);
    expect({ ...withOutcomes, noResult: 0, tradeCount: 5 }).toEqual(withoutOutcomes);
    expect([bestWith.available && bestWith.amount, worstWith.available && worstWith.amount]).toEqual([bestWithout.available && bestWithout.amount, worstWithout.available && worstWithout.amount]);
  });

  it('shows averages to the most places among the results (D193)', async () => {
    const thirds = summarizePerformance(await entriesFor(results(['110', '110', '111'])));
    expect(thirds.averageWin.available && thirds.averageWin.amount.startsWith('10.333')).toBe(true);
    expect(thirds.averageWin).toMatchObject({ shown: '10' });
    expect(summarizePerformance(await entriesFor(results(['110.5', '110', '111']))).averageWin).toMatchObject({ shown: '10.5' });
    expect(summarizePerformance(await entriesFor(results(['100.01', '100.02', '100.02']))).averageWin).toMatchObject({ shown: '0.02' });
  });

  it('never divides by zero: only wins, only losses, and a loss the home currency rounded to 0', async () => {
    expect(summarizePerformance(await entriesFor(results(['110', '120']))).profitFactor).toEqual({ available: false, reason: 'no-losses', tradeCount: 2 });
    expect(summarizePerformance(await entriesFor(results(['95', '90']))).profitFactor).toEqual({ available: true, value: '0', shown: '0', tradeCount: 2 });
    const [win, loss] = await entriesFor(results(['110', '95']));
    const roundedLoss = { ...loss, visualPnl: { ...loss.visualPnl, outcome: 'loss' as const, amount: '0' as DecimalString } };
    expect(summarizePerformance([win, roundedLoss]).profitFactor).toEqual({ available: false, reason: 'no-losses', tradeCount: 2 });
  });

  it('on a tie picks the best and the worst trade that closed first', async () => {
    const entries = await entriesFor(results(['120', '85', '120', '85']));
    const firstClosed = (amount: string) => entries.filter(entry => entry.visualPnl.amount === amount)
      .reduce((a, b) => (Date.parse(a.trade.closedAt ?? '') <= Date.parse(b.trade.closedAt ?? '') ? a : b));
    const summary = summarizePerformance(entries);
    expect(summary.bestTrade).toMatchObject({ available: true, amount: '20', tradeId: firstClosed('20').trade.id });
    expect(summary.worstTrade).toMatchObject({ available: true, amount: '-15', tradeId: firstClosed('-15').trade.id });
  });

  it('works from one trade', async () => {
    const summary = summarizePerformance(await entriesFor(results(['107'])));
    expect(summary.averageWin).toMatchObject({ available: true, amount: '7', tradeCount: 1 });
    expect(summary.averageLoss).toEqual({ available: false, reason: 'no-trades', tradeCount: 0 });
    expect(summary.averageResult).toMatchObject({ available: true, amount: '7', tradeCount: 1 });
    expect(summary.profitFactor).toMatchObject({ available: false, reason: 'no-losses' });
    expect(summary.bestTrade).toEqual(summary.worstTrade);
    expect(summary.bestTrade).toMatchObject({ available: true, amount: '7' });
  });

  it('gives no money number across currencies or without a currency, and still gives the counts, × what you risked and time', async () => {
    const mixed = summarizePerformance(await entriesFor([{ exit: '110', stop: '95' }, { exit: '120' }, { exit: '1.1', entry: '1', currency: 'EUR' }]));
    for (const number of [mixed.averageWin, mixed.averageLoss, mixed.averageResult, mixed.profitFactor, mixed.bestTrade, mixed.worstTrade]) {
      expect(number).toMatchObject({ available: false, reason: 'mixed-currencies' });
    }
    expect(mixed.averageWin.tradeCount).toBe(3);
    expect(mixed.outcomes).toMatchObject({ won: 3, resultCount: 3 });
    expect(mixed.averageTimesRisked).toMatchObject({ available: true, tradeCount: 1 });
    expect(mixed.averageTime).toMatchObject({ available: true, tradeCount: 3 });
    const unknown = summarizePerformance(await entriesFor([{ exit: '110' }, { exit: '120', currency: null }]));
    expect(unknown.averageResult).toMatchObject({ available: false, reason: 'missing-currency-evidence' });
  });

  it('averages × what you risked over the trades that have one', async () => {
    const summary = summarizePerformance(await entriesFor([{ exit: '110', stop: '95' }, { exit: '95', stop: '95' }, { exit: '120' }]));
    expect(summary.averageTimesRisked).toEqual({ available: true, value: '0.5', shown: '0.5', tradeCount: 2 });
  });

  it('averages the time in a trade and leaves out a trade whose exit is before its entry', async () => {
    expect(summarizePerformance(await entriesFor([{ exit: '110', minutes: 60 }, { exit: '110', minutes: 180 }])).averageTime)
      .toEqual({ available: true, averageMs: 7_200_000, tradeCount: 2, tradesWithBadTimes: 0 });
    expect(summarizePerformance(await entriesFor([{ exit: '110', minutes: 60 }, { exit: '110', minutes: 180 }, { exit: '110', minutes: 30, exitFirst: true }])).averageTime)
      .toEqual({ available: true, averageMs: 7_200_000, tradeCount: 2, tradesWithBadTimes: 1 });
  });

  it('says "no trades" for an empty list', () => {
    const summary = summarizePerformance([]);
    expect(summary.tradeCount).toBe(0);
    for (const number of [summary.averageWin, summary.averageLoss, summary.averageResult, summary.profitFactor, summary.bestTrade, summary.worstTrade, summary.averageTimesRisked, summary.averageTime]) {
      expect(number).toMatchObject({ available: false, reason: 'no-trades', tradeCount: 0 });
    }
  });
});
