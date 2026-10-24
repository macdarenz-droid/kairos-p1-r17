import { describe, expect, it } from 'vitest';
import { projectDisciplineScore } from '../src/application/discipline/disciplineScore';
import { EMPTY_GOALS_PREFERENCE, projectGoalsMonths, projectLimitsCalendar, type GoalsPreference, type GoalsSettings } from '../src/application/goals';
import type { JournalHistoryEntry } from '../src/application/journal';
import type { TradeDisciplineId, TradeDisciplineRecord } from '../src/domain/discipline';
import type { DecimalString, TradeId } from '../src/domain/trades';

const d = (value: string) => value as DecimalString;
function trade(id: string, closedAt: string, amount: string | null): JournalHistoryEntry {
  const record = { id, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', openedAt: closedAt, closedAt, createdAt: closedAt, updatedAt: closedAt } as unknown as JournalHistoryEntry['trade'];
  const visualPnl = amount === null
    ? { outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' }
    : { outcome: amount.startsWith('-') ? 'loss' : 'profit', label: amount.startsWith('-') ? 'Loss' : 'Profit', amount, currency: 'USDT', source: 'net-pnl' };
  return { trade: record, plans: [], executions: [], fees: [], metrics: null, metricsError: null, visualPnl } as unknown as JournalHistoryEntry;
}
function review(tradeId: string, reviewed: boolean, ticked: boolean): TradeDisciplineRecord {
  const at = '2026-10-20T10:00:00.000Z';
  return {
    id: `d-${tradeId}` as TradeDisciplineId, tradeId: tradeId as TradeId, preTradeChecklist: [{ itemId: 'plan', label: 'I have a plan', answer: ticked ? 'yes' : 'no' }],
    postTradeReview: [], mistakes: [], note: '', checklistCompletedAt: at, reviewedAt: reviewed ? at : null, createdAt: at, updatedAt: at,
  };
}

const goals = (overrides: Partial<GoalsPreference>): GoalsPreference => ({
  ...EMPTY_GOALS_PREFERENCE, tradesPerMonthTarget: 2, maxTradesPerDay: 2, monthlyResultTarget: { amount: d('50'), currency: 'USDT' },
  lossLimits: { currency: 'USDT', perDay: d('100'), perWeek: d('250') }, reviewEveryTrade: true, tickEveryStep: true, ...overrides,
});
// The first goals start mid-August; on 10 October the closed-trades target goes up to 4.
const settings: GoalsSettings = { periods: [{ from: '2026-08-15', goals: goals({}) }, { from: '2026-10-10', goals: goals({ tradesPerMonthTarget: 4 }) }] };
const entries = [
  trade('s1', '2026-09-03T10:00:00.000Z', '40'), trade('s2', '2026-09-04T10:00:00.000Z', '20'),
  // 5 October is over the day limit; 13 October has a trade without a result.
  trade('o1', '2026-10-05T10:00:00.000Z', '-120'), trade('o2', '2026-10-06T10:00:00.000Z', '10'), trade('o3', '2026-10-13T10:00:00.000Z', null),
];
const todayKey = '2026-10-24';
const calendar = projectLimitsCalendar({ settings, entries, inHome: null, timeZone: 'UTC', todayKey, firstMonthKey: '2026-07' });

function months(records: TradeDisciplineRecord[], checklistSteps = 1) {
  const byId = new Map(records.map(item => [item.tradeId as string, item]));
  const scores = new Map([['2026-09', ['s1', 's2']], ['2026-10', ['o1', 'o2', 'o3']]].map(([key, ids]) => [key as string, projectDisciplineScore({ closedTradeIds: ids as string[], records: byId })]));
  return projectGoalsMonths({ settings, calendar, closedEntries: entries, inHome: null, scores, checklistSteps, timeZone: 'UTC', todayKey });
}
const month = (list: ReturnType<typeof months>, key: string) => list.find(item => item.monthKey === key)!;
const states = (list: ReturnType<typeof months>, key: string) => Object.fromEntries(month(list, key).goals!.map(item => [item.goal, item.state]));

describe('T-058e goals kept month by month', () => {
  it('has no goals before the first period, and judges a month that started part way by the goals at its end', () => {
    const list = months([]);
    expect(list.map(item => item.monthKey)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(month(list, '2026-07')).toMatchObject({ goals: null, judged: 0 });
    expect(month(list, '2026-10').goals!.find(item => item.goal === 'trades-per-month')).toEqual({ goal: 'trades-per-month', state: 'in-progress', current: 3, target: 4 });
  });

  it('a month without trades misses only "closed trades"; the rest have nothing to judge', () => {
    expect(states(months([]), '2026-08')).toEqual({
      'trades-per-month': 'missed', 'monthly-result': 'no-trades', 'review-every-trade': 'no-trades', 'tick-every-step': 'no-trades',
      'max-trades-per-day': 'no-trades', 'daily-loss': 'no-trades', 'weekly-loss': 'no-trades',
    });
    expect(month(months([]), '2026-08')).toMatchObject({ kept: 0, missed: 1, judged: 1 });
  });

  it('an old review turns a past month kept', () => {
    const before = months([review('s1', true, true), review('s2', false, true)]);
    expect(month(before, '2026-09')).toMatchObject({ kept: 6, missed: 1, inProgress: 0, unknown: 0, judged: 7 });
    expect(month(before, '2026-09').goals!.find(item => item.goal === 'review-every-trade')).toEqual({ goal: 'review-every-trade', state: 'missed', reviewed: 1, closed: 2 });
    const after = months([review('s1', true, true), review('s2', true, true)]);
    expect(month(after, '2026-09')).toMatchObject({ kept: 7, missed: 0, judged: 7 });
    expect(month(after, '2026-09').goals!.find(item => item.goal === 'monthly-result')).toMatchObject({ state: 'kept', current: '60', target: '50' });
  });

  it('this month: a broken limit is final, the rest are in progress, and "can\'t tell" stays apart', () => {
    const list = months([]);
    expect(states(list, '2026-10')).toEqual({
      'trades-per-month': 'in-progress', 'monthly-result': 'in-progress', 'review-every-trade': 'in-progress', 'tick-every-step': 'in-progress',
      'max-trades-per-day': 'in-progress', 'daily-loss': 'missed', 'weekly-loss': 'unknown',
    });
    const goalsOf = month(list, '2026-10').goals!;
    expect(goalsOf.find(item => item.goal === 'daily-loss')).toMatchObject({ missedDays: 1 });
    expect(goalsOf.find(item => item.goal === 'weekly-loss')).toMatchObject({ missedWeeks: 0, uncounted: 1, currency: 'USDT' });
    expect(month(list, '2026-10')).toMatchObject({ thisMonth: true, kept: 0, missed: 1, inProgress: 5, unknown: 1, judged: 7 });
  });

  it('the month result leaves out days without a result and says how many (D116)', () => {
    expect(month(months([]), '2026-10').goals!.find(item => item.goal === 'monthly-result')).toEqual({
      goal: 'monthly-result', state: 'in-progress', current: '-110', target: '50', currency: 'USDT', incompleteDays: 1,
    });
  });

  it('"tick every step" can\'t be judged while the checklist has no steps', () => {
    expect(month(months([], 0), '2026-09').goals!.find(item => item.goal === 'tick-every-step')).toMatchObject({ state: 'unknown' });
  });
});
