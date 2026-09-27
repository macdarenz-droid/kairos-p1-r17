import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { describeNewsNearTrade } from '../src/application/economic-calendar/calendarWords';
import { projectNewsNearTrade } from '../src/application/economic-calendar/newsNearTrades';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { economicEventId, type EconomicEventRecord } from '../src/domain/economic-calendar/economicEvent';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-news-near-card-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const card = (symbol: string) => screen.getAllByRole('listitem').find(item => within(item).queryByText(symbol) !== null)!;
const HEADING = 'Big news near this trade';
const CPI_LINE = 'US inflation (CPI): scheduled 12 minutes before this trade opened. Source: U.S. Bureau of Labor Statistics. Big news by Kairos\'s rating.';
const FOMC_LINE = 'FOMC statement: scheduled while this trade was open. Added by you.';
const ECB_LINE = 'Euro interest rate decision: scheduled 15 minutes after this trade closed. Source: European Central Bank. Big news by Kairos\'s rating.';

const fetched = { currency: 'USD', impact: null, expected: null, previous: null, actual: null, savedAt: '2026-09-24T03:00:00.000Z', fetchedAt: '2026-09-24T02:55:00.000Z' } as const;
const CPI_BLS: EconomicEventRecord = { ...fetched, id: 'bls:3bc656751421b9fb', source: 'bls', title: 'Consumer Price Index', startsAt: '2026-09-24T12:30:00.000Z' };
const REAL_EARNINGS: EconomicEventRecord = { ...fetched, id: 'bls:00000000000000e2', source: 'bls', title: 'Real Earnings', startsAt: '2026-09-24T13:05:00.000Z' };
const ECB_DAY2: EconomicEventRecord = { ...fetched, currency: 'EUR', id: 'ecb:00000000000000e1', source: 'ecb', title: 'Governing Council of the ECB: monetary policy meeting in Frankfurt (Day 2)', startsAt: '2026-09-24T13:45:00.000Z' };
const typed = (key: string, title: string, startsAt: string, impact: 'high' | 'medium'): EconomicEventRecord => ({
  id: economicEventId('typed', key), source: 'typed', title, currency: 'USD', startsAt, impact, expected: null, previous: null, actual: null, savedAt: '2026-09-20T08:00:00.000Z', fetchedAt: null,
});
const NEWS = [CPI_BLS, typed('a', 'ECB President speaks', '2026-09-24T12:35:00.000Z', 'medium'), typed('b', 'FOMC statement', '2026-09-24T13:00:00.000Z', 'high'), ECB_DAY2];

