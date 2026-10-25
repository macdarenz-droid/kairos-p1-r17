import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { loadHomeToday } from '../src/application/dashboard/homeToday';
import { NEWS_COVERAGE_KEY, type NewsApiPort } from '../src/application/economic-calendar/fetchedNews';
import type { PriceNowResult } from '../src/application/market-reference/priceNow';
import { skipSetup } from '../src/application/setup/setupState';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { loadVisualPnlTimeZone, writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, JOURNAL_CHANGED_EVENT, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { exchangeRateId } from '../src/domain/calculations/currencyConversion';
import type { DecimalString, MarketType, TradeId } from '../src/domain/trades';
import { TodayCard } from '../src/features/home/TodayCard';
import { TradeFormMarketContext, type TradeFormMarket } from '../src/features/journal/tradeFormMarket';
import type { KairosApiResult } from '../src/services/kairos-api/kairosApi';
import type { NewsCalendarAnswer } from '../src/services/kairos-api/newsApi';
import { axeViolations } from './fixtures/axe';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => <p>market runtime</p>,
}));
import { HomeRoute } from '../src/app/HomeRoute';

const NOW = '2026-10-25T12:00:00.000Z';
const now = () => NOW;
const FAILED = 'Kairos could not load today. Your trades are not affected.';

