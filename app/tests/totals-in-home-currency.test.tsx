import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { GoalsRoute } from '../src/app/GoalsRoute';
import { JournalDailyResults } from '../src/app/JournalDailyResults';
import { JournalRoute } from '../src/app/JournalRoute';
import { describeConversionStep, describeTotalsInHomeCurrency, describeTradeInHomeCurrency } from '../src/application/currency/currencyWords';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { writeGoalsPreference } from '../src/application/goals';
import { savePracticeMoney } from '../src/application/practice/practiceMoney';
import { savePracticeTrade } from '../src/application/practice/savePracticeTrade';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { exchangeRateId, type ExchangeRateRecord } from '../src/domain/calculations/currencyConversion';
import type { DecimalString } from '../src/domain/trades';
import { HomeDisciplineCard } from '../src/features/discipline/HomeDisciplineCard';
import { ForexTradeNote } from '../src/features/journal/ForexTradeNote';
import { StockTradeNote } from '../src/features/journal/StockTradeNote';
import { PatternsScreen } from '../src/features/patterns/PatternsScreen';
import { PracticeMoneyCard } from '../src/features/practice/PracticeMoneyCard';

const NOW = '2026-09-20T12:00:00.000Z';
const now = () => NOW;
const openedAt = '2026-09-18T09:00:00.000Z';
const closedAt = '2026-09-18T10:00:00.000Z';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-totals-home-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', NOW)).ok).toBe(true);
  return db;
}

function trade(symbol: string, marketType: SaveManualTradeInput['marketType'], currency: string, quantity: string, entry: string, exit: string, closed = closedAt, fees: SaveManualTradeInput['fees'] = []): SaveManualTradeInput {
  const open = new Date(Date.parse(closed) - 3_600_000).toISOString();
  return {
    symbol, marketType, side: 'long', status: 'closed', openedAt: open, closedAt: closed, grossPnlCurrency: currency,
    plan: { plannedEntryPrice: null, plannedStopPrice: null, plannedTargetPrice: null, plannedQuantity: null },
    executions: [{ type: 'entry', price: entry, quantity, executedAt: open }, { type: 'exit', price: exit, quantity, executedAt: closed }],
    fees,
  } as SaveManualTradeInput;
}
const PENCE = trade('VOD.L', 'stock', 'GBX', '1000', '70', '75');
const DOLLAR = trade('AAPL', 'stock', 'USD', '10', '187.5', '190');
const EURO_17 = trade('BTCEUR', 'crypto', 'EUR', '10', '100', '102.45', '2026-09-17T10:00:00.000Z');
const bank = (to: string, rate: string, day = '2026-09-18'): ExchangeRateRecord => ({ id: exchangeRateId('ecb', 'EUR', to, day), source: 'ecb', from: 'EUR', to, day, rateDay: day, rate: rate as DecimalString, savedAt: NOW });

async function saveAll(db: KairosDatabase, inputs: readonly SaveManualTradeInput[], practice = false): Promise<void> {
  for (const input of inputs) {
    const saved = practice ? await savePracticeTrade(db, input) : await saveManualTrade(db, input);
    if (!saved.ok) throw new Error(`fixture ${input.symbol}: ${JSON.stringify(saved)}`);
  }
}
async function twoTradesInEuro(db: KairosDatabase, { usdRate = true, practice = false } = {}) {
  await saveAll(db, [PENCE, DOLLAR], practice);
  await db.exchangeRates.bulkPut(usdRate ? [bank('GBP', '0.8588'), bank('USD', '1.146')] : [bank('GBP', '0.8588')]);
  expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);
}
const CONVERTED_NOTE = 'Totals in EUR. 2 trades in other currencies were converted to EUR.';
const UTC_LINE = 'Each result uses the exchange rate of the day it closed by the UTC clock, which can be a day before or after this calendar day.';
const dayButton = (region: HTMLElement, day: string) => within(region).findByRole('button', { name: new RegExp(`^${day} September 2026:`) });
const results = () => screen.findByRole('region', { name: 'Daily results' });

