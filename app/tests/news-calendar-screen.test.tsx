import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { moreNavigation } from '../src/app/navigation';
import { appRoutes } from '../src/app/routes';
import { NEWS_COVERAGE_KEY } from '../src/application/economic-calendar/fetchedNews';
import { readGlossary } from '../src/application/learn/glossary';
import { projectVisualPnlClockTime } from '../src/application/visual-pnl/dayBucket';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl/timeZonePreference';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { economicEventId, type EconomicEventRecord } from '../src/domain/economic-calendar/economicEvent';
import { NEWS_CALENDAR_SOURCE_IDS } from '../src/domain/economic-calendar/newsSources';
import { ThemeProvider } from '../src/design-system/themes';
import { NewsCalendarScreen } from '../src/features/economic-calendar/NewsCalendarScreen';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });

const NOW = '2026-09-24T04:00:00.000Z';
const now = () => NOW;
const savedAt = '2026-09-20T08:00:00.000Z';
const typed = (key: string, title: string, currency: string | null, startsAt: string, impact: EconomicEventRecord['impact']): EconomicEventRecord =>
  ({ id: economicEventId('typed', key), source: 'typed', title, currency, startsAt, impact, expected: null, previous: null, actual: null, savedAt, fetchedAt: null });
const SPEECH = typed('speech', 'ECB President speaks', 'EUR', '2026-09-24T09:00:00.000Z', 'medium');
const OPEC = typed('opec', 'OPEC meeting', null, '2026-09-20T16:00:00.000Z', 'high');
const CPI_BLS: EconomicEventRecord = {
  id: 'bls:3bc656751421b9fb', source: 'bls', title: 'Consumer Price Index', currency: 'USD', startsAt: '2026-09-24T12:30:00.000Z',
  impact: null, expected: null, previous: null, actual: null, savedAt: '2026-09-24T03:00:00.000Z', fetchedAt: '2026-09-24T02:55:00.000Z',
};
const ECB_TITLE = 'Governing Council of the ECB: monetary policy meeting in Frankfurt (Day 2), followed by press conference';
const ECB_DECISION: EconomicEventRecord = {
  id: 'ecb:00000000000000e1', source: 'ecb', title: ECB_TITLE, currency: 'EUR', startsAt: '2026-09-24T12:15:00.000Z',
  impact: null, expected: null, previous: null, actual: null, savedAt: '2026-09-24T03:00:00.000Z', fetchedAt: '2026-09-24T02:55:00.000Z',
};
const window = (source: string) => ({ source, from: '2026-09-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z', fetchedAt: '2026-09-24T02:55:00.000Z' });

