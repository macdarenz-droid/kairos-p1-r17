import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { TradeForm } from '../src/features/journal/TradeForm';

const names: string[] = [];
async function database() { const name = `kairos-trade-form-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillDraft(): void {
  type(/Symbol/, 'ethusdt');
  type(/Market/, 'crypto');
  type(/Direction/, 'long');
  type(/^Status/, 'draft');
}

describe('TradeForm on Practice', () => {
  it('saves the optional trade plan with a practice trade', async () => {
    const db = await database();
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    fillDraft();
    fireEvent.click(screen.getByText('Trade plan · Optional'));
    type('Planned entry', '100');
    type('Planned quantity', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Save practice trade' }));
    expect((await screen.findByRole('status')).textContent).toBe('Practice trade saved. It stays out of your journal results.');
    const trades = await db.trades.toArray();
    const plans = await db.tradePlans.toArray();
    expect(trades).toHaveLength(1);
    expect(trades[0].source).toBe('paper');
    expect(plans).toHaveLength(1);
    expect(plans[0].tradeId).toBe(trades[0].id);
  });

  it('shows the plan error and writes nothing for a bad planned entry', async () => {
    const db = await database();
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    fillDraft();
    fireEvent.click(screen.getByText('Trade plan · Optional'));
    type('Planned entry', 'abc');
    fireEvent.click(screen.getByRole('button', { name: 'Save practice trade' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a positive number or leave this field empty.');
    expect(await db.trades.count()).toBe(0);
    expect(await db.tradePlans.count()).toBe(0);
  });
});

describe('TradeForm on its own', () => {
  it('calls onSaved once, after a valid save and with the success banner already shown', async () => {
    const db: KairosDatabase = await database();
    const seen: (string | null)[] = [];
    const onSaved = vi.fn(async () => { seen.push(screen.queryByRole('status')?.textContent ?? null); });
    render(<TradeForm db={db} kind="journal" onSaved={onSaved} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Choose a market.');
    expect(onSaved).not.toHaveBeenCalled();

    fillDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(seen).toEqual(['Trade saved to your journal.']);
    expect(await db.trades.count()).toBe(1);
  });

  it('uses the wording of its kind', async () => {
    const db = await database();
    const { unmount } = render(<TradeForm db={db} kind="journal" onSaved={async () => undefined} />);
    expect(screen.getByRole('group', { name: 'Trade details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save trade' })).toBeInTheDocument();
    unmount();
    render(<TradeForm db={db} kind="practice" onSaved={async () => undefined} />);
    expect(screen.getByRole('group', { name: 'Practice trade details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save practice trade' })).toBeInTheDocument();
  });
});