describe('T-045h the currency words', () => {
  it('describes each conversion step', () => {
    expect(describeConversionStep({ kind: 'pence', from: 'GBX', to: 'GBP' })).toBe('100 GBX (pence) = 1 GBP');
    expect(describeConversionStep({ kind: 'stablecoin', from: 'USDT', to: 'USD' })).toBe('1 USDT counted as 1 USD, your choice');
    expect(describeConversionStep({ kind: 'typed-rate', from: 'JPY', to: 'EUR', day: '2026-09-18', rate: '0.0055' as DecimalString })).toBe('your rate for 18 September 2026: 1 JPY = 0.0055 EUR');
    expect(describeConversionStep({ kind: 'ecb-rate', from: 'EUR', to: 'USD', day: '2026-09-18', rateDay: '2026-09-18', eurFrom: null, eurTo: '1.146' as DecimalString }))
      .toBe('European Central Bank rate of 18 September 2026: 1 EUR = 1.146 USD');
    expect(describeConversionStep({ kind: 'ecb-rate', from: 'GBP', to: 'USD', day: '2026-09-18', rateDay: '2026-09-18', eurFrom: '0.8588' as DecimalString, eurTo: '1.146' as DecimalString }))
      .toBe('European Central Bank rates of 18 September 2026: 1 EUR = 0.8588 GBP and 1 EUR = 1.146 USD');
    expect(describeConversionStep({ kind: 'ecb-rate', from: 'EUR', to: 'USD', day: '2026-09-19', rateDay: '2026-09-18', eurFrom: null, eurTo: '1.146' as DecimalString }))
      .toBe('European Central Bank rate of 18 September 2026: 1 EUR = 1.146 USD, its last before 19 September 2026');
  });

  it('describes one trade in the home currency, or the rate it needs', () => {
    expect(describeTradeInHomeCurrency({ kind: 'converted', amount: '58.22' as DecimalString, currency: 'EUR', day: '2026-09-18', steps: [
      { kind: 'pence', from: 'GBX', to: 'GBP' },
      { kind: 'ecb-rate', from: 'GBP', to: 'EUR', day: '2026-09-18', rateDay: '2026-09-18', eurFrom: '0.8588' as DecimalString, eurTo: null },
    ] })).toBe('In EUR: 58.22 (100 GBX (pence) = 1 GBP; European Central Bank rate of 18 September 2026: 1 EUR = 0.8588 GBP)');
    expect(describeTradeInHomeCurrency({ kind: 'missing-rate', from: 'USD', to: 'EUR', day: '2026-09-18' })).toBe('Needs the USD to EUR rate of 18 September 2026 to count in EUR.');
    expect(describeTradeInHomeCurrency({ kind: 'home' })).toBeNull();
    expect(describeTradeInHomeCurrency({ kind: 'not-convertible' })).toBeNull();
    expect(describeTradeInHomeCurrency(undefined)).toBeNull();
  });

  it('describes the totals note in each case', () => {
    const summary = (convertedTrades: number, tradesMissingRate: number) => ({ homeCurrency: 'EUR', convertedTrades, tradesMissingRate, missing: [] });
    expect(describeTotalsInHomeCurrency(null)).toBeNull();
    expect(describeTotalsInHomeCurrency({ homeCurrency: null, convertedTrades: 0, tradesMissingRate: 0, missing: [] })).toBeNull();
    expect(describeTotalsInHomeCurrency(summary(2, 1))).toEqual({ text: "Totals in EUR. 1 trade still needs an exchange rate, so totals that include it can't be shown in EUR yet.", link: 'Add the missing rates' });
    expect(describeTotalsInHomeCurrency(summary(0, 3))).toEqual({ text: "Totals in EUR. 3 trades still need an exchange rate, so totals that include them can't be shown in EUR yet.", link: 'Add the missing rates' });
    expect(describeTotalsInHomeCurrency(summary(1, 0))).toEqual({ text: 'Totals in EUR. 1 trade in another currency was converted to EUR.', link: 'See your rates' });
    expect(describeTotalsInHomeCurrency(summary(2, 0))).toEqual({ text: CONVERTED_NOTE, link: 'See your rates' });
    expect(describeTotalsInHomeCurrency(summary(0, 0))).toEqual({ text: 'Totals in EUR.', link: 'Change your currency' });
  });
});

