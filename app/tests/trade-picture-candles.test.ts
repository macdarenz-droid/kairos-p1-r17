import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadTradePictureCandles,
  planTradePictureCandleWindow,
  resetTradePictureCandleCache,
} from '../src/application/trade-visualizer';
import type { TradeExecutionId, TradeExecutionRecord, TradeId, TradeRecord } from '../src/domain/trades';
import { resetBinanceSpotExchangeInfoCache } from '../src/services/market-data';
import { createTradePictureCandleBrowserDeps } from '../src/app/tradePictureCandleBrowserDeps';

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
const kline = (openMs: number) => [openMs, '100', '105', '95', '102', '10', openMs + 299_999, '1000', 10, '5', '500', '0'];

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
      const body = JSON.stringify([kline(from), kline(from + 300_000)]);
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
  it('a 3 h trade uses 5m and asks for the padded window', async () => {
    stubFetch();
    const candles = await loadTradePictureCandles(trade(), [fill('entry', start), fill('exit', start + 3 * HOUR)], deps());
    expect(candles).toHaveLength(2);
    expect(klineUrls).toHaveLength(1);
    const url = klineUrls[0];
    expect(url.searchParams.get('symbol')).toBe('BTCUSDT');
    expect(url.searchParams.get('interval')).toBe('5m');
    // Padding = max(20% of 3 h = 36 min, 3 × 5 min) = 36 min on each side.
    expect(Number(url.searchParams.get('startTime'))).toBe(start - 36 * 60_000);
    expect(Number(url.searchParams.get('endTime'))).toBe(start + 3 * HOUR + 36 * 60_000);
    expect(Number(url.searchParams.get('limit'))).toBe(Math.ceil((3 * HOUR + 72 * 60_000) / (5 * 60_000)) + 1);
  });

  it('a 20-day trade uses 4h', async () => {
    stubFetch();
    await loadTradePictureCandles(trade(), [fill('entry', start - 20 * DAY), fill('exit', start)], deps());
    expect(klineUrls[0].searchParams.get('interval')).toBe('4h');
    expect(planTradePictureCandleWindow(0, 20 * DAY)?.interval).toBe('4h');
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
