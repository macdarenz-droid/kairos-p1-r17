import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { GoalsRoute } from '../src/app/GoalsRoute';
import { saveTradeDiscipline } from '../src/application/discipline';
import { saveGoalsPreference } from '../src/application/goals';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { TradeId } from '../src/domain/trades';
import { GoalsProgressCard } from '../src/features/discipline/GoalsProgressCard';
import { HomeDisciplineCard } from '../src/features/discipline/HomeDisciplineCard';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-goals-rings-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db); return db;
}
const nowText = '2026-10-24T14:30:00.000Z';
const now = () => nowText;
const goal = (id: string) => document.querySelector(`[data-goal="${id}"]`);
const losing = (closedAt: string, exit: string) => ({
  symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: closedAt, closedAt,
  executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: closedAt }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
} as const);

async function journal(): Promise<KairosDatabase> {
  const db = await database();
  await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', nowText);
  expect((await saveGoalsPreference(db, { maxTradesPerDay: '3', lossLimitPerDay: '100', lossLimitPerWeek: '250', lossLimitCurrency: 'USDT', reviewEveryTrade: true, tickEveryStep: true }, { now })).ok).toBe(true);
  const saved = await saveManualTrade(db, losing('2026-10-24T10:00:00.000Z', '60'));
  if (!saved.ok) throw new Error('fixture');
  expect((await saveTradeDiscipline(db, { tradeId: saved.tradeId as TradeId, scope: 'real', half: 'review', answers: [], mistakeIds: [], note: 'calm' })).ok).toBe(true);
  return db;
}

describe('T-058b goals as rings and bars', () => {
  it('the Goals page shows only the goals that are set, each with its words and a ring or bar', async () => {
    const db = await journal();
    const { container } = render(<MemoryRouter><GoalsRoute db={db} now={now} /></MemoryRouter>);
    await waitFor(() => expect(goal('daily-loss')).not.toBeNull());
    expect(goal('daily-loss')).toHaveTextContent('Lost 40 of 100 USDT · 60 left');
    expect(goal('daily-loss')).toHaveAttribute('data-goal-state', 'within');
    expect(goal('weekly-loss')).toHaveTextContent('Lost 40 of 250 USDT · 210 left');
    expect(goal('review-every-trade')).toHaveTextContent('Your 1 closed trade is reviewed');
    expect(goal('tick-every-step')).toHaveTextContent('Every step ticked on 0 of 1 closed trades');
    expect(goal('max-trades-per-day')).toHaveTextContent('1 of 3 allowed · 2 left');
    expect(goal('trades-per-month')).toBeNull();
    expect(document.querySelector('[data-goals-unset]')).toHaveTextContent('Not set yet: Closed trades this month, Result this month. Set them below.');
    expect(goal('daily-loss')!.querySelector('.kairos-progress-bar')).toHaveAttribute('aria-hidden', 'true');
    expect(goal('review-every-trade')!.querySelector('.kairos-progress-ring')).toHaveAttribute('data-tone', 'reached');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('over a limit, the bar turns to "over" with a "!" and the words say so', async () => {
    const db = await journal();
    expect((await saveManualTrade(db, losing('2026-10-24T11:00:00.000Z', '1'))).ok).toBe(true);
    render(<MemoryRouter><GoalsRoute db={db} now={now} /></MemoryRouter>);
    await waitFor(() => expect(goal('daily-loss')).toHaveTextContent('Lost 139 of 100 USDT · over your limit'));
    expect(goal('daily-loss')).toHaveAttribute('data-goal-state', 'over');
    expect(goal('daily-loss')!.querySelector('.kairos-progress-bar')).toHaveAttribute('data-tone', 'over');
    expect(goal('daily-loss')).toHaveTextContent('!');
  });

  it('Analysis and Home say the same, briefly on Home', async () => {
    const db = await journal();
    render(<MemoryRouter><GoalsProgressCard db={db} now={now} /></MemoryRouter>);
    await waitFor(() => expect(goal('daily-loss')).toHaveTextContent('Lost 40 of 100 USDT · 60 left'));
    expect(screen.getByRole('link', { name: 'Set them on the Goals page.' })).toHaveAttribute('href', '/goals');
    cleanup();
    render(<MemoryRouter><HomeDisciplineCard db={db} now={now} /></MemoryRouter>);
    expect(await screen.findByText('Lost today: 40 of 100 USDT')).toBeInTheDocument();
    expect(screen.getByText('Lost this week: 40 of 250 USDT')).toBeInTheDocument();
    expect(screen.getByText('Reviewed: 1 of 1 closed trades')).toBeInTheDocument();
    expect(screen.getByText('Every step ticked: 0 of 1 closed trades')).toBeInTheDocument();
    expect(screen.getByText('Trades opened today: 1 of 3 allowed')).toBeInTheDocument();
  });

  for (const [where, mount, heading] of [
    ['the Goals page', (db: KairosDatabase) => <GoalsRoute db={db} now={now} />, { level: 1, name: 'Goals' }],
    ['Analysis', (db: KairosDatabase) => <GoalsProgressCard db={db} now={now} />, { level: 2, name: 'Your goals' }],
    ['Home', (db: KairosDatabase) => <HomeDisciplineCard db={db} now={now} />, { level: 3, name: 'Your discipline and goals' }],
  ] as const) {
    it(`a failed read on ${where} offers "Try again", which reads again and gives the heading the focus`, async () => {
      const db = await journal();
      db.close();
      render(<MemoryRouter>{mount(db)}</MemoryRouter>);
      const retry = await screen.findByRole('button', { name: 'Try again' });
      await db.open();
      fireEvent.click(retry);
      await waitFor(() => expect(screen.getByRole('heading', heading)).toHaveFocus());
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });
  }
});
