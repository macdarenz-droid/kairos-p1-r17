import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewTradeLink, tradeReviewHref } from '../src/app/ReviewTradeLink';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { loadResultsDashboard, type ResultsDashboardProjection } from '../src/application/performance/resultsDashboard';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference, type VisualPnlPeriodChoice } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { exchangeRateId, type ExchangeRateRecord } from '../src/domain/calculations/currencyConversion';
import type { DecimalString } from '../src/domain/trades';
import { ResultsDashboard } from '../src/features/results/ResultsDashboard';
import { ResultsNumbers } from '../src/features/results/ResultsNumbers';
import { axeViolations } from './fixtures/axe';

const NOW = '2026-09-20T12:00:00.000Z';
const now = () => NOW;
const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-results-numbers-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', NOW)).ok).toBe(true);
  return db;
}

interface Spec { readonly exit: string; readonly entry?: string; readonly currency?: string; readonly stop?: string; readonly entered?: string; readonly exited?: string }
/** Closed in September, one a day from the 1st, in the order given (T-050d's fixture shape). */
async function saveAll(db: KairosDatabase, specs: readonly Spec[]): Promise<void> {
  for (const [index, spec] of specs.entries()) {
    const opened = new Date(Date.UTC(2026, 8, 1 + index, 9)).toISOString();
    const closed = new Date(Date.UTC(2026, 8, 1 + index, 10)).toISOString();
    const currency = spec.currency ?? 'USDT';
    const saved = await saveManualTrade(db, {
      symbol: currency === 'EUR' ? 'BTCEUR' : 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt: opened, closedAt: closed, grossPnlCurrency: currency,
      ...(spec.stop ? { plan: { plannedEntryPrice: spec.entry ?? '100', plannedStopPrice: spec.stop, plannedQuantity: '1' } } : {}),
      executions: [
        { type: 'entry', price: spec.entry ?? '100', quantity: spec.entered ?? '1', executedAt: opened },
        { type: 'exit', price: spec.exit, quantity: spec.exited ?? '1', executedAt: closed },
      ],
    });
    if (!saved.ok) throw new Error(`fixture ${JSON.stringify(saved)}`);
  }
}
const exits = (...values: string[]): Spec[] => values.map(exit => ({ exit }));

async function dashboardOf(db: KairosDatabase): Promise<ResultsDashboardProjection> {
  const read = await loadResultsDashboard(db, { choice: { kind: 'month', at: null }, now: NOW });
  if (read.kind !== 'ready') throw new Error(read.kind);
  return read.dashboard;
}
async function showNumbers(db: KairosDatabase): Promise<{ readonly dashboard: ResultsDashboardProjection; readonly numbers: HTMLElement }> {
  const dashboard = await dashboardOf(db);
  render(<MemoryRouter><ResultsNumbers summary={dashboard.summary} context={dashboard.inHomeCurrency} renderTradeLink={id => <ReviewTradeLink id={id} />} /></MemoryRouter>);
  return { dashboard, numbers: screen.getByRole('region', { name: 'Your numbers' }) };
}
const part = (numbers: HTMLElement, name: string) => numbers.querySelector(`[data-number] [data-part="${name}"]`) as HTMLElement | null;
const number = (numbers: HTMLElement, name: string) => numbers.querySelector(`[data-number="${name}"]`) as HTMLElement;
const tile = (numbers: HTMLElement, label: string) => within(numbers).getByText(label, { selector: 'dt' }).closest('.kairos-stat') as HTMLElement;

