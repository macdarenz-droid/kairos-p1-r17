import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarketMovesReader, type MarketMovePeriod } from '../src/application/markets/marketMoves';
import { createRequestBudget } from '../src/application/online/requestBudget';
import type { DecimalString } from '../src/domain/trades';
import { MarketSheet, type MarketSheetCoin } from '../src/features/home/MarketSheet';
import type { MarketCandle, MarketCandleHistoryPort, MarketCandleHistoryResult } from '../src/services/market-data/MarketCandleHistoryPort';
import type { MarketMovesPort, MarketMovesResult } from '../src/services/market-data/MarketMovesPort';
import { axeViolations } from './fixtures/axe';

const NOW = Date.parse('2026-10-25T02:00:00Z');
const d = (value: string) => value as DecimalString;
const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];
const BTC: MarketSheetCoin = {
  instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, base: 'BTC', quote: 'USDT', name: 'Bitcoin',
  price: d('64210.5'), observedAt: new Date(NOW - 40_000).toISOString(), move24h: d('2.31'),
};
const moves = (window: '1h' | '7d'): MarketMovesResult => ({ ok: true, observedAt: new Date(NOW).toISOString(), moves: [
  window === '1h' ? { symbol: 'BTCUSDT', open: d('63954.68'), last: d('64210.5') } : { symbol: 'BTCUSDT', open: d('67661.22'), last: d('64210.5') },
  { symbol: 'ETHUSDT', open: d('4000'), last: d('4000') },
] });
const BUSY: MarketMovesResult = { ok: false, reason: 'unavailable', why: 'busy', retryAfterSeconds: 60 };
const closes = ['63100', '63500.75', '63320', '64210.5'];
const page = (interval: string, limit: number): MarketCandleHistoryResult => ({ ok: true, snapshot: {
  source: 'market-reference', timeZone: 'UTC', request: { instrument: BTC.instrument, interval, limit }, observedAt: new Date(NOW).toISOString(),
  candles: closes.map((close, index): MarketCandle => ({ openTime: new Date(NOW - (4 - index) * 900_000).toISOString(), closeTime: new Date(NOW - (3 - index) * 900_000 - 1).toISOString(), open: d(close), high: d(close), low: d(close), close: d(close) })),
} });

function setUp(answers: Partial<Record<'1h' | '7d', MarketMovesResult>> = {}, budget: ReturnType<typeof createRequestBudget> | null = null) {
  const movesPort = { acquireMoves: vi.fn<MarketMovesPort['acquireMoves']>(async ({ window }) => answers[window] ?? moves(window)) };
  const history = { acquireHistory: vi.fn<MarketCandleHistoryPort['acquireHistory']>(async request => page(request.interval, request.limit)) };
  const reader = createMarketMovesReader({ moves: movesPort, history, budget });
  return { movesPort, history, reader };
}

