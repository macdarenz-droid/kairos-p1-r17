import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { listJournalHistory } from '../src/application/journal';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';

const names: string[] = [];
async function database() { const name = `kairos-draft-open-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
const draft = { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'draft', plan: { plannedEntryPrice: '100', plannedQuantity: '2' } } as const;
const card = (symbol: string) => screen.getAllByRole('listitem').find(item => within(item).queryByText(symbol) !== null)!;

describe('P31.2 draft trade activation control', () => {
  it('opens a saved draft from its card with the opened moment, a first fill and the currency, keeping the plan', async () => {
    const db = await database();
    await saveManualTrade(db, draft);
    await saveManualTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'short', status: 'open', openedAt: '2026-09-18T07:00:00.000Z' });
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    expect(within(card('ETHUSDT')).queryByRole('button', { name: 'Open this trade' })).toBeNull();
    fireEvent.click(within(card('BTCUSDT')).getByRole('button', { name: 'Open this trade' }));
    const panel = screen.getByRole('region', { name: 'Open BTCUSDT' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save opening' }));
    expect((await within(panel).findByRole('alert')).textContent).toBe('Add the opened date and time to open this trade.');
    expect((await db.trades.toArray()).find(trade => trade.symbol === 'BTCUSDT')?.status).toBe('draft');
    fireEvent.change(within(panel).getByLabelText(/Opened date/), { target: { value: '2026-09-18T09:00' } });
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Currency code' }), { target: { value: 'usdt' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Add entry' }));
    fireEvent.change(within(panel).getByLabelText(/ price$/), { target: { value: '101' } });
    fireEvent.change(within(panel).getByLabelText(/ quantity$/), { target: { value: '2' } });
    fireEvent.change(within(panel).getByLabelText(/ date and time$/), { target: { value: '2026-09-18T09:00' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save opening' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Open BTCUSDT' })).toBeNull());
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('BTCUSDT is now open from 2026-09-18 09:00 UTC.'));
    const opened = (await db.trades.toArray()).find(trade => trade.symbol === 'BTCUSDT')!;
    expect(opened).toMatchObject({ status: 'open', openedAt: '2026-09-18T09:00:00.000Z', grossPnlCurrency: 'USDT', closedAt: null });
    expect((await db.tradePlans.toArray()).map(plan => [plan.tradeId, plan.plannedEntryPrice])).toEqual([[opened.id, '100']]);
    expect((await db.tradeExecutions.toArray()).map(e => [e.tradeId, e.type, e.price])).toEqual([[opened.id, 'entry', '101']]);
    expect((await listJournalHistory(db, { status: 'open' })).map(e => e.trade.symbol).sort()).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(within(card('BTCUSDT')).queryByRole('button', { name: 'Open this trade' })).toBeNull();
  });

  it('keeps the draft when cancelled or when the write fails on the Journal page', async () => {
    const db = await database();
    await saveManualTrade(db, draft);
    await savePracticeTrade(db, { ...draft, symbol: 'SOLUSDT' });
    const view = render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Open this trade' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Open BTCUSDT' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open this trade' }));
    fireEvent.change(screen.getByLabelText(/Opened date/), { target: { value: '2026-09-18T09:00' } });
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    fireEvent.click(screen.getByRole('button', { name: 'Save opening' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Kairos could not open this trade. Your entries are kept so you can retry.');
    vi.restoreAllMocks();
    expect((screen.getByLabelText(/Opened date/) as HTMLInputElement).value).toBe('2026-09-18T09:00');
    expect((await db.trades.toArray()).map(trade => [trade.symbol, trade.status]).sort()).toEqual([['BTCUSDT', 'draft'], ['SOLUSDT', 'draft']]);
    view.unmount();
  });

  // P35.2: the Practice page now opens its own paper drafts through the same released control, scoped to paper; the Journal keeps opening manual drafts only.
  it('opens a practice draft from the Practice page without touching the journal, and offers no activation there for a manual draft', async () => {
    const db = await database();
    await saveManualTrade(db, draft);
    await savePracticeTrade(db, { ...draft, symbol: 'SOLUSDT' });
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Practice' }).getAttribute('data-practice-count')).toBe('1'));
    fireEvent.click(screen.getByRole('button', { name: 'Open this trade' }));
    const panel = screen.getByRole('region', { name: 'Open SOLUSDT' });
    fireEvent.change(within(panel).getByLabelText(/Opened date/), { target: { value: '2026-09-18T09:00' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save opening' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('SOLUSDT is now open from 2026-09-18 09:00 UTC.'));
    const opened = (await db.trades.toArray()).find(trade => trade.symbol === 'SOLUSDT')!;
    expect(opened).toMatchObject({ source: 'paper', status: 'open', openedAt: '2026-09-18T09:00:00.000Z' });
    expect((await db.trades.toArray()).find(trade => trade.symbol === 'BTCUSDT')).toMatchObject({ status: 'draft', source: 'manual' });
    expect((await listJournalHistory(db)).map(entry => entry.trade.symbol)).toEqual(['BTCUSDT']);
  });
});
