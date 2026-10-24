import { describe, expect, it } from 'vitest';
import type { ResultsInHomeCurrency } from '../src/application/currency/resultsInHomeCurrency';
import { EMPTY_GOALS_PREFERENCE, projectGoalsProgress } from '../src/application/goals';
import { judgeLoss, projectCountedDays, projectLossOver } from '../src/application/goals/lossLimits';
import type { JournalHistoryEntry } from '../src/application/journal';
import type { DecimalString } from '../src/domain/trades';

const d = (value: string) => value as DecimalString;
function closed(id: string, closedAt: string, amount: string | null, currency: string | null = 'USDT'): JournalHistoryEntry {
  const trade = { id, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', openedAt: closedAt, closedAt, createdAt: closedAt, updatedAt: closedAt } as unknown as JournalHistoryEntry['trade'];
  const visualPnl = amount === null
    ? { outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' }
    : { outcome: amount.startsWith('-') ? 'loss' : 'profit', label: amount.startsWith('-') ? 'Loss' : 'Profit', amount, currency, source: 'net-pnl' };
  return { trade, plans: [], executions: [], fees: [], metrics: null, metricsError: null, visualPnl } as unknown as JournalHistoryEntry;
}
const days = (entries: JournalHistoryEntry[], currency = 'USDT', inHome: ResultsInHomeCurrency | null = null) => projectCountedDays({ entries, inHome, currency, timeZone: 'UTC' });

describe('T-058b what was lost in a day or a week', () => {
  it('a day is its net after fees: wins count against losses, and a day in profit lost nothing', () => {
    const counted = days([
      closed('a', '2026-10-21T09:00:00.000Z', '50'), closed('b', '2026-10-21T11:00:00.000Z', '-90'),
      closed('c', '2026-10-22T09:00:00.000Z', '10'),
    ]);
    expect(counted.get('2026-10-21')).toEqual({ kind: 'counted', dayKey: '2026-10-21', total: '-40', lost: '40', closedTrades: 2 });
    expect(counted.get('2026-10-22')).toEqual({ kind: 'counted', dayKey: '2026-10-22', total: '10', lost: '0', closedTrades: 1 });
    expect(counted.has('2026-10-23')).toBe(false);
  });

  it('at the limit is still inside; one cent over is over', () => {
    expect(judgeLoss(d('99.99'), d('100'))).toBe('within');
    expect(judgeLoss(d('100'), d('100'))).toBe('at-limit');
    expect(judgeLoss(d('100.01'), d('100'))).toBe('over');
  });

  it("a missing result, another currency or a missing rate makes the day, and its week from then on, can't tell", () => {
    const entries = [
      closed('ok', '2026-10-20T09:00:00.000Z', '-30'),
      closed('none', '2026-10-21T09:00:00.000Z', null), closed('fine', '2026-10-21T10:00:00.000Z', '-5'),
      closed('usd', '2026-10-22T09:00:00.000Z', '-5', 'USD'),
    ];
    const counted = days(entries);
    expect(counted.get('2026-10-21')).toEqual({ kind: 'unknown', dayKey: '2026-10-21', closedTrades: 2, uncounted: 1 });
    expect(counted.get('2026-10-22')).toEqual({ kind: 'unknown', dayKey: '2026-10-22', closedTrades: 1, uncounted: 1 });
    expect(projectLossOver(counted, '2026-10-19', '2026-10-20')).toEqual({ kind: 'counted', total: '-30', lost: '30', closedTrades: 1 });
    expect(projectLossOver(counted, '2026-10-19', '2026-10-25')).toEqual({ kind: 'unknown', closedTrades: 4, uncounted: 2 });
    // In the home currency the converted results count; a trade still missing its rate does not.
    const inHome = {
      homeCurrency: 'EUR', convertedTrades: 1, tradesMissingRate: 1, missing: [], byTrade: {},
      entries: [closed('eur', '2026-10-20T09:00:00.000Z', '-26', 'EUR'), closed('norate', '2026-10-21T09:00:00.000Z', '-5', 'USDT')],
    } as unknown as ResultsInHomeCurrency;
    const home = days(entries, 'EUR', inHome);
    expect(home.get('2026-10-20')).toMatchObject({ kind: 'counted', lost: '26' });
    expect(home.get('2026-10-21')).toMatchObject({ kind: 'unknown', uncounted: 1 });
  });

  it('a week runs Monday to Sunday in the saved time zone, across a month end, and a known trade-count break is unaffected', () => {
    // Sunday 1 November 2026 in New York; its week began on Monday 26 October.
    const now = '2026-11-01T18:00:00.000Z';
    const entries = [
      closed('mon', '2026-10-26T15:00:00.000Z', '-100'),
      // 23:30 on Sunday 25 October in New York: the week before.
      closed('before', '2026-10-26T03:30:00.000Z', '-500'),
      closed('sun', '2026-11-01T16:00:00.000Z', '-50'),
    ];
    const preference = { ...EMPTY_GOALS_PREFERENCE, maxTradesPerDay: 1, lossLimits: { currency: 'USDT', perDay: d('100'), perWeek: d('120') } };
    const progress = projectGoalsProgress({ preference, entries, timeZone: 'America/New_York', now });
    if (progress.kind !== 'ready') throw new Error('not ready');
    expect(progress.weekFromDayKey).toBe('2026-10-26');
    expect(progress.dailyLoss).toEqual({ kind: 'counted', limit: '100', currency: 'USDT', lost: '50', left: '50', state: 'within', fill: 50, closedTrades: 1 });
    expect(progress.weeklyLoss).toEqual({ kind: 'counted', limit: '120', currency: 'USDT', lost: '150', left: '0', state: 'over', fill: 100, closedTrades: 2 });
    // A day that can't be counted leaves the trade limit as it is.
    const unknown = projectGoalsProgress({ preference, entries: [...entries, closed('x', '2026-11-01T17:00:00.000Z', null)], timeZone: 'America/New_York', now });
    if (unknown.kind !== 'ready') throw new Error('not ready');
    expect(unknown.dailyLoss).toEqual({ kind: 'unknown', limit: '100', currency: 'USDT', uncounted: 1 });
    expect(unknown.maxTradesPerDay).toMatchObject({ kind: 'limit', today: 2, exceeded: true });
  });
});
