import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/app/AppShell';
import { JournalRoute } from '../src/app/JournalRoute';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { createKairosDatabase, JOURNAL_CHANGED_EVENT, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { deleteTradeRecord } from '../src/application/trades';
import type { TradeId } from '../src/domain/trades';
import { TradePageScreen } from '../src/features/journal/TradePageScreen';
import { axeViolations } from './fixtures/axe';
import { openTradeMenu } from './fixtures/tradePage';

// Review r1: a read of the trade can be made to fail.
const reads = vi.hoisted(() => ({ failNext: 0 }));
vi.mock('../src/application/journal', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/application/journal')>();
  return { ...actual, getJournalHistoryEntry: async (...args: Parameters<typeof actual.getJournalHistoryEntry>) => {
    if (reads.failNext > 0) { reads.failNext -= 1; throw new Error('read failed'); }
    return actual.getJournalHistoryEntry(...args);
  } };
});

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-trade-page-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}

const openedAt = '2026-09-12T04:00:00.000Z';
const closedAt = '2026-09-12T05:00:00.000Z';
const plan = { plannedEntryPrice: '99', plannedStopPrice: '90', plannedTargetPrice: '125', plannedQuantity: '2' };
const closed: SaveManualTradeInput = {
  symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: 'USDT', plan,
  executions: [{ type: 'entry', price: '100', quantity: '2', executedAt: openedAt }, { type: 'exit', price: '120', quantity: '2', executedAt: closedAt }],
  fees: [{ amount: '0.5', currency: 'USDT' }],
};
const open: SaveManualTradeInput = { symbol: 'ETHUSDT', marketType: 'crypto', side: 'short', status: 'open', openedAt, plan, executions: [{ type: 'entry', price: '100', quantity: '2', executedAt: openedAt }] };
const draft: SaveManualTradeInput = { symbol: 'SOLUSDT', marketType: 'crypto', side: 'long', status: 'draft', plan: { plannedEntryPrice: '100', plannedQuantity: '2' } };

async function saved(db: KairosDatabase, input: SaveManualTradeInput): Promise<TradeId> {
  const result = await saveManualTrade(db, input, { now: () => '2026-09-12T06:00:00.000Z' });
  if (!result.ok) throw new Error('fixture');
  return result.tradeId;
}

/** The app's shell around the pages a trade's page links to, starting at `path` (after the entries `before`). */
function app(db: KairosDatabase, path: string, before: readonly string[] = []) {
  const router = createMemoryRouter([{ element: <AppShell />, children: [
    { path: '/', element: <h1>Home</h1> },
    { path: '/journal', element: <JournalRoute db={db} /> },
    { path: '/practice', element: <h1>Practice</h1> },
    { path: '/analysis', element: <h1>Analysis</h1> },
    { path: '/journal/trades/:id', element: <TradePageScreen db={db} scope="real" /> },
    { path: '/practice/trades/:id', element: <TradePageScreen db={db} scope="practice" /> },
  ] }], { initialEntries: [...before, path], initialIndex: before.length });
  render(<RouterProvider router={router} />);
  return router;
}
const part = (name: string) => within(screen.getByRole('region', { name }));
/** The line under the page's heading. */
const intro = () => document.querySelector('.kairos-page-header__intro')?.textContent ?? '';

