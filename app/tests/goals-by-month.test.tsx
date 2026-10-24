import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { projectDisciplineScore, projectDisciplineTrend } from '../src/application/discipline/disciplineScore';
import { EMPTY_GOALS_PREFERENCE, projectGoalsMonths, projectLimitsCalendar, saveGoalsPreference, type GoalsPreference, type GoalsSettings } from '../src/application/goals';
import type { JournalHistoryEntry } from '../src/application/journal';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { DisciplineMistakeMark, TradeDisciplineId, TradeDisciplineRecord } from '../src/domain/discipline';
import type { DecimalString, TradeId } from '../src/domain/trades';
import { DisciplineOverview } from '../src/features/discipline/DisciplineOverview';
import { GoalsByMonth } from '../src/features/discipline/GoalsByMonth';
import { LimitsCalendar } from '../src/features/discipline/LimitsCalendar';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });

const d = (value: string) => value as DecimalString;
function trade(id: string, closedAt: string, amount: string | null): JournalHistoryEntry {
  const record = { id, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', openedAt: closedAt, closedAt, createdAt: closedAt, updatedAt: closedAt } as unknown as JournalHistoryEntry['trade'];
  const visualPnl = amount === null
    ? { outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' }
    : { outcome: amount.startsWith('-') ? 'loss' : 'profit', label: amount.startsWith('-') ? 'Loss' : 'Profit', amount, currency: 'USDT', source: 'net-pnl' };
  return { trade: record, plans: [], executions: [], fees: [], metrics: null, metricsError: null, visualPnl } as unknown as JournalHistoryEntry;
}
function review(tradeId: string, reviewed: boolean, ticked: boolean, mistakes: DisciplineMistakeMark[] = []): TradeDisciplineRecord {
  const at = '2026-10-20T10:00:00.000Z';
  return {
    id: `d-${tradeId}` as TradeDisciplineId, tradeId: tradeId as TradeId, preTradeChecklist: [{ itemId: 'plan', label: 'I have a plan', answer: ticked ? 'yes' : 'no' }],
    postTradeReview: [], mistakes, note: '', checklistCompletedAt: at, reviewedAt: reviewed ? at : null, createdAt: at, updatedAt: at,
  };
}
const goals = (overrides: Partial<GoalsPreference>): GoalsPreference => ({
  ...EMPTY_GOALS_PREFERENCE, tradesPerMonthTarget: 2, maxTradesPerDay: 2, monthlyResultTarget: { amount: d('50'), currency: 'USDT' },
  lossLimits: { currency: 'USDT', perDay: d('100'), perWeek: d('250') }, reviewEveryTrade: true, tickEveryStep: true, ...overrides,
});
const settings: GoalsSettings = { periods: [{ from: '2026-08-15', goals: goals({}) }, { from: '2026-10-10', goals: goals({ tradesPerMonthTarget: 4 }) }] };
const entries = [
  trade('s1', '2026-09-03T10:00:00.000Z', '40'), trade('s2', '2026-09-04T10:00:00.000Z', '20'),
  trade('o1', '2026-10-05T10:00:00.000Z', '-120'), trade('o2', '2026-10-06T10:00:00.000Z', '10'), trade('o3', '2026-10-13T10:00:00.000Z', null),
];
const stop = { itemId: 'moved-stop', label: 'Moved my stop' };
const records = new Map([review('s1', true, true, [stop]), review('s2', false, true), review('o1', true, false, [stop])].map(item => [item.tradeId as string, item]));
const todayKey = '2026-10-24';
const calendar = projectLimitsCalendar({ settings, entries, inHome: null, timeZone: 'UTC', todayKey, firstMonthKey: '2025-11' });
const ids: Record<string, string[]> = { '2026-09': ['s1', 's2'], '2026-10': ['o1', 'o2', 'o3'] };
const scoreMonths = calendar.map(month => ({ monthKey: month.monthKey, score: projectDisciplineScore({ closedTradeIds: ids[month.monthKey] ?? [], records }) }));
const months = projectGoalsMonths({ settings, calendar, closedEntries: entries, inHome: null, scores: new Map(scoreMonths.map(month => [month.monthKey, month.score])), checklistSteps: 1, timeZone: 'UTC', todayKey });
const trend = { 6: projectDisciplineTrend({ months: scoreMonths, window: 6 }), 12: projectDisciplineTrend({ months: scoreMonths, window: 12 }) };
const tiles = () => within(screen.getByRole('list', { name: 'Months' })).getAllByRole('button');

describe('T-058e month by month on the Goals page', () => {
  it('shows a tile per month, oldest first, each named with its goals kept', async () => {
    const { container } = render(<GoalsByMonth months={months} trend={trend} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Month by month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '6 months' })).toHaveAttribute('aria-pressed', 'true');
    expect(tiles().map(tile => tile.getAttribute('aria-label'))).toEqual([
      'May 2026: no goals then', 'June 2026: no goals then', 'July 2026: no goals then',
      'August 2026: 0 of 1 goal kept, 1 missed',
      'September 2026: 6 of 7 goals kept, 1 missed',
      "October 2026: 0 of 7 goals kept, 1 missed, 5 in progress, 1 Kairos can't tell",
    ]);
    expect(within(tiles()[4]!).getByText('6 of 7')).toBeInTheDocument();
    expect(within(tiles()[5]!).getByText('Oct')).toBeInTheDocument();
    expect(screen.getByText('Each month is judged by the goals you had then. Review an old trade and its month updates.')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('lists a tapped month\'s goals in plain words', () => {
    render(<GoalsByMonth months={months} trend={trend} />);
    fireEvent.click(screen.getByRole('button', { name: /^October 2026/ }));
    expect(screen.getByRole('button', { name: /^October 2026/ })).toHaveAttribute('aria-pressed', 'true');
    const details = screen.getByRole('heading', { level: 3, name: 'October 2026 (so far)' }).parentElement!;
    expect([...details.querySelectorAll('p')].map(line => line.textContent)).toEqual([
      'Closed trades: in progress · 3 of 4',
      'Result this month: in progress · -110 of 50 USDT (1 day in another currency or without a result)',
      'Review every trade: in progress · 1 of 3 reviewed',
      'Tick every step: in progress · 0 of 3',
      'Most trades in a day: in progress',
      'Most I can lose in a day: missed on 1 day',
      "Most I can lose in a week: Kairos can't tell: 1 trade has no result in USDT",
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'September 2026: 6 of 7 goals kept, 1 missed' }));
    expect(screen.getByRole('heading', { level: 3, name: 'September 2026' })).toBeInTheDocument();
    expect(screen.getByText('Review every trade: missed · 1 of 2 reviewed')).toBeInTheDocument();
    expect(screen.getByText('Result this month: kept · 60 of 50 USDT')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'June 2026: no goals then' }));
    expect(screen.getByText('No goals then.')).toBeInTheDocument();
  });

  it('draws the score by month with a text twin, and the common mistakes with bars', () => {
    render(<GoalsByMonth months={months} trend={trend} />);
    expect(screen.getByText('May no closed trades · June no closed trades · July no closed trades · August no closed trades · September 75 · October 17')).toBeInTheDocument();
    const mistake = screen.getByText('Moved my stop').closest('li')!;
    expect(within(mistake).getByText((_, element) => element?.tagName === 'P' && element.textContent === 'Moved my stop · 2 times in 6 months')).toBeInTheDocument();
    expect(within(mistake).getByText('May no reviews · June no reviews · July no reviews · August no reviews · September 1 · October 1')).toBeInTheDocument();
  });

  it('switches to 12 months and keeps focus on the switch', () => {
    render(<GoalsByMonth months={months} trend={trend} />);
    const twelve = screen.getByRole('button', { name: '12 months' });
    twelve.focus();
    fireEvent.click(twelve);
    expect(twelve).toHaveFocus();
    expect(twelve).toHaveAttribute('aria-pressed', 'true');
    expect(tiles()).toHaveLength(12);
    expect(tiles()[0]).toHaveAccessibleName('November 2025: no goals then');
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === 'Moved my stop · 2 times in 12 months')).toBeInTheDocument();
  });

  it('says when there is no score and no mistake yet', () => {
    const empty = calendar.map(month => ({ monthKey: month.monthKey, score: projectDisciplineScore({ closedTradeIds: [], records }) }));
    render(<GoalsByMonth months={months} trend={{ 6: projectDisciplineTrend({ months: empty, window: 6 }), 12: projectDisciplineTrend({ months: empty, window: 12 }) }} />);
    expect(screen.getByText('Your score appears for months with a closed trade.')).toBeInTheDocument();
    expect(screen.getByText('No mistakes tagged in your reviews in these months.')).toBeInTheDocument();
  });

  it('shows on the Goals page from the same read as the calendar, even with no limit set', async () => {
    const name = `kairos-goals-by-month-${crypto.randomUUID()}`; names.push(name);
    const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
    await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', '2026-09-01T00:00:00.000Z');
    expect((await saveGoalsPreference(db, { tradesPerMonthTarget: '1' }, { now: () => '2026-09-01T00:00:00.000Z' })).ok).toBe(true);
    expect((await saveManualTrade(db, {
      symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-10T10:00:00.000Z', closedAt: '2026-09-10T10:00:00.000Z',
      executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-10T10:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-10T10:00:00.000Z' }],
    })).ok).toBe(true);
    render(<MemoryRouter><LimitsCalendar db={db} now={() => '2026-10-24T14:30:00.000Z'} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { level: 2, name: 'Month by month' })).toBeInTheDocument();
    expect(screen.getByText('Set a limit below, such as the most you can lose in a day, to see your limits calendar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'September 2026: 1 of 1 goal kept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'October 2026: 0 of 1 goal kept, 1 in progress' })).toBeInTheDocument();
  });

  it('Analysis › Discipline links to the Goals page under the score', async () => {
    const name = `kairos-goals-by-month-${crypto.randomUUID()}`; names.push(name);
    const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
    render(<MemoryRouter><DisciplineOverview db={db} now={() => '2026-10-24T14:30:00.000Z'} refreshRevision={0} /></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'See your goals and score month by month' });
    expect(link).toHaveAttribute('href', '/goals');
    const score = screen.getByRole('heading', { level: 2, name: 'Your discipline this month' });
    expect(score.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 2, name: 'Your goals' })).toBeInTheDocument();
    expect(link.compareDocumentPosition(screen.getByRole('heading', { level: 2, name: 'Your goals' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
