import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadTradePictureCandles,
  planTradePictureCandleWindow,
  resetTradePictureCandleCache,
  TRADE_PICTURE_INTERVALS,
  TRADE_PICTURE_MAX_WINDOW_CANDLES,
} from '../src/application/trade-visualizer';
import type { TradeExecutionId, TradeExecutionRecord, TradeId, TradeRecord } from '../src/domain/trades';
import { resetBinanceSpotExchangeInfoCache } from '../src/services/market-data';
import { createTradePictureCandleBrowserDeps } from '../src/app/tradePictureCandleBrowserDeps';
import { BINANCE_SPOT_CANDLE_INTERVALS } from '../src/services/market-data/providers/binance/binanceSpotCandleHistoryRequest';
import type { MarketCandleHistoryRequest, MarketCandleHistoryResult, MarketCandleOrigin } from '../src/services/market-data/MarketCandleHistoryPort';

const HOUR = 60 * 60_000, DAY = 24 * HOUR;
const originalFetch = globalThis.fetch;
const tradeId = 't-1' as TradeId;
const start = Date.parse('2026-09-20T09:00:00.000Z');

function trade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return { id: tradeId, symbol: 'btc/usdt', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', openedAt: new Date(start).toISOString(), closedAt: null, createdAt: new Date(start).toISOString(), updatedAt: new Date(start).toISOString(), ...overrides };
}
function fill(type: 'entry' | 'exit', atMs: number): TradeExecutionRecord {
  return { id: `${type}-${atMs}` as TradeExecutionId, tradeId, type, price: '100' as never, quantity: '1' as never, executedAt: new Date(atMs).toISOString(), createdAt: new Date(atMs).toISOString() };
}
const kline = (openMs: number, lengthMs: number) => [openMs, '100', '105', '95', '102', '10', openMs + lengthMs - 1, '1000', 10, '5', '500', '0'];