let deviceZone = 'Asia/Manila';
beforeEach(() => {
  deviceZone = 'Asia/Manila';
  const real = new Intl.DateTimeFormat().resolvedOptions();
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(() => ({ ...real, timeZone: deviceZone }));
});
const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(zone: string | null = 'UTC'): Promise<KairosDatabase> {
  const name = `kairos-today-card-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  if (zone !== null) expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, zone, NOW)).ok).toBe(true);
  return db;
}

function closed(closedAt: string, exit: string, { currency = 'USDT', symbol = 'BTCUSDT', marketType = 'crypto', exitQuantity = '1' }: { currency?: string; symbol?: string; marketType?: SaveManualTradeInput['marketType']; exitQuantity?: string } = {}): SaveManualTradeInput {
  const openedAt = new Date(Date.parse(closedAt) - 3_600_000).toISOString();
  return {
    symbol, marketType, side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: currency,
    executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: openedAt }, { type: 'exit', price: exit, quantity: exitQuantity, executedAt: closedAt }],
    fees: [],
  } as SaveManualTradeInput;
}
function open(symbol: string, openedAt: string, plan: { stop?: string; target?: string } = {}, entry: string | null = '64000', side: 'long' | 'short' = 'long'): SaveManualTradeInput {
  return {
    symbol, marketType: 'crypto', side, status: 'open', openedAt, grossPnlCurrency: 'USDT',
    plan: { plannedEntryPrice: null, plannedStopPrice: plan.stop ?? null, plannedTargetPrice: plan.target ?? null, plannedQuantity: null },
    executions: entry === null ? [] : [{ type: 'entry', price: entry, quantity: '0.1', executedAt: openedAt }],
    fees: [],
  } as SaveManualTradeInput;
}
async function save(db: KairosDatabase, input: SaveManualTradeInput): Promise<TradeId> {
  const saved = await saveManualTrade(db, input);
  if (!saved.ok) throw new Error(`fixture: ${JSON.stringify(saved)}`);
  return saved.tradeId as TradeId;
}
function card(db: KairosDatabase, props: Partial<Parameters<typeof TodayCard>[0]> = {}) {
  return render(<MemoryRouter><TodayCard db={db} now={now} {...props} /></MemoryRouter>);
}
const region = () => screen.findByRole('region', { name: 'Today' });
/** The card's read has settled (no read running). */
const settled = (box: HTMLElement) => waitFor(() => expect(box).not.toHaveAttribute('aria-busy'));
const tick = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
const line = (box: HTMLElement, start: string) => within(box).getByText((_, element) => element?.tagName === 'P' && (element.textContent ?? '').startsWith(start));

describe('T-061b the "Today" card', () => {
  it('shows today, this month, the streak, the small calendar, the open trades and the coach, each with its link', async () => {
    const db = await database();
    await save(db, closed('2026-10-25T08:00:00.000Z', '130'));
    await save(db, closed('2026-10-25T10:00:00.000Z', '115.2'));
    await save(db, closed('2026-10-03T10:00:00.000Z', '95'));
    const btc = await save(db, open('BTCUSDT', '2026-10-24T08:00:00.000Z', { stop: '62000', target: '70000' }));
    const eth = await save(db, open('ETHUSDT', '2026-10-23T08:00:00.000Z', {}, '2500', 'short'));
    const sol = await save(db, open('SOLUSDT', '2026-10-22T08:00:00.000Z', { target: '200' }, null));
    await save(db, open('XRPUSDT', '2026-10-10T08:00:00.000Z'));
    await save(db, open('ADAUSDT', '2026-10-05T08:00:00.000Z'));
    card(db);
    const today = await region();
    await within(today).findByText('Open trades');

    expect(within(today).getByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument();
    expect(line(today, 'Today:')).toHaveTextContent(/^Today: Profit\s*\+45\.2 USDT · 2 trades$/);
    expect(line(today, 'This month:')).toHaveTextContent(/^This month: Profit\s*\+40\.2 USDT · 3 trades$/);
    expect(within(today).getByRole('region', { name: 'Current result streak' })).toHaveTextContent('Profit streak');

    const calendar = within(today).getByRole('table', { name: 'October 2026' });
    expect(within(calendar).getByText('25 October, today: won')).toBeInTheDocument();
    expect(within(calendar).getByText('3 October: lost')).toBeInTheDocument();
    expect(within(calendar).getByText('4 October: no trades')).toBeInTheDocument();
    expect(calendar.querySelector('[data-day-key="2026-10-25"]')).toHaveAttribute('data-day-result', 'profit');
    expect(calendar.querySelector('[data-day-key="2026-10-25"]')).toHaveAttribute('data-day-strength', '4');
    expect(calendar.querySelector('[data-day-key="2026-10-25"]')).toHaveAttribute('data-day-today', 'true');
    expect(calendar.querySelector('[data-day-key="2026-10-03"]')).toHaveAttribute('data-day-result', 'loss');
    expect(within(today).getByRole('link', { name: 'See your results' })).toHaveAttribute('href', '/analysis');

    const trades = within(today).getByRole('list', { name: 'Open trades' });
    expect(within(trades).getAllByRole('link').map(link => [link.textContent, link.getAttribute('href')])).toEqual([
      ['BTCUSDT · Long · in at 64000 · stop 62000 · target 70000', `/journal/trades/${btc}`],
      ['ETHUSDT · Short · in at 2500 · no stop set', `/journal/trades/${eth}`],
      ['SOLUSDT · Long · no entry saved · no stop set · target 200', `/journal/trades/${sol}`],
    ]);
    expect(within(today).getByRole('link', { name: '+ 2 more open trades' })).toHaveAttribute('href', '/journal?status=open');

    expect(line(today, 'Your coach:')).toHaveTextContent('Your coach: You reviewed 0 of your 3 closed trades this month.');
    expect(within(today).getByRole('link', { name: 'See all your coach notes' })).toHaveAttribute('href', '/coach');
  });

  it('says what is not there yet: no trades today, this month, open or for the coach', async () => {
    const db = await database();
    await save(db, closed('2026-09-03T10:00:00.000Z', '95'));
    card(db);
    const today = await region();
    expect(await within(today).findByText('No trades closed today yet.')).toBeInTheDocument();
    expect(within(today).getByText('No trades closed this month yet.')).toBeInTheDocument();
    expect(within(today).queryByText(/^Not available|^No trade with a result yet/)).toBeNull();
    expect(within(today).getByText('No open trades right now.')).toBeInTheDocument();
    expect(within(today).getByText('Your coach has nothing to point out this month.')).toBeInTheDocument();
    expect(within(today).queryByRole('link', { name: /more open trade/ })).toBeNull();
  });

  it('shows one line before any trade', async () => {
    const db = await database();
    card(db);
    const today = await region();
    expect(await within(today).findByText('Your day shows here once you log a trade.')).toBeInTheDocument();
    expect(within(today).queryByText(/^This month/)).toBeNull();
    expect(within(today).queryByRole('table')).toBeNull();
  });

  it("saves this device's time zone first; with none it points to Settings", async () => {
    const db = await database(null);
    await save(db, closed('2026-10-25T08:00:00.000Z', '130'));
    card(db);
    const today = await region();
    expect(await within(today).findByText(/^Today:/)).toBeInTheDocument();
    expect(await loadVisualPnlTimeZone(db)).toBe('Asia/Manila');
    cleanup();

    deviceZone = '';
    const none = await database(null);
    card(none);
    const unconfigured = await region();
    expect(await within(unconfigured).findByText('Kairos needs your time zone to show today.')).toBeInTheDocument();
    expect(within(unconfigured).getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/settings');
    expect(await loadVisualPnlTimeZone(none)).toBeNull();
  });

  it('says why the month has no total, with the fix: a home currency, a missing rate, or the trade with no result', async () => {
    const db = await database();
    await save(db, closed('2026-10-20T10:00:00.000Z', '102', { currency: 'EUR', symbol: 'BTCEUR' }));
    await save(db, closed('2026-10-20T11:00:00.000Z', '110', { currency: 'USD', symbol: 'AAPL', marketType: 'stock' }));
    const view = card(db);
    let today = await region();
    expect(await within(today).findByText('Not available: your trades are in different currencies. Choose a home currency to add them up.', { exact: false })).toBeInTheDocument();
    expect(line(today, 'This month:')).toHaveTextContent(/^This month: Not available · 2 trades$/);
    expect(within(today).getByRole('link', { name: 'Choose a home currency' })).toHaveAttribute('href', '/currency');
    view.unmount();

    expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);
    card(db);
    today = await region();
    expect(await within(today).findByText('Not available: 1 trade still needs an exchange rate to count in EUR.', { exact: false })).toBeInTheDocument();
    expect(within(today).getByRole('link', { name: 'Add the missing rates' })).toHaveAttribute('href', '/currency');
    cleanup();

    const partly = await database();
    const id = await save(partly, closed('2026-10-20T10:00:00.000Z', '110', { exitQuantity: '0.5' }));
    card(partly);
    today = await region();
    expect(await within(today).findByText('1 trade has no result yet:', { exact: false })).toBeInTheDocument();
    expect(within(today).getByRole('link', { name: 'View trade' })).toHaveAttribute('href', `/journal/trades/${id}`);
  });

  it('a failed read says so; "Try again" reads again and puts focus on the heading', async () => {
    const db = await database();
    await save(db, closed('2026-10-25T08:00:00.000Z', '130'));
    const load = vi.fn(loadHomeToday).mockRejectedValueOnce(new Error('storage'));
    card(db, { load });
    const today = await region();
    expect(await within(today).findByRole('alert')).toHaveTextContent(FAILED);
    const retry = within(today).getByRole('button', { name: 'Try again' });
    retry.focus();
    fireEvent.click(retry);
    await within(today).findByText(/^Today:/);
    expect(load).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(document.activeElement).toBe(within(today).getByRole('heading', { level: 2, name: 'Today' })));
  });

  it('reads again when the journal changes, on focus, when the page shows again and on a new day', async () => {
    const db = await database();
    let clock = NOW;
    const load = vi.fn(loadHomeToday);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    card(db, { load, now: () => clock });
    const today = await region();
    expect(await within(today).findByText('Your day shows here once you log a trade.')).toBeInTheDocument();
    await save(db, closed('2026-10-25T08:00:00.000Z', '130'));
    act(() => { window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); });
    await waitFor(() => expect(line(today, 'Today:')).toHaveTextContent('+30 USDT · 1 trade'));

    const calls = load.mock.calls.length;
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(load.mock.calls.length).toBe(calls + 1));
    await settled(today);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(load.mock.calls.length).toBe(calls + 2));
    await settled(today);

    // The same day reads nothing; the next one reads again.
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(load.mock.calls.length).toBe(calls + 2);
    clock = '2026-10-26T00:00:30.000Z';
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(await within(today).findByText('No trades closed today yet.')).toBeInTheDocument();
    expect(load.mock.calls.at(-1)?.[1]).toEqual({ now: clock });
  });

  it('review r1: a read again that fails shows the alert with "Try again" instead of the old numbers, and focus stays in the card', async () => {
    const db = await database();
    await save(db, closed('2026-10-25T08:00:00.000Z', '130'));
    const load = vi.fn(loadHomeToday).mockImplementationOnce(loadHomeToday).mockRejectedValueOnce(new Error('storage'));
    card(db, { load });
    const today = await region();
    await waitFor(() => expect(line(today, 'Today:')).toHaveTextContent('+30 USDT · 1 trade'));
    await settled(today);
    within(today).getByRole('link', { name: 'See your results' }).focus();
    act(() => { window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); });
    expect(await within(today).findByRole('alert')).toHaveTextContent(FAILED);
    expect(within(today).queryByText(/^Today:/)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(today).getByRole('button', { name: 'Try again' })));
    fireEvent.click(within(today).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(line(today, 'Today:')).toHaveTextContent('+30 USDT · 1 trade'));
    expect(within(today).queryByRole('alert')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(today).getByRole('heading', { level: 2, name: 'Today' })));
  });

  it('review r2: a read in the background that works while "Try again" has focus puts focus on the heading', async () => {
    const db = await database();
    await save(db, closed('2026-10-25T08:00:00.000Z', '130'));
    const load = vi.fn(loadHomeToday).mockRejectedValueOnce(new Error('storage'));
    card(db, { load });
    const today = await region();
    const retry = await within(today).findByRole('button', { name: 'Try again' });
    await settled(today);
    retry.focus();
    act(() => { window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); });
    await waitFor(() => expect(line(today, 'Today:')).toHaveTextContent('+30 USDT · 1 trade'));
    await waitFor(() => expect(document.activeElement).toBe(within(today).getByRole('heading', { level: 2, name: 'Today' })));
  });

  it('review r1: a month counted in the home currency says so, with "See your rates"', async () => {
    const db = await database();
    await save(db, closed('2026-10-20T10:00:00.000Z', '102', { currency: 'EUR', symbol: 'BTCEUR' }));
    await save(db, closed('2026-10-20T11:00:00.000Z', '110', { currency: 'USD', symbol: 'AAPL', marketType: 'stock' }));
    expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);
    await db.exchangeRates.put({ id: exchangeRateId('ecb', 'EUR', 'USD', '2026-10-20'), source: 'ecb', from: 'EUR', to: 'USD', day: '2026-10-20', rateDay: '2026-10-20', rate: '1.25' as DecimalString, savedAt: NOW });
    card(db);
    const today = await region();
    await waitFor(() => expect(line(today, 'This month:')).toHaveTextContent(/^This month: Profit\s*\+10 EUR · 2 trades$/));
    expect(within(today).getByText('Totals in EUR. 1 trade in another currency was converted to EUR.', { exact: false })).toBeInTheDocument();
    expect(within(today).getByRole('link', { name: 'See your rates' })).toHaveAttribute('href', '/currency');
  });

  it('review r1: reads nothing while the page is hidden, once on return, and one more for changes during a read', async () => {
    const db = await database();
    const load = vi.fn(loadHomeToday);
    card(db, { load });
    const today = await region();
    await within(today).findByText('Your day shows here once you log a trade.');
    await settled(today);
    const calls = load.mock.calls.length;

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); window.dispatchEvent(new Event('focus')); });
    await tick();
    expect(load.mock.calls.length).toBe(calls);

    // Coming back fires "visibilitychange" and then "focus": one read.
    let finish: () => void = () => undefined;
    const slow: typeof loadHomeToday = async (...args) => { await new Promise<void>(resolve => { finish = resolve; }); return loadHomeToday(...args); };
    load.mockImplementationOnce(slow);
    hidden.mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(load.mock.calls.length).toBe(calls + 1));
    act(() => { window.dispatchEvent(new Event('focus')); });
    await act(async () => { finish(); });
    await settled(today);
    await tick();
    expect(load.mock.calls.length).toBe(calls + 1);

    // Three changes while a read runs: one more read after it, not three.
    load.mockImplementationOnce(slow);
    act(() => { window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); });
    await waitFor(() => expect(load.mock.calls.length).toBe(calls + 2));
    act(() => { for (let n = 0; n < 3; n += 1) window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); });
    await tick();
    expect(load.mock.calls.length).toBe(calls + 2);
    await act(async () => { finish(); });
    await waitFor(() => expect(load.mock.calls.length).toBe(calls + 3));
    await settled(today);
    await tick();
    expect(load.mock.calls.length).toBe(calls + 3);
  });

  it('review r1: a day with a trade with no result or no currency says "Not available", never 0', async () => {
    const db = await database();
    await save(db, closed('2026-10-25T08:00:00.000Z', '110', { exitQuantity: '0.5' }));
    await save(db, { ...closed('2026-10-25T09:00:00.000Z', '120'), grossPnlCurrency: null });
    card(db);
    const today = await region();
    await waitFor(() => expect(line(today, 'Today:')).toHaveTextContent(/^Today: Not available · 2 trades$/));
  });

  it('review r1: an older read that answers after a newer one is ignored', async () => {
    const db = await database();
    await save(db, closed('2026-10-25T08:00:00.000Z', '130'));
    let finishOld: () => void = () => undefined;
    const old = vi.fn<typeof loadHomeToday>(async () => { await new Promise<void>(resolve => { finishOld = resolve; }); return { kind: 'time-zone-unconfigured' } as const; });
    const view = card(db, { load: old });
    const today = await region();
    await waitFor(() => expect(old).toHaveBeenCalled());
    view.rerender(<MemoryRouter><TodayCard db={db} now={now} load={loadHomeToday} /></MemoryRouter>);
    await waitFor(() => expect(line(today, 'Today:')).toHaveTextContent('+30 USDT · 1 trade'));
    await act(async () => { finishOld(); });
    await tick();
    expect(line(today, 'Today:')).toHaveTextContent('+30 USDT · 1 trade');
    expect(within(today).queryByText('Kairos needs your time zone to show today.')).toBeNull();
  });

  it('passes axe at 390 px', async () => {
    window.innerWidth = 390;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
    const db = await database();
    await save(db, closed('2026-10-25T08:00:00.000Z', '130'));
    await save(db, closed('2026-10-20T10:00:00.000Z', '90'));
    await save(db, open('BTCUSDT', '2026-10-24T08:00:00.000Z', { stop: '62000', target: '70000' }));
    await save(db, open('ETHUSDT', '2026-10-23T08:00:00.000Z'));
    await save(db, open('XRPUSDT', '2026-10-22T08:00:00.000Z'));
    await save(db, open('ADAUSDT', '2026-10-21T08:00:00.000Z'));
    card(db);
    const today = await region();
    await within(today).findByRole('link', { name: '+ 1 more open trade' });
    expect(await axeViolations(today)).toEqual([]);
  });
});

describe('T-061b Home opens with "Today"', () => {
  it('shows the header with its intro, then "Today" above the reminders and the dashboard view', async () => {
    const db = await database();
    await skipSetup(db, { now });
    render(<MemoryRouter><HomeRoute db={db} now={now} /></MemoryRouter>);
    const heading = screen.getByRole('heading', { level: 1, name: 'Home' });
    expect(screen.getByText("How you're doing today, and the markets now.")).toBeInTheDocument();
    const today = await region();
    const view = screen.getByRole('group', { name: 'Dashboard view' });
    expect(heading.compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(today.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const started = await screen.findByRole('region', { name: 'Getting started' });
    expect(today.compareDocumentPosition(started) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

const price = (value: string, quote: string | null = 'USDT'): PriceNowResult =>
  ({ ok: true, price: value as DecimalString, at: '2026-10-25T11:59:00.000Z', source: 'binance', market: 'BTCUSDT', midPrice: false, futures: false, quote });
const OFFLINE: PriceNowResult = { ok: false, why: 'offline', retryAfterSeconds: null, note: null, source: { provider: 'binance' } };
type Ask = Readonly<{ marketType: MarketType; symbol: string }>;
/** The app shell's market port, with only the price now (the card asks for nothing else). */
function market(answer: (ask: Ask) => PriceNowResult) {
  const priceNow = vi.fn(async (ask: Ask, _signal: AbortSignal) => answer(ask));
  const value: TradeFormMarket = { marketList: async () => ({ ok: false as const }), priceNow };
  return { value, priceNow };
}
function cardWithMarket(db: KairosDatabase, value: TradeFormMarket, props: Partial<Parameters<typeof TodayCard>[0]> = {}) {
  return render(<MemoryRouter><TradeFormMarketContext.Provider value={value}><TodayCard db={db} now={now} {...props} /></TradeFormMarketContext.Provider></MemoryRouter>);
}
/** The list item of the open trade whose link starts with `symbol`. */
const tradeItem = (box: HTMLElement, symbol: string) => within(box).getByRole('link', { name: new RegExp(`^${symbol} · `) }).closest('li') as HTMLElement;
const priceLine = (item: HTMLElement) => line(item, 'Price now');

describe('T-061c the price now under the open trades', () => {
  it('shows the price now and the result after fees if you closed now, never saved', async () => {
    const db = await database();
    await save(db, closed('2026-10-25T08:00:00.000Z', '130'));
    await save(db, open('BTCUSDT', '2026-10-24T08:00:00.000Z', { stop: '62000', target: '70000' }));
    await save(db, open('ETHUSDT', '2026-10-23T08:00:00.000Z', {}, '2500', 'short'));
    await save(db, open('SOLUSDT', '2026-10-22T08:00:00.000Z', {}, null));
    const executions = await db.tradeExecutions.count();
    const { value, priceNow } = market(ask => price({ BTCUSDT: '64210.5', ETHUSDT: '2450', SOLUSDT: '150' }[ask.symbol] ?? '1'));
    cardWithMarket(db, value);
    const today = await region();
    await waitFor(() => expect(priceLine(tradeItem(today, 'SOLUSDT'))).toBeInTheDocument());
    expect(priceLine(tradeItem(today, 'BTCUSDT'))).toHaveTextContent(/^Price now 64210\.5 USDT \(market, not saved\) · If you closed now Profit\s*\+21\.05 USDT · \+0\.11× what you risked$/);
    // No stop: no × what you risked.
    expect(priceLine(tradeItem(today, 'ETHUSDT'))).toHaveTextContent(/^Price now 2450 USDT \(market, not saved\) · If you closed now Profit\s*\+5 USDT$/);
    expect(priceLine(tradeItem(today, 'SOLUSDT'))).toHaveTextContent("Price now 150 USDT (market, not saved) · Kairos can't work out a result at this price.");
    expect(priceNow.mock.calls.map(([ask]) => ask)).toEqual([
      { marketType: 'crypto', symbol: 'BTCUSDT' }, { marketType: 'crypto', symbol: 'ETHUSDT' }, { marketType: 'crypto', symbol: 'SOLUSDT' },
    ]);
    // The price stays out of every total and is never stored.
    expect(line(today, 'This month:')).toHaveTextContent(/^This month: Profit\s*\+30 USDT · 1 trade$/);
    expect(await db.tradeExecutions.count()).toBe(executions);
    expect(within(tradeItem(today, 'BTCUSDT')).getAllByRole('link')).toHaveLength(1);
  });

  it('says when it cannot work out a result at a price in another currency', async () => {
    const db = await database();
    await save(db, open('BTCUSDT', '2026-10-24T08:00:00.000Z', { stop: '62000' }));
    const { value } = market(() => price('64210.5', 'USDC'));
    cardWithMarket(db, value);
    const today = await region();
    await waitFor(() => expect(priceLine(tradeItem(today, 'BTCUSDT'))).toHaveTextContent("Price now 64210.5 USDC (market, not saved) · Kairos can't work out a result at this price."));
    expect(within(today).queryByText(/If you closed now/)).toBeNull();
  });

  it("says why there is no price; \"Try again\" reads it again and focus moves to the trade", async () => {
    const db = await database();
    await save(db, open('BTCUSDT', '2026-10-24T08:00:00.000Z', { stop: '62000' }));
    let answer: PriceNowResult = OFFLINE;
    const { value, priceNow } = market(() => answer);
    cardWithMarket(db, value);
    const today = await region();
    await waitFor(() => expect(priceLine(tradeItem(today, 'BTCUSDT'))).toHaveTextContent("Price now: you're offline. Try again when you're back online."));
    const retry = within(tradeItem(today, 'BTCUSDT')).getByRole('button', { name: 'Try again' });
    retry.focus();
    answer = price('63000');
    fireEvent.click(retry);
    await waitFor(() => expect(priceLine(tradeItem(today, 'BTCUSDT'))).toHaveTextContent(/^Price now 63000 USDT \(market, not saved\) · If you closed now Loss\s*-100 USDT · -0\.5× what you risked$/));
    expect(priceNow).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(within(tradeItem(today, 'BTCUSDT')).getByRole('link'));
  });

  it('reads the shown trades only: on show, every 60 s while the page shows and is online, and when back online', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const db = await database();
    for (const [index, symbol] of ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'ADAUSDT'].entries()) await save(db, open(symbol, `2026-10-2${4 - index}T08:00:00.000Z`));
    const load = vi.fn(loadHomeToday);
    const { value, priceNow } = market(() => price('1'));
    cardWithMarket(db, value, { load });
    const today = await region();
    await waitFor(() => expect(priceNow).toHaveBeenCalledTimes(3));
    expect(priceNow.mock.calls.map(([ask]) => ask.symbol)).toEqual(['BTCUSDT', 'ETHUSDT', 'XRPUSDT']);
    await waitFor(() => expect(priceLine(tradeItem(today, 'XRPUSDT'))).toBeInTheDocument());

    // The card reading again (focus, a journal change) asks for no price.
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(priceNow).toHaveBeenCalledTimes(3);

    await act(async () => { vi.advanceTimersByTime(59_999); });
    expect(priceNow).toHaveBeenCalledTimes(3);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(priceNow).toHaveBeenCalledTimes(6);

    // Hidden: no read; shown again, the missed one.
    const hidden = vi.spyOn(Document.prototype, 'hidden', 'get').mockReturnValue(true);
    await act(async () => { vi.advanceTimersByTime(120_000); });
    expect(priceNow).toHaveBeenCalledTimes(6);
    hidden.mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(priceNow).toHaveBeenCalledTimes(9);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(priceNow).toHaveBeenCalledTimes(9);

    // Offline: no read; back online, a read at once.
    const online = vi.spyOn(Navigator.prototype, 'onLine', 'get').mockReturnValue(false);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(priceNow).toHaveBeenCalledTimes(9);
    online.mockReturnValue(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(priceNow).toHaveBeenCalledTimes(12);
  });

  it('asks for no price while the page is hidden when it shows', async () => {
    const hidden = vi.spyOn(Document.prototype, 'hidden', 'get').mockReturnValue(true);
    const db = await database();
    await save(db, open('BTCUSDT', '2026-10-24T08:00:00.000Z'));
    const { value, priceNow } = market(() => price('1'));
    cardWithMarket(db, value);
    const today = await region();
    await within(today).findByText('Open trades');
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(priceNow).not.toHaveBeenCalled();
    expect(within(today).queryByText(/^Price now/)).toBeNull();
    // Shown: the first read.
    hidden.mockReturnValue(false);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(priceLine(tradeItem(today, 'BTCUSDT'))).toHaveTextContent(/^Price now 1 USDT \(market, not saved\)/));
    expect(priceNow).toHaveBeenCalledTimes(1);
  });

  it('shows no price line without a market port, or one with no price now', async () => {
    const db = await database();
    await save(db, open('BTCUSDT', '2026-10-24T08:00:00.000Z'));
    cardWithMarket(db, market(() => price('64000')).value);
    let today = await region();
    await waitFor(() => expect(priceLine(tradeItem(today, 'BTCUSDT'))).toBeInTheDocument());
    cleanup();
    card(db);
    today = await region();
    await within(today).findByText('Open trades');
    expect(within(today).queryByText(/Price now/)).toBeNull();
    cleanup();
    cardWithMarket(db, { marketList: async () => ({ ok: false as const }) });
    today = await region();
    await within(today).findByText('Open trades');
    expect(within(today).queryByText(/Price now/)).toBeNull();
  });

  it('passes axe at 390 px with the price lines and a "Try again"', async () => {
    window.innerWidth = 390;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
    const db = await database();
    await save(db, closed('2026-10-25T08:00:00.000Z', '130'));
    await save(db, open('BTCUSDT', '2026-10-24T08:00:00.000Z', { stop: '62000', target: '70000' }));
    await save(db, open('ETHUSDT', '2026-10-23T08:00:00.000Z'));
    const { value } = market(ask => (ask.symbol === 'ETHUSDT' ? OFFLINE : price('64210.5')));
    cardWithMarket(db, value);
    const today = await region();
    await within(today).findByRole('button', { name: 'Try again' });
    await waitFor(() => expect(priceLine(tradeItem(today, 'BTCUSDT'))).toBeInTheDocument());
    expect(await axeViolations(today)).toEqual([]);
  });
});

const COVERS = { from: '2026-10-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z' };
const JOBS = { id: 'bls:00000000000000b1', source: 'bls' as const, title: 'Employment Situation', currency: 'USD', startsAt: '2026-11-06T14:30:00.000Z', impact: null, expected: null, previous: null, actual: null, savedAt: NOW, fetchedAt: NOW };
async function newsDatabase(refreshedAt: string | null, events: readonly (typeof JOBS)[] = [], { trade = true }: { trade?: boolean } = {}): Promise<KairosDatabase> {
  const db = await database();
  if (trade) await save(db, closed('2026-10-25T08:00:00.000Z', '130'));
  if (events.length > 0) await db.economicEvents.bulkPut([...events]);
  if (refreshedAt !== null) await db.metadata.put({ key: NEWS_COVERAGE_KEY, value: JSON.stringify({ version: 1, refreshedAt, windows: [{ source: 'bls', ...COVERS, fetchedAt: refreshedAt }] }), updatedAt: refreshedAt });
  return db;
}
const calendarAnswer = (source: string): NewsCalendarAnswer => source === 'bls'
  ? { source, fetchedAt: NOW, covers: COVERS, events: [{ key: '00000000000000c1', title: 'Consumer Price Index', startsAt: '2026-10-28T12:30:00.000Z' }], leftOut: 0 }
  : { source, fetchedAt: NOW, covers: null, events: [], leftOut: 0 };
function newsPort(setUp: boolean, calendar: (source: string) => Promise<KairosApiResult<NewsCalendarAnswer>> = async source => ({ ok: true, value: calendarAnswer(source) })) {
  const spy = vi.fn(calendar);
  const news: NewsApiPort = { setUp, calendar: spy, headlines: vi.fn(async () => ({ ok: false as const, reason: 'transport-failed' as const })) };
  return { news, calendar: spy };
}
const newsLine = (box: HTMLElement) => line(box, 'Next big news:');
/** Lets React run the card's effects (which start the 10 s wait) before the test moves the clock. */
const settle = () => act(async () => {});

describe('T-061c the next big news on "Today"', () => {
  it('names the next big news and when it is, says when the news was checked, and links the news calendar', async () => {
    const db = await newsDatabase('2026-10-25T09:00:00.000Z', [JOBS]);
    card(db);
    const today = await region();
    await waitFor(() => expect(newsLine(today)).toHaveTextContent('Next big news: US jobs report · Friday 6 November 2026 at 14:30'));
    expect(within(today).getByText('News checked 3 h ago')).toBeInTheDocument();
    expect(within(today).getByRole('link', { name: 'Open the news calendar' })).toHaveAttribute('href', '/news-calendar');
  });

  it('shows the news before the first trade too, and gets the official schedules then as well', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const db = await newsDatabase(null, [JOBS], { trade: false });
    const { news, calendar } = newsPort(true);
    card(db, { news });
    const today = await region();
    expect(await within(today).findByText('Your day shows here once you log a trade.')).toBeInTheDocument();
    expect(newsLine(today)).toHaveTextContent('Next big news: US jobs report · Friday 6 November 2026 at 14:30');
    expect(within(today).getByText("Kairos hasn't got the official schedules yet.")).toBeInTheDocument();
    expect(within(today).getByRole('link', { name: 'Open the news calendar' })).toHaveAttribute('href', '/news-calendar');
    expect(within(today).queryByText(/^This month/)).toBeNull();
    await settle();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(calendar).toHaveBeenCalledTimes(9);
    await waitFor(() => expect(newsLine(today)).toHaveTextContent('Next big news: US inflation (CPI) · Wednesday 28 October 2026 at 12:30'));
    expect(within(today).getByText('News checked just now')).toBeInTheDocument();
  });

  it('a failed read takes away the news and the prices with the old numbers, and reads no price meanwhile', async () => {
    const db = await newsDatabase('2026-10-25T09:00:00.000Z', [JOBS]);
    await save(db, open('BTCUSDT', '2026-10-24T08:00:00.000Z', { stop: '62000' }));
    const load = vi.fn(loadHomeToday);
    const { value, priceNow } = market(() => price('64210.5'));
    cardWithMarket(db, value, { load });
    const today = await region();
    await waitFor(() => expect(priceLine(tradeItem(today, 'BTCUSDT'))).toBeInTheDocument());
    expect(newsLine(today)).toHaveTextContent('US jobs report');
    load.mockRejectedValueOnce(new Error('storage'));
    act(() => { window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); });
    expect(await within(today).findByRole('alert')).toHaveTextContent(FAILED);
    expect(within(today).queryByText(/Next big news/)).toBeNull();
    expect(within(today).queryByText(/News checked/)).toBeNull();
    expect(within(today).queryByText(/Price now/)).toBeNull();
    const reads = priceNow.mock.calls.length;
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(priceNow).toHaveBeenCalledTimes(reads);
    fireEvent.click(within(today).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(newsLine(today)).toHaveTextContent('US jobs report'));
    await waitFor(() => expect(priceLine(tradeItem(today, 'BTCUSDT'))).toBeInTheDocument());
  });

  it('says when there is no big news in the next 14 days, and when the schedules were never fetched', async () => {
    const db = await newsDatabase(null, [{ ...JOBS, startsAt: '2026-11-08T12:00:00.001Z' }]);
    card(db);
    const today = await region();
    expect(await within(today).findByText('No big news in the next 14 days.')).toBeInTheDocument();
    expect(within(today).getByText("Kairos hasn't got the official schedules yet.")).toBeInTheDocument();
    expect(within(today).getByRole('link', { name: 'Open the news calendar' })).toBeInTheDocument();
  });

  it('gets the official schedules once, 10 s after its first read, when they are due and the server is set up, then reads again', async () => {
    // Real time still runs (the testing library waits with setTimeout); the 10 s wait is moved on by hand.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const db = await newsDatabase(null);
    const { news, calendar } = newsPort(true);
    card(db, { news });
    const today = await region();
    await within(today).findByText('No big news in the next 14 days.');
    await settle();
    // Real time moves the clock a little too while the test waits, so the check leaves it a second.
    await act(async () => { vi.advanceTimersByTime(9_000); });
    expect(calendar).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1_000); });
    expect(calendar).toHaveBeenCalledTimes(9);
    await waitFor(() => expect(newsLine(today)).toHaveTextContent('Next big news: US inflation (CPI) · Wednesday 28 October 2026 at 12:30'));
    expect(within(today).getByText('News checked just now')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(calendar).toHaveBeenCalledTimes(9);
  });

  it('gets nothing when the saved news is fresh or the server is not set up', async () => {
    // Real time still runs (the testing library waits with setTimeout); the 10 s wait is moved on by hand.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const fresh = newsPort(true);
    card(await newsDatabase('2026-10-25T11:55:00.000Z', [JOBS]), { news: fresh.news });
    let today = await region();
    await within(today).findByText('News checked 5 min ago');
    await settle();
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(fresh.calendar).not.toHaveBeenCalled();
    cleanup();

    const notSetUp = newsPort(false);
    card(await newsDatabase(null), { news: notSetUp.news });
    today = await region();
    await within(today).findByText("Kairos hasn't got the official schedules yet.");
    await settle();
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(notSetUp.calendar).not.toHaveBeenCalled();
  });

  it('a failed refresh keeps the saved news, and the same port asks again only after 30 minutes', async () => {
    // Real time still runs (the testing library waits with setTimeout); the 10 s wait is moved on by hand.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const db = await newsDatabase('2026-10-25T09:00:00.000Z', [JOBS]);
    const { news, calendar } = newsPort(true, async () => ({ ok: false, reason: 'transport-failed' }));
    let clock = NOW;
    const view = card(db, { news, now: () => clock });
    const today = await region();
    await waitFor(() => expect(newsLine(today)).toHaveTextContent('US jobs report'));
    await settle();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(calendar).toHaveBeenCalledTimes(9);
    await act(async () => { await Promise.resolve(); });
    expect(newsLine(today)).toHaveTextContent('Next big news: US jobs report · Friday 6 November 2026 at 14:30');
    expect(within(today).getByText('News checked 3 h ago')).toBeInTheDocument();
    view.unmount();

    card(db, { news, now: () => clock });
    await within(await region()).findByText('News checked 3 h ago');
    await settle();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(calendar).toHaveBeenCalledTimes(9);
    cleanup();

    clock = '2026-10-25T12:30:00.000Z';
    card(db, { news, now: () => clock });
    await within(await region()).findByText('News checked 3 h ago');
    await settle();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(calendar).toHaveBeenCalledTimes(18);
  });

  it('Home hands its news port to "Today"', async () => {
    // Real time still runs (the testing library waits with setTimeout); the 10 s wait is moved on by hand.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    const db = await newsDatabase(null);
    await skipSetup(db, { now });
    const { news, calendar } = newsPort(true);
    render(<MemoryRouter><HomeRoute db={db} now={now} news={news} /></MemoryRouter>);
    await within(await region()).findByText('No big news in the next 14 days.');
    await settle();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(calendar).toHaveBeenCalledTimes(9);
  });
});

const BUSY: PriceNowResult = { ok: false, why: 'busy', retryAfterSeconds: 150, note: null, source: { provider: 'binance' } };

describe('T-061c review r1', () => {
  it('a price read in the background that works while "Try again" has focus puts focus on the trade: back online, and the minute read', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const db = await database();
    await save(db, open('BTCUSDT', '2026-10-24T08:00:00.000Z', { stop: '62000' }));
    let answer: PriceNowResult = OFFLINE;
    const { value } = market(() => answer);
    cardWithMarket(db, value);
    const today = await region();
    const item = () => tradeItem(today, 'BTCUSDT');
    await waitFor(() => expect(priceLine(item())).toHaveTextContent("Price now: you're offline."));
    within(item()).getByRole('button', { name: 'Try again' }).focus();
    answer = price('63000');
    act(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(priceLine(item())).toHaveTextContent(/^Price now 63000 USDT/));
    await waitFor(() => expect(document.activeElement).toBe(within(item()).getByRole('link')));

    // The minute's read does the same.
    answer = OFFLINE;
    act(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(within(item()).getByRole('button', { name: 'Try again' })).toBeInTheDocument());
    within(item()).getByRole('button', { name: 'Try again' }).focus();
    answer = price('63500');
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await waitFor(() => expect(priceLine(item())).toHaveTextContent(/^Price now 63500 USDT/));
    await waitFor(() => expect(document.activeElement).toBe(within(item()).getByRole('link')));
  });

  it('"Open the news calendar" keeps focus when the first trade comes in, and when the news cannot be read', async () => {
    const db = await newsDatabase('2026-10-25T09:00:00.000Z', [JOBS], { trade: false });
    let newsFails = false;
    const load = vi.fn(async (store: KairosDatabase, options: Readonly<{ now: string }>) => {
      const result = await loadHomeToday(store, options);
      return newsFails && result.kind === 'ready' ? { ...result, projection: { ...result.projection, news: 'unavailable' as const } } : result;
    });
    card(db, { load });
    const today = await region();
    await within(today).findByText('Your day shows here once you log a trade.');
    within(today).getByRole('link', { name: 'Open the news calendar' }).focus();
    await save(db, closed('2026-10-25T08:00:00.000Z', '130'));
    act(() => { window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); });
    await within(today).findByText(/^This month:/);
    await settled(today);
    expect(document.activeElement).toBe(within(today).getByRole('link', { name: 'Open the news calendar' }));

    newsFails = true;
    act(() => { window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT)); });
    await within(today).findByText('Kairos could not load the news. Your trades are not affected.');
    await settled(today);
    expect(document.activeElement).toBe(within(today).getByRole('link', { name: 'Open the news calendar' }));
  });

  it('reads one price for shown trades on the same market', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const db = await database();
    await save(db, open('BTCUSDT', '2026-10-24T08:00:00.000Z', { stop: '62000' }));
    await save(db, open('BTCUSDT', '2026-10-23T08:00:00.000Z', {}, '63000'));
    await save(db, open('ETHUSDT', '2026-10-22T08:00:00.000Z', {}, '2500'));
    const { value, priceNow } = market(ask => price(ask.symbol === 'BTCUSDT' ? '64000' : '2450'));
    cardWithMarket(db, value);
    const today = await region();
    await waitFor(() => expect(within(today).getAllByText(/^Price now 64000 USDT/)).toHaveLength(2));
    await waitFor(() => expect(within(today).getByText(/^Price now 2450 USDT/)).toBeInTheDocument());
    expect(priceNow.mock.calls.map(([ask]) => ask.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(priceNow.mock.calls.map(([ask]) => ask.symbol)).toEqual(['BTCUSDT', 'ETHUSDT', 'BTCUSDT', 'ETHUSDT']);
  });

  it('asks nothing more of a busy source until the wait it asked for has passed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(Date.parse(NOW));
    const db = await database();
    await save(db, open('BTCUSDT', '2026-10-24T08:00:00.000Z', { stop: '62000' }));
    let answer: PriceNowResult = BUSY;
    const { value, priceNow } = market(() => answer);
    cardWithMarket(db, value);
    const today = await region();
    await waitFor(() => expect(priceLine(tradeItem(today, 'BTCUSDT'))).toHaveTextContent('Price now: too many requests right now. Wait a minute, then try again.'));
    expect(priceNow).toHaveBeenCalledTimes(1);
    answer = price('64000');
    await act(async () => { vi.advanceTimersByTime(60_000); });
    act(() => { window.dispatchEvent(new Event('online')); });
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(priceNow).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(priceNow).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(priceLine(tradeItem(today, 'BTCUSDT'))).toHaveTextContent(/^Price now 64000 USDT/));
  });
});