async function database(options: { zone?: boolean; sources?: readonly string[]; rows?: readonly EconomicEventRecord[] } = {}): Promise<KairosDatabase> {
  const name = `kairos-news-screen-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  opened.push(db);
  await openKairosDatabase(db);
  if (options.zone !== false) await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'Asia/Manila', NOW);
  await db.economicEvents.bulkPut([...(options.rows ?? [SPEECH, OPEC, CPI_BLS, ECB_DECISION])]);
  const sources = options.sources ?? NEWS_CALENDAR_SOURCE_IDS;
  await db.metadata.put({ key: NEWS_COVERAGE_KEY, value: JSON.stringify({ version: 1, refreshedAt: NOW, windows: sources.map(window) }), updatedAt: NOW });
  return db;
}
const texts = (element: HTMLElement) => [...element.querySelectorAll('li')].map((item) => [...item.querySelectorAll('p')].map((p) => p.textContent));

describe('T-046j the News calendar page', () => {
  it('shows the week by day in the saved zone, with sizes, where each came from and what was checked', async () => {
    render(<NewsCalendarScreen db={await database()} now={now} />);
    expect(screen.getByRole('heading', { level: 1, name: 'News calendar' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Week of Monday 21 September 2026' })).toBeInTheDocument();
    expect(screen.getByText(/within 30 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/^Official schedules only/)).toBeInTheDocument();
    expect(screen.getByText('Times in Asia/Manila.')).toBeInTheDocument();
    expect(screen.getByText('Kairos checked all 9 official schedules for this week.')).toBeInTheDocument();
    expect(texts(screen.getByRole('group', { name: 'Monday 21 September 2026' }))).toEqual([['00:00 OPEC meeting', 'Big news', 'Added by you']]);
    expect(texts(screen.getByRole('group', { name: 'Thursday 24 September 2026' }))).toEqual([
      ['17:00 ECB President speaks', 'EUR · Medium news', 'Added by you'],
      ['20:15 Euro interest rate decision', "EUR · Big news (Kairos's rating)", `From European Central Bank: ${ECB_TITLE}`, 'Expected, last time and actual: unavailable'],
      ['20:30 US inflation (CPI)', "USD · Big news (Kairos's rating)", 'From U.S. Bureau of Labor Statistics: Consumer Price Index', 'Expected, last time and actual: unavailable'],
    ]);
    expect(screen.getByText('You added 2 news events on this device.')).toBeInTheDocument();
  });

  it('filters big news, moves between weeks, and says what an empty week means', async () => {
    render(<NewsCalendarScreen db={await database()} now={now} />);
    await screen.findByRole('group', { name: 'Thursday 24 September 2026' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show big news only' }));
    const thursday = screen.getByRole('group', { name: 'Thursday 24 September 2026' });
    expect(within(thursday).queryByText(/ECB President speaks/)).toBeNull();
    expect(within(thursday).getByText(/US inflation \(CPI\)/)).toBeInTheDocument();
    expect(screen.getByText(/OPEC meeting/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show big news only' }));

    fireEvent.click(screen.getByRole('button', { name: 'Later week' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Week of Monday 28 September 2026' })).toBeInTheDocument();
    expect(screen.getByText("Nothing from Kairos's list of official releases this week, and no news you added.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show big news only' }));
    expect(screen.getByText("No big news from Kairos's list of official releases this week, and none you added.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show big news only' }));
    for (let step = 0; step < 5; step += 1) fireEvent.click(screen.getByRole('button', { name: 'Later week' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Week of Monday 2 November 2026' })).toBeInTheDocument();
    expect(screen.getByText('Kairos has not checked the official schedules for this week yet.')).toBeInTheDocument();
    expect(screen.getByText('No news saved for this week.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'This week' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Week of Monday 21 September 2026' })).toBeInTheDocument();
  });

  it('counts the checked schedules and names the missing ones when few are missing', async () => {
    render(<NewsCalendarScreen db={await database({ sources: ['bls'] })} now={now} />);
    expect(await screen.findByText('Kairos checked 1 of 9 official schedules for this week.')).toBeInTheDocument();
    cleanup();
    render(<NewsCalendarScreen db={await database({ sources: NEWS_CALENDAR_SOURCE_IDS.filter((source) => source !== 'ons' && source !== 'rba') })} now={now} />);
    expect(await screen.findByText('Kairos checked 7 of 9 official schedules for this week. Not checked yet: Office for National Statistics (UK) and Reserve Bank of Australia.')).toBeInTheDocument();
  });

  it('shows a typed title as text only', async () => {
    const { container } = render(<NewsCalendarScreen db={await database({ rows: [typed('img', '<img src=x onerror=alert(1)> Rates', null, '2026-09-24T09:00:00.000Z', 'low')] })} now={now} />);
    expect(await screen.findByText(/<img src=x onerror=alert\(1\)> Rates/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Small news')).toBeInTheDocument();
  });

  it('asks for the time zone first, and says when it cannot load', async () => {
    render(<NewsCalendarScreen db={await database({ zone: false })} now={now} />);
    expect(await screen.findByText(/it needs your time zone first/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/settings');
    cleanup();
    const db = await database();
    vi.spyOn(db.metadata, 'get').mockRejectedValue(new Error('broken'));
    render(<NewsCalendarScreen db={db} now={now} />);
    expect(await screen.findByText('Kairos could not load your news calendar. Your trades are not affected.')).toBeInTheDocument();
  });

  it('explains "News calendar" in plain words, and uses no jargon', async () => {
    const { container } = render(<NewsCalendarScreen db={await database()} now={now} />);
    await screen.findByRole('group', { name: 'Thursday 24 September 2026' });
    expect(container.textContent).not.toMatch(/high-impact|economic calendar|\b(fills?|executions?|FX)\b|P&L/i);
    fireEvent.click(screen.getByRole('button', { name: 'What does "News calendar" mean?' }));
    const dialog = await screen.findByRole('dialog', { name: 'News calendar' });
    expect(await within(dialog).findByText(/A list of when scheduled news comes out/)).toBeInTheDocument();
  });
});

describe('T-046j the clock time, the words and the route', () => {
  it('gives the clock time in the saved zone only', () => {
    expect(projectVisualPnlClockTime('2026-09-24T12:30:00.000Z', 'Asia/Manila')).toBe('20:30');
    expect(projectVisualPnlClockTime('2026-09-20T16:00:00.000Z', 'Asia/Manila')).toBe('00:00');
    expect(projectVisualPnlClockTime('2026-09-24T12:05:00.000Z', 'America/New_York')).toBe('08:05');
    expect(projectVisualPnlClockTime('2026-09-24T12:30:00.000Z', 'Not/AZone')).toBeNull();
    expect(projectVisualPnlClockTime(null, 'Asia/Manila')).toBeNull();
    expect(projectVisualPnlClockTime('2026-09-24T12:30:00Z', 'Asia/Manila')).toBeNull();
  });

  it('adds the two trading words, and opens at /news-calendar right before Currency in More', async () => {
    expect(readGlossary().problems).toEqual([]);
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/news-calendar'] });
    render(<ThemeProvider><RouterProvider router={router} /></ThemeProvider>);
    expect(await screen.findByRole('heading', { level: 1, name: 'News calendar' }, { timeout: 10_000 })).toBeInTheDocument();
    const labels = moreNavigation.map((item) => item.label);
    expect(labels[labels.indexOf('Currency') - 1]).toBe('News calendar');
  });
});
