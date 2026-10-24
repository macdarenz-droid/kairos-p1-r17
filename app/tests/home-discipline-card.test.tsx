import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { saveTradeDiscipline } from '../src/application/discipline';
import { writeGoalsPreference } from '../src/application/goals';
import { listJournalHistory } from '../src/application/journal';
import { saveManualTrade } from '../src/application/trades';
import { updateOpenManualTrade } from '../src/application/trades/updateOpenManualTrade';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS } from '../src/domain/discipline';
import type { TradeId } from '../src/domain/trades';
import { HomeDisciplineCard } from '../src/features/discipline/HomeDisciplineCard';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({ HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => <div>market runtime</div> }));
import { HomeRoute } from '../src/app/HomeRoute';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-home-discipline-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = () => '2026-09-18T12:00:00.000Z';
const heading = () => screen.findByRole('heading', { name: 'Your discipline and goals' });
async function withZone(db: KairosDatabase) { await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now()); }

/** A trade closed in September whose checklist was answered while it was open (the checklist is refused on a closed trade). */
async function closedWithFullChecklist(db: KairosDatabase): Promise<TradeId> {
  const saved = await saveManualTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', grossPnlCurrency: 'USDT', openedAt: '2026-09-02T09:00:00.000Z', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-02T09:00:00.000Z' }] });
  if (!saved.ok) throw new Error('fixture');
  const tradeId = saved.tradeId as TradeId;
  const checklist = await saveTradeDiscipline(db, { tradeId, scope: 'real', half: 'checklist', answers: KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist.map(item => ({ itemId: item.id, answer: 'yes' as const })) });
  if (!checklist.ok) throw new Error(checklist.reason);
  const expected = (await listJournalHistory(db)).find(entry => entry.trade.id === tradeId)!;
  const closed = await updateOpenManualTrade(db, { expected, status: 'closed', closedAt: '2026-09-02T10:00:00.000Z', executions: [{ type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-02T10:00:00.000Z' }], fees: [] });
  if (!closed.ok) throw new Error('close fixture');
  const review = await saveTradeDiscipline(db, { tradeId, scope: 'real', half: 'review', answers: [], mistakeIds: ['moved-stop'], note: '' });
  if (!review.ok) throw new Error(review.reason);
  return tradeId;
}

describe('T-033c Home "Your discipline and goals" card', () => {
  it('shows the ring, the parts and the goals from their owners', async () => {
    const db = await database();
    await withZone(db);
    expect((await writeGoalsPreference(createKairosRepositories(db).metadata, { tradesPerMonthTarget: '20', maxTradesPerDay: '3' }, now())).ok).toBe(true);
    await closedWithFullChecklist(db);
    await saveManualTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-05T09:00:00.000Z', closedAt: '2026-09-05T10:00:00.000Z', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-05T09:00:00.000Z' }, { type: 'exit', price: '90', quantity: '1', executedAt: '2026-09-05T10:00:00.000Z' }] });
    render(<MemoryRouter><HomeDisciplineCard db={db} now={now} /></MemoryRouter>);
    expect(await screen.findByRole('img', { name: 'Discipline score: 75 out of 100' })).toBeTruthy();
    expect(screen.getByText('Checklist 100% · Reviews 50%')).toBeTruthy();
    expect(screen.getByText('Closed trades: 2 of 20')).toBeTruthy();
    expect(screen.getByText('Trades opened today: 0 of 3 allowed')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See your goals' }).getAttribute('href')).toBe('/goals');
    expect(screen.getByRole('link', { name: 'See your checklist and reviews' }).getAttribute('href')).toBe('/journal');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('says what is missing before any goal or trade', async () => {
    const db = await database();
    await withZone(db);
    render(<MemoryRouter><HomeDisciplineCard db={db} now={now} /></MemoryRouter>);
    expect(await screen.findByText('No goals set yet.')).toBeTruthy();
    expect(screen.getByText('Your score appears after your first closed trade this month.')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Discipline score: not available yet' })).toBeTruthy();
  });

  it('points to Settings without a time zone', async () => {
    const db = await database();
    render(<MemoryRouter><HomeDisciplineCard db={db} now={now} /></MemoryRouter>);
    expect(await screen.findByText(/Choose your time zone in Settings to see your discipline and goals\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Settings' }).getAttribute('href')).toBe('/settings');
  });

  it('uses plain links outside a router', async () => {
    const db = await database();
    await withZone(db);
    render(<HomeDisciplineCard db={db} now={now} />);
    const link = await screen.findByRole('link', { name: 'See your goals' });
    expect(link.getAttribute('href')).toBe('/goals');
    expect(link.tagName).toBe('A');
  });

  it('opens in the Your Trades view of Home only', async () => {
    const db = await database();
    await withZone(db);
    render(<MemoryRouter><HomeRoute db={db} now={now} /></MemoryRouter>);
    expect(screen.queryByRole('heading', { name: 'Your discipline and goals' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Your Trades' }));
    const region = screen.getByRole('region', { name: 'Your Trades' });
    await heading();
    expect(within(region).getByRole('heading', { name: 'Your discipline and goals' })).toBeTruthy();
    await waitFor(() => expect(within(region).queryByText('Loading your discipline and goals…')).toBeNull());
  });
});
