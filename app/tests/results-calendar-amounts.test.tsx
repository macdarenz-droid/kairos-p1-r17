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

/** A closed long of 1 at 100, so the result is `exit` − 100, closed at 10:00 UTC on `day`. */
function trade(day: string, exit: string, currency = 'USDT', quantity = '1'): SaveManualTradeInput {
  const openedAt = `${day}T09:00:00.000Z`, closedAt = `${day}T10:00:00.000Z`;
  return {
    symbol: currency === 'USDT' ? 'BTCUSDT' : `BTC${currency}`, marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: currency,
    executions: [{ type: 'entry', price: '100', quantity, executedAt: openedAt }, { type: 'exit', price: exit, quantity, executedAt: closedAt }],
  } as SaveManualTradeInput;
}
async function database(trades: readonly SaveManualTradeInput[]): Promise<KairosDatabase> {
  const name = `kairos-results-calendar-${crypto.randomUUID()}`; names.push(name);
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
const SEPTEMBER = [trade('2026-09-02', '200'), trade('2026-09-03', '75'), trade('2026-09-09', '110')];
const cell = (found: HTMLElement, dayKey: string) => found.querySelector(`[data-day-key="${dayKey}"]`) as HTMLElement;
const listOf = (found: HTMLElement) => found.querySelector('.kairos-results-day-trades') as HTMLElement | null;

describe('T-051h the calendar with amounts, a week column and the month total', () => {
  it('shows each day\'s short amount and trade count, and keeps its name', async () => {
    const found = await show(await database(SEPTEMBER));
    const second = cell(found, '2026-09-02');
    expect(second.querySelector('[data-cell-amount]')).toHaveTextContent(/^\+100$/);
    expect(second.querySelector('[data-cell-count]')).toHaveTextContent(/^1$/);
    expect(within(second).getByRole('button')).toHaveAccessibleName('2 September 2026: Profit, 100 USDT, 1 trade');
    expect(cell(found, '2026-09-03').querySelector('[data-cell-amount]')).toHaveTextContent(/^-25$/);
    expect(found.querySelector('.kairos-results-calendar')).not.toHaveTextContent(/▲|▼/);
    expect(within(found).getByRole('columnheader', { name: 'Week' })).toHaveAttribute('abbr', 'Week total');
    expect(within(found).getByText('Amounts in USDT.')).toBeInTheDocument();
    expect(within(found).getByText(/^The small number is how many trades closed that day\./)).toBeInTheDocument();
  });

  it('shortens a large day, and keeps the exact amount in its name', async () => {
    const found = await show(await database([trade('2026-09-02', '1334.5')]));
    const day = cell(found, '2026-09-02');
    expect(day.querySelector('[data-cell-amount]')).toHaveTextContent(/^\+1\.2K$/);
    expect(within(day).getByRole('button').getAttribute('aria-label')).toContain('1234.5 USDT');
  });

  it('lists a week\'s trades from its button, with focus on the list and back on the week', async () => {
    const found = await show(await database(SEPTEMBER));
    const week = within(found).getByRole('button', { name: 'Week of 1 – 6 September 2026: Profit, 75 USDT, 2 trades' });
    expect(week.closest('td')).toHaveAttribute('data-week-result', 'profit');
    expect(week.closest('td')).toHaveAttribute('data-week-strength', '4');
    expect(week.querySelector('[data-cell-amount]')).toHaveTextContent(/^\+75$/);
    expect(week.querySelector('[data-cell-count]')).toHaveTextContent(/^2$/);
    expect(within(found).getByRole('button', { name: /^Week of 7 – 13 September 2026: Profit, 10 USDT, 1 trade$/ })).toBeInTheDocument();
    week.focus();
    fireEvent.click(week);
    const heading = await within(found).findByRole('heading', { name: 'Trades closed from 1 to 6 September 2026' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(week).toHaveAttribute('aria-pressed', 'true');
    const items = within(listOf(found)!).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.querySelector('.kairos-result[data-outcome] [data-icon]')).not.toBeNull();
      expect(item).not.toHaveTextContent(/▲|▼/);
    }
    expect(items[0]).toHaveTextContent('+100 USDT');
    expect(items[1]).toHaveTextContent('-25 USDT');
    expect(await axeViolations(found)).toEqual([]);
    fireEvent.click(within(listOf(found)!).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(week).toHaveFocus());
    expect(listOf(found)).toBeNull();
  });

  it('lists the month\'s trades from the month total, and only one list is open at a time', async () => {
    const found = await show(await database(SEPTEMBER));
    const month = within(found).getByRole('button', { name: 'September total: Profit, 85 USDT, 3 trades' });
    expect(month).toHaveTextContent('September total');
    expect(month).toHaveTextContent('+85 USDT · 3 trades');
    fireEvent.click(within(cell(found, '2026-09-02')).getByRole('button'));
    expect(await within(found).findByRole('heading', { name: 'Trades closed on 2 September 2026' })).toBeInTheDocument();
    fireEvent.click(month);
    expect(await within(found).findByRole('heading', { name: 'Trades closed in September 2026' })).toBeInTheDocument();
    expect(found.querySelectorAll('.kairos-results-day-trades')).toHaveLength(1);
    expect(within(listOf(found)!).getAllByRole('listitem')).toHaveLength(3);
    expect(month).toHaveAttribute('aria-pressed', 'true');
    expect(within(cell(found, '2026-09-02')).getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(month);
    await waitFor(() => expect(listOf(found)).toBeNull());
    await waitFor(() => expect(month).toHaveFocus());
  });

  it('says why a week and the month are not available, and colours no week', async () => {
    const partly = { ...trade('2026-09-02', '110', 'USDT', '2'), executions: [{ type: 'entry', price: '100', quantity: '2', executedAt: '2026-09-02T09:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-02T10:00:00.000Z' }] } as SaveManualTradeInput;
    const found = await show(await database([partly, trade('2026-09-09', '110')]));
    const week = within(found).getByRole('button', { name: 'Week of 1 – 6 September 2026: Result unavailable, a trade has no result yet, 1 trade' });
    expect(week.closest('td')).toHaveAttribute('data-week-result', 'unavailable');
    expect(week.querySelector('[data-cell-amount]')).toBeNull();
    expect(week.querySelector('[data-icon="result-unknown"]')).not.toBeNull();
    expect(within(found).getByRole('button', { name: 'September total: Result unavailable, a trade has no result yet, 2 trades' })).toHaveTextContent('September total: not available, a trade has no result yet · 2 trades');
  });

  it('tells you each amount is in its own currency when the days mix currencies', async () => {
    const found = await show(await database([trade('2026-09-02', '110', 'USD'), trade('2026-09-03', '95', 'EUR')]));
    expect(within(found).getByText('Your days use different currencies, so colour strength is off: each amount is in its own day\'s currency. Tap a day to see it.')).toBeInTheDocument();
    expect(within(found).queryByText('Colour strength is off this month because your days use different currencies.')).toBeNull();
    expect(within(found).queryByText(/^Amounts in/)).toBeNull();
  });

  it('keeps focus on a usable button when the first month disables "Previous month"', async () => {
    const found = await show(await database([trade('2026-08-20', '110'), ...SEPTEMBER]), { kind: 'all' });
    const previous = within(found).getByRole('button', { name: 'Previous month' });
    previous.focus();
    fireEvent.click(previous);
    expect(await within(found).findByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
    expect(previous).toBeDisabled();
    await waitFor(() => expect(within(found).getByRole('button', { name: 'Next month' })).toHaveFocus());
  });
});
