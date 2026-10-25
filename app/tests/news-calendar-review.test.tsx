import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeWeekCoverage } from '../src/application/economic-calendar/calendarWords';
import { NEWS_COVERAGE_KEY, type NewsApiPort } from '../src/application/economic-calendar/fetchedNews';
import { NEWS_HEADLINES_KEY } from '../src/application/economic-calendar/newsHeadlines';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl/timeZonePreference';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { economicEventId, type EconomicEventRecord } from '../src/domain/economic-calendar/economicEvent';
import { NEWS_CALENDAR_SOURCE_IDS } from '../src/domain/economic-calendar/newsSources';
import { ThemeProvider } from '../src/design-system/themes';
import { NewsCalendarScreen } from '../src/features/economic-calendar/NewsCalendarScreen';
import type { KairosApiResult } from '../src/services/kairos-api/kairosApi';
import type { NewsCalendarAnswer, NewsHeadlinesAnswer } from '../src/services/kairos-api/newsApi';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });

const NOW = '2026-09-24T04:00:00.000Z';
const now = () => NOW;
const COVERS = { from: '2026-09-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z' };
const CPI_BLS: EconomicEventRecord = {
  id: 'bls:3bc656751421b9fb', source: 'bls', title: 'Consumer Price Index', currency: 'USD', startsAt: '2026-09-24T12:30:00.000Z',
  impact: null, expected: null, previous: null, actual: null, savedAt: '2026-09-24T03:00:00.000Z', fetchedAt: '2026-09-24T02:55:00.000Z',
};
const SPEECH: EconomicEventRecord = {
  id: economicEventId('typed', 'speech'), source: 'typed', title: 'ECB President speaks', currency: 'EUR', startsAt: '2026-09-24T09:00:00.000Z',
  impact: 'medium', expected: null, previous: null, actual: null, savedAt: '2026-09-20T08:00:00.000Z', fetchedAt: null,
};

