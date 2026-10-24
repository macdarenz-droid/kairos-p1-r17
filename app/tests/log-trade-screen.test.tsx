import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/app/AppShell';
import { createEmptyManualTradeDraft } from '../src/application/trades';
import { tradeFormDraftKey } from '../src/application/trades/tradeFormDraft';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { ToastProvider } from '../src/design-system/primitives';
import { LogTradeScreen } from '../src/features/journal/LogTradeScreen';
import { TradeForm } from '../src/features/journal/TradeForm';
import { axeViolations } from './fixtures/axe';

// Review r2: the first read-back of a saved trade can be made to fail.
const readBack = vi.hoisted(() => ({ failNext: 0 }));
vi.mock('../src/application/journal', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/application/journal')>();
  return { ...actual, getJournalHistoryEntry: async (...args: Parameters<typeof actual.getJournalHistoryEntry>) => {
    if (readBack.failNext > 0) { readBack.failNext -= 1; throw new Error('read failed'); }
    return actual.getJournalHistoryEntry(...args);
  } };
});

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); localStorage.clear(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-log-trade-screen-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}
const page = (db: KairosDatabase) => render(<MemoryRouter initialEntries={['/journal/log']}><ToastProvider><LogTradeScreen db={db} /></ToastProvider></MemoryRouter>);
const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const symbol = () => screen.getByLabelText(/^Symbol/) as HTMLInputElement;
const KEPT = 'Kairos kept the trade you were typing.';

describe('T-059e the log page', () => {
  it('has its own heading and a back control: up to the Journal when opened directly, back to where you came from otherwise', async () => {
    const db = await database();
    const routes = [{ element: <AppShell />, children: [
      { path: '/', element: <h1>Home</h1> },
      { path: '/journal', element: <h1>Journal</h1> },
      { path: '/journal/log', element: <LogTradeScreen db={db} /> },
    ] }];
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/journal/log'] })} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Log a trade' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Journal' })).toHaveAttribute('href', '/journal');
    expect(screen.queryByRole('link', { name: 'Log trade' })).toBeNull();
    expect(await axeViolations(document.body)).toEqual([]);
    cleanup();
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { name: 'Home' });
    await act(async () => { await router.navigate('/journal/log'); });
    const back = await screen.findByRole('button', { name: /Home/ });
    // Not from "+ Log trade": the shell puts focus on the page heading (D179), not on Symbol.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Log a trade' })).toHaveFocus());
    fireEvent.click(back);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('keeps what you typed when you leave, fills it in when you come back, and "Start over" empties it with Undo', async () => {
    const db = await database();
    const first = page(db);
    fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
    type(/^Symbol/, 'BTCUSDT');
    type(/^Entry price/, '65000');
    // Kept while you type (at most once a second), not only when you leave.
    await waitFor(async () => expect(JSON.parse((await db.metadata.get(tradeFormDraftKey('journal')))!.value).draft.quick.entryPrice).toBe('65000'), { timeout: 2500 });
    first.unmount();
    page(db);
    await waitFor(() => expect(symbol().value).toBe('BTCUSDT'));
    expect(screen.getByLabelText(/^Entry price/)).toHaveValue('65000');
    expect(screen.getByText(KEPT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(symbol().value).toBe('');
    expect(symbol()).toHaveFocus();
    expect(screen.queryByText(KEPT)).toBeNull();
    await waitFor(async () => expect(await db.metadata.get(tradeFormDraftKey('journal'))).toBeUndefined());
    expect(screen.getByText('Started over.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(symbol().value).toBe('BTCUSDT');
    expect(screen.getByLabelText(/^Entry price/)).toHaveValue('65000');
    // The Journal page's form shares the Journal's kept trade; Practice has its own.
    cleanup();
    render(<TradeForm db={db} kind="journal" onSaved={async () => undefined} />);
    await waitFor(() => expect(symbol().value).toBe('BTCUSDT'));
    cleanup();
    render(<TradeForm db={db} kind="practice" onSaved={async () => undefined} />);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(symbol().value).toBe('');
  });

  it('after a save shows the new trade\'s picture with "Log another trade" and "See it in your journal", and clears the kept trade', async () => {
    const db = await database();
    const { container } = page(db);
    fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
    type(/^Symbol/, 'BTCUSDT');
    type(/^Market/, 'crypto');
    type(/^Direction/, 'long');
    type(/^Entry price/, '100');
    type(/^Exit price/, '120');
    type(/^Quantity/, '2');
    type(/^Opened/, '2026-09-12T10:00');
    type(/^Closed/, '2026-09-12T11:00');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save trade' })); });
    const saved = await screen.findByRole('heading', { level: 2, name: 'Trade saved to your journal.' });
    await waitFor(() => expect(saved).toHaveFocus());
    expect(await screen.findByRole('heading', { name: 'Your trade' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^BTCUSDT long trade, closed\./ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See it in your journal' })).toHaveAttribute('href', '/journal');
    expect(screen.queryByLabelText(/^Symbol/)).toBeNull();
    expect(await db.metadata.get(tradeFormDraftKey('journal'))).toBeUndefined();
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Log another trade' }));
    expect(symbol().value).toBe('');
    await waitFor(() => expect(symbol()).toHaveFocus());
    expect(screen.queryByText(KEPT)).toBeNull();
  });

  it('review r2: an opened form writes nothing, so a trade another tab kept meanwhile stays; a Practice plan is not kept as typing', async () => {
    const db = await database();
    page(db);
    await screen.findByRole('heading', { level: 1, name: 'Log a trade' });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    // Another tab keeps a trade after this form has read.
    const other = { version: 1, savedAt: '2026-10-24T10:00:00.000Z', mode: 'quick', draft: {
      trade: { symbol: 'ETHUSDT', marketType: 'crypto', side: '', status: '', openedAt: '', closedAt: '', plan: { plannedEntryPrice: '', plannedStopPrice: '', plannedTargetPrice: '', plannedQuantity: '' } },
      quick: { entryPrice: '', exitPrice: '', quantity: '' }, executions: [], fees: [], currencyFilledBy: null, currencyTyped: false } };
    await db.metadata.put({ key: tradeFormDraftKey('journal'), value: JSON.stringify(other), updatedAt: other.savedAt });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1500)); });
    expect(await db.metadata.get(tradeFormDraftKey('journal'))).toBeDefined();
    cleanup();
    render(<TradeForm db={db} kind="practice" initialDraft={{ ...createEmptyManualTradeDraft(), side: 'long', plan: { plannedEntryPrice: '100', plannedStopPrice: '95', plannedTargetPrice: '', plannedQuantity: '1' } }} onSaved={async () => undefined} />);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1500)); });
    cleanup();
    expect(await db.metadata.get(tradeFormDraftKey('practice'))).toBeUndefined();
  });

  it('review r2: when the saved trade can\'t be read back, "Try again" draws it and focus goes to the saved heading', async () => {
    const db = await database();
    page(db);
    fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
    type(/^Symbol/, 'BTCUSDT');
    type(/^Market/, 'crypto');
    type(/^Direction/, 'long');
    type(/^Entry price/, '100');
    type(/^Exit price/, '120');
    type(/^Quantity/, '2');
    type(/^Opened/, '2026-09-12T10:00');
    type(/^Closed/, '2026-09-12T11:00');
    readBack.failNext = 1;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save trade' })); });
    const retry = await screen.findByRole('button', { name: 'Try again' });
    retry.focus();
    await act(async () => { fireEvent.click(retry); });
    expect(await screen.findByRole('heading', { name: 'Your trade' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Trade saved to your journal.' })).toHaveFocus());
  });
});
