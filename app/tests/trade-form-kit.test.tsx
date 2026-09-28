import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JournalRoute } from '../src/app/JournalRoute';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { saveManualTrade } from '../src/application/trades';
import { ToastProvider } from '../src/design-system/primitives';
import { TradeForm } from '../src/features/journal/TradeForm';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-trade-form-kit-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); for (const name of names.splice(0)) await Dexie.delete(name); });

const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const paste = (label: RegExp | string, text: string) => fireEvent.paste(screen.getByLabelText(label), { clipboardData: { getData: () => text } });
const mount = (db: KairosDatabase) => render(<ToastProvider><TradeForm db={db} kind="journal" onSaved={async () => undefined} /></ToastProvider>);
const toastRegion = () => screen.getAllByRole('status').find(element => element.classList.contains('kairos-toast-region'))!;

function fillQuickLog(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
  type(/Symbol/, 'BTCUSDT');
  type(/Market/, 'crypto');
  type(/Direction/, 'long');
  type(/^Quantity/, '2');
  type(/^Opened/, '2026-09-12T10:00');
  type(/^Closed/, '2026-09-12T11:00');
}

function chooseClosed(): void {
  fireEvent.click(screen.getByRole('button', { name: 'All details' }));
  type(/^Status/, 'closed');
}

describe('T-049g the Journal header and the trade form on the kit', () => {
  it('shows the Journal heading, intro and badge, and the "How to log this trade" switch', async () => {
    const db = await database();
    render(<MemoryRouter><ToastProvider><JournalRoute db={db} /></ToastProvider></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'Journal' })).toBeInTheDocument();
    expect(screen.getByText('Log what you know now; plan numbers are optional.')).toBeInTheDocument();
    expect(screen.getByText('Saved on this device')).toBeInTheDocument();
    const view = screen.getByRole('group', { name: 'How to log this trade' });
    const options = within(view).getAllByRole('button');
    expect(options.map(option => option.textContent)).toEqual(['Quick log', 'All details']);
    expect(options.filter(option => option.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('stores a pasted "1,234.50" entry price as exactly 1234.50', async () => {
    const db = await database();
    mount(db);
    fillQuickLog();
    paste(/Entry price/, '1,234.50');
    expect(screen.getByLabelText(/Entry price/)).toHaveValue('1234.50');
    type(/Exit price/, '1300');
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    await waitFor(() => expect(screen.getByText('Trade saved to your journal.')).toBeInTheDocument());
    const repositories = createKairosRepositories(db);
    const [trade] = await repositories.trades.listRecentByUpdatedAt(1);
    const entry = (await repositories.tradeExecutions.listByTradeId(trade!.id)).find(row => row.type === 'entry');
    expect(entry?.price).toBe('1234.50');
  });

  it('asks about "1,234" and refuses to save it, leaving the text as typed', async () => {
    const db = await database();
    mount(db);
    fillQuickLog();
    type(/Entry price/, '1200');
    type(/Exit price/, '1,234');
    fireEvent.blur(screen.getByLabelText(/Exit price/));
    expect(screen.getByText(/Kairos can't tell if 1,234 means 1234 or 1\.234/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText(/Exit price/)).toHaveValue('1,234');
    expect(await db.trades.count()).toBe(0);
  });

  it('reads a pasted planned stop "63.500,25" as 63500.25', async () => {
    const db = await database();
    mount(db);
    fireEvent.click(screen.getByRole('button', { name: 'All details' }));
    paste('Planned stop', '63.500,25');
    expect(screen.getByLabelText('Planned stop')).toHaveValue('63500.25');
  });

  it('removing an entry offers "Undo", which brings the row back with its price and quantity', async () => {
    const db = await database();
    mount(db);
    chooseClosed();
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
    type('Entry 1 price', '100');
    type('Entry 1 quantity', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    expect(screen.queryByLabelText('Entry 1 price')).toBeNull();
    expect(toastRegion()).toHaveTextContent('Entry 1 removed.');
    fireEvent.click(within(toastRegion()).getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Entry 1 price')).toHaveValue('100');
    expect(screen.getByLabelText('Entry 1 quantity')).toHaveValue('2');
  });

  it('"Undo" keeps edits made while the toast was shown', async () => {
    const db = await database();
    mount(db);
    chooseClosed();
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add exit' }));
    type('Entry 1 price', '100');
    type('Exit 2 price', '110');
    fireEvent.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    type('Exit 1 price', '125');
    fireEvent.click(within(toastRegion()).getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Entry 1 price')).toHaveValue('100');
    expect(screen.getByLabelText('Exit 2 price')).toHaveValue('125');
  });

  it('gives only "Save trade" the main glow', async () => {
    const db = await database();
    const { container } = mount(db);
    const glowing = container.querySelectorAll('form [data-kairos-emphasis]');
    expect(glowing).toHaveLength(1);
    expect(glowing[0]).toBe(screen.getByRole('button', { name: 'Save trade' }));
    expect(glowing[0]).toHaveAttribute('data-kairos-emphasis', 'main');
  });

  it('has no WCAG problem in either mode', async () => {
    const db = await database();
    const { container } = mount(db);
    fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'All details' }));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('T-049g fix r1', () => {
  function allDetailsClosed(): void {
    fireEvent.click(screen.getByRole('button', { name: 'All details' }));
    for (const [label, value] of [['Symbol', 'BTCUSDT'], ['Market', 'crypto'], ['Direction', 'long'], ['Status', 'closed'], ['Opened', '2026-09-12T10:00'], ['Closed', '2026-09-12T11:00']]) {
      fireEvent.change(screen.getByLabelText(new RegExp('^' + label), { selector: 'input,select' }), { target: { value } });
    }
  }

  it('after "Save trade" the new form stays empty and no "Undo" is offered for a removed row', async () => {
    const db = await database();
    mount(db);
    allDetailsClosed();
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
    type('Entry 1 price', '100');
    fireEvent.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    expect(within(toastRegion()).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Status/, { selector: 'select' }), { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    await waitFor(() => expect(screen.getByText('Trade saved to your journal.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByLabelText('Entry 1 price')).toBeNull();
  });

  it('on the draft card, a row removed before Cancel does not come back on reopen', async () => {
    const db = await database();
    await saveManualTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'draft', plan: { plannedEntryPrice: '100', plannedQuantity: '2' } });
    render(<MemoryRouter><ToastProvider><JournalRoute db={db} /></ToastProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Open this trade' }));
    const panel = screen.getByRole('region', { name: 'Open BTCUSDT' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Add entry' }));
    fireEvent.change(within(panel).getByLabelText('Entry 1 price'), { target: { value: '100' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove entry 1' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open this trade' }));
    expect(within(screen.getByRole('region', { name: 'Open BTCUSDT' })).queryByLabelText('Entry 1 price')).toBeNull();
  });

  it('after "Remove" focus goes to the price of the row now in its place, else the row before, else "Add …"; after "Undo" to the restored row', async () => {
    const db = await database();
    mount(db);
    chooseClosed();
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add exit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    expect(screen.getByLabelText('Exit 1 price')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Remove entry 2' }));
    expect(screen.getByLabelText('Exit 1 price')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Remove exit 1' }));
    expect(screen.getByRole('button', { name: 'Add exit' })).toHaveFocus();
    fireEvent.click(within(toastRegion()).getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Exit 1 price')).toHaveFocus();
  });
});
