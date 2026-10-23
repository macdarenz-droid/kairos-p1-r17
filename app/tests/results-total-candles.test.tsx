import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewTradeLink } from '../src/app/ReviewTradeLink';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference, type VisualPnlPeriodChoice } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { ResultsDashboard } from '../src/features/results/ResultsDashboard';
import { axeViolations } from './fixtures/axe';

const NOW = '2026-09-20T12:00:00.000Z';
const now = () => NOW;
const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });

/** A closed long of 1 USDT at 100 that makes `result`, closed at 10:00 UTC on `day`. */
function trade(day: string, result: number): SaveManualTradeInput {
  const openedAt = `${day}T09:00:00.000Z`, closedAt = `${day}T10:00:00.000Z`;
  return {
    symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: 'USDT',
    executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: openedAt }, { type: 'exit', price: String(100 + result), quantity: '1', executedAt: closedAt }],
  } as SaveManualTradeInput;
}
async function database(trades: readonly SaveManualTradeInput[]): Promise<KairosDatabase> {
  const name = `kairos-results-candles-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', NOW)).ok).toBe(true);
  for (const input of trades) {
    const saved = await saveManualTrade(db, input);
    if (!saved.ok) throw new Error(`fixture ${JSON.stringify(saved)}`);
  }
  return db;
}
function Host({ db, initial }: { readonly db: KairosDatabase; readonly initial: VisualPnlPeriodChoice }) {
  const [choice, setChoice] = useState<VisualPnlPeriodChoice>(initial);
  return <ResultsDashboard db={db} scope="real" now={now} choice={choice} onChoiceChange={setChoice} renderTradeLink={id => <ReviewTradeLink id={id} />} refreshRevision={0} />;
}
async function show(db: KairosDatabase, initial: VisualPnlPeriodChoice = { kind: 'month', at: null }): Promise<HTMLElement> {
  render(<MemoryRouter><Host db={db} initial={initial} /></MemoryRouter>);
  const found = await screen.findByRole('region', { name: 'Your results' });
  await waitFor(() => expect(found).toHaveAttribute('data-results-status', 'ready'));
  await waitFor(() => expect(found).not.toHaveAttribute('aria-busy'));
  return found;
}
const picture = (found: HTMLElement) => found.querySelector('.kairos-results-candles') as HTMLElement;
const unitButton = (found: HTMLElement, name: string) => within(within(found).getByRole('group', { name: 'Candles' })).getByRole('button', { name });
const dates = (found: HTMLElement) => [...picture(found).querySelectorAll('.kairos-results-candles__date')].map(date => date.textContent);
/** 1 August to 9 September 2026, one +1 trade a day. */
const fortyDays = () => Array.from({ length: 40 }, (_, index) => trade(new Date(Date.UTC(2026, 7, 1 + index)).toISOString().slice(0, 10), 1));

describe('T-051i your total as day, week or month candles', () => {
  it('names the period\'s total, starts it at 0 on the first day, and shows day candles by default', async () => {
    const found = await show(await database([trade('2026-09-02', 50), trade('2026-09-03', -10)]));
    expect(within(found).getByRole('heading', { name: 'Your total in September 2026' })).toBeInTheDocument();
    expect(within(found).getByRole('img', { name: /^Your total in September 2026: 40 USDT after 2 days with results\./ })).toBeInTheDocument();
    expect(within(found).getByText('It starts at 0 on 1 September 2026.')).toBeInTheDocument();
    expect(unitButton(found, 'Day')).toHaveAttribute('aria-pressed', 'true');
    expect(picture(found).querySelector('.kairos-results-candles__heading [data-icon="result-up"]')).not.toBeNull();
    expect(picture(found)).not.toHaveTextContent(/▲|▼/);
    expect(dates(found)).toEqual(['2 Sep', '3 Sep']);

    fireEvent.click(unitButton(found, 'Week'));
    expect(within(found).getByRole('img', { name: /One candle, the week of 31 August 2026: 1 week up\. Biggest dip 10 USDT\.$/ })).toBeInTheDocument();
    expect(dates(found)).toEqual(['31 Aug']);
    expect(within(picture(found)).getAllByRole('columnheader')[0]).toHaveTextContent('Week');
    fireEvent.click(unitButton(found, 'Month'));
    expect(dates(found)).toEqual(['Sep 2026']);
    expect(within(picture(found)).getAllByRole('columnheader')[0]).toHaveTextContent('Month');
  });

  it('shows all time with 40 result days as week candles, named "Total result so far"', async () => {
    const found = await show(await database(fortyDays()), { kind: 'all' });
    expect(unitButton(found, 'Week')).toHaveAttribute('aria-pressed', 'true');
    expect(within(found).getByRole('img', { name: /^Total result so far: 40 USDT after 40 days with results\. One candle per week with results, from the week of 27 July 2026 to the week of 7 September 2026: 7 weeks up\./ })).toBeInTheDocument();
    expect(picture(found).querySelectorAll('[data-candle-day]')).toHaveLength(7);
    expect(within(found).queryByText(/^It starts at 0/)).toBeNull();
    fireEvent.click(unitButton(found, 'Day'));
    expect(within(found).getByText('Showing your last 30 days with results. The total above counts all 40.')).toBeInTheDocument();
  });

  it('lists a candle\'s trades from its row or a tap on it, and gives focus back to the row', async () => {
    const found = await show(await database([trade('2026-09-02', 50), trade('2026-09-02', 5), trade('2026-09-03', -10)]));
    const numbers = picture(found).querySelector('details')!;
    numbers.open = true;
    const row = within(numbers).getByRole('button', { name: 'See the trades of 2 September 2026' });
    row.focus();
    fireEvent.click(row);
    const heading = await within(found).findByRole('heading', { name: 'Trades closed on 2 September 2026' });
    await waitFor(() => expect(heading).toHaveFocus());
    const list = heading.closest('.kairos-results-day-trades') as HTMLElement;
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(await axeViolations(found)).toEqual([]);
    fireEvent.click(within(list).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(row).toHaveFocus());

    fireEvent.click(picture(found).querySelectorAll('[data-candle-hit]')[1]!);
    expect(await within(found).findByRole('heading', { name: 'Trades closed on 3 September 2026' })).toBeInTheDocument();
    fireEvent.click(unitButton(found, 'Week'));
    await waitFor(() => expect(found.querySelector('.kairos-results-day-trades')).toBeNull());
    fireEvent.click(picture(found).querySelector('[data-candle-hit]')!);
    const week = await within(found).findByRole('heading', { name: 'Trades closed in the week of 31 August 2026' });
    expect(within(week.closest('.kairos-results-day-trades') as HTMLElement).getAllByRole('listitem')).toHaveLength(3);
    // The tap came from the picture and the numbers are closed: focus goes back to the candles' heading.
    numbers.open = false;
    fireEvent.click(within(week.closest('.kairos-results-day-trades') as HTMLElement).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(within(picture(found)).getByRole('heading', { name: 'Your total in September 2026' })).toHaveFocus());
  });

  it('marks the biggest dip from its high point to its low point', async () => {
    const found = await show(await database([trade('2026-09-01', 10), trade('2026-09-02', -5), trade('2026-09-03', 20), trade('2026-09-04', -30), trade('2026-09-05', 5)]));
    const high = picture(found).querySelector('[data-mark="dip-high"]')!;
    const low = picture(found).querySelector('[data-mark="dip-low"]')!;
    expect(high).toHaveAttribute('data-candle-index', '2');
    expect(low).toHaveAttribute('data-candle-index', '3');
    expect(within(picture(found)).getByText('Biggest dip 30 USDT')).toBeInTheDocument();
    expect(within(found).getByRole('img', { name: /Biggest dip 30 USDT\.$/ })).toBeInTheDocument();
    expect(picture(found).querySelector('.kairos-results-candles__heading [data-icon="result-flat"]')).not.toBeNull();
  });

  it('draws a loss total with the down shape, and a dip from the start at the left edge', async () => {
    const found = await show(await database([trade('2026-09-02', -20)]));
    expect(picture(found).querySelector('.kairos-results-candles__heading [data-icon="result-down"]')).not.toBeNull();
    expect(picture(found).querySelector('.kairos-results-candles__heading')).toHaveTextContent('-20 USDT');
    const high = picture(found).querySelector('[data-mark="dip-high"]')!;
    expect(high).toHaveAttribute('data-at-start', 'true');
    expect(high).toHaveAttribute('x1', '4');
    expect(picture(found).querySelector('[data-mark="dip-low"]')).toHaveAttribute('data-candle-index', '0');
  });

  it('says so when the dip is before the candles shown', async () => {
    const days = fortyDays();
    days[0] = trade('2026-08-01', -5);
    const found = await show(await database(days), { kind: 'all' });
    expect(picture(found).querySelector('[data-mark="dip-high"]')).toHaveAttribute('data-at-start', 'true');
    fireEvent.click(unitButton(found, 'Day'));
    expect(within(found).getByText('Biggest dip 5 USDT (before the candles shown)')).toBeInTheDocument();
    expect(picture(found).querySelector('[data-mark^="dip"]')).toBeNull();
  });

  it('marks nothing when the total never fell', async () => {
    const found = await show(await database([trade('2026-09-02', 20), trade('2026-09-03', 5)]));
    expect(picture(found).querySelector('[data-mark^="dip"]')).toBeNull();
    expect(within(found).queryByText(/^Biggest dip .* \(before the candles shown\)$/)).toBeNull();
  });
});