interface Setup {
  readonly coverage?: { readonly refreshedAt: string; readonly sources: readonly string[] };
  readonly headlines?: { readonly refreshedAt: string; readonly items: readonly object[] };
  readonly rows?: readonly EconomicEventRecord[];
}
async function database(setup: Setup = {}): Promise<KairosDatabase> {
  const name = `kairos-news-review-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  opened.push(db);
  await openKairosDatabase(db);
  await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'Asia/Manila', NOW);
  if (setup.coverage !== undefined) {
    const { refreshedAt, sources } = setup.coverage;
    await db.metadata.put({ key: NEWS_COVERAGE_KEY, value: JSON.stringify({ version: 1, refreshedAt, windows: sources.map((source) => ({ source, ...COVERS, fetchedAt: refreshedAt })) }), updatedAt: refreshedAt });
  }
  if (setup.headlines !== undefined) await db.metadata.put({ key: NEWS_HEADLINES_KEY, value: JSON.stringify({ version: 1, refreshedAt: setup.headlines.refreshedAt, failedSources: [], items: setup.headlines.items }), updatedAt: setup.headlines.refreshedAt });
  if (setup.rows !== undefined) await db.economicEvents.bulkPut([...setup.rows]);
  return db;
}

type CalendarAnswer = KairosApiResult<NewsCalendarAnswer>;
type HeadlinesAnswer = KairosApiResult<NewsHeadlinesAnswer>;
const calendarOk = async (source: string): Promise<CalendarAnswer> => ({ ok: true, value: { source, fetchedAt: NOW, covers: null, events: [], leftOut: 0 } });
const headlinesNone = async (source: string): Promise<HeadlinesAnswer> => ({ ok: true, value: { source, fetchedAt: NOW, items: [], leftOut: 0 } });
function port(calendar: (source: string, options?: { readonly signal?: AbortSignal }) => Promise<CalendarAnswer> = calendarOk, headlines: (source: string, options?: { readonly signal?: AbortSignal }) => Promise<HeadlinesAnswer> = headlinesNone) {
  const calendarSpy = vi.fn(calendar);
  const headlinesSpy = vi.fn(headlines);
  const news: NewsApiPort = { setUp: true, calendar: calendarSpy, headlines: headlinesSpy };
  return { news, calendar: calendarSpy, headlines: headlinesSpy };
}
const never = <T,>() => new Promise<T>(() => {});
const FRESH = '2026-09-24T03:50:00.000Z';
const STALE = '2026-09-24T02:00:00.000Z';

describe('T-046s the week (T-046j)', () => {
  it('says "No news saved for this week." when only some schedules were checked and nothing is saved', async () => {
    render(<NewsCalendarScreen db={await database({ coverage: { refreshedAt: FRESH, sources: ['bls', 'ons'] } })} now={now} />);
    expect(await screen.findByText('Kairos checked 2 of 9 official schedules for this week.')).toBeInTheDocument();
    expect(screen.getByText('No news saved for this week.')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing from Kairos's list/)).toBeNull();
  });

  it('names 1 to 3 schedules not checked yet, and only counts them from 4', () => {
    const checked = (count: number) => NEWS_CALENDAR_SOURCE_IDS.slice(0, count);
    expect(describeWeekCoverage(checked(8))).toMatch(/ Not checked yet: [^.]+\.$/);
    expect(describeWeekCoverage(checked(6))).toMatch(/^Kairos checked 6 of 9 official schedules for this week\. Not checked yet: .+ and .+\.$/);
    expect(describeWeekCoverage(checked(5))).toBe('Kairos checked 5 of 9 official schedules for this week.');
  });

  it("each news row's bars carry its size", async () => {
    render(<NewsCalendarScreen db={await database({ rows: [CPI_BLS, SPEECH] })} now={now} />);
    const thursday = within(await screen.findByRole('group', { name: 'Thursday 24 September 2026' }));
    const bars = (text: RegExp) => thursday.getByText(text).closest('li')!.querySelector('.kairos-news-size');
    expect(bars(/US inflation \(CPI\)/)).toHaveAttribute('data-impact', 'high');
    expect(bars(/ECB President speaks/)).toHaveAttribute('data-impact', 'medium');
  });
});

describe('T-046s refresh, credits and focus (T-046k)', () => {
  it("gives TradingView's credit link and the Open Government Licence link", async () => {
    render(<ThemeProvider><NewsCalendarScreen db={await database()} now={now} /></ThemeProvider>);
    expect(screen.getByRole('link', { name: 'Open Government Licence v3.0' })).toHaveAttribute('href', 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/');
    fireEvent.click(screen.getByRole('button', { name: "Show TradingView's calendar" }));
    expect(screen.getByRole('link', { name: 'Track all markets on TradingView' })).toHaveAttribute('href', 'https://www.tradingview.com/');
  });

  it('still shows the saved copy\'s line when news is not set up', async () => {
    render(<NewsCalendarScreen db={await database({ coverage: { refreshedAt: STALE, sources: ['bls'] } })} now={now} />);
    expect(await screen.findByText('News: not set up in this version of Kairos. You can still add your own news.')).toBeInTheDocument();
    expect(await screen.findByText('Showing news saved Thursday 24 September 2026 at 10:00.')).toBeInTheDocument();
  });

  it('leaving the page stops a refresh in progress', async () => {
    const signals: AbortSignal[] = [];
    const held = port(async (_source, options) => { signals.push(options!.signal!); return never(); });
    const view = render(<NewsCalendarScreen db={await database()} now={now} news={held.news} />);
    await waitFor(() => expect(held.calendar).toHaveBeenCalledTimes(9));
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
    view.unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('after a refresh, the tapped button that is still on the page keeps focus', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const held = port(async (source) => { await gate; return calendarOk(source); });
    render(<NewsCalendarScreen db={await database({ coverage: { refreshedAt: FRESH, sources: [] } })} now={now} news={held.news} />);
    const button = await screen.findByRole('button', { name: 'Refresh' });
    fireEvent.click(button);
    expect(await screen.findByText('Getting the latest news…')).toBeInTheDocument();
    await act(async () => { release(); });
    expect(await screen.findByText('Updated Thursday 24 September 2026 at 12:00.')).toBeInTheDocument();
    expect(button).toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('announces the same failure again after "Try again"', async () => {
    const failing = port(async () => ({ ok: false, reason: 'transport-failed' }));
    render(<NewsCalendarScreen db={await database({ coverage: { refreshedAt: STALE, sources: ['bls'] } })} now={now} news={failing.news} />);
    const words = 'Unavailable · News: Kairos could not reach its server. Check your connection, then try again.';
    const first = await screen.findByRole('alert');
    expect(first).toHaveTextContent(words);
    fireEvent.click(within(first).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(failing.calendar).toHaveBeenCalledTimes(18));
    await waitFor(() => expect(screen.getByRole('alert')).not.toBe(first));
    const second = screen.getByRole('alert');
    expect(second).toHaveTextContent(words);
    expect(first).not.toBeInTheDocument();
    await waitFor(() => expect(within(second).getByRole('button', { name: 'Try again' })).toHaveFocus());
  });
});

describe('T-046s the headlines card (T-046m)', () => {
  const item = (source: 'fed' | 'ecb', hour: number) => ({
    source, title: `${source} release at ${hour}`, publisher: null, publishedAt: `2026-09-2${hour < 10 ? 2 : 3}T${String(hour).padStart(2, '0')}:00:00.000Z`,
    url: source === 'fed' ? `https://www.federalreserve.gov/newsevents/pressreleases/r${hour}.htm` : `https://www.ecb.europa.eu/press/pr/date/2026/html/r${hour}.en.html`,
  });

  it('lists the newest first, at most 10, across sources saved in reverse order', async () => {
    const ecb = [1, 3, 5, 7, 9, 11].map((hour) => item('ecb', hour));
    const fed = [2, 4, 6, 8, 10, 12].map((hour) => item('fed', hour));
    render(<NewsCalendarScreen db={await database({ headlines: { refreshedAt: FRESH, items: [...ecb, ...fed] } })} now={now} />);
    const card = within(await screen.findByRole('region', { name: 'Latest news' }));
    const titles = (await card.findAllByRole('link')).map((link) => link.textContent);
    expect(titles).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map((hour) => `${hour % 2 === 0 ? 'fed' : 'ecb'} release at ${hour}`));
  });

  it('says "No headlines saved yet." when none are saved', async () => {
    render(<NewsCalendarScreen db={await database()} now={now} />);
    const card = within(await screen.findByRole('region', { name: 'Latest news' }));
    expect(card.getByText('No headlines saved yet.')).toBeInTheDocument();
  });

  it('a newer headline refresh stops the older one', async () => {
    const signals: AbortSignal[] = [];
    const held = port(calendarOk, async (_source, options) => { signals.push(options!.signal!); return never(); });
    render(<NewsCalendarScreen db={await database({ coverage: { refreshedAt: FRESH, sources: [] } })} now={now} news={held.news} />);
    await waitFor(() => expect(held.headlines).toHaveBeenCalledTimes(6));
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(held.headlines).toHaveBeenCalledTimes(12));
    expect(signals.slice(0, 6).every((signal) => signal.aborted)).toBe(true);
    expect(signals.slice(6).every((signal) => !signal.aborted)).toBe(true);
  });

  it('a later successful headline refresh clears the older failure line', async () => {
    let failing = true;
    const headlines = async (source: string): Promise<HeadlinesAnswer> => (failing ? { ok: false, reason: 'transport-failed' } : headlinesNone(source));
    const flaky = port(calendarOk, headlines);
    render(<NewsCalendarScreen db={await database({ coverage: { refreshedAt: FRESH, sources: [] } })} now={now} news={flaky.news} />);
    const card = within(await screen.findByRole('region', { name: 'Latest news' }));
    const failure = 'Unavailable · Headlines: Kairos could not reach its server. Check your connection, then try again.';
    const line = await card.findByText((_, element) => element?.tagName === 'P' && element.textContent === failure.replace('Unavailable · ', ''));
    expect(line).toBeInTheDocument();
    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(flaky.headlines).toHaveBeenCalledTimes(12));
    await waitFor(() => expect(line).not.toBeInTheDocument());
    expect(card.queryByText(/Headlines: Kairos could not reach its server/)).toBeNull();
  });
});
