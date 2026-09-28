import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { saveTradeDiscipline } from '../src/application/discipline';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { TradeId } from '../src/domain/trades';
import { CoachCard } from '../src/features/discipline/CoachCard';

beforeAll(async () => { await import('../src/application/coach/loadCoachNotes'); }, 30_000);
const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-coach-card-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = () => '2026-09-18T12:00:00.000Z';
async function withZone(db: KairosDatabase) { await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now()); }
const tradeA = (quantity = '3', exit = '90') => ({
  symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-01T00:00:00.000Z', closedAt: '2026-09-02T10:00:00.000Z',
  plan: { plannedEntryPrice: '100', plannedStopPrice: '95', plannedQuantity: '1' },
  executions: [{ type: 'entry', price: '100', quantity, executedAt: '2026-09-01T00:00:00.000Z' }, { type: 'exit', price: exit, quantity, executedAt: '2026-09-02T10:00:00.000Z' }],
} as const);
const region = (name = 'Your coach') => screen.getByRole('region', { name });
const EMPTY = 'Nothing to point out this month. Your coach speaks up only when your own trades, plans or rules show something to work on.';

describe('T-041e the coach card under "Your discipline"', () => {
  it('shows the first note in the Journal, after "Your discipline", and follows a saved review', async () => {
    const db = await database();
    await withZone(db);
    expect((await saveManualTrade(db, tradeA())).ok).toBe(true);
    render(<MemoryRouter><JournalRoute db={db} now={now} /></MemoryRouter>);
    await waitFor(() => expect(within(region()).getByText('3 notes')).toBeTruthy());
    expect(within(region()).getByText('1 trade this month closed beyond its stop.')).toBeTruthy();
    expect(within(region()).getByText(/^Decide your stop before you enter, /)).toBeTruthy();
    expect(within(region()).getByRole('link', { name: 'See all your coach notes' }).getAttribute('href')).toBe('/coach');
    const discipline = screen.getByRole('region', { name: 'Your discipline' });
    expect(discipline.compareDocumentPosition(region()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const role of ['listitem', 'status', 'alert']) expect(within(region()).queryAllByRole(role)).toHaveLength(0);

    const card = await waitFor(() => screen.getAllByRole('listitem').find(item => within(item).queryByText('BTCUSDT') !== null)!);
    fireEvent.click(await within(card).findByRole('button', { name: 'After the trade: not reviewed yet' }));
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save review' })); });
    await waitFor(() => expect(within(region()).getByText('2 notes')).toBeTruthy());
  });

  it('says when there is nothing to point out', async () => {
    const db = await database();
    await withZone(db);
    const saved = await saveManualTrade(db, tradeA('1', '110'));
    if (!saved.ok) throw new Error('fixture');
    expect((await saveTradeDiscipline(db, { tradeId: saved.tradeId as TradeId, scope: 'real', half: 'review', answers: [], mistakeIds: ['early-exit'], note: '' })).ok).toBe(true);
    render(<MemoryRouter><JournalRoute db={db} now={now} /></MemoryRouter>);
    await waitFor(() => expect(within(region()).getByText(EMPTY)).toBeTruthy());
    expect(within(region()).getByRole('link', { name: 'Open your coach' }).getAttribute('href')).toBe('/coach');
  });

  it('has a practice coach in Practice, apart from the Journal', async () => {
    const db = await database();
    await withZone(db);
    expect((await savePracticeTrade(db, tradeA())).ok).toBe(true);
    render(<MemoryRouter><PracticeRoute db={db} now={now} /></MemoryRouter>);
    await waitFor(() => expect(within(region('Your practice coach')).getByText('3 notes')).toBeTruthy());
    expect(within(region('Your practice coach')).getByRole('link', { name: 'See all your coach notes' }).getAttribute('href')).toBe('/practice/coach');
    cleanup();
    render(<MemoryRouter><JournalRoute db={db} now={now} /></MemoryRouter>);
    await waitFor(() => expect(within(region()).getByText(EMPTY)).toBeTruthy());
  });

  it('works without a router', async () => {
    const db = await database();
    await withZone(db);
    expect((await saveManualTrade(db, tradeA())).ok).toBe(true);
    render(<JournalRoute db={db} now={now} />);
    const link = await waitFor(() => within(region()).getByRole('link', { name: 'See all your coach notes' }));
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/coach');
  });

  it('says when it could not load', async () => {
    const db = await database();
    vi.spyOn(db.metadata, 'get').mockRejectedValue(new Error('storage'));
    render(<CoachCard db={db} scope="real" now={now} refreshRevision={0} disciplineRevision={0} />);
    expect(await screen.findByText('Kairos could not load your coach. Your trades are not affected.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
