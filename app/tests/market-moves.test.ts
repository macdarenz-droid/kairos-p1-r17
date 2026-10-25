import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMarketMovesReader, describeMarketMove, HOME_MARKET_EXTRA_READS_PER_MINUTE, MARKET_MOVES_REFRESH_MS, projectMarketMove, projectMarketMoveLine,
} from '../src/application/markets/marketMoves';
import type { DecimalString } from '../src/domain/trades';
import { createKairosApiClient } from '../src/services/kairos-api/kairosApi';
import { createKairosMarketDataPorts } from '../src/services/kairos-api/marketApi';
import type { MarketCandleHistoryPort, MarketCandleHistoryResult } from '../src/services/market-data/MarketCandleHistoryPort';
import type { MarketMovesPort, MarketMovesResult } from '../src/services/market-data/MarketMovesPort';
import { createBinanceSpotMovesPort } from '../src/services/market-data/providers/binance/binanceSpotRollingWindowMoves';

const d = (value: string) => value as DecimalString;
const SYMBOLS = ['ETHUSDT', 'BTCUSDT'];
const OK: MarketMovesResult = Object.freeze({ ok: true, observedAt: '2026-10-25T02:00:00.000Z', moves: [
  { symbol: 'BTCUSDT', open: d('100'), last: d('102.5') },
  { symbol: 'ETHUSDT', open: d('4020.10000000'), last: d('3990.00000000') },
] });
const BUSY: MarketMovesResult = Object.freeze({ ok: false, reason: 'unavailable', why: 'busy', retryAfterSeconds: 60 });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const neverAsked: MarketCandleHistoryPort = { acquireHistory: vi.fn(async () => { throw new Error('not asked'); }) };
const movesPort = (answer: MarketMovesResult = OK) => ({ acquireMoves: vi.fn<MarketMovesPort['acquireMoves']>(async () => answer) });
/** Lets the reader's promises settle under fake timers. */
const settle = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('the move over a window (projectMarketMove, D271)', () => {
  it('is (last − open) ÷ open × 100, exactly, through the decimal kernel', () => {
    expect(projectMarketMove(d('100'), d('102.5'))).toBe('2.5');
    expect(projectMarketMove(d('4020.10000000'), d('3990.00000000'))).toBe('-0.7487375935921991990248998781124847640606');
    expect(projectMarketMove(d('64000'), d('64000'))).toBe('0');
  });

  it('is unknown, never zero, when the window opened at no price or the text is not a price', () => {
    expect(projectMarketMove(d('0'), d('1'))).toBeNull();
    expect(projectMarketMove(d('abc'), d('1'))).toBeNull();
  });

  it('says the direction and the size in plain words, rounded to one decimal place', () => {
    expect(describeMarketMove(d('2.25'))).toEqual({ direction: 'up', size: '2.3%' });
    expect(describeMarketMove(d('-1.32'))).toEqual({ direction: 'down', size: '1.3%' });
    expect(describeMarketMove(d('0'))).toEqual({ direction: 'none', size: '0%' });
    expect(describeMarketMove(d('0.04'))).toEqual({ direction: 'up', size: 'less than 0.1%' });
    expect(describeMarketMove(null)).toBeNull();
  });

  it('draws a line of closes in steps from the lowest to the highest, flat in the middle', () => {
    expect(projectMarketMoveLine([d('63100'), d('63655.25'), d('64210.5')], 100)).toEqual([0, 50, 100]);
    expect(projectMarketMoveLine([d('5'), d('5')], 100)).toEqual([50, 50]);
    expect(projectMarketMoveLine([], 100)).toBeNull();
    expect(projectMarketMoveLine([d('5'), d('x')], 100)).toBeNull();
  });
});