describe('T-060b a page for each trade', () => {
  it('opens with the trade as its heading, which takes focus, and the date it happened', async () => {
    const db = await database();
    const id = await saved(db, closed);
    const router = app(db, '/');
    await screen.findByRole('heading', { name: 'Home' });
    await act(async () => { await router.navigate(`/journal/trades/${id}`); });
    const heading = await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(intro()).toMatch(/^Closed · opened /);
    expect(document.title).toBe('BTCUSDT · Long · Kairos');
  });

  it('shows a closed trade whole: its result, plan and what happened, details, plan, entries and exits, fees, review and the chart link', async () => {
    const db = await database();
    const id = await saved(db, closed);
    app(db, `/journal/trades/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    const result = part('Recorded result');
    for (const [label, value] of [['Result before fees', '40 USDT'], ['Result after fees', '39.5 USDT'], ['Fees', '0.5 USDT'], ['× what you risked', '+1.98× what you risked']]) {
      expect(result.getByText(label).nextElementSibling).toHaveTextContent(value);
    }
    expect(part('Plan and what happened').getAllByRole('paragraph').map(line => line.textContent)).toEqual([
      'Your stop was 90, and you closed at 120 on average, without reaching it.', 'You traded the size you planned: 2.',
    ]);
    expect(part('Trade overview').getByRole('heading', { name: 'Details' })).toBeInTheDocument();
    expect(part('Saved plan').getByText('Planned stop').nextElementSibling).toHaveTextContent('90');
    expect(part('Your entries and exits').getByText('2 recorded')).toBeInTheDocument();
    expect(part('Recorded fees').getByText('0.5 USDT')).toBeInTheDocument();
    const discipline = within(await screen.findByRole('region', { name: 'Before and after the trade' }));
    expect(discipline.getByRole('button', { name: /^After the trade/ })).toBeInTheDocument();
    expect(discipline.queryByRole('button', { name: /^Before you trade/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'See it on the market chart' })).toHaveAttribute('href', `/analysis?trade=${encodeURIComponent(id)}`);
    const changes = part('Change this trade');
    expect(changes.queryByRole('button', { name: 'Update trade' })).toBeNull();
    expect(changes.queryByRole('button', { name: "I'm in" })).toBeNull();
    expect(await axeViolations(document.body)).toEqual([]);
    // D264: Delete lives in the "…" sheet.
    expect(openTradeMenu().getByRole('button', { name: 'Delete trade' })).toBeInTheDocument();
  });

  it('offers what fits an open and a planned trade', async () => {
    const db = await database();
    const openId = await saved(db, open);
    const draftId = await saved(db, draft);
    app(db, `/journal/trades/${openId}`);
    await screen.findByRole('heading', { level: 1, name: 'ETHUSDT · Short' });
    expect(intro()).toMatch(/^Open · opened /);
    expect(within(await screen.findByRole('region', { name: 'Before and after the trade' })).getByRole('button', { name: /^Before you trade/ })).toBeInTheDocument();
    expect(part('Change this trade').getByRole('button', { name: 'Update trade' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Plan and what happened' })).toBeNull();
    cleanup();
    app(db, `/journal/trades/${draftId}`);
    await screen.findByRole('heading', { level: 1, name: 'SOLUSDT · Long' });
    expect(intro()).toMatch(/^Planned /);
    expect(part('Change this trade').getByRole('button', { name: "I'm in" })).toBeInTheDocument();
    expect(part('Recorded result').getByText('× what you risked').nextElementSibling).toHaveTextContent('Not available');
  });

  it("says a trade of the other kind, or one that isn't saved, isn't in your journal", async () => {
    const db = await database();
    const real = await saved(db, closed);
    const practice = await savePracticeTrade(db, { ...closed, symbol: 'ETHUSDT' });
    if (!practice.ok) throw new Error('fixture');
    app(db, `/practice/trades/${real}`);
    expect(await screen.findByRole('heading', { level: 1, name: "This trade isn't in your journal." })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Practice' })).toHaveAttribute('href', '/practice');
    cleanup();
    app(db, '/journal/trades/no-such-trade');
    expect(await screen.findByRole('heading', { level: 1, name: "This trade isn't in your journal." })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your journal' })).toHaveAttribute('href', '/journal');
    cleanup();
    app(db, `/practice/trades/${practice.tradeId}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'ETHUSDT · Long' })).toBeInTheDocument();
    expect(screen.getByText('Practice trade')).toBeInTheDocument();
  });

  it('updates an open trade here: it closes, says so, and "Review it now" opens the review', async () => {
    const db = await database();
    const id = await saved(db, open);
    app(db, `/journal/trades/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'ETHUSDT · Short' });
    fireEvent.click(part('Change this trade').getByRole('button', { name: 'Update trade' }));
    const form = within(screen.getByRole('region', { name: 'Update ETHUSDT' }));
    fireEvent.click(form.getByRole('button', { name: 'Add exit' }));
    for (const [name, value] of [['price', '90'], ['quantity', '2'], ['date and time', '2026-09-12T15:00']]) fireEvent.change(form.getByLabelText(`Exit 1 ${name}`), { target: { value } });
    fireEvent.change(form.getByLabelText('Trade status'), { target: { value: 'closed' } });
    fireEvent.change(form.getByLabelText('Closed date & time'), { target: { value: '2026-09-12T15:00' } });
    fireEvent.click(form.getByRole('button', { name: 'Save update' }));
    expect(await screen.findByText('Trade closed. How did it go?')).toBeInTheDocument();
    const reviewNow = screen.getByRole('button', { name: 'Review it now' });
    await waitFor(() => expect(reviewNow).toHaveFocus());
    expect(intro()).toMatch(/^Closed · opened /);
    fireEvent.click(reviewNow);
    expect(await screen.findByRole('dialog', { name: 'After the trade: ETHUSDT' })).toBeInTheDocument();
  });

  it("opens a planned trade with \"I'm in\", and fixes an entry's price, reading the trade again each time", async () => {
    const db = await database();
    const draftId = await saved(db, draft);
    app(db, `/journal/trades/${draftId}`);
    await screen.findByRole('heading', { level: 1, name: 'SOLUSDT · Long' });
    fireEvent.click(part('Change this trade').getByRole('button', { name: "I'm in" }));
    const panel = within(screen.getByRole('region', { name: 'Open SOLUSDT' }));
    fireEvent.change(panel.getByLabelText(/Opened date/), { target: { value: '2026-09-18T09:00' } });
    fireEvent.click(panel.getByRole('button', { name: 'Save opening' }));
    await waitFor(() => expect(intro()).toMatch(/^Open · opened /));
    expect(document.querySelector('.kairos-trade-page__notice')).toHaveTextContent(/SOLUSDT/);
    cleanup();
    const closedId = await saved(db, closed);
    app(db, `/journal/trades/${closedId}`);
    await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    fireEvent.click(part('Change this trade').getByRole('button', { name: 'Your entries and exits' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit exit 2' }));
    const edit = within(screen.getByRole('form', { name: /exit 2/i }));
    fireEvent.change(edit.getByLabelText('Price'), { target: { value: '130' } });
    fireEvent.click(edit.getByRole('button', { name: 'Save change' }));
    await waitFor(() => expect(part('Recorded result').getByText('Result after fees').nextElementSibling).toHaveTextContent('59.5 USDT'));
  });

  it('deletes after asking, then goes back to the list with the notice, which takes focus so it is read out', async () => {
    const db = await database();
    const id = await saved(db, closed);
    const router = app(db, `/journal/trades/${id}`, ['/journal']);
    await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    fireEvent.click(openTradeMenu().getByRole('button', { name: 'Delete trade' }));
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Delete BTCUSDT for good?' })).getByRole('button', { name: 'Delete for good' }));
    await screen.findByRole('heading', { name: 'Trade history' });
    expect(router.state.location.pathname).toBe('/journal');
    const notice = screen.getByText('BTCUSDT deleted, with its 2 entries and exits and 1 fee.');
    expect(notice).toHaveAttribute('role', 'status');
    await waitFor(() => expect(notice).toHaveFocus());
    expect(await db.trades.count()).toBe(0);
    // The list's address forgets the notice: coming back to it later shows none.
    expect(router.state.location.state).toBeNull();
    // Review r1: the deleted trade's page is gone from the history, so Back never leads to it.
    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.pathname).toBe('/journal');
    expect(screen.queryByRole('heading', { name: "This trade isn't in your journal." })).toBeNull();
  });

  it('review r1: when another tab deletes the trade, the page says so and focus moves to its heading, never the page', async () => {
    const db = await database();
    const id = await saved(db, closed);
    app(db, `/journal/trades/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    screen.getByRole('button', { name: 'More for this trade' }).focus();
    expect(await deleteTradeRecord(db, id)).toMatchObject({ ok: true });
    await act(async () => { window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); });
    const heading = await screen.findByRole('heading', { level: 1, name: "This trade isn't in your journal." });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('review r1: a read again that fails keeps the trade on screen, with what you were typing', async () => {
    const db = await database();
    const id = await saved(db, open);
    app(db, `/journal/trades/${id}`);
    await screen.findByRole('heading', { level: 1, name: 'ETHUSDT · Short' });
    fireEvent.click(part('Change this trade').getByRole('button', { name: 'Update trade' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Update ETHUSDT' })).getByRole('button', { name: 'Add exit' }));
    reads.failNext = 1;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(reads.failNext).toBe(0));
    expect(screen.getByRole('heading', { level: 1, name: 'ETHUSDT · Short' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Update ETHUSDT' })).getByLabelText('Exit 1 price')).toBeInTheDocument();
    expect(screen.queryByText('Kairos could not read this trade. Your saved trades were not changed.')).toBeNull();
  });

  it('review r1: another trade\'s page starts afresh, with nothing said on the last one', async () => {
    const db = await database();
    const draftId = await saved(db, draft);
    const otherId = await saved(db, closed);
    const router = app(db, `/journal/trades/${draftId}`);
    await screen.findByRole('heading', { level: 1, name: 'SOLUSDT · Long' });
    fireEvent.click(part('Change this trade').getByRole('button', { name: "I'm in" }));
    const panel = within(screen.getByRole('region', { name: 'Open SOLUSDT' }));
    fireEvent.change(panel.getByLabelText(/Opened date/), { target: { value: '2026-09-18T09:00' } });
    fireEvent.click(panel.getByRole('button', { name: 'Save opening' }));
    await waitFor(() => expect(document.querySelector('.kairos-trade-page__notice')).not.toBeNull());
    await act(async () => { await router.navigate(`/journal/trades/${otherId}`); });
    await screen.findByRole('heading', { level: 1, name: 'BTCUSDT · Long' });
    expect(document.querySelector('.kairos-trade-page__notice')).toBeNull();
  });
});
