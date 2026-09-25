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
    const candles = await loadTradePictureCandles(trade(), [fill('entry', start), fill('exit', start + 3 * HOUR)], deps());
    expect(candles).toHaveLength(2);
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
  ] as const)('%s → null, never throws', async (_label, options) => {
    stubFetch(options);
    await expect(loadTradePictureCandles(trade(), [fill('entry', start), fill('exit', start + HOUR)], deps())).resolves.toBeNull();
  });

  it('an unknown symbol → null, with no candle request', async () => {
    stubFetch();
    await expect(loadTradePictureCandles(trade({ symbol: 'AAPL' }), [fill('entry', start)], deps())).resolves.toBeNull();
    expect(klineUrls).toHaveLength(0);
  });

  it('a trade with no start time → null, with no request', async () => {
    const fetchMock = stubFetch();
    await expect(loadTradePictureCandles(trade({ status: 'draft', openedAt: null }), [], deps())).resolves.toBeNull();
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