describe('the moves cadence: only while chosen and visible', () => {
  it('reads "1 hour" at once and then once every 30 seconds, all markets in one request in one order', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-25T02:00:00Z') });
    const port = movesPort();
    const reader = createMarketMovesReader({ moves: port, history: neverAsked, perMinute: null });
    const cadence = reader.cadence(() => SYMBOLS);
    cadence.update({ period: '1h', visible: true });
    await settle();
    expect(port.acquireMoves).toHaveBeenCalledTimes(1);
    expect(port.acquireMoves.mock.calls[0]![0]).toEqual({ symbols: ['BTCUSDT', 'ETHUSDT'], window: '1h' });
    expect(reader.state()['1h'].reading?.moves.get('BTCUSDT')).toBe('2.5');
    await vi.advanceTimersByTimeAsync(MARKET_MOVES_REFRESH_MS['1h'] - 1);
    expect(port.acquireMoves).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(port.acquireMoves).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(port.acquireMoves).toHaveBeenCalledTimes(4);
    cadence.close();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(port.acquireMoves).toHaveBeenCalledTimes(4);
  });

  it('reads nothing on "24 hours" (the move comes with the prices) or while hidden, and reads at once when shown again if stale', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-25T02:00:00Z') });
    const port = movesPort();
    const reader = createMarketMovesReader({ moves: port, history: neverAsked, perMinute: null });
    const cadence = reader.cadence(() => SYMBOLS);
    cadence.update({ period: '24h', visible: true });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(port.acquireMoves).not.toHaveBeenCalled();
    cadence.update({ period: '1h', visible: false });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(port.acquireMoves).not.toHaveBeenCalled();
    cadence.update({ period: '1h', visible: true });
    await settle();
    expect(port.acquireMoves).toHaveBeenCalledTimes(1);
    // Hidden then shown within 30 seconds: still fresh, no read.
    cadence.update({ period: '1h', visible: false });
    await vi.advanceTimersByTimeAsync(10_000);
    cadence.update({ period: '1h', visible: true });
    await settle();
    expect(port.acquireMoves).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(port.acquireMoves).toHaveBeenCalledTimes(2);
    cadence.close();
  });

  it('reads "7 days" once every 5 minutes, and switching back and forth never reads a fresh window again', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-25T02:00:00Z') });
    const port = movesPort();
    const reader = createMarketMovesReader({ moves: port, history: neverAsked, perMinute: null });
    const cadence = reader.cadence(() => SYMBOLS);
    cadence.update({ period: '7d', visible: true });
    await settle();
    expect(port.acquireMoves.mock.calls.map(([request]) => request.window)).toEqual(['7d']);
    for (const period of ['24h', '7d', '24h', '7d'] as const) cadence.update({ period, visible: true });
    await vi.advanceTimersByTimeAsync(MARKET_MOVES_REFRESH_MS['7d'] - 1);
    expect(port.acquireMoves).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(port.acquireMoves).toHaveBeenCalledTimes(2);
    cadence.close();
  });

  it('after a busy or rate-limited answer waits the time asked, so it never retries in a burst; "Try again" asks once', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-25T02:00:00Z') });
    const port = movesPort(BUSY);
    const reader = createMarketMovesReader({ moves: port, history: neverAsked, perMinute: null });
    const cadence = reader.cadence(() => SYMBOLS);
    cadence.update({ period: '1h', visible: true });
    await settle();
    expect(reader.state()['1h'].failure?.unavailable).toEqual(BUSY);
    cadence.update({ period: '24h', visible: true });
    cadence.update({ period: '1h', visible: true });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(port.acquireMoves).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(port.acquireMoves).toHaveBeenCalledTimes(2);
    cadence.close();
    // The trader's own "Try again" is one request, even while the source asked to wait.
    await reader.ensure('7d', SYMBOLS, { byTrader: true });
    await reader.ensure('7d', SYMBOLS);
    expect(port.acquireMoves).toHaveBeenCalledTimes(3);
  });
});

