import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { savePracticeTrade } from '../src/application/practice/savePracticeTrade';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference, type VisualPnlPeriodChoice } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { exchangeRateId } from '../src/domain/calculations/currencyConversion';
import type { DecimalString, TradeId } from '../src/domain/trades';
import { ResultsDashboard } from '../src/features/results/ResultsDashboard';
import { axeViolations } from './fixtures/axe';

const NOW = '2026-09-20T12:00:00.000Z';
const now = () => NOW;
const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-results-calendar-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', NOW)).ok).toBe(true);
  return db;
}
function trade(closedAt: string, exit: string): SaveManualTradeInput {
  const openedAt = new Date(Date.parse(closedAt) - 3_600_000).toISOString();
  return {
    symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: 'USDT',
    plan: { plannedEntryPrice: null, plannedStopPrice: null, plannedTargetPrice: null, plannedQuantity: null },
    executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: openedAt }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
    fees: [],
  } as SaveManualTradeInput;
}
async function save(db: KairosDatabase, closedAt: string, exit: string, practice = false): Promise<TradeId> {
  const saved = practice ? await savePracticeTrade(db, trade(closedAt, exit)) : await saveManualTrade(db, trade(closedAt, exit));
  if (!saved.ok) throw new Error(`fixture: ${JSON.stringify(saved)}`);
  return saved.tradeId;
}
function Host({ db, initial, scope = 'real' }: { readonly db: KairosDatabase; readonly initial: VisualPnlPeriodChoice; readonly scope?: 'real' | 'practice' }) {
  const [choice, setChoice] = useState(initial);
  return <ResultsDashboard db={db} scope={scope} now={now} choice={choice} onChoiceChange={setChoice}
    renderTradeLink={id => <a href={`/analysis?trade=${id}`}>View trade</a>} refreshRevision={0} glow={scope === 'real'} />;
}
async function show(db: KairosDatabase, initial: VisualPnlPeriodChoice = { kind: 'month', at: null }, scope: 'real' | 'practice' = 'real') {
  render(<MemoryRouter><Host db={db} initial={initial} scope={scope} /></MemoryRouter>);
  const found = await screen.findByRole('region', { name: scope === 'real' ? 'Your results' : 'Your practice results' });
  await waitFor(() => expect(found).toHaveAttribute('data-results-status', 'ready'));
  return found;
}
const calendarBar = (found: HTMLElement) => found.querySelector('.kairos-results-calendar__bar') as HTMLElement;