// The trades of totals-in-home-currency's twoTradesInEuro({ usdRate: false }): EUR home, the GBX trade converts, the USD trade has no rate.
function stock(symbol: string, currency: string, quantity: string, entry: string, exit: string): SaveManualTradeInput {
  return {
    symbol, marketType: 'stock', side: 'long', status: 'closed', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', grossPnlCurrency: currency,
    plan: { plannedEntryPrice: null, plannedStopPrice: null, plannedTargetPrice: null, plannedQuantity: null },
    executions: [{ type: 'entry', price: entry, quantity, executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: exit, quantity, executedAt: '2026-09-18T10:00:00.000Z' }],
    fees: [],
  } as SaveManualTradeInput;
}
const bank = (to: string, rate: string): ExchangeRateRecord => ({ id: exchangeRateId('ecb', 'EUR', to, '2026-09-18'), source: 'ecb', from: 'EUR', to, day: '2026-09-18', rateDay: '2026-09-18', rate: rate as DecimalString, savedAt: NOW });

function Dashboard({ db }: { readonly db: KairosDatabase }) {
  const [choice, setChoice] = useState<VisualPnlPeriodChoice>({ kind: 'month', at: null });
  return <ResultsDashboard db={db} scope="real" now={now} choice={choice} onChoiceChange={setChoice} renderTradeLink={id => <ReviewTradeLink id={id} />} refreshRevision={0} />;
}

