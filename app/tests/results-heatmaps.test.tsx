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

/** A closed long of 1 at 100 that makes `result` in `currency`, opened at `openedAt` and closed an hour later. */
function trade(symbol: string, openedAt: string, result: number, currency = 'USDT'): SaveManualTradeInput {
  const closedAt = new Date(Date.parse(openedAt) + 3_600_000).toISOString();
  return {
    symbol, marketType: currency === 'USDT' ? 'crypto' : 'stock', side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: currency,
    executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: openedAt }, { type: 'exit', price: String(100 + result), quantity: '1', executedAt: closedAt }],
  } as SaveManualTradeInput;
}
// 7 September 2026 is a Monday; 11 September a Friday.
const WEEK = [trade('BTCUSDT', '2026-09-07T09:30:00.000Z', 10), trade('BTCUSDT', '2026-09-07T10:15:00.000Z', -4), trade('ETHUSDT', '2026-09-11T21:00:00.000Z', 1)];
async function database(trades: readonly SaveManualTradeInput[]): Promise<KairosDatabase> {
  const name = `kairos-results-heatmaps-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', NOW)).ok).toBe(true);
  for (const input of trades) {
    const saved = await saveManualTrade(db, input);
    if (!saved.ok) throw new Error(`fixture ${JSON.stringify(saved)}`);
  }
  return db;
}
function Host({ db }: { readonly db: KairosDatabase }) {
  const [choice, setChoice] = useState<VisualPnlPeriodChoice>({ kind: 'month', at: null });
  return <ResultsDashboard db={db} scope="real" now={now} choice={choice} onChoiceChange={setChoice} renderTradeLink={id => <ReviewTradeLink id={id} />} refreshRevision={0} />;
}
async function show(db: KairosDatabase): Promise<HTMLElement> {
  render(<MemoryRouter><Host db={db} /></MemoryRouter>);
  const found = await screen.findByRole('region', { name: 'Your results' });
  await waitFor(() => expect(found).toHaveAttribute('data-results-status', 'ready'));
  await waitFor(() => expect(found).not.toHaveAttribute('aria-busy'));
  return found;
}
const section = (found: HTMLElement, name: string) => within(found).getByRole('region', { name });
const lists = (found: HTMLElement) => found.querySelectorAll('.kairos-results-day-trades');

describe('T-051j when you trade and your markets', () => {
  it('draws a weekday × time of day grid, and lists a cell\'s trades', async () => {
    const found = await show(await database(WEEK));
    const heatmap = section(found, 'When you trade');
    expect(within(heatmap).getByText('Your results by the day and time you opened each trade, in UTC.')).toBeInTheDocument();
    expect(within(heatmap).getAllByRole('rowheader').map(header => [header.textContent, header.getAttribute('abbr')])).toEqual([
      ['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday'],
    ]);
    expect(within(heatmap).getAllByRole('columnheader').map(header => header.textContent)).toEqual(['00', '04', '08', '12', '16', '20']);
    expect(within(heatmap).getAllByRole('columnheader')[2]).toHaveAttribute('abbr', 'Morning (08:00 to 11:59)');
    expect(within(heatmap).getAllByRole('button', { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/ })).toHaveLength(2);
    const cell = within(heatmap).getByRole('button', { name: 'Monday, Morning (08:00 to 11:59): Profit, 6 USDT, 2 trades' });
    expect(cell.querySelector('[data-cell-amount]')).toHaveTextContent(/^\+6$/);
    expect(cell.querySelector('[data-cell-count]')).toHaveTextContent(/^2$/);
    expect(cell.closest('td')).toHaveAttribute('data-cell-result', 'profit');
    expect(cell.closest('td')).toHaveAttribute('data-cell-strength', '4');
    cell.focus();
    fireEvent.click(cell);
    const heading = await within(found).findByRole('heading', { name: 'Trades opened on Monday, Morning (08:00 to 11:59)' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(within(heading.closest('.kairos-results-day-trades') as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
    expect(cell).toHaveAttribute('aria-pressed', 'true');
    expect(await axeViolations(found)).toEqual([]);
    fireEvent.click(within(heading.closest('.kairos-results-day-trades') as HTMLElement).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(cell).toHaveFocus());
  });

  it('shows your markets as tiles sized by money, and lists a tile\'s trades', async () => {
    const found = await show(await database(WEEK));
    const markets = section(found, 'Your markets');
    const tiles = [...markets.querySelectorAll<HTMLElement>('.kairos-results-markets__tile')];
    expect(tiles.map(tile => [tile.querySelector('.kairos-results-markets__symbol')!.textContent, tile.getAttribute('data-size')])).toEqual([['BTCUSDT', '3'], ['ETHUSDT', '1']]);
    expect(tiles[0]).toHaveAccessibleName('BTCUSDT: Profit, 6 USDT, 2 trades, won 1 of 2');
    expect(tiles[0]).toHaveTextContent('+6');
    expect(tiles[0]).toHaveTextContent('2 trades · won 1');
    // On the money basis the legend names the currency, so the tile shows the amount alone.
    expect(tiles[0]!.querySelector('.kairos-result__amount')).toHaveTextContent(/^\+6$/);
    expect(within(markets).getByText('Bigger tile: more money made or lost. Amounts in USDT.')).toBeInTheDocument();
    tiles[0]!.focus();
    fireEvent.click(tiles[0]!);
    const heading = await within(found).findByRole('heading', { name: 'Trades in BTCUSDT' });
    expect(within(heading.closest('.kairos-results-day-trades') as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(within(heading.closest('.kairos-results-day-trades') as HTMLElement).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(tiles[0]).toHaveFocus());
  });

  it('sizes tiles by trades when the markets use different currencies, each with its own currency', async () => {
    const found = await show(await database([...WEEK, trade('SAP.DE', '2026-09-08T09:00:00.000Z', 3, 'EUR')]));
    const markets = section(found, 'Your markets');
    expect(within(markets).getByText('Bigger tile: more trades.')).toBeInTheDocument();
    const byName = (symbol: string) => [...markets.querySelectorAll<HTMLElement>('.kairos-results-markets__tile')].find(tile => tile.querySelector('.kairos-results-markets__symbol')!.textContent === symbol)!;
    expect(byName('SAP.DE')).toHaveTextContent('+3 EUR');
    expect(byName('BTCUSDT')).toHaveTextContent('+6 USDT');
    expect(byName('BTCUSDT')).toHaveAttribute('data-size', '3');
  });

  it('keeps one list open on the whole dashboard', async () => {
    const found = await show(await database(WEEK));
    fireEvent.click(within(found.querySelector('[data-day-key="2026-09-07"]') as HTMLElement).getByRole('button'));
    expect(await within(found).findByRole('heading', { name: 'Trades closed on 7 September 2026' })).toBeInTheDocument();
    fireEvent.click(section(found, 'Your markets').querySelector('.kairos-results-markets__tile')!);
    expect(await within(found).findByRole('heading', { name: 'Trades in BTCUSDT' })).toBeInTheDocument();
    expect(lists(found)).toHaveLength(1);
    // The list shows under the section it came from.
    expect(section(found, 'Your markets').nextElementSibling).toBe(lists(found)[0]);
  });

  it('says when a trade has no opening time and is left out', async () => {
    const db = await database(WEEK);
    const first = await db.trades.toCollection().first();
    await db.trades.update(first!.id, { openedAt: null });
    const found = await show(db);
    expect(within(section(found, 'When you trade')).getByText('1 trade has no opening time, so it is left out.')).toBeInTheDocument();
  });
});
