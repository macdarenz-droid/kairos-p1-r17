import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeNewsNearTrade } from '../src/application/economic-calendar/calendarWords';
import { projectNewsNearTrade } from '../src/application/economic-calendar/newsNearTrades';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { economicEventId, type EconomicEventRecord } from '../src/domain/economic-calendar/economicEvent';
import type { TradeId } from '../src/domain/trades';
import { renderTradePage, tradePageHeading, tradePagePart } from './fixtures/tradePage';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-news-near-card-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

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

async function journal(news: readonly EconomicEventRecord[]): Promise<{ readonly db: KairosDatabase; readonly btc: TradeId; readonly eth: TradeId; readonly sol: TradeId }> {
  const db = await database();
  const ids: TradeId[] = [];
  for (const input of [BTC, ETH, SOL]) {
    const saved = await saveManualTrade(db, input);
    expect(saved.ok).toBe(true);
    if (saved.ok) ids.push(saved.tradeId);
  }
  await db.economicEvents.bulkPut([...news]);
  return { db, btc: ids[0]!, eth: ids[1]!, sol: ids[2]! };
}
// T-060c: the news is on the trade's own page, under "Big news near this trade": its heading, then one line each.
const lines = () => Array.from(screen.getByRole('region', { name: HEADING }).querySelectorAll('h2, p'), line => line.textContent);
/** For a page that should show no news: once the page's news read (if it makes one) has had time to answer. */
async function newsSettled(where?: { readonly mock: { readonly calls: readonly unknown[] } }): Promise<void> {
  if (where) await waitFor(() => expect(where.mock.calls.length).toBeGreaterThan(0));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
}

describe('T-046n the trade page says when big news was near it', () => {
  it('lists official and your own big news near a closed Journal trade, in time order, and nothing on other trades', async () => {
    const { db, btc, eth, sol } = await journal(NEWS);
    const where = vi.spyOn(db.economicEvents, 'where');
    renderTradePage(db, btc);
    await tradePageHeading('BTCUSDT · Long');
    await waitFor(() => expect(tradePagePart(HEADING).getByText(HEADING)).toBeTruthy());
    expect(lines()).toEqual([HEADING, CPI_LINE, FOMC_LINE, ECB_LINE]);
    expect(screen.queryByText(/ECB President speaks/)).toBeNull();
    expect(screen.queryByText(/no news/i)).toBeNull();
    cleanup();

    where.mockClear();
    renderTradePage(db, eth);
    await tradePageHeading('ETHUSDT · Long');
    await newsSettled(where);
    expect(screen.queryByText(HEADING)).toBeNull();
    expect(screen.queryByText(/no news/i)).toBeNull();
    cleanup();

    // An open trade has no news read at all.
    where.mockClear();
    renderTradePage(db, sol);
    await tradePageHeading('SOLUSDT · Long');
    await newsSettled();
    expect(where).not.toHaveBeenCalled();
    expect(screen.queryByText(HEADING)).toBeNull();
    expect(screen.queryByText(/no news/i)).toBeNull();
  });

  it('shows three lines and how many more, and never lists news that is not big', async () => {
    const { db, btc } = await journal([...NEWS, typed('c', 'US jobs report', '2026-09-24T13:10:00.000Z', 'high'), REAL_EARNINGS]);
    renderTradePage(db, btc);
    await tradePageHeading('BTCUSDT · Long');
    await waitFor(() => expect(tradePagePart(HEADING).getByText(HEADING)).toBeTruthy());
    expect(lines()).toEqual([HEADING, CPI_LINE, FOMC_LINE, 'US jobs report: scheduled while this trade was open. Added by you.', 'And 1 more big news event near this trade.']);
    expect(screen.queryByText(/Real Earnings/)).toBeNull();
  });

  it('shows the line on a Practice trade page', async () => {
    const db = await database();
    const saved = await savePracticeTrade(db, BTC);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    await db.economicEvents.put(CPI_BLS);
    renderTradePage(db, saved.tradeId, { scope: 'practice' });
    await tradePageHeading('BTCUSDT · Long');
    await waitFor(() => expect(tradePagePart(HEADING).getByText(CPI_LINE)).toBeTruthy());
    expect(lines()).toEqual([HEADING, CPI_LINE]);
  });

  it('renders the page with no news and no error when the news cannot be read', async () => {
    const { db, btc } = await journal(NEWS);
    const where = vi.spyOn(db.economicEvents, 'where').mockImplementation(() => { throw new Error('read failed'); });
    renderTradePage(db, btc);
    await tradePageHeading('BTCUSDT · Long');
    await waitFor(() => expect(screen.getByRole('region', { name: 'Recorded result' })).toBeTruthy());
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
