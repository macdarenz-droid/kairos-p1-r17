import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '../src/app/routes';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { ThemeProvider } from '../src/design-system/themes';
import { CoachScreen } from '../src/features/discipline/CoachScreen';
import { PatternsScreen } from '../src/features/patterns/PatternsScreen';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));
beforeAll(async () => { await import('../src/features/patterns/PatternsScreen'); }, 30_000);

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-patterns-screen-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = '2026-09-18T12:00:00.000Z';
const clock = () => now;
async function withZone(db: KairosDatabase) { await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now); }
function closed(symbol: string, side: 'long' | 'short', exit: string, openedAt: string, closedAt: string, fees?: { amount: string; currency: string }[]) {
  return {
    symbol, marketType: 'crypto', side, status: 'closed', grossPnlCurrency: 'USDT', openedAt, closedAt, ...(fees ? { fees } : {}),
    executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: openedAt }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
  } as const;
}
async function save(db: KairosDatabase, input: Parameters<typeof saveManualTrade>[1]) { expect((await saveManualTrade(db, input)).ok).toBe(true); }
const monday = (i: number) => closed('BTCUSDT', 'long', i <= 6 ? '110' : i <= 10 ? '95' : '100', '2026-09-14T09:00:00.000Z', `2026-09-14T10:${String(i).padStart(2, '0')}:00.000Z`);
async function fixture(db: KairosDatabase) {
  await withZone(db);
  for (let i = 0; i < 12; i += 1) await save(db, monday(i));
  for (let i = 0; i < 3; i += 1) await save(db, closed('ETHUSDT', 'short', '90', '2026-09-16T21:00:00.000Z', `2026-09-16T22:0${i}:00.000Z`));
  await save(db, closed('SOLUSDT', 'long', '90', '2026-06-20T23:00:00.000Z', '2026-06-21T01:00:00.000Z'));
}
function renderScreen(db: KairosDatabase, scope: 'real' | 'practice' = 'real') {
  return render(<MemoryRouter><PatternsScreen db={db} scope={scope} now={clock} /></MemoryRouter>);
}
const region = (name: string) => screen.getByRole('region', { name });
const part = (bar: Element, name: string) => (bar.querySelector(`[data-part="${name}"]`) as HTMLElement).style.flexGrow;

