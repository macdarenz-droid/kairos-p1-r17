import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadReplayCandles, type ReplayRequest } from '../src/application/practice/replayCandles';
import { resetTradePictureCandleCache } from '../src/application/trade-visualizer';
import { createTradePictureCandleBrowserDeps } from '../src/app/tradePictureCandleBrowserDeps';
import { decimalNormalize } from '../src/domain/calculations/decimalKernel';
import type { MarketCandleHistoryRequest } from '../src/services/market-data/MarketCandleHistoryPort';
import { resetBinanceSpotExchangeInfoCache } from '../src/services/market-data';
import { fakeReplayMarket, HOUR, replayCandle } from './fixtures/replayCandles';

const now = Date.parse('2024-04-01T00:00:00.000Z');
const START = '2024-03-01T12:30:00.000Z';
const noon = Date.parse('2024-03-01T12:00:00.000Z');
const request = (overrides: Partial<ReplayRequest> = {}): ReplayRequest => ({ market: ' btc/usdt ', candleSize: '1h', startAt: START, ...overrides });
const hourly = (fromMs: number, count: number, prices: [string, string, string, string] = ['100', '101', '99', '100']) =>
  Array.from({ length: count }, (_, i) => replayCandle(fromMs + i * HOUR, ...prices));

describe('T-038b decimalNormalize', () => {
  it.each([['100.00000000', '100'], ['0.00001230', '0.0000123'], ['-2.50', '-2.5'], ['0.000', '0']])('%s → %s', (input, output) => {
    expect(decimalNormalize(input)).toEqual({ ok: true, value: output });
  });
  it('refuses what is not a decimal', () => {
    expect(decimalNormalize('abc')).toEqual({ ok: false, reason: 'invalid-decimal' });
  });
});

describe('T-038b past candles for a replay', () => {
  it('loads 60 candles before the moment and the rest after it, in one request', async () => {
    const { market, requests } = fakeReplayMarket({ nowMs: now });
    const result = await loadReplayCandles(request(), market);
    expect(requests).toEqual([{ instrument: { venue: 'test-venue', symbol: 'BTCUSDT' }, interval: '1h', limit: 300, startTimeMs: Date.parse('2024-02-28T00:00:00.000Z'), endTimeMs: Date.parse('2024-03-11T11:00:00.000Z') }]);
    if (!result.ok) throw new Error(result.reason);
    expect(result.replay).toMatchObject({ symbol: 'BTCUSDT', quoteAsset: 'USDT', startIndex: 60 });
    expect(result.replay.candles).toHaveLength(300);
    expect(result.replay.candles[60]!.openTime).toBe('2024-03-01T12:00:00.000Z');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.replay)).toBe(true);
    expect(Object.isFrozen(result.replay.candles)).toBe(true);
  });

  it('keeps finished candles only', async () => {
    const nowSoon = Date.parse('2024-03-01T15:30:00.000Z');
    const { market, requests } = fakeReplayMarket({ nowMs: nowSoon });
    const result = await loadReplayCandles(request(), market);
    expect(requests[0]!.endTimeMs).toBe(nowSoon);
    if (!result.ok) throw new Error(result.reason);
    expect(result.replay.candles.slice(result.replay.startIndex).map(candle => candle.openTime)).toEqual(['2024-03-01T12:00:00.000Z', '2024-03-01T13:00:00.000Z', '2024-03-01T14:00:00.000Z']);
    expect(result.replay.candles.length - result.replay.startIndex).toBe(3);
  });

  it('writes prices in their shortest exact form', async () => {
    const { market } = fakeReplayMarket({ nowMs: now, history: (r: MarketCandleHistoryRequest) => hourly(r.startTimeMs!, 100, ['63000.01000000', '63100.00000000', '62900.50000000', '63050.10000000']) });
    const result = await loadReplayCandles(request(), market);
    if (!result.ok) throw new Error(result.reason);
    expect(result.replay.candles[0]).toMatchObject({ open: '63000.01', high: '63100', low: '62900.5', close: '63050.1' });
  });

  it.each([
    ['market-required', { market: '  ' }],
    ['candle-size-invalid', { candleSize: '1w' }],
    ['start-invalid', { startAt: '' }],
    ['start-invalid', { startAt: 'not a date' }],
    ['start-in-future', { startAt: '2024-05-01T00:00:00.000Z' }],
    ['no-history', { startAt: '1970-01-02T00:00:00.000Z' }],
  ] as const)('refuses with %s before asking the market', async (reason, overrides) => {
    const { market, requests, state } = fakeReplayMarket({ nowMs: now });
    expect(await loadReplayCandles(request(overrides), market)).toEqual({ ok: false, reason });
    expect(state.metadataCalls).toBe(0);
    expect(requests).toHaveLength(0);
  });

  it('an unknown market is never asked for candles', async () => {
    const { market, requests } = fakeReplayMarket({ nowMs: now });
    expect(await loadReplayCandles(request({ market: 'NOPEUSDT' }), market)).toEqual({ ok: false, reason: 'unknown-market' });
    expect(requests).toHaveLength(0);
  });

  it('says unavailable when a port fails or throws, and never rejects', async () => {
    const meta = fakeReplayMarket({ nowMs: now });
    meta.state.metadataFails = true;
    expect(await loadReplayCandles(request(), meta.market)).toEqual({ ok: false, reason: 'unavailable' });
    const history = fakeReplayMarket({ nowMs: now });
    history.state.historyFails = true;
    expect(await loadReplayCandles(request(), history.market)).toEqual({ ok: false, reason: 'unavailable' });
    const rejects = fakeReplayMarket({ nowMs: now });
    const market = { ...rejects.market, history: { acquireHistory: () => Promise.reject(new Error('offline')) } };
    await expect(loadReplayCandles(request(), market)).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('needs candles on both sides of the moment', async () => {
    const after = fakeReplayMarket({ nowMs: now, history: () => hourly(noon, 10) });
    expect(await loadReplayCandles(request(), after.market)).toEqual({ ok: false, reason: 'no-history' });
    const before = fakeReplayMarket({ nowMs: now, history: () => hourly(noon - 10 * HOUR, 10) });
    expect(await loadReplayCandles(request(), before.market)).toEqual({ ok: false, reason: 'no-future' });
  });

  it('a quote asset that is not a plain code is unknown', async () => {
    const { market } = fakeReplayMarket({ nowMs: now, quoteAsset: 'US D' });
    const result = await loadReplayCandles(request(), market);
    expect(result.ok && result.replay.quoteAsset).toBeNull();
  });
});

