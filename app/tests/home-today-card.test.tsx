import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { loadHomeToday } from '../src/application/dashboard/homeToday';
import { skipSetup } from '../src/application/setup/setupState';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { loadVisualPnlTimeZone, writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, JOURNAL_CHANGED_EVENT, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { exchangeRateId } from '../src/domain/calculations/currencyConversion';
import type { DecimalString, TradeId } from '../src/domain/trades';
import { TodayCard } from '../src/features/home/TodayCard';
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
