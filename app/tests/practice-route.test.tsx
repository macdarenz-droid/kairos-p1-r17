import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { listJournalHistory } from '../src/application/journal';
import { loadHomeYourTrades } from '../src/application/dashboard/homeDashboardYourTradesQuery';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';

const names: string[] = [];
async function database() { const name = `kairos-practice-route-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
const route = () => screen.getByRole('region', { name: 'Practice' });
const mount = (db: Awaited<ReturnType<typeof database>>) => render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('P29.3 Practice route', () => {
  it('records a practice trade with source paper, lists it as practice history and keeps it out of the journal', async () => {
    const db = await database();
    await saveManualTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-09-18T08:00:00.000Z' });
    mount(db);
    await waitFor(() => expect(route().getAttribute('data-practice-status')).toBe('ready'));
    expect(route().getAttribute('data-practice-count')).toBe('0');
    expect(screen.getByText('No saved trades yet. Your first saved trade will appear here.')).toBeTruthy();
    type(/Symbol/, 'ethusdt');
    type(/Market/, 'crypto');
    type(/Direction/, 'short');
    type(/^Status/, 'closed');
    type(/Opened/, '2026-09-18T09:00');
    fireEvent.change(screen.getByLabelText(/Closed/, { selector: 'input' }), { target: { value: '2026-09-18T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save practice trade' }));
    expect((await screen.findByRole('status')).textContent).toBe('Practice trade saved. It stays out of your journal results.');
    await waitFor(() => expect(route().getAttribute('data-practice-count')).toBe('1'));
    expect((await db.trades.toArray()).map(trade => [trade.symbol, trade.source]).sort()).toEqual([['BTCUSDT', 'manual'], ['ETHUSDT', 'paper']]);
    expect(screen.getByLabelText(/Symbol/)).toHaveValue('');
    expect(route().querySelector('.kairos-history-card__topline strong')!.textContent).toBe('ETHUSDT');
    expect((await listJournalHistory(db)).map(entry => entry.trade.symbol)).toEqual(['BTCUSDT']);
    expect((await loadHomeYourTrades(db)).map(trade => trade.id)).toHaveLength(1);
  });

  it('refuses an incomplete practice trade in plain words, keeps the form and writes nothing', async () => {
    const db = await database();
    mount(db);
    type(/Symbol/, 'BTCUSD');
    type(/Market/, 'crypto');
    type(/Direction/, 'long');
    type(/^Status/, 'open');
    fireEvent.click(screen.getByRole('button', { name: 'Save practice trade' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Add the opened date and time for an open practice trade.');
    expect(screen.getByLabelText(/Symbol/)).toHaveValue('BTCUSD');
    expect(await db.trades.count()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Save practice trade' }));
  });

  it('filters the practice history by status without touching manual trades', async () => {
    const db = await database();
    mount(db);
    await waitFor(() => expect(route().getAttribute('data-practice-status')).toBe('ready'));
    type(/Symbol/, 'SOLUSDT');
    type(/Market/, 'crypto');
    type(/Direction/, 'long');
    type(/^Status/, 'draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save practice trade' }));
    await waitFor(() => expect(route().getAttribute('data-practice-count')).toBe('1'));
    type('Show trades', 'closed');
    await waitFor(() => expect(screen.getByText('No closed trades found.')).toBeTruthy());
    type('Show trades', 'draft');
    await waitFor(() => expect(route().getAttribute('data-practice-count')).toBe('1'));
    expect((await db.trades.toArray()).map(trade => trade.source)).toEqual(['paper']);
  });
});