/** A bubble and its sheet, as Home has them: a tap that does not focus the bubble (Safari) opens it. */
function Harness({ reader, period = '24h' }: { readonly reader: ReturnType<typeof setUp>['reader']; readonly period?: MarketMovePeriod }) {
  const [open, setOpen] = useState(false);
  return <main>
    <button type="button" id="bubble" onClick={() => setOpen(true)}>BTC, Bitcoin. Show details</button>
    <MarketSheet coin={open ? BTC : null} period={period} reader={reader} symbols={() => SYMBOLS} chartHref="/analysis?market=binance-spot%3ABTCUSDT"
      onClose={() => setOpen(false)} returnFocusTo={() => document.getElementById('bubble')} />
  </main>;
}
const settle = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
async function openSheet(reader: ReturnType<typeof setUp>['reader'], period?: MarketMovePeriod) {
  render(<Harness reader={reader} period={period} />);
  fireEvent.click(screen.getByRole('button', { name: 'BTC, Bitcoin. Show details' }));
  await settle();
  return screen.getByRole('dialog', { name: 'BTC · Bitcoin' });
}
const moveLine = (sheet: HTMLElement, period: string) => within(sheet).getByText(period, { selector: '.kairos-market-sheet__period' }).closest('li')!;

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('the market sheet (T-061e, D271)', () => {
  it('shows the coin, its price as the source wrote it, how long ago, and its moves over 1 hour, 24 hours and 7 days', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const { reader } = setUp();
    const sheet = await openSheet(reader);
    expect(within(sheet).getByText('Price 64210.5 USDT')).toBeInTheDocument();
    expect(within(sheet).getByText('Updated 40 s ago')).toBeInTheDocument();
    expect(moveLine(sheet, '1 hour')).toHaveTextContent('▲ 0.4%');
    expect(moveLine(sheet, '1 hour')).toHaveTextContent('up 0.4%');
    expect(moveLine(sheet, '24 hours')).toHaveTextContent('▲ 2.3%');
    expect(moveLine(sheet, '7 days')).toHaveTextContent('▼ 5.1%');
    expect(moveLine(sheet, '7 days')).toHaveTextContent('down 5.1%');
    expect(within(sheet).getByText('Coin names: CoinGecko')).toBeInTheDocument();
    // The ago words keep time while the sheet is open.
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(within(sheet).getByText('Updated 1 min ago')).toBeInTheDocument();
  });

  it('draws the price over the period chosen on the map, named with its first and last price, and "Open chart" opens that market', async () => {
    const { reader, history } = setUp();
    const sheet = await openSheet(reader, '24h');
    const line = within(sheet).getByRole('img', { name: 'Price over the last 24 hours, from 63100 to 64210.5' });
    expect(line.querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(4);
    expect(history.acquireHistory.mock.calls.map(([request]) => `${request.instrument.symbol} ${request.interval}×${request.limit}`)).toEqual(['BTCUSDT 15m×96']);
    expect(within(sheet).getByRole('link', { name: 'Open chart' })).toHaveAttribute('href', '/analysis?market=binance-spot%3ABTCUSDT');
    cleanup();
    const hour = setUp();
    const hourSheet = await openSheet(hour.reader, '1h');
    expect(within(hourSheet).getByRole('img', { name: 'Price over the last hour, from 63100 to 64210.5' })).toBeInTheDocument();
    expect(hour.history.acquireHistory.mock.calls[0]![0]).toMatchObject({ interval: '1m', limit: 60 });
    cleanup();
    const week = setUp();
    await openSheet(week.reader, '7d');
    expect(week.history.acquireHistory.mock.calls[0]![0]).toMatchObject({ interval: '1h', limit: 168 });
  });

  it('says one move is not available while the others still show, with "Try again" asking once more', async () => {
    const { reader, movesPort } = setUp({ '7d': BUSY });
    const sheet = await openSheet(reader);
    expect(moveLine(sheet, '7 days')).toHaveTextContent('not available');
    expect(moveLine(sheet, '1 hour')).toHaveTextContent('▲ 0.4%');
    expect(moveLine(sheet, '24 hours')).toHaveTextContent('▲ 2.3%');
    expect(within(sheet).getByRole('img', { name: /^Price over the last 24 hours/ })).toBeInTheDocument();
    expect(within(sheet).getByText(/7-day move: too many requests right now/)).toBeInTheDocument();
    const calls = movesPort.acquireMoves.mock.calls.length;
    movesPort.acquireMoves.mockImplementation(async ({ window }) => moves(window));
    const retry = within(sheet).getByRole('button', { name: 'Try again' });
    retry.focus();
    fireEvent.click(retry);
    await settle();
    expect(movesPort.acquireMoves.mock.calls.length).toBe(calls + 1);
    expect(moveLine(sheet, '7 days')).toHaveTextContent('▼ 5.1%');
    // The notice went away with the answer: focus is still in the sheet, never on the page.
    expect(sheet.contains(document.activeElement)).toBe(true);
  });

  it('reads one candle page and this coin\'s moves on open, uses the map\'s moves while fresh, and reads again every 60 s while open', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const { reader, movesPort, history } = setUp();
    // The map read the 1-hour moves 10 seconds ago.
    await reader.ensure('1h', SYMBOLS);
    await act(async () => { vi.advanceTimersByTime(10_000); });
    await openSheet(reader);
    expect(history.acquireHistory).toHaveBeenCalledTimes(1);
    expect(movesPort.acquireMoves.mock.calls.map(([request]) => request.window)).toEqual(['1h', '7d']);
    await act(async () => { vi.advanceTimersByTime(59_000); });
    expect(history.acquireHistory).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1_000); });
    await settle();
    expect(history.acquireHistory).toHaveBeenCalledTimes(2);
    // The 1-hour moves are older than 30 s now; the 7-day ones are fresh for 5 minutes.
    expect(movesPort.acquireMoves.mock.calls.map(([request]) => request.window)).toEqual(['1h', '7d', '1h']);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await act(async () => { vi.advanceTimersByTime(5 * 60_000); });
    expect(history.acquireHistory).toHaveBeenCalledTimes(2);
  });

  it('gives the focus back to the tapped bubble when it closes, even when the tap did not focus it (Safari)', async () => {
    const { reader } = setUp();
    const sheet = await openSheet(reader);
    expect(sheet.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(sheet, { key: 'Escape' });
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'BTC, Bitcoin. Show details' }));
  });

  it('review r1: never shows an old move as now: a 1-hour move read 20 minutes ago shows as loading until the new read comes', async () => {
    vi.useFakeTimers({ now: NOW - 20 * 60_000, toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const budget = createRequestBudget(2);
    const { reader, movesPort } = setUp({}, budget);
    // Read 20 minutes ago: BTC up 0.4% then.
    await reader.ensure('1h', SYMBOLS);
    vi.setSystemTime(NOW);
    // The budget is full for now: the sheet's new 1-hour read waits its turn.
    expect(await budget.take(2)).toBe(true);
    const sheet = await openSheet(reader);
    expect(moveLine(sheet, '1 hour')).toHaveTextContent('loading');
    expect(moveLine(sheet, '1 hour')).not.toHaveTextContent('0.4%');
    expect(movesPort.acquireMoves).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    await settle();
    expect(movesPort.acquireMoves.mock.calls.map(([request]) => request.window)).toEqual(['1h', '1h']);
    expect(moveLine(sheet, '1 hour')).toHaveTextContent('▲ 0.4%');
  });

  it('passes axe at 390 px', async () => {
    window.innerWidth = 390;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
    const { reader } = setUp({ '7d': BUSY });
    await openSheet(reader);
    expect(await axeViolations(document.body)).toEqual([]);
  });
});