describe('T-045h the Journal daily results in the home currency', () => {
  it('says the totals are in EUR, and each trade of a day shows its converted result and rate', async () => {
    const db = await database();
    await twoTradesInEuro(db);
    render(<JournalRoute db={db} now={now} />);
    const region = await results();
    expect(await within(region).findByText(CONVERTED_NOTE, { exact: false })).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'See your rates' })).toHaveAttribute('href', '/currency');
    const day = await dayButton(region, '18');
    expect(day.getAttribute('aria-label')).toContain('Profit, 80.04 EUR');
    expect(day.getAttribute('aria-label')).toContain('2 trades');
    fireEvent.click(day);
    const pence = await within(region).findByText('In EUR: 58.22 (100 GBX (pence) = 1 GBP; European Central Bank rate of 18 September 2026: 1 EUR = 0.8588 GBP)');
    const dollar = within(region).getByText('In EUR: 21.82 (European Central Bank rate of 18 September 2026: 1 EUR = 1.146 USD)');
    expect(pence.closest('li')).toHaveTextContent('VOD.L');
    expect(pence.closest('li')).toHaveTextContent('5000 GBX');
    expect(dollar.closest('li')).toHaveTextContent('AAPL');
    expect(dollar.closest('li')).toHaveTextContent('25 USD');
    expect(within(region).getByText(UTC_LINE)).toBeInTheDocument();
  });

  it('says when a trade still needs a rate', async () => {
    const db = await database();
    await twoTradesInEuro(db, { usdRate: false });
    render(<JournalRoute db={db} now={now} />);
    const region = await results();
    expect(await within(region).findByText("Totals in EUR. 1 trade still needs an exchange rate, so totals that include it can't be shown in EUR yet.", { exact: false })).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'Add the missing rates' })).toHaveAttribute('href', '/currency');
    const day = await dayButton(region, '18');
    expect(day.getAttribute('aria-label')).toContain('Result unavailable, trades in different currencies');
    fireEvent.click(day);
    const needs = await within(region).findByText('Needs the USD to EUR rate of 18 September 2026 to count in EUR.');
    expect(needs.closest('li')).toHaveTextContent('AAPL');
  });

  it('shows today\'s page without a home currency', async () => {
    const db = await database();
    await saveAll(db, [PENCE, DOLLAR]);
    await db.exchangeRates.bulkPut([bank('GBP', '0.8588'), bank('USD', '1.146')]);
    render(<JournalRoute db={db} now={now} />);
    const region = await results();
    fireEvent.click(await dayButton(region, '18'));
    await within(region).findByText('Trades closed on 18 September 2026');
    await within(region).findAllByRole('listitem');
    expect(region.querySelector('[data-home-currency]')).toBeNull();
    expect(within(region).queryByText(/^In EUR/)).toBeNull();
    expect(within(region).queryByText(UTC_LINE)).toBeNull();
  });

  it('adds no UTC clock line for a day whose trades are already in the home currency', async () => {
    const db = await database();
    await saveAll(db, [EURO_17]);
    expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);
    render(<JournalRoute db={db} now={now} />);
    const region = await results();
    fireEvent.click(await dayButton(region, '17'));
    await within(region).findByText('Trades closed on 17 September 2026');
    await within(region).findAllByRole('listitem');
    expect(within(region).queryByText(UTC_LINE)).toBeNull();
    expect(within(region).getByText('Totals in EUR.', { exact: false })).toBeInTheDocument();
  });

  it('says the same on the practice results', async () => {
    const db = await database();
    await twoTradesInEuro(db, { practice: true });
    render(<JournalDailyResults db={db} refreshRevision={0} now={now} scope="practice" />);
    expect(await screen.findByText(CONVERTED_NOTE, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See your rates' })).toHaveAttribute('href', '/currency');
  });
});

