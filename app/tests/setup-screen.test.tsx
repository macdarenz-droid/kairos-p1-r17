import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadHomeCurrency } from '../src/application/currency/homeCurrency';
import { loadDisciplineLists } from '../src/application/discipline';
import { loadGoalsPreference } from '../src/application/goals';
import { loadSetupState } from '../src/application/setup/setupState';
import { loadTradedMarkets } from '../src/application/setup/tradedMarkets';
import { loadVisualPnlTimeZone } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS } from '../src/domain/discipline';
import { SetupScreen } from '../src/features/setup/SetupScreen';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-setup-screen-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}
const now = () => '2026-10-23T10:00:00.000Z';

async function mount(db: KairosDatabase, path = '/setup') {
  const router = createMemoryRouter([
    { path: '/setup', element: <SetupScreen db={db} deviceTimeZone="Asia/Manila" languages={['en-PH']} now={now} /> },
    { path: '/', element: <p>Home page</p> },
    { path: '/journal', element: <p>Journal page</p> },
    { path: '/practice', element: <p>Practice page</p> },
  ], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { level: 2 });
  return router;
}
const next = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^(Next|Not now)$/ })); }); };
const stepHeading = (name: string) => screen.findByRole('heading', { level: 2, name });

describe('T-053d the setup screen', () => {
  it('walks the six steps, each saving through its owner, with focus on each step\'s heading', async () => {
    const db = await database();
    await mount(db);
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
    expect(screen.getByText(/this phone's time zone/)).toHaveTextContent('Asia/Manila');
    await next();
    expect(await stepHeading('Your home currency')).toHaveFocus();
    expect(await loadVisualPnlTimeZone(db)).toBe('Asia/Manila');
    // The suggestion from the phone's region is chosen first.
    expect(screen.getByLabelText('Home currency')).toHaveValue('PHP');
    expect(screen.getByText("PHP, from this phone's region")).toBeInTheDocument();
    await next();
    expect(await stepHeading('What you trade')).toHaveFocus();
    expect(await loadHomeCurrency(db)).toEqual({ currency: 'PHP', usdStablecoins: [] });
    await next();
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose at least one market.');
    fireEvent.click(screen.getByLabelText('Stocks'));
    fireEvent.click(screen.getByLabelText('Crypto'));
    await next();
    expect(await stepHeading('Your checklist')).toHaveFocus();
    expect(await loadTradedMarkets(db)).toEqual(['crypto', 'stock']);
    const first = KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist[0]!;
    fireEvent.click(within(screen.getByRole('group', { name: 'Before you trade: your steps' })).getByLabelText(first.label));
    await next();
    expect(await stepHeading('Your first goal')).toHaveFocus();
    const lists = await loadDisciplineLists(db);
    expect(lists.ok && lists.lists.checklist.map(item => item.id)).toEqual(KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist.slice(1).map(item => item.id));
    fireEvent.change(screen.getByLabelText('Trades a month'), { target: { value: '20' } });
    await next();
    expect(await stepHeading("You're set")).toHaveFocus();
    expect((await loadGoalsPreference(db)).tradesPerMonthTarget).toBe(20);
    await waitFor(async () => expect((await loadSetupState(db)).finishedAt).toBe(now()));
    expect(screen.getByRole('link', { name: 'Log your first trade' })).toHaveAttribute('href', '/journal');
    expect(screen.getByRole('link', { name: 'Try Practice first' })).toHaveAttribute('href', '/practice');
  });

  it('goes back a step, saves nothing for a blank goal or "Not now", and opens at the step the address asks for', async () => {
    const db = await database();
    await mount(db, '/setup?step=2');
    fireEvent.change(screen.getByLabelText('Home currency'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    await next();
    await stepHeading('What you trade');
    expect(await loadHomeCurrency(db)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await stepHeading('Your home currency')).toHaveFocus();
    cleanup();
    await mount(db, '/setup?step=5');
    await next();
    await stepHeading("You're set");
    expect(await loadGoalsPreference(db)).toEqual({ tradesPerMonthTarget: null, maxTradesPerDay: null, monthlyResultTarget: null });
  });

  it('"Skip for now" saves that it was skipped and opens Home', async () => {
    const db = await database();
    const router = await mount(db);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Skip for now' })); });
    await screen.findByText('Home page');
    expect(router.state.location.pathname).toBe('/');
    expect((await loadSetupState(db)).skippedAt).toBe(now());
  });

  it('a failed save says so and keeps the step, and "Try again" saves', async () => {
    const db = await database();
    await mount(db);
    const transaction = db.transaction.bind(db);
    const spy = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('quota'));
    await next();
    expect(await screen.findByText('Could not save. Nothing was changed.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Your time zone' })).toBeInTheDocument();
    spy.mockImplementation(transaction as typeof db.transaction);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    const heading = await stepHeading('Your home currency');
    await waitFor(() => expect(heading).toHaveFocus());
    expect(await loadVisualPnlTimeZone(db)).toBe('Asia/Manila');
  });

  it('refuses a time zone it does not know, and keeps the step', async () => {
    const db = await database();
    await mount(db);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Mars/Olympus' } });
    await next();
    expect(await screen.findByRole('alert')).toHaveTextContent('Kairos does not know that time zone.');
    expect(await loadVisualPnlTimeZone(db)).toBeNull();
  });
});
