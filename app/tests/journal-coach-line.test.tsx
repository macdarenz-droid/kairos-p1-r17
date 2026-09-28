import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-coach-line-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });

const card = (symbol: string) => screen.getAllByRole('listitem').find(item => within(item).queryByText(symbol) !== null)!;
const STOP = 'Your stop was 95, and you closed at 90 on average, beyond it.';
const SIZE = 'You planned a size of 1 and traded 3.';
const plan = { plannedEntryPrice: '100', plannedStopPrice: '95', plannedQuantity: '1' };
const closed = (symbol: string, entryQuantity: string, exitPrice: string) => ({
  symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', plan,
  executions: [{ type: 'entry', price: '100', quantity: entryQuantity, executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: exitPrice, quantity: entryQuantity, executedAt: '2026-09-18T10:00:00.000Z' }],
} as const);

describe('T-041a the coach line on a closed trade card', () => {
  it('says when a closed Journal trade went past its stop or was bigger than planned', async () => {
    const db = await database();
    for (const input of [
      closed('BTCUSDT', '3', '90'),
      closed('ETHUSDT', '1', '110'),
      { symbol: 'SOLUSDT', marketType: 'crypto', side: 'long', status: 'open', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T11:00:00.000Z', plan: { plannedQuantity: '1' }, executions: [{ type: 'entry', price: '100', quantity: '3', executedAt: '2026-09-18T11:00:00.000Z' }] } as const,
    ]) expect((await saveManualTrade(db, input)).ok).toBe(true);
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(within(card('BTCUSDT')).getByText('Your coach')).toBeTruthy());
    expect(within(card('BTCUSDT')).getByText(STOP)).toBeTruthy();
    expect(within(card('BTCUSDT')).getByText(SIZE)).toBeTruthy();
    expect(within(card('ETHUSDT')).queryByText('Your coach')).toBeNull();
    expect(within(card('SOLUSDT')).queryByText('Your coach')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('says it for paper trades but never for replay trades in Practice', async () => {
    const db = await database();
    expect((await savePracticeTrade(db, closed('BTCUSDT', '3', '90'))).ok).toBe(true);
    expect((await savePracticeTrade(db, { ...closed('ETHUSDT', '3', '90'), source: 'replay' })).ok).toBe(true);
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(within(card('BTCUSDT')).getByText(STOP)).toBeTruthy());
    expect(within(card('BTCUSDT')).getByText(SIZE)).toBeTruthy();
    expect(within(card('ETHUSDT')).getByText('From replay')).toBeTruthy();
    expect(within(card('ETHUSDT')).queryByText('Your coach')).toBeNull();
  });
});