const closed = (symbol: string, openedAt: string, closedAt: string) => ({
  symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt, closedAt,
  executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: openedAt }, { type: 'exit', price: '110', quantity: '1', executedAt: closedAt }],
} as const);
const BTC = closed('BTCUSDT', '2026-09-24T12:42:00.000Z', '2026-09-24T13:30:00.000Z');
const ETH = closed('ETHUSDT', '2026-09-26T09:00:00.000Z', '2026-09-26T10:00:00.000Z');
const SOL = { symbol: 'SOLUSDT', marketType: 'crypto', side: 'long', status: 'open', grossPnlCurrency: 'USDT', openedAt: '2026-09-24T12:40:00.000Z', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-24T12:40:00.000Z' }] } as const;

async function journal(news: readonly EconomicEventRecord[]): Promise<KairosDatabase> {
  const db = await database();
  for (const input of [BTC, ETH, SOL]) expect((await saveManualTrade(db, input)).ok).toBe(true);
  await db.economicEvents.bulkPut([...news]);
  return db;
}
const lines = (symbol: string) => {
  const box = within(card(symbol)).getByText(HEADING).parentElement!;
  return Array.from(box.children).map(child => child.textContent);
};

describe('T-046n the trade card says when big news was near it', () => {
  it('lists official and your own big news near a closed Journal trade, in time order, and nothing on other cards', async () => {
    const db = await journal(NEWS);
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(within(card('BTCUSDT')).getByText(HEADING)).toBeTruthy());
    expect(lines('BTCUSDT')).toEqual([HEADING, CPI_LINE, FOMC_LINE, ECB_LINE]);
    expect(screen.queryByText(/ECB President speaks/)).toBeNull();
    expect(within(card('ETHUSDT')).queryByText(HEADING)).toBeNull();
    expect(within(card('SOLUSDT')).queryByText(HEADING)).toBeNull();
    expect(screen.queryByText(/no news/i)).toBeNull();
  });

  it('shows three lines and how many more, and never lists news that is not big', async () => {
    const db = await journal([...NEWS, typed('c', 'US jobs report', '2026-09-24T13:10:00.000Z', 'high'), REAL_EARNINGS]);
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(within(card('BTCUSDT')).getByText(HEADING)).toBeTruthy());
    expect(lines('BTCUSDT')).toEqual([HEADING, CPI_LINE, FOMC_LINE, 'US jobs report: scheduled while this trade was open. Added by you.', 'And 1 more big news event near this trade.']);
    expect(screen.queryByText(/Real Earnings/)).toBeNull();
  });

  it('shows the line on a Practice trade card', async () => {
    const db = await database();
    expect((await savePracticeTrade(db, BTC)).ok).toBe(true);
    await db.economicEvents.put(CPI_BLS);
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(within(card('BTCUSDT')).getByText(CPI_LINE)).toBeTruthy());
    expect(lines('BTCUSDT')).toEqual([HEADING, CPI_LINE]);
  });

  it('renders the cards with no news line and no error when the news cannot be read', async () => {
    const db = await journal(NEWS);
    const where = vi.spyOn(db.economicEvents, 'where').mockImplementation(() => { throw new Error('read failed'); });
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    await waitFor(() => expect(where).toHaveBeenCalled());
    expect(screen.queryByText(HEADING)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says 0 and 1 minute in plain words, and "more events" for two or more', () => {
    const trade = { status: 'closed', openedAt: '2026-09-24T12:30:00.000Z', closedAt: '2026-09-24T13:00:00.000Z' } as const;
    const at = (key: string, startsAt: string) => typed(key, `News ${key}`, startsAt, 'high');
    expect(describeNewsNearTrade(projectNewsNearTrade(trade, [at('a', '2026-09-24T12:30:00.000Z')]))).toEqual(['News a: scheduled right when this trade opened. Added by you.']);
    expect(describeNewsNearTrade(projectNewsNearTrade(trade, [at('a', '2026-09-24T12:29:00.000Z')]))).toEqual(['News a: scheduled 1 minute before this trade opened. Added by you.']);
    expect(describeNewsNearTrade(projectNewsNearTrade(trade, [at('a', '2026-09-24T13:00:00.000Z')]))).toEqual(['News a: scheduled right when this trade closed. Added by you.']);
    expect(describeNewsNearTrade(projectNewsNearTrade(trade, [at('a', '2026-09-24T13:01:00.000Z')]))).toEqual(['News a: scheduled 1 minute after this trade closed. Added by you.']);
    expect(describeNewsNearTrade(projectNewsNearTrade(trade, [at('a', '2026-09-24T13:20:00.000Z')]))).toEqual(['News a: scheduled 20 minutes after this trade closed. Added by you.']);
    const five = ['12:10', '12:40', '12:45', '12:50', '12:55'].map((time, index) => at(`n${index}`, `2026-09-24T${time}:00.000Z`));
    expect(describeNewsNearTrade(projectNewsNearTrade(trade, five)).at(-1)).toBe('And 2 more big news events near this trade.');
    expect(describeNewsNearTrade([])).toEqual([]);
    expect(Object.isFrozen(describeNewsNearTrade([]))).toBe(true);
  });
});
