import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { defineSavedAnalysis } from '../src/domain/saved-records/savedAnalysisContract';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
async function database() { const name = `kairos-trade-delete-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
const eth = { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' } as const;
const closed = (symbol: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }], fees: [{ amount: '0.5', currency: 'USDT' }] } as const);
const card = (symbol: string) => screen.getAllByRole('listitem').find(item => within(item).queryByText(symbol) !== null)!;
const counts = async (db: Awaited<ReturnType<typeof database>>) => ({ trades: await db.trades.count(), executions: await db.tradeExecutions.count(), fees: await db.tradeFees.count(), analyses: await db.savedAnalyses.count() });

describe('P30.2 trade delete control', () => {
  it('deletes exactly the confirmed journal trade with its fills and fees, refreshes the history and reports it', async () => {
    const db = await database();
    await saveManualTrade(db, closed('BTCUSDT'));
    await saveManualTrade(db, closed('ETHUSDT'));
    await createKairosRepositories(db).savedAnalyses.put(defineSavedAnalysis({ id: 'a-1', market: eth, drawings: [], riskRewards: [] }));
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    fireEvent.click(within(card('ETHUSDT')).getByRole('button', { name: 'Delete trade' }));
    const confirm = within(card('ETHUSDT')).getByRole('group', { name: 'Delete ETHUSDT' });
    expect(confirm.textContent).toContain('Delete ETHUSDT for good? Its 2 fills and 1 fee go with it. A backup taken before this keeps it.');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete for good' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByRole('status').textContent).toBe('ETHUSDT deleted. 2 fills and 1 fee were removed with it.');
    expect((await db.trades.toArray()).map(trade => trade.symbol)).toEqual(['BTCUSDT']);
    expect(await counts(db)).toEqual({ trades: 1, executions: 2, fees: 1, analyses: 1 });
  });

  it('keeps the trade when the confirmation is declined and reports a storage failure without changing anything', async () => {
    const db = await database();
    await saveManualTrade(db, closed('BTCUSDT'));
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Delete trade' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep trade' }));
    expect(screen.queryByRole('group', { name: 'Delete BTCUSDT' })).toBeNull();
    expect(await db.trades.count()).toBe(1);
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete trade' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Kairos could not delete BTCUSDT. Nothing was changed.');
    vi.restoreAllMocks();
    expect(await db.trades.count()).toBe(1);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('deletes a practice trade from the Practice page without touching the journal', async () => {
    const db = await database();
    await saveManualTrade(db, closed('BTCUSDT'));
    await savePracticeTrade(db, closed('SOLUSDT'));
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Practice' }).getAttribute('data-practice-count')).toBe('1'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete trade' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Practice' }).getAttribute('data-practice-count')).toBe('0'));
    expect(screen.getByRole('status').textContent).toBe('SOLUSDT deleted. 2 fills and 1 fee were removed with it.');
    expect((await db.trades.toArray()).map(trade => [trade.symbol, trade.source])).toEqual([['BTCUSDT', 'manual']]);
  });
});
