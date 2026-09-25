import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { appRoutes } from '../src/app/routes';
import { saveTradeDiscipline } from '../src/application/discipline';
import { saveStrategy } from '../src/application/discipline/strategies';
import { writeGoalsPreference } from '../src/application/goals';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { TradeId } from '../src/domain/trades';
import { ThemeProvider } from '../src/design-system/themes';
import { CoachScreen } from '../src/features/discipline/CoachScreen';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));
beforeAll(async () => { await import('../src/features/discipline/CoachScreen'); }, 30_000);

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-coach-screen-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = '2026-09-18T12:00:00.000Z';
const clock = () => now;
async function withZone(db: KairosDatabase) { await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now); }
const closed = (symbol: string, quantity: string, exit: string, closedAt: string) => ({
  symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-01T00:00:00.000Z', closedAt,
  plan: { plannedEntryPrice: '100', plannedStopPrice: '95', plannedQuantity: '1' },
  executions: [{ type: 'entry', price: '100', quantity, executedAt: '2026-09-01T00:00:00.000Z' }, { type: 'exit', price: exit, quantity, executedAt: closedAt }],
} as const);
const idOf = (saved: { ok: boolean; tradeId?: unknown }) => { if (!saved.ok) throw new Error('fixture'); return saved.tradeId as TradeId; };
function renderScreen(db: KairosDatabase, scope: 'real' | 'practice' = 'real') {
  return render(<MemoryRouter><CoachScreen db={db} scope={scope} now={clock} renderTradeLink={id => <a href={`/analysis?trade=${id}`}>View trade</a>} /></MemoryRouter>);
}
const article = (title: string) => screen.getByRole('article', { name: title });
const before = (a: Node, b: Node) => expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

