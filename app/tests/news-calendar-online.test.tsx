import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEWS_COVERAGE_KEY, type NewsApiPort } from '../src/application/economic-calendar/fetchedNews';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl/timeZonePreference';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { NEWS_CALENDAR_SOURCE_IDS, NEWS_SOURCES } from '../src/domain/economic-calendar/newsSources';
import { ThemeProvider } from '../src/design-system/themes';
import { NewsCalendarScreen } from '../src/features/economic-calendar/NewsCalendarScreen';
import { tradingViewCalendarUrl } from '../src/features/economic-calendar/WorldCalendarPanel';
import type { KairosApiFailure, KairosApiResult } from '../src/services/kairos-api/kairosApi';
import type { NewsCalendarAnswer } from '../src/services/kairos-api/newsApi';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });

const NOW = '2026-09-24T04:00:00.000Z';
const now = () => NOW;
const COVERS = { from: '2026-09-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z' };
const OLD_BLS_ROW = {
  id: 'bls:00000000000000b1', source: 'bls' as const, title: 'Employment Situation', currency: 'USD', startsAt: '2026-09-22T12:30:00.000Z',
  impact: null, expected: null, previous: null, actual: null, savedAt: '2026-09-24T02:00:00.000Z', fetchedAt: '2026-09-24T01:55:00.000Z',
};