describe('T-051g your numbers as pictures', () => {
  it('draws the T-050d fixture: won and lost, the averages, for every 1 you lost, and the best and worst trade', async () => {
    const db = await database();
    await saveAll(db, [...exits('110', '120', '95', '100', '85'), { exit: '110', entered: '2', exited: '1' }]);
    const { dashboard, numbers } = await showNumbers(db);
    const bar = within(numbers).getByRole('img', { name: 'Won 2 of 5 · 1 trade has no result yet' });
    expect(within(numbers).getByText('Won 2 of 5 · 1 trade has no result yet', { selector: 'p' })).toBeInTheDocument();
    expect([...bar.querySelectorAll('[data-part]')].map(span => [span.getAttribute('data-part'), (span as HTMLElement).style.inlineSize]))
      .toEqual([['won', '33%'], ['lost', '33%'], ['breakEven', '17%'], ['noResult', '17%']]);
    expect([...numbers.querySelectorAll('.kairos-results-numbers__legend [data-icon]')].map(icon => icon.getAttribute('data-icon'))).toEqual(['result-up', 'result-down', 'result-flat', 'result-unknown']);
    // Each key carries the swatch of its part, so the legend matches the bar (fix r1).
    expect([...numbers.querySelectorAll('.kairos-results-numbers__legend li')].map(item => [item.getAttribute('data-key'), item.querySelector('.kairos-results-numbers__swatch') !== null]))
      .toEqual([['won', true], ['lost', true], ['breakEven', true], ['noResult', true]]);
    expect(number(numbers, 'average-win')).toHaveTextContent(/Average win.*\+15 USDT.*from 2 trades/);
    expect(number(numbers, 'average-loss')).toHaveTextContent(/Average loss.*-10 USDT.*from 2 trades/);
    expect(part(numbers, 'won')).not.toBeNull();
    expect(number(numbers, 'profit-factor')).toHaveTextContent('You made 1.5 for every 1 you lost');
    expect(number(numbers, 'average-result')).toHaveTextContent(/Average result per trade.*\+2 USDT.*from 5 trades/);
    const best = tile(numbers, 'Best trade');
    expect(best).toHaveTextContent('+20 USDT');
    const bestId = dashboard.summary.bestTrade.available ? dashboard.summary.bestTrade.tradeId : '';
    expect(within(best).getByRole('link', { name: 'View trade' })).toHaveAttribute('href', tradeReviewHref(bestId));
    expect(tile(numbers, 'Worst trade')).toHaveTextContent('-15 USDT');
    expect(within(tile(numbers, 'Worst trade')).getByRole('link', { name: 'View trade' })).toBeInTheDocument();
    expect(numbers.querySelector('[data-kairos-emphasis]')).toBeNull();
    expect(numbers.textContent).not.toMatch(/▲|▼/);
    expect(await axeViolations(numbers)).toEqual([]);
  });

  it('draws what you make for what you risk against a block of 1×', async () => {
    const db = await database();
    await saveAll(db, [{ exit: '110', stop: '95' }, { exit: '95', stop: '95' }, { exit: '120' }]);
    const { numbers } = await showNumbers(db);
    const risk = number(numbers, 'times-risked');
    expect(risk).toHaveTextContent(/On average you make 0\.5× what you risk.*from 2 trades/);
    // The sentence says it once; the picture is for the eye only (fix r1).
    expect(within(risk).queryByRole('img')).toBeNull();
    expect(risk.querySelector('.kairos-results-numbers__risk')).toHaveAttribute('aria-hidden', 'true');
    expect((risk.querySelector('[data-part="one-risk"]') as HTMLElement).style.inlineSize).toBe('100%');
    const average = risk.querySelector('[data-part="average-risk"]') as HTMLElement;
    expect(average.style.inlineSize).toBe('50%');
    expect(average).toHaveAttribute('data-direction', 'up');
  });

  it('gives the biggest dip and the longest runs in closing order', async () => {
    const db = await database();
    await saveAll(db, exits('110', '120', '95', '70', '105'));
    const { numbers } = await showNumbers(db);
    expect(tile(numbers, 'Biggest dip')).toHaveTextContent('35 USDT');
    expect(tile(numbers, 'Biggest dip')).toHaveTextContent('from 5 trades');
    expect(tile(numbers, 'Most wins in a row')).toHaveTextContent('2 in a row');
    expect(tile(numbers, 'Most losses in a row')).toHaveTextContent('2 in a row');
    expect(tile(numbers, 'Average time in a trade')).toHaveTextContent(/1 h.*from 5 trades/);
  });

  it('tells the longest win run from the longest loss run (fix r1)', async () => {
    const db = await database();
    await saveAll(db, exits('110', '120', '105', '95'));
    const { numbers } = await showNumbers(db);
    expect(tile(numbers, 'Most wins in a row')).toHaveTextContent('3 in a row');
    expect(tile(numbers, 'Most losses in a row')).toHaveTextContent('1 in a row');
  });

  it('never shows a 0 for money it cannot add up: a EUR trade among USDT with no home currency', async () => {
    const db = await database();
    await saveAll(db, [...exits('110', '95'), { exit: '1.1', entry: '1', currency: 'EUR' }]);
    const { numbers } = await showNumbers(db);
    const words = 'Not available: your trades are in different currencies. Choose a home currency to add them up.';
    for (const name of ['average-win', 'average-loss', 'profit-factor', 'average-result']) expect(number(numbers, name)).toHaveTextContent(words);
    for (const label of ['Best trade', 'Worst trade', 'Biggest dip']) expect(tile(numbers, label)).toHaveTextContent(words);
    expect(within(numbers).getByRole('img', { name: 'Won 2 of 3' })).toBeInTheDocument();
    expect(numbers.querySelector('[data-number="win-loss"] [data-part]')).toBeNull();
    expect(numbers.querySelectorAll('.kairos-result__amount')).toHaveLength(0);
    // As "Result after fees": "Not available" as the value, the reason in the small line under it (fix r1).
    for (const label of ['Best trade', 'Worst trade', 'Biggest dip']) {
      expect(tile(numbers, label).querySelector('.kairos-stat__value')).toHaveTextContent(/^Not available( \?)?$/);
      expect(tile(numbers, label).querySelector('.kairos-stat__hint')).toHaveTextContent(words);
    }
    expect(number(numbers, 'profit-factor')).toHaveTextContent(/^For every 1 you lost: Not available/);
    expect(number(numbers, 'average-win').querySelector('.kairos-results-numbers__why')).toHaveTextContent(words);
    // Said once per row (fix r2).
    for (const name of ['average-win', 'average-loss', 'profit-factor', 'average-result']) expect(number(numbers, name).textContent!.match(/Not available/g)).toHaveLength(1);
  });

  it('says no trade has a result yet, never that there was no win or no loss (fix r1)', async () => {
    const db = await database();
    await saveAll(db, [{ exit: '110', entered: '2', exited: '1' }]);
    const { numbers } = await showNumbers(db);
    for (const name of ['average-win', 'average-loss', 'average-result']) expect(number(numbers, name)).toHaveTextContent('No trade with a result yet');
    expect(number(numbers, 'profit-factor')).toHaveTextContent(/^For every 1 you lost: Needs a win or a loss/);
    expect(numbers).not.toHaveTextContent(/No winning trade|No losing trade/);
  });

  it('works from one trade', async () => {
    const db = await database();
    await saveAll(db, exits('107'));
    const { dashboard, numbers } = await showNumbers(db);
    expect(within(numbers).getByRole('img', { name: 'Won 1 of 1' })).toBeInTheDocument();
    expect(number(numbers, 'profit-factor')).toHaveTextContent('No losses in this period');
    expect(number(numbers, 'average-loss')).toHaveTextContent('No losing trade in this period');
    expect(number(numbers, 'average-loss')).not.toHaveTextContent('from');
    expect(tile(numbers, 'Best trade')).toHaveTextContent('+7 USDT');
    expect(tile(numbers, 'Worst trade')).toHaveTextContent('+7 USDT');
    const id = dashboard.entries[0]!.trade.id;
    for (const label of ['Best trade', 'Worst trade']) expect(within(tile(numbers, label)).getByRole('link', { name: 'View trade' })).toHaveAttribute('href', tradeReviewHref(id));
  });

  it('names the missing exchange rate in the home currency, never "Choose a home currency"', async () => {
    const db = await database();
    for (const input of [stock('VOD.L', 'GBX', '1000', '70', '75'), stock('AAPL', 'USD', '10', '187.5', '190')]) expect((await saveManualTrade(db, input)).ok).toBe(true);
    await db.exchangeRates.bulkPut([bank('GBP', '0.8588')]);
    expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);
    const { numbers } = await showNumbers(db);
    const words = 'Not available: 1 trade still needs an exchange rate to count in EUR.';
    for (const name of ['average-win', 'average-loss', 'profit-factor', 'average-result']) expect(number(numbers, name)).toHaveTextContent(words);
    for (const label of ['Best trade', 'Worst trade', 'Biggest dip']) expect(tile(numbers, label)).toHaveTextContent(words);
    expect(numbers).not.toHaveTextContent('Choose a home currency');
  });

  it('explains a new word behind its "?"', async () => {
    const db = await database();
    await saveAll(db, exits('110', '95'));
    const { numbers } = await showNumbers(db);
    fireEvent.click(within(numbers).getByRole('button', { name: 'What does "Biggest dip" mean?' }));
    const sheet = await screen.findByRole('dialog', { name: 'Biggest dip' });
    expect(await within(sheet).findByText(/The largest fall of your total result from a high point to a later low/)).toBeInTheDocument();
    for (const label of ['Share of trades won', 'For every 1 you lost', 'Average result per trade', '× what you risked']) {
      expect(within(numbers).getByRole('button', { name: `What does "${label}" mean?` })).toBeInTheDocument();
    }
  });

  it('sits right after "Result after fees" in the dashboard, which keeps the one glow', async () => {
    const db = await database();
    await saveAll(db, exits('110', '95'));
    render(<MemoryRouter><Dashboard db={db} /></MemoryRouter>);
    const results = await screen.findByRole('region', { name: 'Your results' });
    await waitFor(() => expect(results).toHaveAttribute('data-results-status', 'ready'));
    await waitFor(() => expect(results).not.toHaveAttribute('aria-busy'));
    const numbers = within(results).getByRole('region', { name: 'Your numbers' });
    const resultTile = within(results).getByText('Result after fees').closest('.kairos-stat-grid') as HTMLElement;
    expect(resultTile.nextElementSibling).toBe(numbers);
    const glowing = results.querySelectorAll('[data-kairos-emphasis]');
    expect(glowing).toHaveLength(1);
    expect(glowing[0]).toHaveTextContent('Result after fees');
    expect(await axeViolations(results)).toEqual([]);
  });
});
