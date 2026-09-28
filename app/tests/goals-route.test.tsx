import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { GoalsRoute } from '../src/app/GoalsRoute';
import { readGoalsPreference, writeGoalsPreference } from '../src/application/goals';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
async function database() { const name = `kairos-goals-route-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
const now = () => '2026-09-18T14:30:00.000Z';
const route = () => screen.getByRole('region', { name: 'Goals' });
const mount = (db: Awaited<ReturnType<typeof database>>) => render(<MemoryRouter><GoalsRoute db={db} now={now} /></MemoryRouter>);
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('P26.3 Goals route', () => {
  it('points to Settings while the daily-results time zone is unconfigured, and still lets the user save targets', async () => {
    const db = await database();
    mount(db);
    await waitFor(() => expect(route().getAttribute('data-goals-status')).toBe('time-zone-unconfigured'));
    expect(screen.getByRole('link', { name: 'Set your time zone in Settings' }).getAttribute('href')).toBe('/settings');
    type('Closed trades per month', '12');
    fireEvent.click(screen.getByRole('button', { name: 'Save goals' }));
    await waitFor(() => expect(screen.getByText('Goals saved.')).toBeTruthy());
    expect(await readGoalsPreference(createKairosRepositories(db).metadata)).toEqual({ tradesPerMonthTarget: 12, maxTradesPerDay: null, monthlyResultTarget: null });
  });

  it('shows progress from the journal in the explicit time zone, refreshes after a save, and reports invalid targets without writing', async () => {
    const db = await database();
    const { metadata } = createKairosRepositories(db);
    await writeVisualPnlTimeZonePreference(metadata, 'UTC', now());
    await writeGoalsPreference(metadata, { tradesPerMonthTarget: '2', maxTradesPerDay: '1' }, now());
    await db.trades.put({ id: 'trade-today', symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', source: 'manual', openedAt: '2026-09-18T09:00:00.000Z', closedAt: null, createdAt: '2026-09-18T09:00:00.000Z', updatedAt: '2026-09-18T09:00:00.000Z' } as never);
    mount(db);
    await waitFor(() => expect(route().getAttribute('data-goals-status')).toBe('ready'));
    expect(route().querySelector('[data-goals-progress="ready"]')!.getAttribute('data-goals-month')).toBe('2026-09');
    expect(route().querySelector('[data-goal="trades-per-month"]')!.textContent).toContain('0 of 2 · 2 to go');
    expect(route().querySelector('[data-goal="max-trades-per-day"]')!.getAttribute('data-goal-state')).toBe('at-limit');
    expect(route().querySelector('[data-goal="max-trades-per-day"]')!.textContent).toContain('1 of 1 allowed · at your limit');
    expect(route().querySelector('[data-goal="monthly-result"]')!.textContent).toContain('No result target set.');
    expect((screen.getByLabelText('Closed trades per month') as HTMLInputElement).value).toBe('2');
    type('Max trades per day', '3');
    type('Monthly result target', '250');
    type('Currency', 'usdt');
    fireEvent.click(screen.getByRole('button', { name: 'Save goals' }));
    await waitFor(() => expect(screen.getByText('Goals saved.')).toBeTruthy());
    await waitFor(() => expect(route().querySelector('[data-goal="max-trades-per-day"]')!.textContent).toContain('1 of 3 allowed · 2 left'));
    expect(route().querySelector('[data-goal="monthly-result"]')!.textContent).toContain('Target 250 USDT');
    expect((screen.getByLabelText('Currency') as HTMLInputElement).value).toBe('USDT');
    type('Closed trades per month', '2.5');
    fireEvent.click(screen.getByRole('button', { name: 'Save goals' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Trades per month must be a whole number from 1 to 10000, or left blank.'));
    expect(await readGoalsPreference(metadata)).toMatchObject({ tradesPerMonthTarget: 2, maxTradesPerDay: 3, monthlyResultTarget: { amount: '250', currency: 'USDT' } });
  });
});
