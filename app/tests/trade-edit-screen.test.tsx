import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from '../src/app/AppShell';
import { JournalRoute } from '../src/app/JournalRoute';
import { getJournalHistoryEntry } from '../src/application/journal';
import { savePracticeTrade } from '../src/application/practice';
import { createEmptyManualTradeDraft, saveManualTrade, saveTradeNote, tradeRevision, type SaveManualTradeInput } from '../src/application/trades';
import { createEmptyQuickTradeLogDraft } from '../src/application/trades/quickTradeLog';
import { keepTradeFormDraft, readTradeFormDraft } from '../src/application/trades/tradeFormDraft';
import { createKairosDatabase, JOURNAL_CHANGED_EVENT, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { TradeId } from '../src/domain/trades';
import { LogTradeScreen } from '../src/features/journal/LogTradeScreen';
import { TradeEditScreen } from '../src/features/journal/TradeEditScreen';
import { TRADE_FORM_MODE_STORAGE_KEY } from '../src/features/journal/TradeForm';
import { TradePageScreen } from '../src/features/journal/TradePageScreen';
import { axeViolations } from './fixtures/axe';
import { openTradeMenu } from './fixtures/tradePage';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); window.localStorage.clear(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-trade-edit-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}

const openedAt = '2026-09-12T04:00:00.000Z';
const closedAt = '2026-09-12T05:00:00.000Z';
const closed: SaveManualTradeInput = {
  symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: 'USDT', tags: ['breakout'], exchange: 'Binance', leverage: '10',
  plan: { plannedEntryPrice: '99', plannedStopPrice: '90', plannedTargetPrice: '125', plannedQuantity: '2' },
  executions: [{ type: 'entry', price: '100', quantity: '2', executedAt: openedAt }, { type: 'exit', price: '120', quantity: '2', executedAt: closedAt }],
  fees: [{ amount: '0.5', currency: 'USDT' }],
};

async function saved(db: KairosDatabase, input: SaveManualTradeInput = closed): Promise<TradeId> {
  const result = await saveManualTrade(db, input, { now: () => '2026-09-12T06:00:00.000Z' });
  if (!result.ok) throw new Error('fixture');
  return result.tradeId;
}

/** The app's shell around the Journal, the log page, Practice's list and the trade pages, starting at `path`. */
function app(db: KairosDatabase, path: string) {
  const router = createMemoryRouter([{ element: <AppShell />, children: [
    { path: '/', element: <h1>Home</h1> },
    { path: '/journal', element: <JournalRoute db={db} /> },
    { path: '/journal/log', element: <LogTradeScreen db={db} /> },
    { path: '/practice', element: <h1>Practice</h1> },
    { path: '/analysis', element: <h1>Analysis</h1> },
    { path: '/journal/trades/:id', element: <TradePageScreen db={db} scope="real" /> },
    { path: '/journal/trades/:id/edit', element: <TradeEditScreen db={db} scope="real" /> },
    { path: '/practice/trades/:id', element: <TradePageScreen db={db} scope="practice" /> },
    { path: '/practice/trades/:id/edit', element: <TradeEditScreen db={db} scope="practice" /> },
  ] }], { initialEntries: ['/journal', path], initialIndex: 1 });
  render(<RouterProvider router={router} />);
  return router;
}
const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(field(id), { target: { value } });

async function openEdit(db: KairosDatabase, id: TradeId) {
  const router = app(db, `/journal/trades/${id}`);
  await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
  fireEvent.click(openTradeMenu().getByRole('link', { name: 'Edit trade' }));
  await screen.findByRole('heading', { level: 1, name: 'Edit your BTCUSDT trade' });
  return router;
}