describe('the request budget (the Kairos server allows 30 a minute without a device)', () => {
  it(`sends at most ${HOME_MARKET_EXTRA_READS_PER_MINUTE} extra reads in any 60 seconds, the rest wait their turn, and an abandoned wait sends nothing`, async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-25T02:00:00Z') });
    const port = movesPort();
    const candles: MarketCandleHistoryResult = { ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request: { instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, interval: '15m', limit: 96 }, observedAt: '2026-10-25T02:00:00.000Z', candles: [] } };
    const history = { acquireHistory: vi.fn<MarketCandleHistoryPort['acquireHistory']>(async () => candles) };
    const reader = createMarketMovesReader({ moves: port, history, perMinute: HOME_MARKET_EXTRA_READS_PER_MINUTE });
    const btc = { venue: 'binance-spot', symbol: 'BTCUSDT' };
    const asked = () => port.acquireMoves.mock.calls.length + history.acquireHistory.mock.calls.length;
    void reader.readLine(btc, '24h');
    void reader.ensure('1h', SYMBOLS, { byTrader: true });
    void reader.ensure('7d', SYMBOLS, { byTrader: true });
    void reader.readLine(btc, '1h');
    void reader.readLine(btc, '7d');
    const gone = new AbortController();
    const abandoned = reader.readLine({ venue: 'binance-spot', symbol: 'ETHUSDT' }, '24h', { signal: gone.signal });
    await settle();
    expect(asked()).toBe(4);
    gone.abort();
    expect(await abandoned).toMatchObject({ ok: false, reason: 'unavailable' });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(asked()).toBe(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(asked()).toBe(5);
    expect(history.acquireHistory.mock.calls.map(([request]) => `${request.instrument.symbol} ${request.interval}×${request.limit}`)).toEqual(['BTCUSDT 15m×96', 'BTCUSDT 1m×60', 'BTCUSDT 1h×168']);
  });
});

describe('the request budget, a read abandoned before it is sent', () => {
  it('gives its slot back, so a screen opened and closed at once (React\'s development double start) costs nothing', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-25T02:00:00Z') });
    const candles: MarketCandleHistoryResult = { ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request: { instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, interval: '1m', limit: 60 }, observedAt: '2026-10-25T02:00:00.000Z', candles: [] } };
    const history = { acquireHistory: vi.fn<MarketCandleHistoryPort['acquireHistory']>(async () => candles) };
    const port = movesPort();
    const reader = createMarketMovesReader({ moves: port, history, perMinute: 2 });
    const btc = { venue: 'binance-spot', symbol: 'BTCUSDT' };
    const closedAtOnce = new AbortController();
    const line = reader.readLine(btc, '1h', { signal: closedAtOnce.signal });
    const moves = reader.ensure('1h', SYMBOLS, { signal: closedAtOnce.signal });
    closedAtOnce.abort();
    await line; await moves; await settle();
    expect(history.acquireHistory).not.toHaveBeenCalled();
    expect(port.acquireMoves).not.toHaveBeenCalled();
    void reader.readLine(btc, '1h');
    void reader.ensure('1h', SYMBOLS);
    await settle();
    expect(history.acquireHistory).toHaveBeenCalledTimes(1);
    expect(port.acquireMoves).toHaveBeenCalledTimes(1);
  });
});