describe('T-038b with the app\'s Binance ports', () => {
  const originalFetch = globalThis.fetch;
  let klineUrls: URL[] = [];
  beforeEach(() => { resetTradePictureCandleCache(); resetBinanceSpotExchangeInfoCache(); klineUrls = []; });
  afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

  function stubFetch(fails = false) {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (fails) throw new Error('offline');
      const url = new URL(String(input));
      if (url.pathname.endsWith('/exchangeInfo')) return { text: async () => JSON.stringify({ symbols: [{ symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' }] }) };
      if (url.pathname.endsWith('/klines')) {
        klineUrls.push(url);
        const from = Number(url.searchParams.get('startTime')), to = Number(url.searchParams.get('endTime')), limit = Number(url.searchParams.get('limit'));
        const rows: unknown[] = [];
        for (let openMs = from; rows.length < limit && openMs <= to; openMs += HOUR) rows.push([openMs, '100.00000000', '101.00000000', '99.00000000', '100.50000000', '10', openMs + HOUR - 1, '1000', 10, '5', '500', '0']);
        return { status: 200, text: async () => JSON.stringify(rows), headers: { get: () => null } };
      }
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;
  }
  const deps = () => ({ ...createTradePictureCandleBrowserDeps(), nowMs: () => now });

  it('asks Binance for one 1h page around the moment', async () => {
    stubFetch();
    const result = await loadReplayCandles(request(), deps());
    expect(klineUrls).toHaveLength(1);
    const url = klineUrls[0]!;
    expect(url.searchParams.get('symbol')).toBe('BTCUSDT');
    expect(url.searchParams.get('interval')).toBe('1h');
    expect(url.searchParams.get('limit')).toBe('300');
    expect(Number(url.searchParams.get('startTime'))).toBe(Date.parse('2024-02-28T00:00:00.000Z'));
    expect(Number(url.searchParams.get('endTime'))).toBe(Date.parse('2024-03-11T11:00:00.000Z'));
    expect(result.ok).toBe(true);
    expect(result.ok && result.replay.candles[0]!.close).toBe('100.5');
  });

  it('offline → unavailable', async () => {
    stubFetch(true);
    expect(await loadReplayCandles(request(), deps())).toEqual({ ok: false, reason: 'unavailable' });
  });
});
