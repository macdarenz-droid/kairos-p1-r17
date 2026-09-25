import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { savePracticeTrade } from '../src/application/practice';
import { practiceMoneyMetadataKey, savePracticeMoney } from '../src/application/practice/practiceMoney';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { PracticeMoneyCard } from '../src/features/practice/PracticeMoneyCard';

const names: string[] = [];
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-practice-card-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
const now = () => '2026-09-25T12:00:00.000Z';
const lossTrade = { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: '10', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }] } as const;
const card = () => screen.getByRole('region', { name: 'Your practice money' });
const nowLine = () => card().querySelector('.kairos-practice-money__now')?.textContent ?? '';
const bar = (name: string) => card().querySelector(`[data-bar="${name}"]`)!;
const typeIn = (label: string, value: string) => fireEvent.change(within(card()).getByLabelText(new RegExp(`^${label}`)), { target: { value } });
const press = (name: string) => act(async () => { fireEvent.click(within(card()).getByRole('button', { name })); });

describe('P26.3 Your practice money', () => {
  it('asks for a start, refuses bad input, then shows the money', async () => {
    const db = await database();
    render(<PracticeMoneyCard db={db} refreshRevision={0} />);
    expect(await within(card()).findByText('Practise with pretend money before you risk real money. Choose how much to start with.')).toBeTruthy();
    expect(within(card()).getByLabelText(/^Starting amount/)).toBeTruthy();
    expect(within(card()).getByLabelText(/^Money currency/)).toBeTruthy();
    await press('Start practising');
    expect(within(card()).getByText('Use a number above 0, like 10000 or 2500.50.')).toBeTruthy();
    expect(await db.metadata.count()).toBe(0);
    expect(document.activeElement).toBe(within(card()).getByLabelText(/^Starting amount/));
    typeIn('Starting amount', '10000');
    typeIn('Money currency', '$');
    await press('Start practising');
    expect(within(card()).getByText('Use a currency code such as USD or USDT: letters and digits only, at most 12.')).toBeTruthy();
    expect(document.activeElement).toBe(within(card()).getByLabelText(/^Money currency/));
    typeIn('Money currency', 'usdt');
    await press('Start practising');
    expect((await within(card()).findByRole('status', undefined, { timeout: 3000 })).textContent).toBe('Practice money saved.');
    await waitFor(() => expect(nowLine()).toContain('Now: 10000 USDT'), { timeout: 3000 });
    expect(within(card()).getByText('No closed practice trades yet.')).toBeTruthy();
    expect(within(card()).getByRole('img', { name: 'Practice money: started with 10000 USDT, now 10000 USDT.' })).toBeTruthy();
    expect(bar('now').getAttribute('data-steps')).toBe('20');
    expect(document.activeElement).toBe(within(card()).getByRole('heading', { name: 'Your practice money' }));
  });

  it('shows what closed practice trades made of it', async () => {
    const db = await database();
    await savePracticeMoney(db, { startAmount: '1000', currency: 'USDT' }, { now });
    expect((await saveLossTrade(db)).ok).toBe(true);
    render(<PracticeMoneyCard db={db} refreshRevision={0} />);
    await waitFor(() => expect(nowLine()).toContain('Now: 910 USDT'), { timeout: 3000 });
    expect(within(card()).getByText('1 closed practice trade: -90 USDT so far.')).toBeTruthy();
    expect(bar('start').getAttribute('data-steps')).toBe('20');
    expect(bar('now').getAttribute('data-steps')).toBe('18');
    expect(bar('now').getAttribute('data-outcome')).toBe('loss');
  });

  it('changes the start, or cancels without writing', async () => {
    const db = await database();
    await savePracticeMoney(db, { startAmount: '1000', currency: 'USDT' }, { now });
    expect((await saveLossTrade(db)).ok).toBe(true);
    render(<PracticeMoneyCard db={db} refreshRevision={0} />);
    await waitFor(() => expect(nowLine()).toContain('Now: 910 USDT'), { timeout: 3000 });
    await press('Change starting amount');
    const amount = within(card()).getByLabelText(/^Starting amount/) as HTMLInputElement;
    expect(amount.value).toBe('1000');
    expect((within(card()).getByLabelText(/^Money currency/) as HTMLInputElement).value).toBe('USDT');
    expect(document.activeElement).toBe(amount);
    const before = (await db.metadata.get(practiceMoneyMetadataKey))!.updatedAt;
    await press('Cancel');
    expect((await db.metadata.get(practiceMoneyMetadataKey))!.updatedAt).toBe(before);
    expect(nowLine()).toContain('Now: 910 USDT');
    await press('Change starting amount');
    typeIn('Starting amount', '2000');
    await press('Save');
    await waitFor(() => expect(nowLine()).toContain('Now: 1910 USDT'), { timeout: 3000 });
  });

  it('says why when it cannot add up, with no number', async () => {
    const db = await database();
    await savePracticeMoney(db, { startAmount: '1000', currency: 'EUR' }, { now });
    expect((await saveLossTrade(db)).ok).toBe(true);
    render(<PracticeMoneyCard db={db} refreshRevision={0} />);
    expect(await within(card()).findByText('Your closed practice trades are in USDT, not EUR. To count them, choose EUR on the Currency page and add any missing exchange rates, or change your practice money to USDT.')).toBeTruthy();
    expect(within(card()).queryByRole('img', { name: /^Practice money:/ })).toBeNull();
    expect(card().querySelector('.kairos-practice-money__now')).toBeNull();
  });

  it('sits before the trade form and updates after a practice save', async () => {
    const db = await database();
    await savePracticeMoney(db, { startAmount: '1000', currency: 'USDT' }, { now });
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(nowLine()).toContain('Now: 1000 USDT'), { timeout: 3000 });
    const save = screen.getByRole('button', { name: 'Save practice trade' });
    expect(card().compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
    const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label, { selector: 'input, select' }), { target: { value } });
    type(/^Symbol/, 'XRPUSDT');
    type(/^Market/, 'crypto');
    type(/^Direction/, 'long');
    type(/^Entry price/, '100');
    type(/^Exit price/, '110');
    type(/^Quantity/, '2');
    type(/^Opened/, '2026-09-19T12:00');
    type(/^Closed/, '2026-09-19T13:00');
    type(/Currency code/, 'USDT');
    await act(async () => { fireEvent.click(save); });
    await waitFor(() => expect(nowLine()).toContain('Now: 1020 USDT'), { timeout: 3000 });
  });
});

function saveLossTrade(db: KairosDatabase) {
  return savePracticeTrade(db, lossTrade);
}