async function database(refreshedAt: string | null): Promise<KairosDatabase> {
  const name = `kairos-news-online-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  opened.push(db);
  await openKairosDatabase(db);
  await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'Asia/Manila', NOW);
  if (refreshedAt !== null) {
    await db.economicEvents.put(OLD_BLS_ROW);
    await db.metadata.put({ key: NEWS_COVERAGE_KEY, value: JSON.stringify({ version: 1, refreshedAt, windows: [{ source: 'bls', ...COVERS, fetchedAt: refreshedAt }] }), updatedAt: refreshedAt });
  }
  return db;
}

const answer = (source: string): NewsCalendarAnswer => source === 'bls'
  ? { source, fetchedAt: '2026-09-24T03:59:00.000Z', covers: COVERS, events: [{ key: '3bc656751421b9fb', title: 'Consumer Price Index', startsAt: '2026-09-24T12:30:00.000Z' }], leftOut: 0 }
  : { source, fetchedAt: '2026-09-24T03:59:00.000Z', covers: null, events: [], leftOut: 0 };
const okAnswer = async (source: string): Promise<KairosApiResult<NewsCalendarAnswer>> => ({ ok: true, value: answer(source) });

function port(calendar: (source: string) => Promise<KairosApiResult<NewsCalendarAnswer>>) {
  const spy = vi.fn(calendar);
  const news: NewsApiPort = { setUp: true, calendar: spy, headlines: vi.fn(async () => ({ ok: false as const, reason: 'transport-failed' as const })) };
  return { news, calendar: spy };
}

/** A port whose answers wait until the test releases them. */
function heldPort(answerFor: (source: string) => KairosApiResult<NewsCalendarAnswer>) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  return { ...port(async (source) => { await gate; return answerFor(source); }), release: () => act(async () => { release(); }) };
}

const serverFailure = (serverReason: string, status: number, retryAfterSeconds: number | null = null): KairosApiFailure =>
  ({ ok: false, reason: 'unavailable', serverReason, retryAfterSeconds, status });

describe('T-046k fresh news on open, Refresh and Try again', () => {
  it('asks all nine sources on open when nothing is saved, then shows the update and the new rows', async () => {
    const held = heldPort((source) => ({ ok: true, value: answer(source) }));
    render(<NewsCalendarScreen db={await database(null)} now={now} news={held.news} />);
    const busy = await screen.findByText('Getting the latest news…');
    const line = screen.getByText('Kairos has not got the official schedules on this device yet.');
    expect(busy.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await held.release();
    expect(await screen.findByText('Updated Thursday 24 September 2026 at 12:00.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(within(await screen.findByRole('group', { name: 'Thursday 24 September 2026' })).getByText(/US inflation \(CPI\)/)).toBeInTheDocument();
    expect(held.calendar.mock.calls.map(([source]) => source)).toEqual([...NEWS_CALENDAR_SOURCE_IDS]);
  });

  it('does not ask when the saved copy is fresh; "Refresh" asks all nine and stays in place, busy, until the result', async () => {
    const held = heldPort((source) => ({ ok: true, value: answer(source) }));
    render(<NewsCalendarScreen db={await database('2026-09-24T03:50:00.000Z')} now={now} news={held.news} />);
    expect(await screen.findByText('Showing news saved Thursday 24 September 2026 at 11:50.')).toBeInTheDocument();
    expect(held.calendar).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: 'Refresh' });
    fireEvent.click(button);
    expect(await screen.findByText('Getting the latest news…')).toBeInTheDocument();
    expect(held.calendar).toHaveBeenCalledTimes(9);
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await held.release();
    expect(await screen.findByText('Updated Thursday 24 September 2026 at 12:00.')).toBeInTheDocument();
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(screen.queryByText('Getting the latest news…')).toBeNull();
  });

  it('keeps the saved week under the Unavailable box, and "Try again" stays busy until the result, then focus goes to "Refresh"', async () => {
    let failing = true;
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { news } = port(async (source) => {
      if (failing) return { ok: false, reason: 'transport-failed' };
      await gate;
      return { ok: true, value: answer(source) };
    });
    render(<NewsCalendarScreen db={await database('2026-09-24T02:00:00.000Z')} now={now} news={news} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unavailable · News: Kairos could not reach its server. Check your connection, then try again.');
    expect(screen.getByText('Showing news saved Thursday 24 September 2026 at 10:00.')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Tuesday 22 September 2026' })).getByText(/US jobs report/)).toBeInTheDocument();
    failing = false;
    const tryAgain = within(alert).getByRole('button', { name: 'Try again' });
    fireEvent.click(tryAgain);
    expect(await screen.findByText('Getting the latest news…')).toBeInTheDocument();
    expect(tryAgain).toBeInTheDocument();
    expect(tryAgain).toHaveAttribute('aria-busy', 'true');
    await act(async () => { release(); });
    expect(await screen.findByText('Updated Thursday 24 September 2026 at 12:00.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveFocus();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("says the server's words for a rate limit, a server not ready, and names the sources that failed", async () => {
    const limited = port(async () => serverFailure('rate-limited', 429, 60));
    render(<NewsCalendarScreen db={await database(null)} now={now} news={limited.news} />);
    const box = await screen.findByRole('alert');
    expect(box).toHaveTextContent('Unavailable · News: too many requests from this device. Wait a minute, then try again.');
    expect(within(box).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    cleanup();

    const notReady = port(async () => serverFailure('not-set-up', 503));
    render(<NewsCalendarScreen db={await database(null)} now={now} news={notReady.news} />);
    const notReadyBox = await screen.findByRole('alert');
    expect(notReadyBox).toHaveTextContent('Unavailable · News: not ready on the Kairos server yet.');
    expect(within(notReadyBox).queryByRole('button')).toBeNull();
    cleanup();

    const some = port(async (source) => (source === 'ecb' || source === 'rba' ? serverFailure('source-unavailable', 502) : okAnswer(source)));
    render(<NewsCalendarScreen db={await database(null)} now={now} news={some.news} />);
    expect(await screen.findByText('Updated Thursday 24 September 2026 at 12:00. Could not get news from European Central Bank and Reserve Bank of Australia this time.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('without a server address: typed news only, no Refresh and no call', async () => {
    const off = port(okAnswer);
    for (const news of [undefined, { ...off.news, setUp: false }]) {
      render(<NewsCalendarScreen db={await database(null)} now={now} news={news} />);
      expect(await screen.findByText('News: not set up in this version of Kairos. You can still add your own news.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      cleanup();
    }
    expect(off.calendar).not.toHaveBeenCalled();
  });
});

describe('T-046k where the news comes from, and the full world calendar', () => {
  it('links the nine official schedules and gives the credits', async () => {
    render(<NewsCalendarScreen db={await database(null)} now={now} />);
    const card = screen.getByRole('region', { name: 'Where the news comes from' });
    expect(card).toHaveTextContent("Kairos shows only the releases on its own fixed list");
    expect(card).toHaveTextContent('Kairos changed it: it keeps only the releases on its list');
    const links = within(within(card).getByRole('list')).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(NEWS_CALENDAR_SOURCE_IDS.map((id) => NEWS_SOURCES[id].page));
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
  });

  it("shows TradingView's calendar only after a tap, sandboxed, in the theme, and never fetches", async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<ThemeProvider><NewsCalendarScreen db={await database(null)} now={now} /></ThemeProvider>);
    const button = screen.getByRole('button', { name: "Show TradingView's calendar" });
    expect(document.querySelector('iframe')).toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    button.focus();
    fireEvent.click(button);
    const holder = document.getElementById(button.getAttribute('aria-controls')!)!;
    const frame = within(holder).getByTitle('Full world calendar by TradingView');
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    const src = frame.getAttribute('src')!;
    expect(src.startsWith('https://www.tradingview-widget.com/embed-widget/events/?locale=en#')).toBe(true);
    expect(JSON.parse(decodeURIComponent(src.split('#')[1])).colorTheme).toBe('dark');
    expect(button).toHaveAccessibleName("Hide TradingView's calendar");
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(document.querySelector('iframe')).toBeNull();
    expect(button).toHaveAccessibleName("Show TradingView's calendar");
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(button);
    expect(JSON.parse(decodeURIComponent(tradingViewCalendarUrl('light').split('#')[1])).colorTheme).toBe('light');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