let klineUrls: URL[] = [];
function stubFetch(options: { klines?: 'ok' | 'fail' | 'error-status'; exchangeInfo?: 'ok' | 'fail' } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/exchangeInfo')) {
      if (options.exchangeInfo === 'fail') throw new Error('offline');
      return { text: async () => JSON.stringify({ symbols: [{ symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' }] }) };
    }
    if (url.pathname.endsWith('/klines')) {
      klineUrls.push(url);
      if (options.klines === 'fail') throw new Error('offline');
      const from = Number(url.searchParams.get('startTime'));
      const ms = TRADE_PICTURE_INTERVALS.find(item => item.interval === url.searchParams.get('interval'))!.ms;
      const body = JSON.stringify([kline(from, ms), kline(from + ms, ms)]);
      return { status: options.klines === 'error-status' ? 500 : 200, text: async () => body, headers: { get: () => null } };
    }
    throw new Error(`unexpected ${url}`);
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}
const deps = () => ({ ...createTradePictureCandleBrowserDeps(), nowMs: () => Date.parse('2026-09-24T12:00:00.000Z') });

beforeEach(() => {
  resetTradePictureCandleCache();
  resetBinanceSpotExchangeInfoCache();
  klineUrls = [];
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('T-027b candles for the trade window', () => {
  it('a 3 h trade uses 15m and asks for the padded window', async () => {
    stubFetch();
    const result = await loadTradePictureCandles(trade(), [fill('entry', start), fill('exit', start + 3 * HOUR)], deps());
    expect(result.ok && result.candles).toHaveLength(2);
    expect(klineUrls).toHaveLength(1);
    const url = klineUrls[0];
    expect(url.searchParams.get('symbol')).toBe('BTCUSDT');
    expect(url.searchParams.get('interval')).toBe('15m');
    // Padding = max(20% of 3 h = 36 min, 3 × 15 min = 45 min) = 45 min on each side; 5m would need 52 candles.
    expect(Number(url.searchParams.get('startTime'))).toBe(start - 45 * 60_000);
    expect(Number(url.searchParams.get('endTime'))).toBe(start + 3 * HOUR + 45 * 60_000);
    expect(Number(url.searchParams.get('limit'))).toBe(19);
  });

  it('a 20-day trade uses 1d', async () => {
    stubFetch();
    await loadTradePictureCandles(trade(), [fill('entry', start - 20 * DAY), fill('exit', start)], deps());
    expect(klineUrls[0].searchParams.get('interval')).toBe('1d');
    expect(planTradePictureCandleWindow(0, 20 * DAY)?.interval).toBe('1d');
  });

  it('a second call for the same trade makes no new request', async () => {
    const fetchMock = stubFetch();
    const fills = [fill('entry', start), fill('exit', start + 3 * HOUR)];
    const first = await loadTradePictureCandles(trade(), fills, deps());
    const calls = fetchMock.mock.calls.length;
    const second = await loadTradePictureCandles(trade(), fills, deps());
    expect(second).toBe(first);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it.each([
    ['candles offline', { klines: 'fail' }],
    ['candles error status', { klines: 'error-status' }],
    ['market list offline', { exchangeInfo: 'fail' }],
  ] as const)('%s → the source did not answer, never throws', async (_label, options) => {
    stubFetch(options);
    await expect(loadTradePictureCandles(trade(), [fill('entry', start), fill('exit', start + HOUR)], deps())).resolves.toMatchObject({ ok: false, why: 'source-down' });
  });

  it('an unknown symbol → not listed, with no candle request', async () => {
    stubFetch();
    await expect(loadTradePictureCandles(trade({ symbol: 'AAPL' }), [fill('entry', start)], deps())).resolves.toMatchObject({ ok: false, why: 'not-listed' });
    expect(klineUrls).toHaveLength(0);
  });

  it('a trade with no start time → no start, with no request', async () => {
    const fetchMock = stubFetch();
    await expect(loadTradePictureCandles(trade({ status: 'draft', openedAt: null }), [], deps())).resolves.toMatchObject({ ok: false, why: 'no-start' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('T-039d real candles at every trade length', () => {
  const MIN = 60_000;
  const at = (iso: string) => Date.parse(iso);

  it.each([
    ['10 min', 10 * MIN, '1m', '2026-09-20T08:57:00.000Z', '2026-09-20T09:13:00.000Z', 17],
    ['2 h', 2 * HOUR, '5m', '2026-09-20T08:36:00.000Z', '2026-09-20T11:24:00.000Z', 35],
    ['4 h', 4 * HOUR, '15m', '2026-09-20T08:12:00.000Z', '2026-09-20T13:48:00.000Z', 24],
    ['1 day', DAY, '1h', '2026-09-20T04:12:00.000Z', '2026-09-21T13:48:00.000Z', 35],
    ['10 days', 10 * DAY, '8h', '2026-09-18T09:00:00.000Z', '2026-10-02T09:00:00.000Z', 43],
  ] as const)('a %s trade gets its table window', (_label, length, interval, from, to, limit) => {
    expect(planTradePictureCandleWindow(start, start + length)).toEqual({ interval, startTimeMs: at(from), endTimeMs: at(to), limit });
  });

  it('every trade length gets at most 48 candles, and from 40 min on at least 16', () => {
    const lengths = [
      ...Array.from({ length: 24 * 60 + 1 }, (_, minute) => minute * MIN),
      ...Array.from({ length: 235 * 24 }, (_, index) => (index + 1) * HOUR),
    ];
    for (const length of lengths) {
      const window = planTradePictureCandleWindow(start, start + length)!;
      expect(window.limit).toBeLessThanOrEqual(TRADE_PICTURE_MAX_WINDOW_CANDLES);
      if (length >= 40 * MIN) expect(window.limit).toBeGreaterThanOrEqual(16);
    }
    expect(planTradePictureCandleWindow(start, start + 300 * DAY)?.interval).toBe('1w');
  });

  it('Binance knows every timeframe, smallest first', () => {
    expect(TRADE_PICTURE_INTERVALS.map(item => item.interval)).toEqual(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w']);
    for (let index = 1; index < TRADE_PICTURE_INTERVALS.length; index += 1) expect(TRADE_PICTURE_INTERVALS[index]!.ms).toBeGreaterThan(TRADE_PICTURE_INTERVALS[index - 1]!.ms);
    for (const item of TRADE_PICTURE_INTERVALS) expect(BINANCE_SPOT_CANDLE_INTERVALS).toContain(item.interval);
  });

  it('the owner\'s 2 h trade asks for 35 five-minute candles', async () => {
    stubFetch();
    await loadTradePictureCandles(trade(), [fill('entry', start), fill('exit', start + 2 * HOUR)], deps());
    expect(klineUrls).toHaveLength(1);
    const url = klineUrls[0]!;
    expect(url.searchParams.get('interval')).toBe('5m');
    expect(url.searchParams.get('limit')).toBe('35');
    expect(Number(url.searchParams.get('startTime'))).toBe(start - 24 * MIN);
    expect(Number(url.searchParams.get('endTime'))).toBe(start + 2 * HOUR + 24 * MIN);
  });
});

describe('T-048f the matching market, futures candles and the real reason', () => {
  const listed = [
    { instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, baseAsset: 'BTC', quoteAsset: 'USDT', tradingEnabled: true },
    { instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, baseAsset: 'ETH', quoteAsset: 'USDT', tradingEnabled: true },
  ];
  const candle = { openTime: new Date(start).toISOString(), closeTime: new Date(start + HOUR - 1).toISOString(), open: '100', high: '105', low: '95', close: '102' } as never;
  const answered = (request: MarketCandleHistoryRequest, origin: MarketCandleOrigin): MarketCandleHistoryResult =>
    ({ ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request, observedAt: new Date(start).toISOString(), candles: [candle], origin } });
  function ports(answer: (request: MarketCandleHistoryRequest) => MarketCandleHistoryResult) {
    const acquireHistory = vi.fn(async (request: MarketCandleHistoryRequest) => answer(request));
    return {
      acquireHistory,
      deps: {
        venue: 'binance-spot',
        history: { acquireHistory },
        metadata: { acquireInstrumentMetadata: async () => ({ ok: true as const, facts: listed as never }) },
        nowMs: () => Date.parse('2026-09-24T12:00:00.000Z'),
      },
    };
  }
  const fills = [fill('entry', start), fill('exit', start + HOUR)];
  const binance = (market: 'spot' | 'usdm-futures'): MarketCandleOrigin => ({ provider: 'binance', market, symbol: 'BTCUSDT', backup: null });

  it('a futures trade asks binance-usdm with the pair, and names Binance Futures', async () => {
    const { acquireHistory, deps } = ports(request => answered(request, binance('usdm-futures')));
    const result = await loadTradePictureCandles(trade({ symbol: 'BTCUSDT', marketType: 'futures' }), fills, deps);
    expect(acquireHistory).toHaveBeenCalledTimes(1);
    expect(acquireHistory.mock.calls[0]![0]).toMatchObject({ instrument: { venue: 'binance-usdm', symbol: 'BTCUSDT' }, pair: { base: 'BTC', quote: 'USDT' } });
    expect(result).toMatchObject({ ok: true, source: 'Candles: Binance Futures · BTC/USDT', note: null });
  });

  it('a futures market Binance does not have → spot candles once, and the source line says so', async () => {
    const { acquireHistory, deps } = ports(request => request.instrument.venue === 'binance-usdm'
      ? { ok: false, reason: 'unavailable', why: 'unknown-market', retryAfterSeconds: null }
      : answered(request, binance('spot')));
    const result = await loadTradePictureCandles(trade({ symbol: 'BTCUSDT', marketType: 'futures' }), fills, deps);
    expect(acquireHistory.mock.calls.map(([request]) => request.instrument.venue)).toEqual(['binance-usdm', 'binance-spot']);
    expect(result).toMatchObject({ ok: true, source: 'Candles: Binance Spot · BTC/USDT · no futures candles for this market' });
  });

  it('BTC/USD loads BTCUSDT with the stablecoin note', async () => {
    const { acquireHistory, deps } = ports(request => answered(request, binance('spot')));
    const result = await loadTradePictureCandles(trade({ symbol: 'BTC/USD' }), fills, deps);
    expect(acquireHistory.mock.calls[0]![0]).toMatchObject({ instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, pair: { base: 'BTC', quote: 'USDT' } });
    expect(result).toMatchObject({ ok: true, source: 'Candles: Binance Spot · BTC/USDT' });
    expect(result.note).toContain('USDT is a dollar stablecoin');
  });

  it('a region failure gives its why, and failures are not kept: a second call asks again', async () => {
    const { acquireHistory, deps } = ports(() => ({ ok: false, reason: 'unavailable', why: 'region', retryAfterSeconds: null }));
    await expect(loadTradePictureCandles(trade({ symbol: 'BTCUSDT' }), fills, deps)).resolves.toMatchObject({ ok: false, why: 'region', retryAfterSeconds: null });
    await expect(loadTradePictureCandles(trade({ symbol: 'BTCUSDT' }), fills, deps)).resolves.toMatchObject({ ok: false, why: 'region' });
    expect(acquireHistory).toHaveBeenCalledTimes(2);
  });

  describe('D171 a futures market on no spot list', () => {
    const pepe = (marketType: 'futures' | 'crypto') => trade({ symbol: '1000PEPEUSDT', marketType });

    it('asks binance-usdm for its own name with no pair, and names Binance Futures', async () => {
      const { acquireHistory, deps } = ports(request => answered(request, { provider: 'binance', market: 'usdm-futures', symbol: '1000PEPEUSDT', backup: null }));
      const result = await loadTradePictureCandles(pepe('futures'), fills, deps);
      expect(acquireHistory).toHaveBeenCalledTimes(1);
      const asked = acquireHistory.mock.calls[0]![0];
      expect(asked.instrument).toEqual({ venue: 'binance-usdm', symbol: '1000PEPEUSDT' });
      expect(asked.pair).toBeUndefined();
      expect(result).toMatchObject({ ok: true, source: 'Candles: Binance Futures · 1000PEPEUSDT', note: null });
    });

    it('Binance Futures does not list it either → not listed, with the Spot and Futures sentence', async () => {
      const { deps } = ports(() => ({ ok: false, reason: 'unavailable', why: 'unknown-market', retryAfterSeconds: null }));
      expect(await loadTradePictureCandles(pepe('futures'), fills, deps)).toEqual({ ok: false, why: 'not-listed', retryAfterSeconds: null, note: "Binance Spot and Futures don't list 1000PEPEUSDT. Check the spelling, for example BTCUSDT." });
    });

    it('a build without the Kairos server → not listed, and futures candles need the server', async () => {
      const { deps } = ports(() => ({ ok: false, reason: 'invalid-request', detail: 'venue-mismatch' }));
      expect(await loadTradePictureCandles(pepe('futures'), fills, deps)).toEqual({ ok: false, why: 'not-listed', retryAfterSeconds: null, note: "Binance doesn't list 1000PEPEUSDT. Check the spelling, for example BTCUSDT. Futures candles need the Kairos server." });
    });

    it('a spot trade stays not listed and asks nothing', async () => {
      const { acquireHistory, deps } = ports(request => answered(request, binance('spot')));
      expect(await loadTradePictureCandles(pepe('crypto'), fills, deps)).toMatchObject({ ok: false, why: 'not-listed' });
      expect(acquireHistory).not.toHaveBeenCalled();
    });
  });
});
