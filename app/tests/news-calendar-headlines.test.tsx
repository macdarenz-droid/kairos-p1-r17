import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEWS_COVERAGE_KEY, type NewsApiPort } from '../src/application/economic-calendar/fetchedNews';
import { NEWS_HEADLINES_KEY } from '../src/application/economic-calendar/newsHeadlines';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl/timeZonePreference';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { NewsCalendarScreen } from '../src/features/economic-calendar/NewsCalendarScreen';
import type { KairosApiResult } from '../src/services/kairos-api/kairosApi';
import type { NewsCalendarAnswer, NewsHeadline, NewsHeadlinesAnswer } from '../src/services/kairos-api/newsApi';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });

const NOW = '2026-09-24T04:00:00.000Z';
const TEN_MINUTES_AGO = '2026-09-24T03:50:00.000Z';
const now = () => NOW;
const FED: NewsHeadline = { title: 'Federal Reserve Board announces approval of application by Peoples Bancorp Inc.', url: 'https://www.federalreserve.gov/newsevents/pressreleases/orders20260924a.htm', publishedAt: '2026-09-24T03:00:00.000Z', publisher: null };
const YAHOO: NewsHeadline = { title: 'Stocks rise as inflation cools', url: 'https://finance.yahoo.com/news/stocks-rise-123.html', publishedAt: '2026-09-24T04:00:00.000Z', publisher: 'Reuters' };
const ECB: NewsHeadline = { title: 'Monetary policy statement', url: 'https://www.ecb.europa.eu/press/pr/date/2026/html/x.en.html', publishedAt: '2026-09-23T12:00:00.000Z', publisher: null };

async function database(options: { coverageAt?: string; headlines?: { refreshedAt: string; items: readonly object[] } } = {}): Promise<KairosDatabase> {
  const name = `kairos-news-headlines-screen-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  opened.push(db);
  await openKairosDatabase(db);
  await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'Asia/Manila', NOW);
  if (options.coverageAt !== undefined) await db.metadata.put({ key: NEWS_COVERAGE_KEY, value: JSON.stringify({ version: 1, refreshedAt: options.coverageAt, windows: [] }), updatedAt: options.coverageAt });
  if (options.headlines !== undefined) await db.metadata.put({ key: NEWS_HEADLINES_KEY, value: JSON.stringify({ version: 1, refreshedAt: options.headlines.refreshedAt, failedSources: [], items: options.headlines.items }), updatedAt: options.headlines.refreshedAt });
  return db;
}

const calendarOk = async (source: string): Promise<KairosApiResult<NewsCalendarAnswer>> => ({ ok: true, value: { source, fetchedAt: NOW, covers: null, events: [], leftOut: 0 } });
const headlinesBySource = async (source: string): Promise<KairosApiResult<NewsHeadlinesAnswer>> =>
  ({ ok: true, value: { source, fetchedAt: NOW, items: source === 'fed' ? [FED] : source === 'yahoo' ? [YAHOO] : [], leftOut: 0 } });
function port(headlines: (source: string) => Promise<KairosApiResult<NewsHeadlinesAnswer>> = headlinesBySource) {
  const calendar = vi.fn(calendarOk);
  const headlinesSpy = vi.fn(headlines);
  const news: NewsApiPort = { setUp: true, calendar, headlines: headlinesSpy };
  return { news, calendar, headlines: headlinesSpy };
}
const card = async () => within(await screen.findByRole('region', { name: 'Latest news' }));

describe('T-046m the latest headlines on the News calendar page', () => {
  it('lists official press releases and Yahoo Finance headlines as text with a link, with Yahoo\'s credit', async () => {
    render(<NewsCalendarScreen db={await database()} now={now} news={port().news} />);
    const latest = await card();
    const fed = await latest.findByRole('link', { name: FED.title });
    expect(fed).toHaveAttribute('href', FED.url);
    expect(fed.getAttribute('rel')).toContain('noopener');
    expect(latest.getByRole('heading', { name: 'From central banks and statistics offices' })).toBeInTheDocument();
    const yahoo = latest.getByRole('link', { name: YAHOO.title });
    expect(yahoo.closest('li')).toHaveTextContent('Yahoo Finance · Thursday 24 September 2026 at 12:00 · Reuters');
    expect(latest.getByRole('link', { name: 'Yahoo Finance' })).toHaveAttribute('href', 'https://finance.yahoo.com/');
  });

  it('shows a saved title as text only', async () => {
    const item = { source: 'yahoo', ...YAHOO, title: '<img src=x onerror=alert(1)>' };
    render(<NewsCalendarScreen db={await database({ coverageAt: TEN_MINUTES_AGO, headlines: { refreshedAt: TEN_MINUTES_AGO, items: [item] } })} now={now} news={port().news} />);
    const latest = await card();
    expect(latest.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Latest news' }).querySelector('img')).toBeNull();
  });

  it('keeps the saved headlines when none can be got, and names a source that failed', async () => {
    const saved = { refreshedAt: '2026-09-24T02:00:00.000Z', items: [{ source: 'fed', ...FED }] };
    render(<NewsCalendarScreen db={await database({ coverageAt: TEN_MINUTES_AGO, headlines: saved })} now={now} news={port(async () => ({ ok: false, reason: 'transport-failed' })).news} />);
    const latest = await card();
    expect(await latest.findByText('Headlines: Kairos could not reach its server. Check your connection, then try again.')).toBeInTheDocument();
    expect(latest.getByRole('link', { name: FED.title })).toBeInTheDocument();
    cleanup();

    render(<NewsCalendarScreen db={await database({ coverageAt: TEN_MINUTES_AGO })} now={now} news={port(async (source) => (source === 'ecb' ? { ok: false, reason: 'transport-failed' } : headlinesBySource(source))).news} />);
    expect(await (await card()).findByText('Could not get headlines from European Central Bank this time.')).toBeInTheDocument();
  });

  it('refreshes each saved copy on open only when it is due, and "Refresh" refreshes both', async () => {
    const fresh = port();
    render(<NewsCalendarScreen db={await database({ headlines: { refreshedAt: TEN_MINUTES_AGO, items: [{ source: 'ecb', ...ECB }] } })} now={now} news={fresh.news} />);
    await waitFor(() => expect(fresh.calendar).toHaveBeenCalledTimes(9));
    expect(await screen.findByText(/^Updated /)).toBeInTheDocument();
    expect(fresh.headlines).not.toHaveBeenCalled();
    cleanup();

    const due = port();
    render(<NewsCalendarScreen db={await database({ coverageAt: TEN_MINUTES_AGO })} now={now} news={due.news} />);
    await waitFor(() => expect(due.headlines).toHaveBeenCalledTimes(6));
    expect(await (await card()).findByRole('link', { name: FED.title })).toBeInTheDocument();
    expect(due.calendar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(due.calendar).toHaveBeenCalledTimes(9));
    await waitFor(() => expect(due.headlines).toHaveBeenCalledTimes(12));
  });
});