describe('T-042e the patterns page', () => {
  it('is reachable from More, and at /patterns and /practice/patterns', async () => {
    for (const [path, heading] of [['/patterns', 'Your patterns'], ['/practice/patterns', 'Your practice patterns']] as const) {
      render(<ThemeProvider><RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: [path] })} /></ThemeProvider>);
      expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeTruthy();
      cleanup();
    }
    render(<ThemeProvider><RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: ['/more'] })} /></ThemeProvider>);
    expect((await screen.findByRole('link', { name: 'Patterns' })).getAttribute('href')).toBe('/patterns');
  });

  it('shows every pattern with bars before words', async () => {
    const db = await database();
    await fixture(db);
    renderScreen(db);
    await screen.findByRole('region', { name: 'All your trades' });
    expect(screen.getAllByRole('heading', { level: 2 }).map(item => item.textContent)).toEqual(['All your trades', 'Keeping your plan', 'After a win or a loss', 'By strategy', 'By day of the week', 'By time of day', 'Long or short']);
    for (const line of ['16 trades.', 'Won 10, lost 5, break-even 1: 63% won.', 'Result after fees: 70 USDT.']) expect(within(region('All your trades')).getByText(line)).toBeTruthy();

    const days = within(region('By day of the week')).getAllByRole('listitem');
    expect(days).toHaveLength(7);
    const [mon, tue, wed] = days as [HTMLElement, HTMLElement, HTMLElement];
    for (const line of ['Monday', '12 trades.', 'Won 7, lost 4, break-even 1: 58% won.', 'Result after fees: 50 USDT.']) expect(within(mon).getByText(line)).toBeTruthy();
    const bar = mon.querySelector('.kairos-pattern-bar')!;
    expect(bar.getAttribute('data-steps')).toBe('10');
    expect(['won', 'even', 'lost', 'none'].map(name => part(bar, name))).toEqual(['7', '1', '4', '0']);
    expect(bar.compareDocumentPosition(within(mon).getByText('12 trades.')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(wed).getByText('Wednesday')).toBeTruthy();
    expect(within(wed).getByText('3 trades.')).toBeTruthy();
    expect(within(wed).getByText('Not enough trades with a result yet (3 of 10).')).toBeTruthy();
    const wedBar = wed.querySelector('.kairos-pattern-bar')!;
    expect([wedBar.getAttribute('data-steps'), wedBar.getAttribute('data-enough')]).toEqual(['3', 'false']);
    expect(wedBar.querySelector('[data-part]')).toBeNull();
    expect(within(tue).getByText('No trades.')).toBeTruthy();
    expect(tue.querySelector('.kairos-pattern-bar')!.getAttribute('data-steps')).toBe('0');

    expect(within(region('Keeping your plan')).getByText('Left out: 16 trades with nothing planned to compare.')).toBeTruthy();
    expect(screen.getByText('Time zone: UTC')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to your Journal' }).getAttribute('href')).toBe('/journal');
  });

  it('keeps a trade with no result grey in the bar', async () => {
    const db = await database();
    await withZone(db);
    for (let i = 0; i < 10; i += 1) await save(db, monday(i));
    await save(db, closed('SOLUSDT', 'long', '110', '2026-09-15T09:00:00.000Z', '2026-09-15T10:00:00.000Z', [{ amount: '0.1', currency: 'BNB' }]));
    renderScreen(db);
    const overall = await screen.findByRole('region', { name: 'All your trades' });
    const bar = overall.querySelector('.kairos-pattern-bar')!;
    expect(bar.getAttribute('data-steps')).toBe('10');
    expect(['won', 'lost', 'none'].map(name => part(bar, name))).toEqual(['7', '3', '1']);
    expect(within(overall).getByText('11 trades, 1 with no result.')).toBeTruthy();
  });

  it('keeps practice apart', async () => {
    const db = await database();
    await fixture(db);
    expect((await savePracticeTrade(db, monday(0))).ok).toBe(true);
    renderScreen(db, 'practice');
    expect(await screen.findByRole('heading', { name: 'Your practice patterns', level: 1 })).toBeTruthy();
    expect(within(await screen.findByRole('region', { name: 'All your practice trades' })).getByText('1 trade.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to Practice' }).getAttribute('href')).toBe('/practice');
    cleanup();
    renderScreen(db);
    expect(within(await screen.findByRole('region', { name: 'All your trades' })).getByText('16 trades.')).toBeTruthy();
  });

  it('says when there are no trades yet, no time zone, or a load failure', async () => {
    const db = await database();
    renderScreen(db);
    expect(await screen.findByText(/so they need your time zone first/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Settings' }).getAttribute('href')).toBe('/settings');
    cleanup();
    await withZone(db);
    renderScreen(db);
    expect(await screen.findByText('No closed trades in the last 90 days yet. Your patterns appear here as you close trades.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'All your trades' })).toBeNull();
    cleanup();
    vi.spyOn(db.metadata, 'get').mockRejectedValue(new Error('storage'));
    renderScreen(db);
    expect(await screen.findByText('Kairos could not load your patterns. Your trades are not affected.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is linked from Practice and the coach page', async () => {
    const db = await database();
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    expect((await screen.findByRole('link', { name: 'Your practice patterns' })).getAttribute('href')).toBe('/practice/patterns');
    cleanup();
    await withZone(db);
    for (const [scope, name, href] of [['real', 'See your patterns', '/patterns'], ['practice', 'See your practice patterns', '/practice/patterns']] as const) {
      render(<MemoryRouter><CoachScreen db={db} scope={scope} now={clock} renderTradeLink={id => <a href={`/analysis?trade=${id}`}>View trade</a>} /></MemoryRouter>);
      expect((await screen.findByRole('link', { name })).getAttribute('href')).toBe(href);
      cleanup();
    }
  });
});
