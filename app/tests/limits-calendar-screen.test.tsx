import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGoalsHistory, saveGoalsPreference } from '../src/application/goals';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { LimitsCalendar } from '../src/features/discipline/LimitsCalendar';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-limits-calendar-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db); return db;
}
const nowText = '2026-10-24T14:30:00.000Z';
const now = () => nowText;
const closed = (closedAt: string, exit: string) => ({
  symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: closedAt, closedAt,
  executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: closedAt }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
} as const);

async function journal(): Promise<KairosDatabase> {
  const db = await database();
  await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', '2026-09-01T00:00:00.000Z');
  expect((await saveGoalsPreference(db, { maxTradesPerDay: '3', lossLimitPerDay: '100', lossLimitPerWeek: '250', lossLimitCurrency: 'USDT' }, { now: () => '2026-09-01T00:00:00.000Z' })).ok).toBe(true);
  // 30 September: -10. 14 October: -40. 15 October: -99 and -5, so 104 that day and 144 that week.
  for (const [at, exit] of [['2026-09-30T10:00:00.000Z', '90'], ['2026-10-14T10:00:00.000Z', '60'], ['2026-10-15T10:00:00.000Z', '1'], ['2026-10-15T11:00:00.000Z', '95']] as const) {
    expect((await saveManualTrade(db, closed(at, exit))).ok).toBe(true);
  }
  return db;
}

describe('T-058d the 12-month read', () => {
  it('starts on the Monday on or before the first month, counts open trades, and needs a time zone', async () => {
    const db = await journal();
    expect(await loadGoalsHistory(await database(), { now: nowText })).toEqual({ kind: 'time-zone-unconfigured' });
    expect((await saveManualTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-10-15T12:00:00.000Z' })).ok).toBe(true);
    const history = await loadGoalsHistory(db, { now: nowText });
    if (history.kind !== 'ready') throw new Error('not ready');
    expect(history.calendar.map(month => month.monthKey)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    const day = (key: string) => history.calendar.flatMap(month => month.days).find(item => item.dayKey === key)!;
    expect(day('2026-10-15')).toMatchObject({ state: 'over', trades: { opened: 3 }, dayLoss: { lost: '104', state: 'over' } });
    expect(day('2026-09-30')).toMatchObject({ state: 'inside', dayLoss: { lost: '10' } });
    expect(day('2026-10-14')).toMatchObject({ state: 'inside', dayLoss: { lost: '40' } });
  });
});

describe('T-058d the limits calendar on the Goals page', () => {
  it('marks each day, names it, and shows a tapped day with a link to its trades', async () => {
    const db = await journal();
    const { container } = render(<MemoryRouter><LimitsCalendar db={db} now={now} /></MemoryRouter>);
    const over = await screen.findByRole('button', { name: '15 October: over a limit' });
    expect(screen.getByRole('button', { name: '14 October: inside your limits' })).toBeInTheDocument();
    expect(screen.getByText('16 October: no trades')).toBeInTheDocument();
    expect(screen.getByText('25 October')).toBeInTheDocument();
    expect(screen.getByText('October 2026 so far: 1 day inside your limits, 1 over, 0 Kairos can\'t tell.')).toBeInTheDocument();
    fireEvent.click(over);
    const details = screen.getByRole('heading', { level: 3, name: 'Thursday 15 October' }).parentElement!;
    expect(within(details).getByText('Trades: 2 of 3 allowed · 1 left')).toBeInTheDocument();
    expect(within(details).getByText('Lost that day: 104 of 100 USDT · over your limit')).toBeInTheDocument();
    expect(within(details).getByText('Lost that week so far: 144 of 250 USDT')).toBeInTheDocument();
    expect(within(details).getByRole('link', { name: "See this day's trades" })).toHaveAttribute('href', '/analysis?period=custom&first=2026-10-15&last=2026-10-15');
    expect(over).toHaveAttribute('aria-pressed', 'true');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('goes back month by month within the 12 months, never past this one', async () => {
    const db = await journal();
    render(<MemoryRouter><LimitsCalendar db={db} now={now} /></MemoryRouter>);
    const next = await screen.findByRole('button', { name: 'Next month' });
    expect(next).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(next);
    expect(screen.getByText('October 2026', { selector: '.kairos-limits__month' })).toBeInTheDocument();
    const previous = screen.getByRole('button', { name: 'Previous month' });
    fireEvent.click(previous);
    expect(screen.getByText('September 2026', { selector: '.kairos-limits__month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 September: inside your limits' })).toBeInTheDocument();
    expect(screen.getByText('September 2026: 1 day inside your limits, 0 over, 0 Kairos can\'t tell.')).toBeInTheDocument();
    for (let step = 0; step < 12; step += 1) fireEvent.click(previous);
    expect(screen.getByText('November 2025', { selector: '.kairos-limits__month' })).toBeInTheDocument();
    expect(previous).toHaveAttribute('aria-disabled', 'true');
    expect(previous).toBeEnabled();
  });

  it('says how to start when no limit is set, and offers "Try again" when the read fails', async () => {
    const empty = await database();
    await writeVisualPnlTimeZonePreference(createKairosRepositories(empty).metadata, 'UTC', nowText);
    render(<MemoryRouter><LimitsCalendar db={empty} now={now} /></MemoryRouter>);
    expect(await screen.findByText('Set a limit below, such as the most you can lose in a day, to see your limits calendar.')).toBeInTheDocument();
    cleanup();
    const db = await journal();
    db.close();
    render(<MemoryRouter><LimitsCalendar db={db} now={now} /></MemoryRouter>);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    await db.open();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Your limits calendar' })).toHaveFocus());
  });
});
