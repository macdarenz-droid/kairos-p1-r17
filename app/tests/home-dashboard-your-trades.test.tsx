import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => <p>market runtime</p>,
}));
import { HomeDashboardYourTrades } from '../src/app/HomeDashboardYourTrades';
import { HomeRoute } from '../src/app/HomeRoute';
import { GLASS_HOLD_MS } from '../src/app/homeDashboardGlassDrag';
import type { HomeYourTrade, HomeYourTradesResult, loadHomeYourTrades } from '../src/application/dashboard/homeDashboardYourTradesQuery';
import { saveTradedMarkets } from '../src/application/setup/tradedMarkets';
import { skipSetup } from '../src/application/setup/setupState';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { loadVisualPnlTimeZone, projectVisualPnlPeriod, writeVisualPnlTimeZonePreference, type VisualPnlPeriodChoice } from '../src/application/visual-pnl';
import { createKairosDatabase, JOURNAL_CHANGED_EVENT, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { DecimalString, TradeId } from '../src/domain/trades';
import { axeViolations } from './fixtures/axe';

// Sunday 25 October 2026, noon UTC.
const NOW = '2026-10-25T12:00:00.000Z';
const now = () => NOW;
const FAILED = 'Kairos could not load your saved trades. They are still on this device.';

let deviceZone: string | null = 'Asia/Manila';
beforeEach(() => {
  deviceZone = 'Asia/Manila';
  const real = new Intl.DateTimeFormat().resolvedOptions();
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(() => ({ ...real, timeZone: deviceZone as string }));
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
});
const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(zone: string | null = 'UTC'): Promise<KairosDatabase> {
  const name = `kairos-your-trades-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  if (zone !== null) expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, zone, NOW)).ok).toBe(true);
  return db;
}
function closed(closedAt: string, exit: string, { currency = 'USDT' as string | null, symbol = 'BTCUSDT' } = {}): SaveManualTradeInput {
  const openedAt = new Date(Date.parse(closedAt) - 3_600_000).toISOString();
  return {
    symbol, marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: currency,
    executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: openedAt }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
    fees: [],
  } as SaveManualTradeInput;
}
async function save(db: KairosDatabase, input: SaveManualTradeInput): Promise<TradeId> {
  const saved = await saveManualTrade(db, input);
  if (!saved.ok) throw new Error(`fixture: ${JSON.stringify(saved)}`);
  return saved.tradeId as TradeId;
}

/** A closed trade as the read gives it, compared as recorded. */
const row = (id: string, amount: string | null = '40', overrides: Partial<HomeYourTrade> = {}): HomeYourTrade => ({
  id: id as TradeId, symbol: 'BTCUSDT', side: 'long',
  outcome: amount === null ? 'unavailable' : amount.startsWith('-') ? 'loss' : 'profit',
  resultLabel: amount === null ? 'Not available' : amount.startsWith('-') ? 'Loss' : 'Profit',
  amount: amount as DecimalString | null, currency: 'USDT', source: amount === null ? 'none' : 'net-pnl',
  compared: amount === null ? { kind: 'no-result' } : { kind: 'compared', amount: amount as DecimalString, currency: 'USDT', converted: false },
  closedAt: '2026-10-12T01:00:00.000Z', closeDayKey: '2026-10-12', ...overrides,
});
function answer(trades: readonly HomeYourTrade[], { choice = { kind: 'month', at: null } as VisualPnlPeriodChoice, homeCurrency = null as string | null, hasTrades = true } = {}): HomeYourTradesResult {
  const projected = projectVisualPnlPeriod(choice, '2026-10-25');
  if (!projected.ok) throw new Error('fixture period');
  return { kind: 'ready', timeZone: 'UTC', todayKey: '2026-10-25', period: projected.period, homeCurrency, trades, hasTrades };
}
type Load = typeof loadHomeYourTrades;

/** Where the router is (the page and its search), and the browser's Back. */
function Where() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><span data-testid="where">{location.pathname + location.search}</span><button type="button" onClick={() => navigate(-1)}>Go back</button></>;
}
const where = () => screen.getByTestId('where').textContent;
function TradePage() {
  return <h1>Trade page</h1>;
}
function inApp(element: React.ReactNode, at = '/') {
  return render(<MemoryRouter initialEntries={[at]}><Routes><Route path="/" element={element} /><Route path="/journal/trades/:id" element={<TradePage />} /></Routes><Where /></MemoryRouter>);
}
const region = () => screen.getByRole('region', { name: 'Your Trades' });
const periods = () => within(region()).getByRole('group', { name: 'Trades closed in' });
const pressed = (group: HTMLElement) => within(group).getAllByRole('button').filter(button => button.getAttribute('aria-pressed') === 'true').map(button => button.textContent);

describe('T-061d Your Trades: the closed trades of a period, each a link to its page', () => {
  it('shows each real trade closed in the period from its saved executions, named with its result after fees; open trades stay out', async () => {
    const db = await database();
    const id = await save(db, closed('2026-10-12T10:00:00.000Z', '140'));
    await save(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'short', status: 'open', openedAt: '2026-10-20T10:00:00.000Z' } as SaveManualTradeInput);
    await save(db, closed('2025-12-31T10:00:00.000Z', '90', { symbol: 'SOLUSDT' }));
    inApp(<HomeDashboardYourTrades db={db} now={now} />);
    const link = await screen.findByRole('link', { name: 'BTCUSDT long, closed 12 Oct, result after fees +40 USDT' });
    expect(link).toHaveAttribute('href', `/journal/trades/${id}`);
    expect(within(link).getByText('BTCUSDT')).toBeInTheDocument();
    expect(within(link).getByText('+40 USDT')).toBeInTheDocument();
    expect(within(region()).getAllByRole('link', { name: /result after fees/ })).toHaveLength(1);
    expect(screen.getByText('One bubble per closed trade · bigger result, bigger bubble · green won, red lost')).toBeInTheDocument();

    // Another year says its year; a loss is red.
    fireEvent.click(within(periods()).getByRole('button', { name: 'All time' }));
    expect(await screen.findByRole('link', { name: 'SOLUSDT long, closed 31 Dec 2025, result after fees -10 USDT' })).toHaveAttribute('data-movement', 'negative');
  });

  it('shows loading, an error with "Try again" that gives the heading focus, and an empty journal that links to the journal', async () => {
    const load = vi.fn<Load>().mockRejectedValueOnce(new Error('read')).mockResolvedValue(answer([], { hasTrades: false }));
    inApp(<HomeDashboardYourTrades load={load} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your saved trades…');
    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED);
    const retry = screen.getByRole('button', { name: 'Try again' });
    retry.focus();
    fireEvent.click(retry);
    expect(await screen.findByRole('heading', { level: 3, name: 'Your trading story starts here' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log your first trade' })).toHaveAttribute('href', '/journal');
    expect(screen.getByRole('heading', { level: 2, name: 'Your Trades' })).toHaveFocus();
  });

  it('a period switch replaces the pages: every trade of the period shows, and a tap on a period reads it', async () => {
    const load = vi.fn<Load>().mockImplementation(async (_db, { choice }) => answer(Array.from({ length: 14 }, (_, index) => row(String(index))), { choice }));
    const { container } = inApp(<HomeDashboardYourTrades load={load} now={now} />);
    await waitFor(() => expect(container.querySelectorAll('.kairos-your-trades__bubble')).toHaveLength(14));
    expect(within(periods()).getAllByRole('button').map(button => button.textContent)).toEqual(['Week', 'Month', '3 months', 'Year', 'All time']);
    expect(pressed(periods())).toEqual(['Month']);
    expect(load).toHaveBeenLastCalledWith(expect.anything(), { choice: { kind: 'month', at: null }, now: NOW });
    expect(screen.queryByText(/Page \d of/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();

    const week = within(periods()).getByRole('button', { name: 'Week' });
    week.focus();
    fireEvent.click(week);
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.anything(), { choice: { kind: 'week', at: null }, now: NOW }));
    expect(pressed(periods())).toEqual(['Week']);
    expect(week).toHaveFocus();
  });

  it('a tap opens the trade\'s page: no details panel and no pressed bubbles', async () => {
    const load = vi.fn<Load>().mockResolvedValue(answer([row('trade/1?', '150'), row('two', '-20')]));
    inApp(<HomeDashboardYourTrades load={load} />);
    const link = await screen.findByRole('link', { name: 'BTCUSDT long, closed 12 Oct, result after fees +150 USDT' });
    expect(link).not.toHaveAttribute('aria-pressed');
    fireEvent.click(link);
    expect(await screen.findByRole('heading', { name: 'Trade page' })).toBeInTheDocument();
    expect(where()).toBe('/journal/trades/trade%2F1%3F');
    expect(screen.queryByLabelText('Selected trade')).toBeNull();
  });

  it('Home keeps the view and the period in the address, replacing its entry, so Back returns to the same bubbles', async () => {
    const db = await database();
    await skipSetup(db, { now });
    const id = await save(db, closed('2026-10-20T10:00:00.000Z', '150'));
    inApp(<HomeRoute db={db} now={now} />);
    const view = await screen.findByRole('group', { name: 'Dashboard view' });
    expect(where()).toBe('/');
    fireEvent.click(within(view).getByRole('button', { name: 'Your Trades' }));
    await waitFor(() => expect(where()).toBe('/?view=trades'));
    fireEvent.click(within(await waitFor(periods)).getByRole('button', { name: 'Week' }));
    await waitFor(() => expect(where()).toBe('/?view=trades&period=week'));
    fireEvent.click(await screen.findByRole('link', { name: 'BTCUSDT long, closed 20 Oct, result after fees +50 USDT' }));
    await waitFor(() => expect(where()).toBe(`/journal/trades/${id}`));

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(where()).toBe('/?view=trades&period=week'));
    expect(within(screen.getByRole('group', { name: 'Dashboard view' })).getByRole('button', { name: 'Your Trades' })).toHaveAttribute('aria-pressed', 'true');
    expect(pressed(periods())).toEqual(['Week']);
    expect(await screen.findByRole('link', { name: /^BTCUSDT long, closed 20 Oct/ })).toBeInTheDocument();
    // Each change replaced Home's entry: nothing is left behind it to go back to (pushed, Back would show "/?view=trades").
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await act(async () => { await new Promise(done => setTimeout(done, 30)); });
    expect(where()).toBe('/?view=trades&period=week');
    fireEvent.click(within(screen.getByRole('group', { name: 'Dashboard view' })).getByRole('button', { name: 'Live Market' }));
    await waitFor(() => expect(where()).toBe('/?view=market&period=week'));
    expect(screen.getByText('market runtime')).toBeInTheDocument();
  });

  it('without a view in the address, D223 picks it and the address stays "/"; a period chosen there keeps the view', async () => {
    const db = await database();
    await skipSetup(db, { now });
    await saveTradedMarkets(db, ['forex'], { now });
    inApp(<HomeRoute db={db} now={now} />);
    const view = await screen.findByRole('group', { name: 'Dashboard view' });
    await waitFor(() => expect(within(view).getByRole('button', { name: 'Your Trades' })).toHaveAttribute('aria-pressed', 'true'));
    expect(where()).toBe('/');
    fireEvent.click(within(await waitFor(periods)).getByRole('button', { name: 'Year' }));
    await waitFor(() => expect(where()).toBe('/?period=year&view=trades'));
  });

  it('outside a router the view and the period live in the page, and each bubble is a plain link', async () => {
    const db = await database();
    await skipSetup(db, { now });
    const id = await save(db, closed('2026-03-02T10:00:00.000Z', '120'));
    render(<HomeRoute db={db} now={now} />);
    fireEvent.click(within(await screen.findByRole('group', { name: 'Dashboard view' })).getByRole('button', { name: 'Your Trades' }));
    expect(await screen.findByText('No trades closed this month.')).toBeInTheDocument();
    fireEvent.click(within(periods()).getByRole('button', { name: 'Year' }));
    const link = await screen.findByRole('link', { name: 'BTCUSDT long, closed 2 Mar, result after fees +20 USDT' });
    expect(link).toHaveAttribute('href', `/journal/trades/${id}`);
    expect(pressed(periods())).toEqual(['Year']);
  });

  it('a drag still blocks the link\'s click; a tap from the keyboard still opens it', async () => {
    const frames = new Map<number, FrameRequestCallback>();
    let next = 1;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = next++; frames.set(id, callback); return id; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const load = vi.fn<Load>().mockResolvedValue(answer([row('one', '150')]));
    inApp(<HomeDashboardYourTrades load={load} />);
    const link = await screen.findByRole('link', { name: /^BTCUSDT long/ });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const pointer = (target: EventTarget, type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y });
      Object.assign(event, { pointerType: 'mouse', pointerId: 1, isPrimary: true });
      act(() => { target.dispatchEvent(event); });
    };
    pointer(link, 'pointerdown', 100, 100);
    act(() => { vi.advanceTimersByTime(GLASS_HOLD_MS); });
    expect(link).toHaveAttribute('data-glass-dragging', 'true');
    pointer(window, 'pointermove', 140, 130);
    pointer(window, 'pointerup', 140, 130);
    fireEvent.click(link, { detail: 1 });
    expect(where()).toBe('/');
    vi.useRealTimers();
    // Enter on a focused link clicks with no pointer (detail 0): it opens the page.
    fireEvent.click(link, { detail: 0 });
    expect(await screen.findByRole('heading', { name: 'Trade page' })).toBeInTheDocument();
  });

  it('shows the 40 biggest of the period, with a link to all of them in your results', async () => {
    const many = Array.from({ length: 63 }, (_, index) => row(`t${index}`, String(index + 1)));
    const load = vi.fn<Load>().mockImplementation(async (_db, { choice }) => answer(many, { choice }));
    const { container } = inApp(<HomeDashboardYourTrades load={load} />);
    expect(await screen.findByText('The 40 biggest of 63 trades')).toBeInTheDocument();
    expect(container.querySelectorAll('.kairos-your-trades__bubble')).toHaveLength(40);
    expect(screen.getByRole('link', { name: 'See them all in your results' })).toHaveAttribute('href', '/analysis?period=month');
    fireEvent.click(within(periods()).getByRole('button', { name: '3 months' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'See them all in your results' })).toHaveAttribute('href', '/analysis?period=three-months'));
    expect(await axeViolations(region())).toEqual([]);
  });

  it('says which trades could not be compared, with a dashed edge, and how to fix it', async () => {
    const converted = row('converted', '150', { currency: 'USD', compared: { kind: 'compared', amount: '120' as DecimalString, currency: 'EUR', converted: true } });
    const missing = [row('m1', '30', { currency: 'USD', compared: { kind: 'not-compared', reason: 'missing-rate' } }), row('m2', '-5', { currency: 'USD', compared: { kind: 'not-compared', reason: 'missing-rate' } })];
    const load = vi.fn<Load>().mockResolvedValue(answer([converted, ...missing, row('none', '-7', { currency: null, compared: { kind: 'not-compared', reason: 'unknown-currency' } })], { homeCurrency: 'EUR' }));
    inApp(<HomeDashboardYourTrades load={load} />);
    const link = await screen.findByRole('link', { name: 'BTCUSDT long, closed 12 Oct, result after fees +150 USD (+120 EUR)' });
    expect(within(link).getByText('+120 EUR')).toBeInTheDocument();
    expect(link).toHaveAttribute('data-compared', 'true');
    const dashed = screen.getByRole('link', { name: 'BTCUSDT long, closed 12 Oct, result after fees +30 USD, not compared' });
    expect(dashed).toHaveAttribute('data-compared', 'false');
    expect(screen.getByText(/2 trades couldn't be compared: a rate is missing\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add the missing rates' })).toHaveAttribute('href', '/currency');
    expect(screen.getByText("1 trade couldn't be compared: it has no currency Kairos knows.")).toBeInTheDocument();
    expect(screen.queryByText('Sizes compare trades in the same currency.')).toBeNull();
  });

  it('with results in several currencies and no home currency, says sizes compare within a currency', async () => {
    const load = vi.fn<Load>().mockResolvedValue(answer([row('usdt', '40'), row('eur', '-30', { currency: 'EUR', compared: { kind: 'compared', amount: '-30' as DecimalString, currency: 'EUR', converted: false } })]));
    inApp(<HomeDashboardYourTrades load={load} />);
    expect(await screen.findByText(/Sizes compare trades in the same currency\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose a home currency' })).toHaveAttribute('href', '/currency');
    expect(screen.getByRole('link', { name: 'BTCUSDT long, closed 12 Oct, result after fees -30 EUR' })).toHaveAttribute('data-movement', 'negative');
  });

  it('an empty period says so, with "See all time" (which keeps focus on the switch) and "Log a trade"', async () => {
    const load = vi.fn<Load>().mockImplementation(async (_db, { choice }) => answer(choice.kind === 'all' ? [row('old', '15')] : [], { choice }));
    inApp(<HomeDashboardYourTrades load={load} />);
    expect(await screen.findByText('No trades closed this month.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log a trade' })).toHaveAttribute('href', '/journal/log');
    expect(await axeViolations(region())).toEqual([]);
    const all = screen.getByRole('button', { name: 'See all time' });
    all.focus();
    fireEvent.click(all);
    expect(await screen.findByRole('link', { name: /^BTCUSDT long, closed 12 Oct/ })).toBeInTheDocument();
    expect(within(periods()).getByRole('button', { name: 'All time' })).toHaveFocus();
    expect(pressed(periods())).toEqual(['All time']);
  });

  it('with no saved time zone it saves this device\'s first; with none it says so, with "Open Settings"', async () => {
    const db = await database(null);
    await save(db, closed('2026-10-20T10:00:00.000Z', '150'));
    inApp(<HomeDashboardYourTrades db={db} now={now} />);
    expect(await screen.findByRole('link', { name: /^BTCUSDT long, closed 20 Oct/ })).toBeInTheDocument();
    expect(await loadVisualPnlTimeZone(db)).toBe('Asia/Manila');
    cleanup();

    deviceZone = 'Not/AZone';
    const none = await database(null);
    inApp(<HomeDashboardYourTrades db={none} now={now} />);
    expect(await screen.findByText(/Kairos needs your time zone to show your trades\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/settings');
    expect(await loadVisualPnlTimeZone(none)).toBeNull();
  });

  it('focus never falls to the page when a new read takes the focused bubble away', async () => {
    const load = vi.fn<Load>().mockResolvedValueOnce(answer([row('gone', '40'), row('stays', '20')])).mockResolvedValue(answer([row('stays', '20')]));
    inApp(<HomeDashboardYourTrades load={load} />);
    const gone = await screen.findByRole('link', { name: /result after fees \+40 USDT/ });
    gone.focus();
    act(() => { window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); });
    await waitFor(() => expect(screen.queryByRole('link', { name: /result after fees \+40 USDT/ })).toBeNull());
    expect(screen.getByRole('heading', { level: 2, name: 'Your Trades' })).toHaveFocus();
  });

  it('ignores an answer that comes after a newer read took over', async () => {
    let resolve!: (value: HomeYourTradesResult) => void;
    const old: Load = () => new Promise(done => { resolve = done; });
    const next: Load = async () => answer([], { hasTrades: false });
    const { rerender } = render(<MemoryRouter><HomeDashboardYourTrades load={old} /></MemoryRouter>);
    rerender(<MemoryRouter><HomeDashboardYourTrades load={next} /></MemoryRouter>);
    await screen.findByText('Your trading story starts here');
    resolve(answer([row('late')]));
    await act(async () => { await new Promise(done => setTimeout(done, 30)); });
    expect(screen.queryByRole('link', { name: /^BTCUSDT long/ })).toBeNull();
  });

  it('passes axe at 390 px with bubbles, notes and the period switch', async () => {
    const load = vi.fn<Load>().mockResolvedValue(answer([row('a', '40'), row('b', '-25'), row('c', null), row('d', '9', { currency: 'USD', compared: { kind: 'not-compared', reason: 'missing-rate' } })], { homeCurrency: 'USDT' }));
    inApp(<HomeDashboardYourTrades load={load} />);
    await screen.findByRole('link', { name: 'BTCUSDT long, closed 12 Oct, result not available' });
    expect(await axeViolations(region())).toEqual([]);
  });
});
