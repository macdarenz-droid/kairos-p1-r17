import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import type { JournalHistoryEntry } from '../src/application/journal';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import {
  projectVisualPnlResultCandles, summarizeVisualPnlByDay, writeVisualPnlTimeZonePreference,
  type VisualPnlOutcomeProjection, type VisualPnlResultCandlesProjection,
} from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { parseDecimalString, type TradeRecord } from '../src/domain/trades';
import { ResultsCandles } from '../src/features/journal/ResultsCandles';

function dec(value: string) {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`Invalid fixture decimal: ${value}`);
  return parsed.value;
}
function visual(amount: string, currency = 'USD'): VisualPnlOutcomeProjection {
  const outcome = amount.startsWith('-') ? 'loss' : amount === '0' ? 'breakeven' : 'profit';
  return Object.freeze({ outcome, label: 'Profit', amount: dec(amount), currency, source: 'net-pnl' }) as VisualPnlOutcomeProjection;
}
let ids = 0;
function entry(closedAt: string, pnl: VisualPnlOutcomeProjection): JournalHistoryEntry {
  return {
    trade: { id: `t-${++ids}`, symbol: 'TEST', marketType: 'stock', side: 'long', status: 'closed', openedAt: '2026-08-01T00:00:00.000Z', closedAt, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' } as TradeRecord,
    plans: [], executions: [], fees: [], metrics: null, metricsError: null, visualPnl: pnl,
  };
}
const candlesOf = (...entries: JournalHistoryEntry[]) => projectVisualPnlResultCandles(summarizeVisualPnlByDay(entries, 'UTC').days);
const threeDays = () => candlesOf(
  entry('2026-09-01T10:00:00.000Z', visual('100')), entry('2026-09-01T11:00:00.000Z', visual('-30')),
  entry('2026-09-02T10:00:00.000Z', visual('-50')), entry('2026-09-02T11:00:00.000Z', visual('10')), entry('2026-09-02T12:00:00.000Z', visual('-90')),
  entry('2026-09-03T10:00:00.000Z', visual('5')), entry('2026-09-03T11:00:00.000Z', visual('-5')),
);
const candle = (container: HTMLElement, index: number) => container.querySelectorAll('[data-candle-day]')[index] as SVGGElement;

describe('P13.A3 ResultsCandles', () => {
  afterEach(cleanup);

  it('draws one candle per day with marks, the zero line, dates and the numbers', () => {
    const { container } = render(<ResultsCandles projection={threeDays()} />);
    const label = screen.getByRole('img').getAttribute('aria-label')!;
    expect(label.startsWith('Total result so far: -60 USD after 3 days with results.')).toBe(true);
    expect(label).toContain('1 day up, 1 day down, 1 day even');
    const groups = [...container.querySelectorAll('[data-candle-day]')];
    expect(groups.map((g) => g.getAttribute('data-direction'))).toEqual(['up', 'down', 'even']);
    expect(groups.map((g) => g.getAttribute('class'))).toEqual(['up', 'down', 'even'].map((d) => `kairos-results-candles__candle kairos-results-candles__candle--${d}`));
    expect(candle(container, 0).querySelector('[data-mark="up"]')).not.toBeNull();
    expect(candle(container, 1).querySelector('[data-mark="down"]')).not.toBeNull();
    expect(candle(container, 2).querySelector('[data-mark]')).toBeNull();
    const zeroY = Number(container.querySelector('.kairos-results-candles__zero')!.getAttribute('y1'));
    const upBody = candle(container, 0).querySelector('rect')!;
    expect(zeroY).toBeCloseTo(Number(upBody.getAttribute('y')) + Number(upBody.getAttribute('height')));
    expect(candle(container, 2).querySelector('rect')!.getAttribute('height')).toBe('2');
    const heading = container.querySelector('.kairos-results-candles__heading')!;
    expect(heading).toHaveTextContent('▼');
    expect(heading).toHaveTextContent('-60 USD');
    expect(container.querySelector('.kairos-results-candles')!.getAttribute('data-outcome')).toBe('loss');
    expect([...container.querySelectorAll('.kairos-results-candles__axis span')].map((span) => span.textContent)).toEqual(['1 September 2026', '3 September 2026']);
    const numbers = container.querySelector('details')!;
    expect(within(numbers).getByText('Show the numbers')).toBeInTheDocument();
    expect(within(numbers).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Day', 'Start', 'Highest', 'Lowest', 'End']);
    const row = within(numbers).getByRole('rowheader', { name: /2 September 2026/ }).closest('tr')!;
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['70', '70', '-60', '-60']);
    expect(screen.getByText('Only closed trades count. This is not your account balance.')).toBeInTheDocument();
  });

  it('draws the one-day loss the owner saw as one down candle', () => {
    const { container } = render(<ResultsCandles projection={candlesOf(entry('2026-09-25T10:00:00.000Z', visual('-6.233', 'USDT')))} />);
    const groups = container.querySelectorAll('[data-candle-day]');
    expect(groups).toHaveLength(1);
    expect(groups[0].getAttribute('data-direction')).toBe('down');
    expect(groups[0].querySelector('[data-mark="down"]')).not.toBeNull();
    expect(container.querySelectorAll('.kairos-results-candles__axis span')).toHaveLength(1);
    expect(container.querySelector('.kairos-results-candles__heading')).toHaveTextContent('▼');
  });

  it('says when only the last 30 days are drawn', () => {
    const { container } = render(<ResultsCandles projection={candlesOf(...Array.from({ length: 31 }, (_, i) => entry(`2026-08-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`, visual('1'))))} />);
    expect(screen.getByText('Showing your last 30 days with results. The total above counts all 31.')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-candle-day]')).toHaveLength(30);
  });

  it.each([
    ['no-result-days', 'Your total appears after your first closed trade.'],
    ['mixed-currencies', "The total can't be drawn because your trades use more than one currency."],
    ['unavailable-result-day', "The total can't be drawn because at least one day has no result. Look for · on the calendar."],
    ['invalid-cumulative-decimal', 'The total could not be worked out. Your stored trades were not changed.'],
    ['invalid-candle-decimal', 'The total could not be worked out. Your stored trades were not changed.'],
  ] as const)('explains %s without drawing', (reason, message) => {
    render(<ResultsCandles projection={{ available: false, reason } as VisualPnlResultCandlesProjection} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-results-candles-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
const closed = (symbol: string, dayKey: string, exitPrice: string, closeTime = '10:00') => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: `${dayKey}T09:00:00.000Z`, closedAt: `${dayKey}T${closeTime}:00.000Z`, executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: `${dayKey}T09:00:00.000Z` }, { type: 'exit', price: exitPrice, quantity: '1', executedAt: `${dayKey}T${closeTime}:00.000Z` }] } as const);

describe('P13.A3 the candles on the pages', () => {
  afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });

  it('shows the Journal total as candles', async () => {
    const db = await database();
    const now = () => '2026-09-10T12:00:00.000Z';
    await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now());
    expect((await saveManualTrade(db, closed('BTCUSDT', '2026-09-02', '150'))).ok).toBe(true);
    expect((await saveManualTrade(db, closed('ETHUSDT', '2026-09-03', '90'))).ok).toBe(true);
    const { container } = render(<MemoryRouter><JournalRoute db={db} now={now} /></MemoryRouter>);
    expect(await screen.findByRole('img', { name: /^Total result so far: 40 USDT/ })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-candle-day]')).toHaveLength(2);
  });

  it('builds a day from its trades in close order, not save order', async () => {
    const db = await database();
    const now = () => '2026-09-10T12:00:00.000Z';
    await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now());
    expect((await saveManualTrade(db, closed('BTCUSDT', '2026-09-02', '70', '11:00'))).ok).toBe(true);
    expect((await saveManualTrade(db, closed('ETHUSDT', '2026-09-02', '150', '10:30'))).ok).toBe(true);
    const { container } = render(<MemoryRouter><JournalRoute db={db} now={now} /></MemoryRouter>);
    await screen.findByRole('img', { name: /^Total result so far: 20 USDT/ });
    const numbers = container.querySelector('.kairos-results-candles__numbers')!;
    const row = within(numbers as HTMLElement).getByRole('rowheader', { name: /2 September 2026/ }).closest('tr')!;
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['0', '50', '0', '20']);
  });

  it('shows practice days only on the Practice page', async () => {
    const db = await database();
    const now = () => '2026-09-20T12:00:00.000Z';
    await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now());
    const saved = [
      await saveManualTrade(db, closed('BTCUSDT', '2026-09-17', '150')),
      await savePracticeTrade(db, closed('ADAUSDT', '2026-09-16', '120')),
      await savePracticeTrade(db, closed('ETHUSDT', '2026-09-18', '10')),
      await savePracticeTrade(db, { symbol: 'SOLUSDT', marketType: 'crypto', side: 'short', status: 'open', openedAt: '2026-09-18T11:00:00.000Z' }),
    ];
    expect(saved.every((item) => item.ok)).toBe(true);
    render(<MemoryRouter><PracticeRoute db={db} now={now} /></MemoryRouter>);
    const region = await screen.findByRole('region', { name: 'Your practice results' });
    await waitFor(() => expect(region.querySelector('[data-candle-day="2026-09-16"]')?.getAttribute('data-direction')).toBe('up'));
    expect(region.querySelector('[data-candle-day="2026-09-18"]')?.getAttribute('data-direction')).toBe('down');
    expect(region.querySelector('[data-candle-day="2026-09-17"]')).toBeNull();
  });
});
