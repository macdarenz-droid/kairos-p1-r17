import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { saveTradeDiscipline } from '../src/application/discipline';
import { loadResultsDashboard } from '../src/application/performance/resultsDashboard';
import { savePracticeTrade } from '../src/application/practice/savePracticeTrade';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { readVisualPnlTimeZonePreference, visualPnlTimeZonePreferenceMetadataKey, writeVisualPnlTimeZonePreference, type VisualPnlPeriodChoice } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { exchangeRateId, type ExchangeRateRecord } from '../src/domain/calculations/currencyConversion';
import type { DecimalString, TradeId } from '../src/domain/trades';
import { ResultsDashboard, type ResultsDashboardProps } from '../src/features/results/ResultsDashboard';
import { axeViolations } from './fixtures/axe';

const NOW = '2026-09-20T12:00:00.000Z';
const now = () => NOW;
const ERROR = 'Kairos could not load your results. Your saved trades have not changed.';

let deviceZone: string | undefined = 'Asia/Manila';
beforeEach(() => {
  deviceZone = 'Asia/Manila';
  const real = new Intl.DateTimeFormat().resolvedOptions();
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(() => ({ ...real, timeZone: deviceZone as string }));
});
const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(zone: string | null = 'UTC'): Promise<KairosDatabase> {
  const name = `kairos-results-screen-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  if (zone !== null) expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, zone, '2026-09-01T00:00:00.000Z')).ok).toBe(true);
  return db;
}
interface TradeOptions { readonly currency?: string; readonly symbol?: string; readonly marketType?: string; readonly quantity?: string; readonly exitQuantity?: string; readonly entry?: string }
function trade(closedAt: string, exit: string, options: TradeOptions = {}): SaveManualTradeInput {
  const { currency = 'USDT', symbol = 'BTCUSDT', marketType = 'crypto', quantity = '1', entry = '100' } = options;
  const exitQuantity = options.exitQuantity ?? quantity;
  const openedAt = new Date(Date.parse(closedAt) - 3_600_000).toISOString();
  return {
    symbol, marketType, side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: currency,
    plan: { plannedEntryPrice: null, plannedStopPrice: null, plannedTargetPrice: null, plannedQuantity: null },
    executions: [{ type: 'entry', price: entry, quantity, executedAt: openedAt }, { type: 'exit', price: exit, quantity: exitQuantity, executedAt: closedAt }],
    fees: [],
  } as SaveManualTradeInput;
}
async function save(db: KairosDatabase, input: SaveManualTradeInput, practice = false): Promise<TradeId> {
  const saved = practice ? await savePracticeTrade(db, input) : await saveManualTrade(db, input);
  if (!saved.ok) throw new Error(`fixture: ${JSON.stringify(saved)}`);
  return saved.tradeId;
}
async function septemberTrades(db: KairosDatabase) {
  return [
    await save(db, trade('2026-09-02T10:00:00.000Z', '110')),
    await save(db, trade('2026-09-03T10:00:00.000Z', '95')),
    await save(db, trade('2026-09-05T10:00:00.000Z', '120')),
  ];
}

type HostProps = Partial<Omit<ResultsDashboardProps, 'choice' | 'onChoiceChange'>> & { readonly db: KairosDatabase; readonly initial?: VisualPnlPeriodChoice };
function Host({ db, initial = { kind: 'month', at: null }, ...rest }: HostProps) {
  const [choice, setChoice] = useState<VisualPnlPeriodChoice>(initial);
  return <ResultsDashboard db={db} scope="real" now={now} choice={choice} onChoiceChange={setChoice}
    renderTradeLink={id => <a href={`/analysis?trade=${id}`}>View trade</a>} refreshRevision={0} {...rest} />;
}
function show(props: HostProps) { return render(<MemoryRouter><Host {...props} /></MemoryRouter>); }
const region = (name = 'Your results') => screen.findByRole('region', { name });
async function settled(name = 'Your results', status?: string) {
  const found = await region(name);
  await waitFor(() => expect(found.getAttribute('data-results-status')).not.toBe('loading'));
  if (status) await waitFor(() => expect(found).toHaveAttribute('data-results-status', status));
  await waitFor(() => expect(found).not.toHaveAttribute('aria-busy'));
  return found;
}
const periodLabel = (found: HTMLElement) => found.querySelector('.kairos-period-chooser__label')?.textContent;

describe('T-051c the time zone on first use', () => {
  it('saves this device zone the first time and says so, with "Change"', async () => {
    const db = await database(null);
    show({ db });
    const found = await settled();
    expect(within(found).getByRole('status')).toHaveTextContent("Kairos set your time zone to Asia/Manila, this device's time zone.");
    expect(within(found).getByText('Time zone: Asia/Manila')).toBeInTheDocument();
    expect(within(found).getByRole('link', { name: 'Change your time zone' })).toHaveAttribute('href', '/settings');
    expect(await readVisualPnlTimeZonePreference(createKairosRepositories(db).metadata)).toBe('Asia/Manila');
  });

  it('keeps the first-use line when a reload starts before the zone is saved', async () => {
    const db = await database(null);
    const view = render(<MemoryRouter><Host db={db} refreshRevision={0} /></MemoryRouter>);
    view.rerender(<MemoryRouter><Host db={db} refreshRevision={1} /></MemoryRouter>);
    const found = await settled();
    expect(within(found).getByRole('status')).toHaveTextContent("Kairos set your time zone to Asia/Manila, this device's time zone.");
    cleanup();

    const strictDb = await database(null);
    render(<StrictMode><MemoryRouter><Host db={strictDb} /></MemoryRouter></StrictMode>);
    const strict = await settled();
    expect(within(strict).getByRole('status')).toHaveTextContent("Kairos set your time zone to Asia/Manila, this device's time zone.");
  });

  it('keeps a saved zone', async () => {
    const db = await database('UTC');
    show({ db });
    const found = await settled();
    expect(within(found).getByText('Time zone: UTC')).toBeInTheDocument();
    expect(within(found).queryByText(/Kairos set your time zone/)).toBeNull();
    expect(await createKairosRepositories(db).metadata.get(visualPnlTimeZonePreferenceMetadataKey)).toMatchObject({ value: 'UTC', updatedAt: '2026-09-01T00:00:00.000Z' });
  });

  it('asks for a zone when the device gives none, and saves nothing', async () => {
    deviceZone = '';
    const db = await database(null);
    show({ db });
    const found = await settled('Your results', 'unconfigured');
    expect(within(found).getByRole('heading', { name: 'Choose your time zone' })).toBeInTheDocument();
    expect(within(found).getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/settings');
    expect(await readVisualPnlTimeZonePreference(createKairosRepositories(db).metadata)).toBeNull();
    expect(await axeViolations(found)).toEqual([]);
  });

  it('shows the error when the start fails, and "Try again" saves the zone and loads', async () => {
    const db = await database(null);
    vi.spyOn(db, 'transaction').mockImplementationOnce((() => Promise.reject(new Error('storage'))) as never);
    show({ db });
    const found = await settled('Your results', 'error');
    expect(within(found).getByText(ERROR)).toBeInTheDocument();
    fireEvent.click(within(found).getByRole('button', { name: 'Try again' }));
    await settled('Your results', 'empty');
    expect(await readVisualPnlTimeZonePreference(createKairosRepositories(db).metadata)).toBe('Asia/Manila');
  });
});

describe("T-051c the period's result after fees", () => {
  it('glows, with its trade count and the period', async () => {
    const db = await database();
    await septemberTrades(db);
    show({ db });
    const found = await settled('Your results', 'ready');
    const tile = within(found).getByText('Result after fees').closest('.kairos-stat') as HTMLElement;
    expect(tile).toHaveTextContent('+25 USDT');
    expect(within(tile).getByText('from 3 trades · September 2026')).toBeInTheDocument();
    expect(tile).toHaveAttribute('data-kairos-emphasis', 'main');
    expect(found.querySelectorAll('[data-kairos-emphasis]')).toHaveLength(1);
    expect(await axeViolations(found)).toEqual([]);
  });

  it('names a partly closed trade that blocks it', async () => {
    const db = await database();
    await septemberTrades(db);
    const partly = await save(db, trade('2026-09-10T10:00:00.000Z', '110', { quantity: '2', exitQuantity: '1' }));
    show({ db });
    const found = await settled('Your results', 'ready');
    expect(within(found).getByText('Not available: a trade has no result yet.')).toBeInTheDocument();
    expect(within(found).getByText('1 trade has no result yet:')).toBeInTheDocument();
    expect(within(found).getByRole('link', { name: 'View trade' })).toHaveAttribute('href', `/analysis?trade=${partly}`);
  });

  it('asks for a home currency when the trades are in different currencies', async () => {
    const db = await database();
    await septemberTrades(db);
    await save(db, trade('2026-09-11T10:00:00.000Z', '1.1', { currency: 'EUR', symbol: 'BTCEUR', entry: '1' }));
    show({ db });
    const found = await settled('Your results', 'ready');
    expect(within(found).getByText('Not available: your trades are in different currencies. Choose a home currency to add them up.')).toBeInTheDocument();
    expect(within(found).getByRole('link', { name: 'Choose a home currency' })).toHaveAttribute('href', '/currency');
  });

  it('says how many trades still need a rate, and links the missing rates once', async () => {
    const db = await database();
    const bank = (to: string, rate: string): ExchangeRateRecord => ({ id: exchangeRateId('ecb', 'EUR', to, '2026-09-18'), source: 'ecb', from: 'EUR', to, day: '2026-09-18', rateDay: '2026-09-18', rate: rate as DecimalString, savedAt: NOW });
    await save(db, trade('2026-09-18T10:00:00.000Z', '75', { currency: 'GBX', symbol: 'VOD.L', marketType: 'stock', quantity: '1000', entry: '70' }));
    await save(db, trade('2026-09-18T10:00:00.000Z', '190', { currency: 'USD', symbol: 'AAPL', marketType: 'stock', quantity: '10', entry: '187.5' }));
    await db.exchangeRates.bulkPut([bank('GBP', '0.8588')]);
    expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);
    show({ db });
    const found = await settled('Your results', 'ready');
    expect(within(found).getByText('Not available: 1 trade still needs an exchange rate to count in EUR.')).toBeInTheDocument();
    expect(within(found).getAllByRole('link', { name: 'Add the missing rates' })).toHaveLength(1);
    expect(found.querySelector('[data-home-currency="EUR"]')).not.toBeNull();
  });

  it('notes the totals are in the home currency, with a link to the rates', async () => {
    const db = await database();
    const bank = (to: string, rate: string): ExchangeRateRecord => ({ id: exchangeRateId('ecb', 'EUR', to, '2026-09-18'), source: 'ecb', from: 'EUR', to, day: '2026-09-18', rateDay: '2026-09-18', rate: rate as DecimalString, savedAt: NOW });
    await save(db, trade('2026-09-18T10:00:00.000Z', '75', { currency: 'GBX', symbol: 'VOD.L', marketType: 'stock', quantity: '1000', entry: '70' }));
    await save(db, trade('2026-09-18T10:00:00.000Z', '190', { currency: 'USD', symbol: 'AAPL', marketType: 'stock', quantity: '10', entry: '187.5' }));
    await db.exchangeRates.bulkPut([bank('GBP', '0.8588'), bank('USD', '1.146')]);
    expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);
    show({ db });
    const found = await settled('Your results', 'ready');
    expect(within(found).getByText('Totals in EUR. 2 trades in other currencies were converted to EUR.', { exact: false })).toBeInTheDocument();
    expect(within(found).getByRole('link', { name: 'See your rates' })).toHaveAttribute('href', '/currency');
    expect(within(found).getByText('Result after fees').closest('.kairos-stat')).toHaveTextContent('+80.04 EUR');
  });
});

describe('T-051c the period chooser', () => {
  it('steps by month, chooses a kind, and shows custom days only on "Show"', async () => {
    const db = await database();
    await septemberTrades(db);
    show({ db });
    let found = await settled('Your results', 'ready');
    expect(periodLabel(found)).toBe('September 2026');
    expect(within(found).getByRole('button', { name: 'Next month' })).toBeDisabled();
    fireEvent.click(within(found).getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(periodLabel(found)).toBe('August 2026'));
    expect(within(found).getByRole('button', { name: 'Next month' })).toBeEnabled();

    fireEvent.change(within(found).getByRole('combobox', { name: 'Period' }), { target: { value: 'year' } });
    await waitFor(() => expect(periodLabel(found)).toBe('2026'));
    fireEvent.change(within(found).getByRole('combobox', { name: 'Period' }), { target: { value: 'all' } });
    await waitFor(() => expect(periodLabel(found)).toBe('All time'));
    expect(within(found).queryByRole('button', { name: /^(Previous|Next) / })).toBeNull();

    fireEvent.change(within(found).getByRole('combobox', { name: 'Period' }), { target: { value: 'custom' } });
    fireEvent.change(within(found).getByLabelText('First day'), { target: { value: '2026-09-03' } });
    fireEvent.change(within(found).getByLabelText('Last day'), { target: { value: '2026-09-20' } });
    expect(periodLabel(found)).toBe('All time');
    fireEvent.click(within(found).getByRole('button', { name: 'Show' }));
    found = await region();
    await waitFor(() => expect(periodLabel(found)).toBe('3 – 20 September 2026'));

    fireEvent.change(within(found).getByRole('combobox', { name: 'Period' }), { target: { value: 'custom' } });
    fireEvent.change(within(found).getByLabelText('First day'), { target: { value: '2026-09-10' } });
    fireEvent.change(within(found).getByLabelText('Last day'), { target: { value: '2026-09-09' } });
    fireEvent.click(within(found).getByRole('button', { name: 'Show' }));
    expect(within(found).getByRole('alert')).toHaveTextContent('The last day is before the first day.');
    expect(periodLabel(found)).toBe('3 – 20 September 2026');
  });

  it('moves focus to "Previous month" when "Next month" reaches this month', async () => {
    const db = await database();
    await septemberTrades(db);
    show({ db, initial: { kind: 'month', at: '2026-08-01' } });
    const found = await settled('Your results');
    const next = within(found).getByRole('button', { name: 'Next month' });
    next.focus();
    fireEvent.click(next);
    await waitFor(() => expect(periodLabel(found)).toBe('September 2026'));
    await waitFor(() => expect(within(found).getByRole('button', { name: 'Previous month' })).toHaveFocus());
    expect(within(found).getByRole('button', { name: 'Next month' })).toBeDisabled();
  });
});

describe('T-051c the discipline ring over the period', () => {
  it('counts the reviews of the chosen period', async () => {
    const db = await database();
    const first = await save(db, trade('2026-09-02T10:00:00.000Z', '110'));
    await save(db, trade('2026-09-03T10:00:00.000Z', '95'));
    await save(db, trade('2026-08-15T10:00:00.000Z', '107'));
    expect((await saveTradeDiscipline(db, { tradeId: first, scope: 'real', half: 'review', answers: [{ itemId: 'followed-plan', answer: 'yes' }], mistakeIds: [], note: '' }, { now })).ok).toBe(true);
    show({ db });
    const found = await settled('Your results', 'ready');
    const panel = within(found).getByRole('region', { name: 'Your discipline' });
    expect(panel).toHaveTextContent('Trades closed in September 2026');
    expect(within(panel).getByText('After the trade: you reviewed 1 of 2 closed trades (50%).')).toBeInTheDocument();
    fireEvent.click(within(found).getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(within(found).getByText('After the trade: you reviewed 0 of 1 closed trade (0%).')).toBeInTheDocument());
  });
});

describe('T-051c empty and error states', () => {
  it('offers all time for an empty period, then "Log a trade" when there is nothing at all', async () => {
    const db = await database();
    show({ db, initial: { kind: 'month', at: '2026-08-01' } });
    const found = await settled('Your results', 'empty');
    expect(within(found).getByRole('heading', { name: 'No closed trades in August 2026' })).toBeInTheDocument();
    expect(await axeViolations(found)).toEqual([]);
    fireEvent.click(within(found).getByRole('button', { name: 'Show all time' }));
    await waitFor(() => expect(within(found).getByRole('heading', { name: 'No closed trades yet' })).toBeInTheDocument());
    await waitFor(() => expect(within(found).getByRole('combobox', { name: 'Period' })).toHaveFocus());
    expect(within(found).getByRole('link', { name: 'Log a trade' })).toHaveAttribute('href', '/journal');
    expect(within(found).queryByText('Result after fees')).toBeNull();
  });

  it('retries a failed load, and focus goes to the period list', async () => {
    const db = await database();
    await septemberTrades(db);
    const load = vi.fn(loadResultsDashboard).mockRejectedValueOnce(new Error('storage'));
    show({ db, load });
    const found = await settled('Your results', 'error');
    expect(within(found).getByText(ERROR)).toBeInTheDocument();
    const retry = within(found).getByRole('button', { name: 'Try again' });
    retry.focus();
    fireEvent.click(retry);
    await settled('Your results', 'ready');
    await waitFor(() => expect(within(found).getByRole('combobox', { name: 'Period' })).toHaveFocus());
  });

  it('keeps focus on the new "Try again" when the retry fails too', async () => {
    const db = await database();
    const load = vi.fn(loadResultsDashboard).mockRejectedValueOnce(new Error('storage')).mockRejectedValueOnce(new Error('storage'));
    show({ db, load });
    const found = await settled('Your results', 'error');
    const retry = within(found).getByRole('button', { name: 'Try again' });
    retry.focus();
    await act(async () => { fireEvent.click(retry); });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(found).not.toHaveAttribute('aria-busy'));
    await waitFor(() => expect(within(found).getByRole('button', { name: 'Try again' })).toHaveFocus());
  });
});

describe('T-051c practice results', () => {
  it('counts only practice trades, without a glow', async () => {
    const db = await database();
    await save(db, trade('2026-09-02T10:00:00.000Z', '110'));
    await save(db, trade('2026-09-04T10:00:00.000Z', '90'), true);
    show({ db, scope: 'practice', glow: false });
    const found = await settled('Your practice results', 'ready');
    expect(within(found).getByText('Result after fees').closest('.kairos-stat')).toHaveTextContent('-10 USDT');
    expect(within(found).getByRole('region', { name: 'Your practice discipline' })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-kairos-emphasis]')).toHaveLength(0);
    expect(within(found).getByText('Practice trades only')).toBeInTheDocument();
  });

  it('reads "Trades closed in Practice" for all time, and has its own empty words', async () => {
    const db = await database();
    await save(db, trade('2026-09-04T10:00:00.000Z', '90'), true);
    show({ db, scope: 'practice', glow: false, initial: { kind: 'all' } });
    const found = await settled('Your practice results', 'ready');
    expect(within(found).getByRole('region', { name: 'Your practice discipline' })).toHaveTextContent('Trades closed in Practice');
    cleanup();

    show({ db: await database(), scope: 'practice', glow: false, initial: { kind: 'all' } });
    const empty = await settled('Your practice results', 'empty');
    expect(within(empty).getByRole('heading', { name: 'No closed practice trades yet' })).toBeInTheDocument();
    expect(within(empty).getByText('A practice trade counts here once it is closed. Save one with the form above.')).toBeInTheDocument();
    expect(within(empty).queryAllByRole('link').filter(link => link.textContent !== 'Change')).toHaveLength(0);
  });
});
