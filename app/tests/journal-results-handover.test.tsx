import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { axeViolations } from './fixtures/axe';

beforeAll(async () => { await import('../src/application/coach/loadCoachNotes'); }, 30_000);
const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-results-handover-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db);
  await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now());
  return db;
}
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = () => '2026-09-18T12:00:00.000Z';
const beyondStop = {
  symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-01T00:00:00.000Z', closedAt: '2026-09-02T10:00:00.000Z',
  plan: { plannedEntryPrice: '100', plannedStopPrice: '95', plannedQuantity: '1' },
  executions: [{ type: 'entry', price: '100', quantity: '3', executedAt: '2026-09-01T00:00:00.000Z' }, { type: 'exit', price: '90', quantity: '3', executedAt: '2026-09-02T10:00:00.000Z' }],
} as const;
const closedPractice = {
  symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-10T09:00:00.000Z', closedAt: '2026-09-10T10:00:00.000Z',
  executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-10T09:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-10T10:00:00.000Z' }],
} as const;
const input = (label: RegExp) => screen.getByLabelText(label, { selector: 'input, select' }) as HTMLInputElement;

describe('T-051e the Journal hands its results to Analysis', () => {
  it('shows a card that opens your results, and keeps the coach after the trade form', async () => {
    const db = await database();
    expect((await saveManualTrade(db, beyondStop)).ok).toBe(true);
    const { container } = render(<MemoryRouter><JournalRoute db={db} now={now} /></MemoryRouter>);
    const coach = await screen.findByRole('region', { name: 'Your coach' });
    await waitFor(() => expect(within(coach).getByText('3 notes')).toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Daily results' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Your discipline' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Your results' })).toBeNull();
    const card = screen.getByRole('heading', { level: 2, name: 'Your results' }).closest('.kairos-card') as HTMLElement;
    expect(within(card).getByText('Your calendar, your numbers and their pictures are in Analysis.', { exact: false })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Open your results' })).toHaveAttribute('href', '/analysis');
    const form = container.querySelector('form')!;
    expect(form.compareDocumentPosition(coach) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll('[data-results-status]')).toHaveLength(0);
    expect(await axeViolations(card)).toEqual([]);

    const tradeCard = await waitFor(() => screen.getAllByRole('listitem').find(item => within(item).queryByText('BTCUSDT') !== null)!);
    fireEvent.click(await within(tradeCard).findByRole('button', { name: 'After the trade: not reviewed yet' }));
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save review' })); });
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Your coach' })).getByText('2 notes')).toBeInTheDocument());
  });
});

describe('T-051e Practice shows the same dashboard for practice trades', () => {
  it('keeps a calculator plan when the period changes, and keeps the period when the plan is saved', async () => {
    const db = await database();
    const router = createMemoryRouter([{ path: '/practice', element: <PracticeRoute db={db} now={now} /> }], { initialEntries: ['/practice?side=long&entry=100&stop=90&quantity=1'] });
    render(<RouterProvider router={router} />);
    const results = await screen.findByRole('region', { name: 'Your practice results' });
    const period = await within(results).findByRole('combobox', { name: 'Period' });
    fireEvent.change(period, { target: { value: 'year' } });
    await waitFor(() => expect(router.state.location.search).toBe('?side=long&entry=100&stop=90&quantity=1&period=year'));
    await screen.findByText(/^From the calculator:/);

    fireEvent.change(input(/^Symbol/), { target: { value: 'ETHUSDT' } });
    fireEvent.change(input(/^Market/), { target: { value: 'crypto' } });
    fireEvent.change(input(/^Status/), { target: { value: 'draft' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save practice trade' })); });
    await waitFor(() => expect(router.state.location.search).toBe('?period=year'));
    expect(document.querySelectorAll('[data-results-status]')).toHaveLength(1);
  });

  it('has one glow, the trade form\'s Save button, with a closed practice trade', async () => {
    const db = await database();
    expect((await savePracticeTrade(db, closedPractice)).ok).toBe(true);
    render(<MemoryRouter><PracticeRoute db={db} now={now} /></MemoryRouter>);
    const results = await screen.findByRole('region', { name: 'Your practice results' });
    await waitFor(() => expect(results).toHaveAttribute('data-results-status', 'ready'));
    await waitFor(() => expect(results).not.toHaveAttribute('aria-busy'));
    const glowing = document.querySelectorAll('[data-kairos-emphasis]');
    expect(glowing).toHaveLength(1);
    expect(glowing[0]).toHaveTextContent('Save practice trade');
    expect(document.querySelectorAll('[data-results-status]')).toHaveLength(1);
    expect(await axeViolations(results)).toEqual([]);
  });
});
