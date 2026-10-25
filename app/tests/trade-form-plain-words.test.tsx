import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { JournalRoute } from '../src/app/JournalRoute';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { TradeForm, type TradeFormKind } from '../src/features/journal/TradeForm';

const names: string[] = [];
async function database() { const name = `kairos-trade-form-words-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const JARGON = /\b(fills?|executions?|unexecuted)\b|P&L/i;

describe('the trade form in plain words', () => {
  it.each<TradeFormKind>(['journal', 'practice'])('uses no jargon on the empty %s form', async kind => {
    const db = await database();
    const { container } = render(<TradeForm db={db} kind={kind} onSaved={async () => undefined} />);
    expect(container.textContent).not.toMatch(JARGON);
    type(/^Status/, 'draft');
    expect(container.textContent).not.toMatch(JARGON);
  });

  it('shows no "Local-first" badge on the Journal page', async () => {
    const db = await database();
    const { container } = render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    expect(container.textContent).not.toContain('Local-first');
    expect(screen.getByText('Saved on this device')).toBeInTheDocument();
  });

  it('describes the Status select with the status hint', async () => {
    const db = await database();
    render(<TradeForm db={db} kind="journal" onSaved={async () => undefined} />);
    const status = screen.getByLabelText(/^Status/);
    expect(status).toHaveAccessibleDescription('Choose the state that matches the trade right now.');
    type(/^Status/, 'closed');
    expect(status).toHaveAccessibleDescription('Closed trades need both opened and closed date and time.');
  });

  it('marks the save button busy while saving', async () => {
    const db = await database();
    render(<TradeForm db={db} kind="journal" onSaved={async () => undefined} />);
    type(/Symbol/, 'btcusdt');
    type(/Market/, 'crypto');
    type(/Direction/, 'long');
    type(/^Status/, 'draft');
    vi.spyOn(db, 'transaction').mockReturnValue(new Promise(() => undefined) as never);
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    const button = await screen.findByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('names the closed-trade guidance note "Result guidance"', async () => {
    const db = await database();
    render(<TradeForm db={db} kind="journal" onSaved={async () => undefined} />);
    type(/^Status/, 'closed');
    expect(screen.getByRole('note', { name: 'Result guidance' })).toHaveTextContent('result stays unavailable');
  });
});
