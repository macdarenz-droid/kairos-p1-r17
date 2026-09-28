import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it } from 'vitest';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { practicePlanDraft, practicePlanHref, readPracticePlanStart } from '../src/application/practice/practicePlanStart';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { DecimalString } from '../src/domain/trades';
import { CalculatorsScreen } from '../src/features/learn/CalculatorsScreen';

const names: string[] = [];
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-practice-plan-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
const LONG = 'side=long&entry=100&stop=95&quantity=2';
const long = { side: 'long', entryPrice: '100' as DecimalString, stopPrice: '95' as DecimalString, quantity: '2' as DecimalString } as const;
const input = (label: RegExp) => screen.getByLabelText(label, { selector: 'input, select' }) as HTMLInputElement;

describe('P26.4 the calculator → Practice address', () => {
  it('reads a long and a short, and round-trips the href', () => {
    const plan = readPracticePlanStart(new URLSearchParams(LONG));
    expect(plan).toEqual(long);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(readPracticePlanStart(new URLSearchParams('side=short&entry=100&stop=105&quantity=2'))).toEqual({ side: 'short', entryPrice: '100', stopPrice: '105', quantity: '2' });
    const href = practicePlanHref(long);
    expect(href).toBe(`/practice?${LONG}`);
    expect(readPracticePlanStart(new URLSearchParams(href.split('?')[1]))).toEqual(long);
  });

  it('refuses anything that is not a sound plan', () => {
    for (const search of [
      'entry=100&stop=95&quantity=2', 'side=up&entry=100&stop=95&quantity=2', 'side=long&entry=abc&stop=95&quantity=2',
      'side=long&entry=100&stop=-1&quantity=2', 'side=long&entry=100&stop=95&quantity=0', 'side=long&entry=100&stop=100&quantity=2',
      'side=long&entry=100&stop=105&quantity=2', 'side=short&entry=100&stop=95&quantity=2', `side=long&entry=1${'0'.repeat(30)}&stop=95&quantity=2`,
    ]) expect(readPracticePlanStart(new URLSearchParams(search))).toBeNull();
  });

  it('starts a draft with the direction and the plan only', () => {
    const draft = practicePlanDraft(long);
    expect(draft).toMatchObject({ side: 'long', symbol: '', marketType: '', status: '', plan: { plannedEntryPrice: '100', plannedStopPrice: '95', plannedTargetPrice: '', plannedQuantity: '2' } });
  });
});

describe('P26.4 the calculator link', () => {
  const calculator = () => screen.getByRole('region', { name: 'How much can I buy?' });
  const fill = (...values: string[]) => {
    const labels = ['Money in your account', "Most you're willing to lose (%)", 'Entry price', 'Stop price'];
    values.forEach((value, index) => fireEvent.change(within(calculator()).getByRole('textbox', { name: labels[index] }), { target: { value } }));
  };
  it('links the owner plan to Practice', () => {
    render(<MemoryRouter><CalculatorsScreen /></MemoryRouter>);
    expect(within(calculator()).queryByRole('link', { name: 'Try it as a practice trade' })).toBeNull();
    fill('1000', '1', '100', '95');
    expect(within(calculator()).getByRole('link', { name: 'Try it as a practice trade' }).getAttribute('href')).toBe(`/practice?${LONG}`);
    fill('100', '1', '100', '97');
    expect(within(calculator()).getByRole('link', { name: 'Try it as a practice trade' }).getAttribute('href')).toBe('/practice?side=long&entry=100&stop=97&quantity=0.33333333');
  });
});

describe('P26.4 the Practice page with a plan', () => {
  it('fills the plan, saves it, then clears the address and the note', async () => {
    const db = await database();
    const router = createMemoryRouter([{ path: '/practice', element: <PracticeRoute db={db} /> }], { initialEntries: [`/practice?${LONG}`] });
    render(<RouterProvider router={router} />);
    const note = await screen.findByText(/^From the calculator:/);
    expect(note.textContent!.startsWith('From the calculator: buy up to 2, entry 100, stop 95.')).toBe(true);
    expect(input(/^Direction/).value).toBe('long');
    expect(input(/^Planned entry/).value).toBe('100');
    expect(input(/^Planned stop/).value).toBe('95');
    expect(input(/^Planned quantity/).value).toBe('2');
    expect(input(/^Planned target/).value).toBe('');
    expect(input(/^Planned stop/).closest('details')!.hasAttribute('open')).toBe(true);
    fireEvent.change(input(/^Symbol/), { target: { value: 'ETHUSDT' } });
    fireEvent.change(input(/^Market/), { target: { value: 'crypto' } });
    fireEvent.change(input(/^Status/), { target: { value: 'draft' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save practice trade' })); });
    expect((await screen.findByRole('status')).textContent).toBe('Practice trade saved. It stays out of your journal results.');
    const [trade] = await db.trades.toArray();
    expect(trade).toMatchObject({ source: 'paper', side: 'long' });
    expect(await db.tradePlans.where('tradeId').equals(trade.id).first()).toMatchObject({ plannedStopPrice: '95', plannedQuantity: '2' });
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await waitFor(() => expect(screen.queryByText(/^From the calculator:/)).toBeNull());
    expect(input(/^Planned stop/).value).toBe('');
  });

  it('ignores a bad address and links to the calculators', async () => {
    const db = await database();
    render(<MemoryRouter initialEntries={['/practice?side=long&entry=100&stop=105&quantity=2']}><PracticeRoute db={db} /></MemoryRouter>);
    expect(screen.queryByText(/^From the calculator:/)).toBeNull();
    expect(input(/^Planned stop/).value).toBe('');
    expect(input(/^Direction/).value).toBe('');
    expect(screen.getByRole('link', { name: 'Work it out in the calculators' }).getAttribute('href')).toBe('/library/calculators');
  });

  it('is never read by the Journal', async () => {
    const db = await database();
    render(<MemoryRouter initialEntries={[`/journal?${LONG}`]}><JournalRoute db={db} /></MemoryRouter>);
    expect(input(/^Direction/).value).toBe('');
    expect(input(/^Planned stop/).value).toBe('');
  });
});
