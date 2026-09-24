import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createTradeDomainId, type TradeId, type TradeRecord, type TradeSource } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-show-older-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

function cancelled(index: number, source: TradeSource = 'manual'): TradeRecord {
  const updatedAt = new Date(Date.parse('2026-01-01T00:00:00.000Z') + index * 1_000).toISOString();
  return { id: createTradeDomainId<TradeId>(), symbol: `${source === 'manual' ? 'OLD' : 'PAP'}${String(index).padStart(3, '0')}`, marketType: 'crypto', side: 'long', status: 'cancelled', source, openedAt: null, closedAt: null, createdAt: updatedAt, updatedAt } as TradeRecord;
}

// Text queries walk every card; with 150 cards that is slow, so read the list's own count line.
const shown = () => document.querySelector('.kairos-history__count')?.textContent ?? '';
const expectShown = (text: string) => waitFor(() => expect(shown()).toBe(text), { timeout: 5_000 });

describe('"Show older trades"', () => {
  it('loads the next page, keeps the count after a save, and resets on a filter change', async () => {
    const db = await database();
    await db.trades.bulkPut(Array.from({ length: 150 }, (_, index) => cancelled(index)));
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    await expectShown('100 shown');
    expect(screen.queryByText('OLD000')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show older trades' }));
    await expectShown('150 shown');
    expect(screen.queryByRole('button', { name: 'Show older trades' })).toBeNull();
    expect(screen.getByText('OLD000')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Symbol/), { target: { value: 'NEWONE' } });
    fireEvent.change(screen.getByLabelText(/Market/), { target: { value: 'crypto' } });
    fireEvent.change(screen.getByLabelText(/Direction/), { target: { value: 'long' } });
    fireEvent.change(screen.getByLabelText(/^Status/), { target: { value: 'cancelled' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    await expectShown('151 shown');

    fireEvent.change(screen.getByLabelText('Show trades'), { target: { value: 'closed' } });
    await expectShown('0 shown');
    fireEvent.change(screen.getByLabelText('Show trades'), { target: { value: '' } });
    await expectShown('100 shown');
  }, 20_000);

  it('pages practice trades and never shows journal trades there', async () => {
    const db = await database();
    await db.trades.bulkPut([
      ...Array.from({ length: 120 }, (_, index) => cancelled(index, 'paper')),
      ...Array.from({ length: 3 }, (_, index) => cancelled(500 + index)),
    ]);
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    await expectShown('100 shown');
    fireEvent.click(screen.getByRole('button', { name: 'Show older trades' }));
    await expectShown('120 shown');
    await waitFor(() => expect(screen.queryByText(/^OLD5/)).toBeNull());
  }, 20_000);
});