describe('T-045h Goals, Home, Patterns and practice money', () => {
  const goal = (db: KairosDatabase, currency: string) => writeGoalsPreference(createKairosRepositories(db).metadata, { monthlyResultTargetAmount: '100', monthlyResultTargetCurrency: currency }, NOW);

  it('counts a goal in the home currency with converted results, and says so', async () => {
    const db = await database();
    await twoTradesInEuro(db);
    await goal(db, 'EUR');
    render(<MemoryRouter><GoalsRoute db={db} now={now} /></MemoryRouter>);
    const card = await waitFor(() => { const found = document.querySelector('[data-goal="monthly-result"]'); if (!found) throw new Error('no card'); return found as HTMLElement; });
    await waitFor(() => expect(card).toHaveTextContent('80.04 of 100 EUR · 19.96 to go'));
    expect(screen.getByText(CONVERTED_NOTE, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See your rates' })).toHaveAttribute('href', '/currency');
  });

  it('leaves a goal in another currency as today, with no note', async () => {
    const db = await database();
    await twoTradesInEuro(db);
    await goal(db, 'USD');
    render(<MemoryRouter><GoalsRoute db={db} now={now} /></MemoryRouter>);
    await waitFor(() => expect(document.querySelector('[data-goal="monthly-result"]')).toHaveTextContent('no closed trade this month has a result in USD yet'));
    expect(screen.queryByText(/^Totals in/)).toBeNull();
  });

  it('adds the note to Home\'s goal lines', async () => {
    const db = await database();
    await twoTradesInEuro(db);
    await goal(db, 'EUR');
    render(<HomeDisciplineCard db={db} now={now} />);
    expect(await screen.findByText('Result this month: 80.04 of 100 EUR')).toBeInTheDocument();
    expect(screen.getByText(CONVERTED_NOTE, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See your rates' })).toHaveAttribute('href', '/currency');
  });

  it('adds the note to Patterns', async () => {
    const db = await database();
    await twoTradesInEuro(db);
    render(<MemoryRouter><PatternsScreen db={db} scope="real" now={now} /></MemoryRouter>);
    expect(await screen.findByText(CONVERTED_NOTE, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See your rates' })).toHaveAttribute('href', '/currency');
  });

  it('points practice money to the Currency page only for a bank currency', async () => {
    const eur = await database();
    await savePracticeMoney(eur, { startAmount: '1000', currency: 'EUR' }, { now });
    await saveAll(eur, [trade('BTCUSDT', 'crypto', 'USDT', '1', '100', '90')], true);
    render(<PracticeMoneyCard db={eur} refreshRevision={0} />);
    expect(await screen.findByText('Your closed practice trades are in USDT, not EUR. To count them, choose EUR on the Currency page and add any missing exchange rates, or change your practice money to USDT.')).toBeInTheDocument();
    cleanup();
    const usdt = await database();
    await savePracticeMoney(usdt, { startAmount: '1000', currency: 'USDT' }, { now });
    await saveAll(usdt, [DOLLAR], true);
    render(<PracticeMoneyCard db={usdt} refreshRevision={0} />);
    expect(await screen.findByText('Your closed practice trades are in USD, not USDT. Change your practice money to USD to see it.')).toBeInTheDocument();
  });
});

describe('T-045h what a trade keeps', () => {
  it('explains fees in another currency on the trade card', async () => {
    const db = await database();
    await saveAll(db, [trade('MSFT', 'stock', 'USD', '1', '400', '410', closedAt, [{ amount: '1', currency: 'AUD' }])]);
    render(<JournalRoute db={db} now={now} />);
    expect(await screen.findByText("Result after fees needs fees in the same currency as your recorded prices, or in pounds (GBP) for prices in pence (GBX). Kairos does not convert a trade's fees with exchange rates.")).toBeInTheDocument();
  });

  it('says the stock and forex notes never change a trade\'s prices', () => {
    const { container: stock } = render(<StockTradeNote symbol="VOD.L" priceCurrency="GBX" />);
    expect(stock.textContent).toContain('Kairos never changes them');
    expect(stock.textContent).not.toContain('never converts');
    cleanup();
    const { container: forex } = render(<ForexTradeNote symbol="EURUSD" />);
    expect(forex.textContent).toContain('Kairos never changes them');
    expect(forex.textContent).not.toContain('never converts');
  });
});