describe('T-060d edit a saved trade', () => {
  it('fills every field from the saved trade; Save goes back to its page with "Changes saved." and focus on its heading', async () => {
    const db = await database();
    const id = await saved(db);
    const entry = (await getJournalHistoryEntry(db, id))!;
    expect((await saveTradeNote(db, { tradeId: id, expectedRevision: tradeRevision(entry), note: 'Waited for the close.', scope: 'real' })).ok).toBe(true);
    const router = await openEdit(db, id);
    expect(router.state.location.pathname).toBe(`/journal/trades/${id}/edit`);
    expect(field('kairos-trade-symbol').value).toBe('BTCUSDT');
    expect(field('kairos-trade-market').value).toBe('crypto');
    expect(field('kairos-trade-side').value).toBe('long');
    expect(field('kairos-trade-status').value).toBe('closed');
    expect(field('kairos-trade-opened-at').value).not.toBe('');
    expect(field('kairos-trade-exchange').value).toBe('Binance');
    expect(field('kairos-plan-stop').value).toBe('90');
    expect(field('kairos-trade-note').value).toBe('Waited for the close.');
    // All details only, with its entries, exits and fee; no checklist or strategy (the trade's own stay as they are).
    expect(screen.queryByRole('radiogroup', { name: 'How to log this trade' })).toBeNull();
    expect(screen.queryByText(/Before you trade/)).toBeNull();
    expect(await axeViolations(document.body)).toEqual([]);

    type('kairos-trade-symbol', 'ETHUSDT');
    type('kairos-plan-stop', '95');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const heading = await screen.findByRole('heading', { level: 1, name: 'ETHUSDT · Long' });
    expect(router.state.location.pathname).toBe(`/journal/trades/${id}`);
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText('Changes saved.')).toHaveAttribute('role', 'status');
    // D263: the old plan is kept and the change is said in words.
    expect(within(screen.getByRole('region', { name: 'Plan changes' })).getByText(/^Stop moved from 90 to 95 on/)).toBeInTheDocument();
    const after = (await getJournalHistoryEntry(db, id))!;
    expect(after.plans).toHaveLength(2);
    expect(after.trade).toMatchObject({ symbol: 'ETHUSDT', note: 'Waited for the close.', createdAt: entry.trade.createdAt });
    expect(after.executions.map(e => e.id).sort()).toEqual(entry.executions.map(e => e.id).sort());
    // Review r1: Save went back to the page Edit was opened from, so one Back returns to where that page came from.
    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.pathname).toBe('/journal');
  });

  it('Cancel goes back to the trade\'s page and saves nothing', async () => {
    const db = await database();
    const id = await saved(db);
    const router = await openEdit(db, id);
    type('kairos-trade-symbol', 'ETHUSDT');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    expect(router.state.location.pathname).toBe(`/journal/trades/${id}`);
    expect((await db.trades.get(id))?.symbol).toBe('BTCUSDT');
  });

  it('a stale save says another tab changed the trade; "Load the new version" fills the form again', async () => {
    const db = await database();
    const id = await saved(db);
    await openEdit(db, id);
    type('kairos-trade-symbol', 'ETHUSDT');
    const entry = (await getJournalHistoryEntry(db, id))!;
    expect((await saveTradeNote(db, { tradeId: id, expectedRevision: tradeRevision(entry), note: 'From the other tab.', scope: 'real' })).ok).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("This trade changed in another tab. Your changes aren't saved.");
    await waitFor(() => expect(alert).toHaveFocus());
    expect((await db.trades.get(id))?.symbol).toBe('BTCUSDT');
    fireEvent.click(within(alert).getByRole('button', { name: 'Load the new version' }));
    await waitFor(() => expect(field('kairos-trade-note').value).toBe('From the other tab.'));
    expect(field('kairos-trade-symbol').value).toBe('BTCUSDT');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Edit your BTCUSDT trade' })).toHaveFocus());
  });

  it('a field the save refuses is said as for a new trade, and nothing is saved', async () => {
    const db = await database();
    const id = await saved(db);
    await openEdit(db, id);
    type('kairos-trade-closed-at', '');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Add both opened and closed date and time for a closed trade.');
    expect((await db.trades.get(id))?.closedAt).toBe(closedAt);
  });

  it('a Replay trade has no Edit: its page says why, its note still saves, and its edit address shows no form', async () => {
    const db = await database();
    const result = await savePracticeTrade(db, { ...closed, source: 'replay' }, { now: () => '2026-09-12T06:00:00.000Z' });
    if (!result.ok) throw new Error('fixture');
    const router = app(db, `/practice/trades/${result.tradeId}`);
    await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    const menu = openTradeMenu();
    expect(menu.queryByRole('link', { name: 'Edit trade' })).toBeNull();
    expect(menu.getByRole('button', { name: 'Duplicate trade' })).toBeInTheDocument();
    fireEvent.click(menu.getByRole('button', { name: 'Close' }));
    expect(within(screen.getByRole('region', { name: 'Change this trade' })).getByText("Made in Replay from past candles, so its entries and exits can't be changed.")).toBeInTheDocument();
    const notes = within(screen.getByRole('region', { name: 'Notes' }));
    fireEvent.change(notes.getByLabelText('Your note about this trade'), { target: { value: '  Entered too early.  ' } });
    fireEvent.click(notes.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Note saved.')).toBeInTheDocument();
    expect((await db.trades.get(result.tradeId))?.note).toBe('Entered too early.');
    await act(async () => { await router.navigate(`/practice/trades/${result.tradeId}/edit`); });
    await screen.findByText(/Made in Replay from past candles/);
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  it('a practice trade is edited at its own address and stays a practice trade', async () => {
    const db = await database();
    const result = await savePracticeTrade(db, closed, { now: () => '2026-09-12T06:00:00.000Z' });
    if (!result.ok) throw new Error('fixture');
    const router = app(db, `/practice/trades/${result.tradeId}/edit`);
    await screen.findByRole('heading', { level: 1, name: 'Edit your BTCUSDT trade' });
    type('kairos-practice-symbol', 'SOLUSDT');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('heading', { level: 1, name: 'SOLUSDT · Long' });
    expect(router.state.location.pathname).toBe(`/practice/trades/${result.tradeId}`);
    expect(await db.trades.get(result.tradeId)).toMatchObject({ symbol: 'SOLUSDT', source: 'paper' });
  });
});

describe('T-060d the note on a trade\'s page', () => {
  it('saves a note with its counter, refuses one over 2,000 characters, and a blank note removes it', async () => {
    const db = await database();
    const id = await saved(db);
    app(db, `/journal/trades/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    const notes = within(screen.getByRole('region', { name: 'Notes' }));
    const area = notes.getByLabelText('Your note about this trade');
    fireEvent.change(area, { target: { value: 'Followed the plan.' } });
    expect(area).toHaveAccessibleDescription('Optional. 18 of 2,000 characters.');
    fireEvent.click(notes.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Note saved.')).toBeInTheDocument();
    expect((await db.trades.get(id))?.note).toBe('Followed the plan.');

    fireEvent.change(area, { target: { value: 'x'.repeat(2001) } });
    fireEvent.click(notes.getByRole('button', { name: 'Save note' }));
    const alert = await notes.findByRole('alert');
    expect(alert).toHaveTextContent('A note can be up to 2,000 characters.');
    expect(alert).toHaveFocus();
    expect((await db.trades.get(id))?.note).toBe('Followed the plan.');

    fireEvent.change(area, { target: { value: '   ' } });
    fireEvent.click(notes.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Note removed.')).toBeInTheDocument();
    expect(await db.trades.get(id)).not.toHaveProperty('note');
    expect(await axeViolations(document.body)).toEqual([]);
  });
});

describe('T-060d review r1', () => {
  it('a note saved in another tab while you type is not overwritten: Save says so, and "Load the new version" shows it', async () => {
    const db = await database();
    const id = await saved(db);
    app(db, `/journal/trades/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    const notes = within(screen.getByRole('region', { name: 'Notes' }));
    const area = notes.getByLabelText('Your note about this trade');
    fireEvent.change(area, { target: { value: 'Typed in this tab.' } });
    // Another tab saves a note; this page hears it (D229) and reads the trade again, keeping what is typed here.
    const entry = (await getJournalHistoryEntry(db, id))!;
    expect((await saveTradeNote(db, { tradeId: id, expectedRevision: tradeRevision(entry), note: 'From the other tab.', scope: 'real' })).ok).toBe(true);
    await act(async () => { window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); });
    await waitFor(() => expect(screen.getByRole('region', { name: 'Notes' })).toBeInTheDocument());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(area).toHaveValue('Typed in this tab.');
    fireEvent.click(notes.getByRole('button', { name: 'Save note' }));
    const alert = await notes.findByRole('alert');
    expect(alert).toHaveTextContent("This trade changed in another tab. Your note isn't saved.");
    expect((await db.trades.get(id))?.note).toBe('From the other tab.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Load the new version' }));
    await waitFor(() => expect(area).toHaveValue('From the other tab.'));
    expect(area).toHaveFocus();
  });

  it('a change elsewhere on the trade, not its note, does not stop a note being saved', async () => {
    const db = await database();
    const id = await saved(db);
    app(db, `/journal/trades/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    const notes = within(screen.getByRole('region', { name: 'Notes' }));
    fireEvent.change(notes.getByLabelText('Your note about this trade'), { target: { value: 'Typed in this tab.' } });
    // Another tab gives the trade a new plan version; the note it started from is unchanged.
    const entry = (await getJournalHistoryEntry(db, id))!;
    await db.tradePlans.put({ ...entry.plans[0]!, id: 'plan-from-the-other-tab' as never, plannedStopPrice: '95' as never, createdAt: '2026-09-12T07:00:00.000Z', updatedAt: '2026-09-12T07:00:00.000Z' });
    await act(async () => { window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); });
    await screen.findByRole('region', { name: 'Plan changes' });
    fireEvent.click(notes.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Note saved.')).toBeInTheDocument();
    expect((await db.trades.get(id))?.note).toBe('Typed in this tab.');
  });
});

describe('T-060d Duplicate', () => {
  it('opens the log page with the copy: symbol, market, direction, currency, where you traded, tags and plan; no times or entries', async () => {
    const db = await database();
    const id = await saved(db);
    const router = app(db, `/journal/trades/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    fireEvent.click(openTradeMenu().getByRole('button', { name: 'Duplicate trade' }));
    const line = await screen.findByText(/^Copied from your BTCUSDT trade of /);
    expect(router.state.location.pathname).toBe('/journal/log');
    await waitFor(() => expect(line).toHaveFocus());
    expect(field('kairos-trade-symbol').value).toBe('BTCUSDT');
    expect(field('kairos-trade-side').value).toBe('long');
    expect(field('kairos-trade-exchange').value).toBe('Binance');
    expect(field('kairos-trade-tags').value).toBe('breakout');
    expect(field('kairos-plan-stop').value).toBe('90');
    expect(field('kairos-trade-status').value).toBe('');
    expect(screen.queryByLabelText(/^Opened/)).toBeNull();
    expect(field('kairos-trade-leverage').value).toBe('10');
    // The address forgets the copy, so coming back to the page later starts empty.
    expect(router.state.location.state).toBeNull();
    expect(await db.trades.count()).toBe(1);
  });

  it('review r1: opens in All details even after Quick log was chosen, so where you traded and leverage come too; the choice stays', async () => {
    window.localStorage.setItem(TRADE_FORM_MODE_STORAGE_KEY, 'quick');
    const db = await database();
    const id = await saved(db);
    app(db, `/journal/trades/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    fireEvent.click(openTradeMenu().getByRole('button', { name: 'Duplicate trade' }));
    await screen.findByText(/^Copied from your BTCUSDT trade of /);
    expect(field('kairos-trade-exchange').value).toBe('Binance');
    expect(field('kairos-trade-leverage').value).toBe('10');
    expect(window.localStorage.getItem(TRADE_FORM_MODE_STORAGE_KEY)).toBe('quick');
  });

  it('asks first when a trade was being typed: "Keep what you were typing" keeps it, "Use the copy" replaces it', async () => {
    const db = await database();
    const id = await saved(db);
    const typing = { ...createEmptyManualTradeDraft(), symbol: 'XRPUSDT', marketType: 'crypto' as const };
    expect(await keepTradeFormDraft(db, 'journal', { mode: 'full', draft: { trade: typing, quick: createEmptyQuickTradeLogDraft(), executions: [], fees: [], currencyFilledBy: null, currencyTyped: false } })).toBe(true);
    const router = app(db, `/journal/trades/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    fireEvent.click(openTradeMenu().getByRole('button', { name: 'Duplicate trade' }));
    const question = await screen.findByText(/^You were typing another trade\. Use the copy of your BTCUSDT trade instead/);
    await waitFor(() => expect(question).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Keep what you were typing' }));
    await waitFor(() => expect(field('kairos-trade-symbol').value).toBe('XRPUSDT'));
    expect(field('kairos-trade-symbol')).toHaveFocus();

    await act(async () => { await router.navigate(`/journal/trades/${id}`); });
    await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    fireEvent.click(openTradeMenu().getByRole('button', { name: 'Duplicate trade' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use the copy' }));
    const line = await screen.findByText(/^Copied from your BTCUSDT trade of /);
    await waitFor(() => expect(line).toHaveFocus());
    expect(field('kairos-trade-symbol').value).toBe('BTCUSDT');
    expect(await readTradeFormDraft(db, 'journal')).toBeNull();
  });
});
