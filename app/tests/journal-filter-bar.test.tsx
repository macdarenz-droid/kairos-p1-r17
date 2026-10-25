import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-filter-bar-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}

/** A closed long trade of 1 at 100, out at `exit`: a win above 100, a loss below. */
const closed = (symbol: string, exit: string, day: string, side: 'long' | 'short' = 'long'): SaveManualTradeInput => ({
  symbol, marketType: 'crypto', side, status: 'closed', grossPnlCurrency: 'USDT', openedAt: `${day}T09:00:00.000Z`, closedAt: `${day}T10:00:00.000Z`,
  executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: `${day}T09:00:00.000Z` }, { type: 'exit', price: exit, quantity: '1', executedAt: `${day}T10:00:00.000Z` }],
});
async function seed(db: KairosDatabase) {
  for (const input of [closed('BTCUSDT', '110', '2026-03-02'), closed('BTCUSDT', '90', '2026-03-05'), closed('ETHUSDT', '120', '2026-03-07', 'short')]) {
    expect((await saveManualTrade(db, input)).ok).toBe(true);
  }
}

function app(db: KairosDatabase, path: string) {
  const router = createMemoryRouter([
    { path: '/', element: <h1>Home</h1> },
    { path: '/journal', element: <JournalRoute db={db} /> },
    { path: '/practice', element: <PracticeRoute db={db} /> },
    { path: '/journal/trades/:id', element: <h1>Trade</h1> },
    { path: '/practice/trades/:id', element: <h1>Trade</h1> },
  ], { initialEntries: ['/', path], initialIndex: 1 });
  render(<RouterProvider router={router} />);
  return router;
}
const rows = () => screen.queryAllByRole('link').filter(link => link.classList.contains('kairos-history-card__link'));
const chips = () => within(screen.getByRole('group', { name: 'Filters in use' }));
const sheet = () => within(screen.getByRole('dialog', { name: 'Filters' }));