async function fixture(db: KairosDatabase): Promise<TradeId> {
  await withZone(db);
  const a = idOf(await saveManualTrade(db, closed('BTCUSDT', '3', '90', '2026-09-02T10:00:00.000Z')));
  for (const [symbol, at] of [['ETHUSDT', '2026-09-05T10:00:00.000Z'], ['SOLUSDT', '2026-09-08T10:00:00.000Z']] as const) {
    const id = idOf(await saveManualTrade(db, closed(symbol, '1', '110', at)));
    const saved = await saveTradeDiscipline(db, { tradeId: id, scope: 'real', half: 'review', answers: [], mistakeIds: ['moved-stop'], note: '' });
    if (!saved.ok) throw new Error('fixture');
  }
  await saveManualTrade(db, { symbol: 'DOTUSDT', marketType: 'crypto', side: 'long', status: 'open', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', executions: [{ type: 'entry', price: '5', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }] });
  expect((await writeGoalsPreference(createKairosRepositories(db).metadata, { maxTradesPerDay: '1' }, now)).ok).toBe(true);
  return a;
}

describe('T-041d the coach page', () => {
  it('is reachable from More, and at /coach and /practice/coach', async () => {
    for (const [path, heading] of [['/coach', 'Your coach'], ['/practice/coach', 'Your practice coach']] as const) {
      render(<ThemeProvider><RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: [path] })} /></ThemeProvider>);
      expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeTruthy();
      cleanup();
    }
    render(<ThemeProvider><RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: ['/more'] })} /></ThemeProvider>);
    expect((await screen.findByRole('link', { name: 'Coach' })).getAttribute('href')).toBe('/coach');
  });

  it('shows every note with its trades, pictures and next step', async () => {
    const db = await database();
    const a = await fixture(db);
    renderScreen(db);
    expect(await screen.findByText('5 notes this month')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map(item => item.textContent)).toEqual([
      'You reached your limit of 1 trade today.',
      '1 trade this month closed beyond its stop.',
      '1 trade this month was bigger than you planned.',
      'You marked "Moved my stop" on 2 trades this month.',
      'You reviewed 2 of your 3 closed trades this month.',
    ]);
    const limit = article('You reached your limit of 1 trade today.');
    expect(within(limit).getByText("Stop for today. Use the time to review today's trades instead.")).toBeTruthy();
    expect(within(limit).queryByRole('list')).toBeNull();
    for (const item of screen.getAllByRole('article')) expect(within(item).getByText('Next step:')).toBeTruthy();

    const stop = article('1 trade this month closed beyond its stop.');
    const stopTrades = within(stop).getByRole('list', { name: 'Trades behind this note' });
    expect(within(stopTrades).getByText('BTCUSDT')).toBeTruthy();
    expect(within(stopTrades).getByText('Your stop was 95, and you closed at 90 on average, beyond it.')).toBeTruthy();
    expect(within(stopTrades).getByRole('link', { name: 'View trade' }).getAttribute('href')).toBe(`/analysis?trade=${a}`);

    const size = article('1 trade this month was bigger than you planned.');
    const planned = size.querySelector('[data-bar="planned"]')!;
    const traded = size.querySelector('[data-bar="traded"]')!;
    expect(planned.getAttribute('data-steps')).toBe('3');
    expect(traded.getAttribute('data-steps')).toBe('10');
    expect(within(size).getByText('You planned').nextElementSibling).toBe(planned);
    expect(within(size).getByText('You traded').nextElementSibling).toBe(traded);
    before(traded, within(size).getByText('You planned a size of 1 and traded 3.'));

    const reviews = article('You reviewed 2 of your 3 closed trades this month.');
    expect(reviews.querySelector('.kairos-discipline-bar')!.getAttribute('data-percent')).toBe('67');
    expect(within(within(reviews).getByRole('list')).getAllByRole('listitem').map(item => item.querySelector('strong')!.textContent)).toEqual(['BTCUSDT']);

    expect(screen.getByText('Time zone: UTC')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to your Journal' }).getAttribute('href')).toBe('/journal');
  });

  it('keeps practice apart and has no daily limit there', async () => {
    const db = await database();
    await fixture(db);
    const paper = idOf(await savePracticeTrade(db, closed('BTCUSDT', '3', '90', '2026-09-12T10:00:00.000Z')));
    renderScreen(db, 'practice');
    expect(await screen.findByRole('heading', { name: 'Your practice coach', level: 1 })).toBeTruthy();
    const stop = await screen.findByRole('article', { name: '1 trade this month closed beyond its stop.' });
    expect(screen.queryByRole('article', { name: /limit/ })).toBeNull();
    const links = within(stop).getAllByRole('link', { name: 'View trade' });
    expect(links.map(link => link.getAttribute('href'))).toEqual([`/analysis?trade=${paper}`]);
    expect(screen.getByRole('link', { name: 'Back to Practice' }).getAttribute('href')).toBe('/practice');
  });

  it('shows two written rules with the same words once each', async () => {
    const db = await database();
    await withZone(db);
    const saved = await saveStrategy(db, { id: null, name: 'Patient', rules: [{ id: 'wait-1', kind: 'written', label: 'Wait for the close' }, { id: 'wait-2', kind: 'written', label: 'Wait for the close' }] });
    if (!saved.ok) throw new Error('fixture');
    const id = idOf(await saveManualTrade(db, closed('ETHUSDT', '1', '110', '2026-09-05T10:00:00.000Z')));
    const marked = await saveTradeDiscipline(db, { tradeId: id, scope: 'real', half: 'strategy', strategyId: saved.strategy.id, answers: [] });
    if (!marked.ok) throw new Error('fixture');
    const ticked = await saveTradeDiscipline(db, { tradeId: id, scope: 'real', half: 'strategy', strategyId: saved.strategy.id, answers: [{ itemId: 'wait-1', answer: 'no' }, { itemId: 'wait-2', answer: 'no' }] });
    if (!ticked.ok) throw new Error('fixture');
    const errors = vi.spyOn(console, 'error');
    renderScreen(db);
    const note = await screen.findByRole('article', { name: '1 trade this month broke a rule of its strategy.' });
    const trade = within(within(note).getByRole('list')).getByRole('listitem');
    expect(within(trade).getAllByText('Wait for the close: you did not keep it.')).toHaveLength(2);
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key/);
  });

  it('says when there is nothing to point out', async () => {
    const db = await database();
    await withZone(db);
    renderScreen(db);
    expect(await screen.findByText('Nothing to point out this month. Your coach speaks up only when your own trades, plans or rules show something to work on.')).toBeTruthy();
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('asks for the time zone first', async () => {
    const db = await database();
    renderScreen(db);
    expect(await screen.findByText(/so it needs your time zone first/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Settings' }).getAttribute('href')).toBe('/settings');
  });

  it('says when it could not load', async () => {
    const db = await database();
    vi.spyOn(db.metadata, 'get').mockRejectedValue(new Error('storage'));
    renderScreen(db);
    expect(await screen.findByText('Kairos could not load your coach. Your trades are not affected.')).toBeTruthy();
  });
});