describe('T-051d the calendar, a day\'s trades, candles, streak and result days in "Your results"', () => {
  it("shows the month's days, and a tapped day's trades with focus on its heading", async () => {
    const db = await database();
    const first = await save(db, '2026-09-02T10:00:00.000Z', '150');
    await save(db, '2026-09-03T10:00:00.000Z', '90');
    const found = await show(db);
    expect(within(calendarBar(found)).getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    expect(within(calendarBar(found)).queryAllByRole('button')).toHaveLength(0);
    const day = within(found).getByRole('button', { name: '2 September 2026: Profit, 50 USDT, 1 trade' });
    fireEvent.click(day);
    const heading = await within(found).findByRole('heading', { name: 'Trades closed on 2 September 2026' });
    await waitFor(() => expect(heading).toHaveFocus());
    const list = within(heading.closest('.kairos-results-day-trades') as HTMLElement);
    expect(list.getByText('BTCUSDT')).toBeInTheDocument();
    expect(list.getByRole('link', { name: 'View trade' })).toHaveAttribute('href', `/analysis?trade=${first}`);
    expect(await axeViolations(found)).toEqual([]);
    fireEvent.click(list.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(within(found).getByRole('button', { name: /^2 September 2026:/ })).toHaveFocus());
    expect(within(found).queryByRole('heading', { name: /^Trades closed on/ })).toBeNull();
  });

  it('dims the days outside a week and leaves their trades off the calendar', async () => {
    const db = await database();
    await save(db, '2026-09-13T10:00:00.000Z', '120');
    await save(db, '2026-09-15T10:00:00.000Z', '110');
    const found = await show(db, { kind: 'week', at: '2026-09-14' });
    const outside = found.querySelector('[data-day-key="2026-09-13"]') as HTMLElement;
    expect(outside).toHaveAttribute('data-day-outside');
    expect(within(outside).queryByRole('button')).toBeNull();
    expect(within(found).getByText('Days outside 14 – 20 September 2026 are dimmed.')).toBeInTheDocument();
    expect(within(found).queryByRole('button', { name: /^13 September 2026:/ })).toBeNull();
    expect(within(found).getByRole('button', { name: /^15 September 2026:/ })).toBeInTheDocument();
  });

  it("pages a year's months, never past today's month or before January", async () => {
    const db = await database();
    await save(db, '2026-09-02T10:00:00.000Z', '110');
    await save(db, '2026-08-20T10:00:00.000Z', '105');
    const found = await show(db, { kind: 'year', at: null });
    const bar = () => within(calendarBar(found));
    expect(bar().getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    expect(bar().getByRole('button', { name: 'Next month' })).toBeDisabled();
    fireEvent.click(bar().getByRole('button', { name: 'Previous month' }));
    expect(bar().getByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
    expect(within(found).getByRole('button', { name: /^20 August 2026:/ })).toBeInTheDocument();
    for (let step = 0; step < 7; step += 1) fireEvent.click(bar().getByRole('button', { name: 'Previous month' }));
    expect(bar().getByRole('heading', { name: 'January 2026' })).toBeInTheDocument();
    expect(bar().getByRole('button', { name: 'Previous month' })).toBeDisabled();
  });

  it("pages all time back to the first trade's month", async () => {
    const db = await database();
    await save(db, '2026-07-10T10:00:00.000Z', '110');
    await save(db, '2026-09-02T10:00:00.000Z', '110');
    const found = await show(db, { kind: 'all' });
    const bar = () => within(calendarBar(found));
    fireEvent.click(bar().getByRole('button', { name: 'Previous month' }));
    fireEvent.click(bar().getByRole('button', { name: 'Previous month' }));
    expect(bar().getByRole('heading', { name: 'July 2026' })).toBeInTheDocument();
    expect(bar().getByRole('button', { name: 'Previous month' })).toBeDisabled();
  });

  it('draws the total as day candles, and counts the result days', async () => {
    const db = await database();
    await save(db, '2026-09-02T10:00:00.000Z', '150');
    await save(db, '2026-09-03T10:00:00.000Z', '90');
    const found = await show(db);
    expect(within(found).getByRole('img', { name: /^Total result so far: 40 USDT/ })).toBeInTheDocument();
    expect(found.querySelectorAll('[data-candle-day]')).toHaveLength(2);
    const days = within(found).getByRole('region', { name: 'Result day summary' });
    expect(within(days).getByText('Profit days').closest('.kairos-stat')).toHaveTextContent('1');
    expect(within(days).getByText('Loss days').closest('.kairos-stat')).toHaveTextContent('1');
  });

  it('shows the current streak only for a period that holds today, across the first of the month', async () => {
    const db = await database();
    await save(db, '2026-08-31T10:00:00.000Z', '110');
    await save(db, '2026-09-02T10:00:00.000Z', '105');
    const september = await show(db);
    const streak = within(september).getByRole('region', { name: 'Current result streak' });
    expect(streak).toHaveTextContent('Profit streak');
    expect(streak).toHaveTextContent('2 result days');
    cleanup();
    const august = await show(db, { kind: 'month', at: '2026-08-01' });
    expect(within(august).queryByRole('region', { name: 'Current result streak' })).toBeNull();
  });

  it('says when a closed trade cannot be placed on a day', async () => {
    const db = await database();
    await save(db, '2026-09-02T10:00:00.000Z', '110');
    await createKairosRepositories(db).trades.put({ id: 'bad-close' as TradeId, symbol: 'BAD', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', openedAt: '2026-09-02T10:00:00.000Z', closedAt: '2026-09-02 14:30:00', createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T15:00:00.000Z' });
    const found = await show(db, { kind: 'all' });
    expect(within(found).getByText('1 closed trade could not be placed on a day.')).toBeInTheDocument();
  });

  it("lists a day's trades with their own result and the home-currency line", async () => {
    const db = await database();
    const openedAt = '2026-09-18T09:00:00.000Z', closedAt = '2026-09-18T10:00:00.000Z';
    const dollar = { symbol: 'AAPL', marketType: 'stock', side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: 'USD',
      executions: [{ type: 'entry', price: '187.5', quantity: '10', executedAt: openedAt }, { type: 'exit', price: '190', quantity: '10', executedAt: closedAt }] } as const;
    expect((await saveManualTrade(db, dollar)).ok).toBe(true);
    await db.exchangeRates.put({ id: exchangeRateId('ecb', 'EUR', 'USD', '2026-09-18'), source: 'ecb', from: 'EUR', to: 'USD', day: '2026-09-18', rateDay: '2026-09-18', rate: '1.25' as DecimalString, savedAt: NOW });
    expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);
    const found = await show(db);
    fireEvent.click(within(found).getByRole('button', { name: /^18 September 2026:/ }));
    const item = (await within(found).findByText('AAPL')).closest('li') as HTMLElement;
    expect(item).toHaveTextContent('25 USD');
    expect(item).toHaveTextContent('In EUR: 20 (European Central Bank rate of 18 September 2026: 1 EUR = 1.25 USD)');
  });

  it('names the practice candles', async () => {
    const db = await database();
    await save(db, '2026-09-04T10:00:00.000Z', '90', true);
    const found = await show(db, { kind: 'month', at: null }, 'practice');
    expect(within(found).getByText('Your practice results over time')).toBeInTheDocument();
  });
});