describe('T-060e search, filters and totals in the address', () => {
  it('reads the filters from the address: only matching rows, a chip for each, and what they all add up to', async () => {
    const db = await database();
    await seed(db);
    app(db, '/journal?q=btc%2F&result=lost');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveAccessibleName(/^BTCUSDT long, closed, .*loss -10 USDT/);
    expect(chips().getByText('Symbol: btc/')).toBeInTheDocument();
    expect(chips().getByText('Lost')).toBeInTheDocument();
    expect(await screen.findByText('1 trade · won 0 · lost 1 · result after fees -10 USDT')).toBeInTheDocument();
    expect(screen.getByLabelText('Search symbols')).toHaveValue('btc/');
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('a search and a filter each replace the address entry, and focus stays on the control changed', async () => {
    const db = await database();
    await seed(db);
    const router = app(db, '/journal');
    await waitFor(() => expect(rows()).toHaveLength(3));
    const search = screen.getByLabelText('Search symbols');
    search.focus();
    fireEvent.change(search, { target: { value: 'eth' } });
    await waitFor(() => expect(router.state.location.search).toBe('?q=eth'));
    expect(router.state.historyAction).toBe('REPLACE');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(search).toHaveFocus();
    expect(await screen.findByText('1 trade · won 0 · lost 1 · result after fees -20 USDT')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: '' } });
    await waitFor(() => expect(router.state.location.search).toBe(''));
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const side = sheet().getByLabelText('Long or Short');
    side.focus();
    fireEvent.change(side, { target: { value: 'long' } });
    await waitFor(() => expect(router.state.location.search).toBe('?side=long'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(side).toHaveFocus();
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(sheet().getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Filters · 1' })).toBeInTheDocument();
    // The list's own entry: Back goes where the Journal was opened from, never through each change.
    expect(router.state.location.pathname).toBe('/journal');
  });

  it('"Remove" takes a chip away and hands focus to the next one, then to "Filters"; "Clear filters" clears all and focuses the search', async () => {
    const db = await database();
    await seed(db);
    const router = app(db, '/journal?market=crypto&side=long&result=won');
    await waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(chips().getByRole('button', { name: 'Remove Market: Crypto' }));
    await waitFor(() => expect(router.state.location.search).toBe('?side=long&result=won'));
    await waitFor(() => expect(chips().getByRole('button', { name: 'Remove Long' })).toHaveFocus());
    fireEvent.click(chips().getByRole('button', { name: 'Remove Won' }));
    await waitFor(() => expect(chips().getByRole('button', { name: 'Remove Long' })).toHaveFocus());
    fireEvent.click(chips().getByRole('button', { name: 'Remove Long' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Filters' })).toHaveFocus());
    expect(screen.queryByRole('group', { name: 'Filters in use' })).toBeNull();
    // No filter: no totals line.
    expect(screen.queryByText(/trades? · won/)).toBeNull();

    await router.navigate('/journal?q=btc&side=long', { replace: true });
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.getByLabelText('Search symbols')).toHaveValue('');
    expect(screen.getByLabelText('Search symbols')).toHaveFocus();
    await waitFor(() => expect(rows()).toHaveLength(3));
  });

  it('when nothing matches, says so with "Clear filters", which moves focus to the list\'s heading', async () => {
    const db = await database();
    await seed(db);
    const router = app(db, '/journal?q=sol');
    expect(await screen.findByRole('heading', { name: 'No trades match these filters.' })).toBeInTheDocument();
    expect(await screen.findByText(/^0 trades · won 0 · lost 0 · result after fees: /)).toBeInTheDocument();
    expect(await axeViolations(document.body)).toEqual([]);
    const empty = screen.getByRole('heading', { name: 'No trades match these filters.' }).closest('.kairos-empty-state') ?? document.body;
    fireEvent.click(within(empty as HTMLElement).getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.getByRole('heading', { name: 'Trade history' })).toHaveFocus();
  });

  it('review r1: the calculator\'s plan in the Practice address is not a filter, and clearing filters keeps it', async () => {
    const db = await database();
    expect((await savePracticeTrade(db, closed('BTCUSDT', '110', '2026-03-02'))).ok).toBe(true);
    expect((await savePracticeTrade(db, closed('ETHUSDT', '90', '2026-03-03', 'short'))).ok).toBe(true);
    const router = app(db, '/practice?direction=long&entry=100&stop=90&quantity=1');
    expect(await screen.findByText(/^From the calculator: buy up to 1/)).toBeInTheDocument();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.queryByRole('group', { name: 'Filters in use' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(sheet().getByLabelText('Long or Short'), { target: { value: 'short' } });
    await waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(sheet().getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(router.state.location.search).toBe('?direction=long&entry=100&stop=90&quantity=1'));
    expect(screen.getByText(/^From the calculator: buy up to 1/)).toBeInTheDocument();
  });

  it('review r1: a typed space stays in the search after the pause; a period changed meanwhile is kept', async () => {
    const db = await database();
    expect((await savePracticeTrade(db, closed('BTCUSDT', '110', '2026-03-02'))).ok).toBe(true);
    const router = app(db, '/practice');
    await waitFor(() => expect(rows()).toHaveLength(1));
    const search = screen.getByLabelText('Search symbols');
    fireEvent.change(search, { target: { value: 'btc' } });
    // Another part of the page changes the address while the search waits for typing to pause.
    await act(async () => { await router.navigate('/practice?period=all', { replace: true }); });
    await waitFor(() => expect(router.state.location.search).toBe('?period=all&q=btc'));
    fireEvent.change(search, { target: { value: 'btc ' } });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 400)); });
    expect(router.state.location.search).toBe('?period=all&q=btc');
    expect(search).toHaveValue('btc ');
  });

  it('review r1: "Show all trades" after a status that matched nothing moves focus to the list\'s heading', async () => {
    const db = await database();
    await seed(db);
    const router = app(db, '/journal?status=open');
    const button = await screen.findByRole('button', { name: 'Show all trades' });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.getByRole('heading', { name: 'Trade history' })).toHaveFocus();
  });

  it('Practice has "How it was made"; the Journal does not, and drops it from the address', async () => {
    const db = await database();
    expect((await savePracticeTrade(db, closed('BTCUSDT', '110', '2026-03-02'))).ok).toBe(true);
    expect((await savePracticeTrade(db, { ...closed('ETHUSDT', '90', '2026-03-03'), source: 'replay' })).ok).toBe(true);
    app(db, '/practice?source=replay');
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveAccessibleName(/^ETHUSDT long, from replay/);
    expect(chips().getByText('Made in Replay')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filters · 1' }));
    expect(sheet().getByLabelText('How it was made')).toHaveValue('replay');
    cleanup();

    app(db, '/journal?source=replay');
    await screen.findByRole('heading', { name: 'Trade history' });
    expect(screen.queryByRole('group', { name: 'Filters in use' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(sheet().queryByLabelText('How it was made')).toBeNull();
  });
});