describe('the Binance rolling-window adapter (direct, without the Kairos server)', () => {
  const BINANCE_ROWS = [
    { symbol: 'ETHUSDT', openPrice: '4020.10000000', highPrice: '4100', lowPrice: '3990', lastPrice: '3990.00000000', volume: '1', quoteVolume: '1', openTime: 1, closeTime: 2, firstId: 1, lastId: 2, count: 3 },
    { symbol: 'BTCUSDT', openPrice: '100.00', highPrice: '103', lowPrice: '99', lastPrice: '102.50', volume: '1', quoteVolume: '1', openTime: 1, closeTime: 2, firstId: 1, lastId: 2, count: 3 },
  ];

  it('asks data-api.binance.vision for the MINI rolling window and answers each market in the asked order, prices as the same text', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(BINANCE_ROWS));
    const port = createBinanceSpotMovesPort({ fetchImpl, now: () => Date.parse('2026-10-25T02:00:00Z'), isOnline: () => true });
    const result = await port.acquireMoves({ symbols: ['BTCUSDT', 'ETHUSDT'], window: '7d' });
    expect(String(fetchImpl.mock.calls[0]![0])).toBe('https://data-api.binance.vision/api/v3/ticker?symbols=%5B%22BTCUSDT%22%2C%22ETHUSDT%22%5D&windowSize=7d&type=MINI');
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error' });
    expect(result).toEqual({ ok: true, observedAt: '2026-10-25T02:00:00.000Z', moves: [
      { symbol: 'BTCUSDT', open: '100.00', last: '102.50' },
      { symbol: 'ETHUSDT', open: '4020.10000000', last: '3990.00000000' },
    ] });
  });

  it('refuses a missing, extra or number price as unreadable, and says what a failed answer means', async () => {
    const ask = async (response: () => Response | Promise<Response>, online = true) =>
      createBinanceSpotMovesPort({ fetchImpl: vi.fn<typeof fetch>(async () => response()), isOnline: () => online }).acquireMoves({ symbols: ['BTCUSDT', 'ETHUSDT'], window: '1h' });
    for (const rows of [[BINANCE_ROWS[0]], [...BINANCE_ROWS, { ...BINANCE_ROWS[0], symbol: 'XRPUSDT' }], [BINANCE_ROWS[0], { ...BINANCE_ROWS[1], lastPrice: 102.5 }], [BINANCE_ROWS[0], { ...BINANCE_ROWS[1], openPrice: '-1' }]]) {
      expect(await ask(() => json(rows))).toMatchObject({ ok: false, why: 'unreadable' });
    }
    expect(await ask(() => json({}, 451))).toMatchObject({ ok: false, why: 'region' });
    expect(await ask(() => json({}, 429, { 'Retry-After': '12' }))).toEqual({ ok: false, reason: 'unavailable', why: 'busy', retryAfterSeconds: 12 });
    expect(await ask(() => json({ code: -1121, msg: 'Invalid symbol.' }, 400))).toMatchObject({ ok: false, why: 'unknown-market' });
    expect(await ask(() => json({}, 500))).toMatchObject({ ok: false, why: 'source-down' });
    expect(await ask(() => { throw new TypeError('Failed to fetch'); }, false)).toMatchObject({ ok: false, why: 'offline' });
  });
});

describe('the Kairos server client for /market/moves', () => {
  const okData = (moves: unknown[], overrides: Record<string, unknown> = {}) => ({ apiVersion: 1, ok: true, data: { source: 'binance-spot', window: '1h', fetchedAt: '2026-10-25T01:59:58.000Z', moves, ...overrides } });
  const row = (symbol: string, openPrice: string, lastPrice: string) => ({ symbol, openPrice, lastPrice, openTime: '2026-10-25T00:59:58.000Z', closeTime: '2026-10-25T01:59:58.000Z' });
  const server = (fetchImpl: typeof fetch) => createKairosMarketDataPorts(createKairosApiClient({ baseUrl: 'https://api.test', fetchImpl }), { store: null, isOnline: () => true }).moves;

  it('asks /market/moves once for every market in one ascending order, and answers the server\'s read time', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(okData([row('BTCUSDT', '100', '102.5'), row('ETHUSDT', '4020.1', '3990')])));
    const result = await server(fetchImpl).acquireMoves({ symbols: ['ETHUSDT', 'BTCUSDT'], window: '1h' });
    expect(String(fetchImpl.mock.calls[0]![0])).toBe('https://api.test/market/moves?symbols=BTCUSDT%2CETHUSDT&window=1h');
    expect(result).toEqual({ ok: true, observedAt: '2026-10-25T01:59:58.000Z', moves: [
      { symbol: 'ETHUSDT', open: '4020.1', last: '3990' },
      { symbol: 'BTCUSDT', open: '100', last: '102.5' },
    ] });
  });

  it('refuses another window, a missing market or a price as a number; a rate-limited answer is "busy" with its wait', async () => {
    for (const body of [okData([row('BTCUSDT', '1', '2')], { window: '7d' }), okData([]), okData([{ ...row('BTCUSDT', '1', '2'), lastPrice: 2 }])]) {
      expect(await server(vi.fn<typeof fetch>(async () => json(body))).acquireMoves({ symbols: ['BTCUSDT'], window: '1h' })).toMatchObject({ ok: false, why: 'unreadable' });
    }
    const limited = json({ apiVersion: 1, ok: false, error: 'unavailable', reason: 'rate-limited', retryAfter: 60 }, 429);
    expect(await server(vi.fn<typeof fetch>(async () => limited)).acquireMoves({ symbols: ['BTCUSDT'], window: '1h' })).toEqual({ ok: false, reason: 'unavailable', why: 'busy', retryAfterSeconds: 60 });
  });
});
