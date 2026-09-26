import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { loadDisciplineScore } from '../src/application/discipline';
import { listJournalVisualPnlDailySummary } from '../src/application/journal';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = () => '2026-09-20T12:00:00.000Z';
const closed = (symbol: string, day: string, exitPrice: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: `${day}T09:00:00.000Z`, closedAt: `${day}T10:00:00.000Z`, executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: `${day}T09:00:00.000Z` }, { type: 'exit', price: exitPrice, quantity: '1', executedAt: `${day}T10:00:00.000Z` }] } as const);

async function seeded(withTimeZone = true): Promise<KairosDatabase> {
  const name = `kairos-practice-results-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db);
  if (withTimeZone) await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now());
  const results = [
    await saveManualTrade(db, closed('BTCUSDT', '2026-09-17', '150')),
    await savePracticeTrade(db, closed('ADAUSDT', '2026-09-16', '120')),
    await savePracticeTrade(db, closed('ETHUSDT', '2026-09-18', '10')),
    await savePracticeTrade(db, { symbol: 'SOLUSDT', marketType: 'crypto', side: 'short', status: 'open', openedAt: '2026-09-18T11:00:00.000Z' }),
  ];
  if (!results.every((result) => result.ok)) throw new Error('fixture');
  return db;
}
const day = (region: HTMLElement, key: string) => region.querySelector(`[data-day-key="${key}"]`)?.getAttribute('data-day-result');

describe('P26.1 practice results', () => {
  it('reads the practice scope when asked, and real by default', async () => {
    const db = await seeded();
    expect((await listJournalVisualPnlDailySummary(db, 'UTC', { scope: 'practice' })).days.map((item) => item.dayKey)).toEqual(['2026-09-16', '2026-09-18']);
    expect((await listJournalVisualPnlDailySummary(db, 'UTC')).days.map((item) => item.dayKey)).toEqual(['2026-09-17']);
    const practice = await loadDisciplineScore(db, { now: now(), scope: 'practice' });
    const real = await loadDisciplineScore(db, { now: now() });
    expect(practice.kind === 'ready' && practice.score.available && practice.score.review.closedCount).toBe(2);
    expect(real.kind === 'ready' && real.score.available && real.score.review.closedCount).toBe(1);
  });

  it('pictures only practice trades on the Practice page', async () => {
    const db = await seeded();
    render(<MemoryRouter><PracticeRoute db={db} now={now} /></MemoryRouter>);
    const region = await screen.findByRole('region', { name: 'Your practice results' });
    await waitFor(() => expect(day(region, '2026-09-16')).toBe('profit'));
    expect(day(region, '2026-09-18')).toBe('loss');
    expect(day(region, '2026-09-17')).toBe('no-trades');
    expect(within(region).getByText('Your practice results over time')).toBeTruthy();
    expect(within(region).getByRole('img', { name: /^Total result so far: -70 USDT/ })).toBeTruthy();
    expect(within(region).getByRole('heading', { name: 'Your practice discipline' })).toBeTruthy();
    await waitFor(() => expect(within(region).getByRole('img', { name: 'Discipline score: 0 out of 100' })).toBeTruthy());
    fireEvent.click(within(region).getByRole('button', { name: /^18 September 2026/ }));
    const heading = await within(region).findByRole('heading', { name: /Trades closed on 18 September 2026/ });
    await waitFor(() => expect(within(heading.parentElement!.parentElement!).getByText('ETHUSDT')).toBeTruthy());
    expect(region.contains(heading)).toBe(true);
    expect(screen.queryByRole('region', { name: 'Daily results' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Your discipline' })).toBeNull();
  });

  it('leaves the Journal on real trades', async () => {
    const db = await seeded();
    render(<MemoryRouter><JournalRoute db={db} now={now} /></MemoryRouter>);
    const region = await screen.findByRole('region', { name: 'Daily results' });
    await waitFor(() => expect(day(region, '2026-09-17')).toBe('profit'));
    expect(day(region, '2026-09-16')).toBe('no-trades');
    expect(day(region, '2026-09-18')).toBe('no-trades');
    expect(within(region).getByRole('heading', { name: 'Your discipline' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Your practice results' })).toBeNull();
  });

  it('refreshes the pictures after a practice trade is saved', async () => {
    const db = await seeded();
    render(<MemoryRouter><PracticeRoute db={db} now={now} /></MemoryRouter>);
    const region = await screen.findByRole('region', { name: 'Your practice results' });
    await waitFor(() => expect(day(region, '2026-09-16')).toBe('profit'));
    fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
    const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label, { selector: 'input, select' }), { target: { value } });
    type(/^Symbol/, 'XRPUSDT');
    type(/^Market/, 'crypto');
    type(/^Direction/, 'long');
    type(/^Entry price/, '100');
    type(/^Exit price/, '110');
    type(/^Quantity/, '2');
    type(/^Opened/, '2026-09-19T12:00');
    type(/^Closed/, '2026-09-19T13:00');
    type(/Currency code/, 'USDT');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save practice trade' })); });
    await waitFor(() => expect(day(region, '2026-09-19')).toBe('profit'));
  });

  it('asks for a time zone in its own words', async () => {
    const db = await seeded(false);
    render(<MemoryRouter><PracticeRoute db={db} now={now} /></MemoryRouter>);
    const region = await screen.findByRole('region', { name: 'Your practice results' });
    expect(await within(region).findByText('Choose a time zone in Settings to see your practice results.')).toBeTruthy();
  });
});
