import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '../src/app/routes';
import { loadTradeDiscipline, saveTradeDiscipline } from '../src/application/discipline';
import { loadStrategies } from '../src/application/discipline/strategies';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { ThemeProvider } from '../src/design-system/themes';
import { StrategiesScreen } from '../src/features/discipline/StrategiesScreen';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-strategies-screen-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
beforeAll(async () => { await import('../src/features/discipline/StrategiesScreen'); }, 30_000);

const renderPath = (path: string) => render(<ThemeProvider><RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: [path] })} /></ThemeProvider>);

async function saveExample(db: KairosDatabase) {
  render(<StrategiesScreen db={db} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Start from an example' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save strategy' })); });
  await screen.findByRole('status');
}

describe('T-040g the Strategies page', () => {
  it('opens from its own path and from More', async () => {
    renderPath('/strategies');
    expect(await screen.findByRole('heading', { name: 'Your strategies' }, { timeout: 5000 })).toBeInTheDocument();
    cleanup();
    renderPath('/more');
    expect((await screen.findByRole('link', { name: 'Strategies' })).getAttribute('href')).toBe('/strategies');
  });

  it('starts empty, with an example and a blank start', async () => {
    const db = await database();
    render(<StrategiesScreen db={db} />);
    expect(await screen.findByText('You have no strategies yet. Start from an example you can change, or write your own.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start from an example' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Write your own' })).toBeInTheDocument();
  });

  it('saves the example and lists it in plain sentences', async () => {
    const db = await database();
    render(<StrategiesScreen db={db} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start from an example' }));
    expect(screen.getByLabelText(/^Name/)).toHaveValue('My first plan');
    expect(screen.getByRole('checkbox', { name: 'Least I aim to make for what I risk' })).toBeChecked();
    expect(screen.getByLabelText(/^Times what you risk/)).toHaveValue('2');
    expect(screen.getByRole('checkbox', { name: 'Plan a stop before every trade' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Tick every step of my checklist before the trade' })).toBeChecked();
    expect(screen.getByLabelText(/^Rule 1/)).toHaveValue('I only trade when I feel calm and rested');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save strategy' })); });
    expect(await screen.findByText('Strategy saved.')).toBeInTheDocument();
    const article = screen.getByRole('article', { name: 'My first plan' });
    expect(within(article).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'Aim to make at least 2× what I risk', 'Plan a stop before every trade', 'Tick every step of my checklist before the trade', 'I only trade when I feel calm and rested',
    ]);
    await waitFor(() => expect(within(article).getByRole('heading', { name: 'My first plan' })).toHaveFocus());
  });

  it('changes, then cancels back to the list', async () => {
    const db = await database();
    await saveExample(db);
    fireEvent.click(screen.getByRole('button', { name: 'Change My first plan' }));
    expect(screen.getByRole('heading', { name: 'Change My first plan' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'My first plan', level: 2 })).toHaveFocus());
  });

  it('deletes after a confirm, and never touches a trade', async () => {
    const db = await database();
    await saveExample(db);
    const loaded = await loadStrategies(db);
    const strategy = loaded.ok ? loaded.strategies[0]! : null;
    const trade = await saveManualTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-09-18T08:00:00.000Z' });
    if (!trade.ok || !strategy) throw new Error('fixture');
    expect((await saveTradeDiscipline(db, { tradeId: trade.tradeId, scope: 'real', half: 'strategy', strategyId: strategy.id, answers: [] })).ok).toBe(true);
    const trades = await db.trades.count();

    fireEvent.click(screen.getByRole('button', { name: 'Delete My first plan' }));
    const group = screen.getByRole('group', { name: 'Delete My first plan?' });
    await waitFor(() => expect(within(group).getByRole('button', { name: 'Keep it' })).toHaveFocus());
    fireEvent.click(within(group).getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete My first plan' })).toHaveFocus());
    expect(await loadStrategies(db)).toMatchObject({ ok: true, strategies: [{ name: 'My first plan' }] });

    fireEvent.click(screen.getByRole('button', { name: 'Delete My first plan' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, delete it' })); });
    expect(await screen.findByText('My first plan was deleted. Trades that used it keep its rules.')).toBeInTheDocument();
    expect(await screen.findByText('You have no strategies yet. Start from an example you can change, or write your own.')).toBeInTheDocument();
    expect(await db.trades.count()).toBe(trades);
    const discipline = await loadTradeDiscipline(db, [trade.tradeId]);
    expect(discipline.ok && discipline.records.get(trade.tradeId)?.strategy?.name).toBe('My first plan');
  });

  it('says when the strategies cannot be loaded', async () => {
    const db = await database();
    vi.spyOn(db.metadata, 'get').mockRejectedValue(new Error('storage'));
    render(<StrategiesScreen db={db} />);
    expect(await screen.findByText('Kairos could not load your strategies. Your trades are not affected.')).toBeInTheDocument();
  });
});
