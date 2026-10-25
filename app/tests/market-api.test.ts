import { describe, expect, it, vi } from 'vitest';
import { createKairosApiClient, type KairosApiFailure } from '../src/services/kairos-api/kairosApi';
import { createKairosCoinNames, createKairosMarketDataPorts, decodeCoinNames, marketDataUnavailableOf, type MarketListStore } from '../src/services/kairos-api/marketApi';
import type { MarketCandleHistoryRequest } from '../src/services/market-data/MarketCandleHistoryPort';

const BASE = 'https://api.test';
const NOW = Date.parse('2026-09-26T02:00:00.000Z');
const HOUR = 3_600_000;
const START = 1_704_067_200_000;
const FETCHED_AT = '2026-09-26T01:59:58.000Z';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const okAnswer = (data: unknown) => json({ apiVersion: 1, ok: true, data });
const failAnswer = (reason: string, status: number, retryAfter: number | null = null) => json({ apiVersion: 1, ok: false, error: 'unavailable', reason, retryAfter }, status);

function ports(fetchImpl: typeof fetch, store: MarketListStore | null = null) {
  return createKairosMarketDataPorts(createKairosApiClient({ baseUrl: BASE, fetchImpl }), { store, now: () => NOW, isOnline: () => true });
}

const candle = (openMs: number, overrides: Record<string, unknown> = {}) => ({
  openTime: new Date(openMs).toISOString(), closeTime: new Date(openMs + HOUR - 1).toISOString(),
  open: '42283.58', high: '42554.57', low: '42261.02', close: '42475.23', volume: '1271.68108', ...overrides,
});
const candlesData = (candles: unknown[], overrides: Record<string, unknown> = {}) => ({
  source: { provider: 'okx', market: 'spot', symbol: 'BTC-USDT' }, backup: 'refused', interval: '1h', fetchedAt: FETCHED_AT, candles, next: null, ...overrides,
});
const REQUEST: MarketCandleHistoryRequest = {
  instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, interval: '1h', limit: 3, startTimeMs: START, endTimeMs: START + 2 * HOUR - 1, pair: { base: 'BTC', quote: 'USDT' },
};

describe('the server-backed candle history port', () => {
  it('asks /market/candles with every query name, and answers candles with volume and where they came from', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => okAnswer(candlesData([candle(START), candle(START + HOUR)])));
    const result = await ports(fetchImpl).history.acquireHistory(REQUEST);
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://api.test/market/candles?base=BTC&end=1704074399999&interval=1h&limit=3&market=binance-spot&quote=USDT&start=1704067200000&symbol=BTCUSDT');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.observedAt).toBe(FETCHED_AT);
    expect(result.snapshot.request).toBe(REQUEST);
    expect(result.snapshot.candles).toHaveLength(2);
    expect(result.snapshot.candles[0]).toEqual(candle(START));
    expect(result.snapshot.origin).toEqual({ provider: 'okx', market: 'spot', symbol: 'BTC-USDT', backup: 'refused' });
  });

  it('refuses an answer it cannot trust as unreadable', async () => {
    const faults: [string, unknown][] = [
      ['a number price', candlesData([candle(START, { open: 42283.58 })])],
      ['rows out of order', candlesData([candle(START + HOUR), candle(START)])],
      ['a candle outside the window', candlesData([candle(START + 2 * HOUR)])],
      ['limit + 1 candles', candlesData([candle(START), candle(START + HOUR), candle(START + 2 * HOUR), candle(START + 3 * HOUR)], { interval: '1h' })],
      ['a negative volume', candlesData([candle(START, { volume: '-1' })])],
      ['an unknown backup', candlesData([candle(START)], { backup: 'maybe' })],
    ];
    for (const [label, data] of faults) {
      const request = label === 'limit + 1 candles' ? { ...REQUEST, endTimeMs: START + 10 * HOUR } : REQUEST;
      const result = await ports(vi.fn<typeof fetch>(async () => okAnswer(data))).history.acquireHistory(request);
      expect(result, label).toEqual({ ok: false, reason: 'unavailable', why: 'unreadable', retryAfterSeconds: null });
    }
  });

  it('asks OANDA forex by its six letters with no base or quote, and keeps a missing volume missing (T-055b)', async () => {
    const forex: MarketCandleHistoryRequest = { ...REQUEST, instrument: { venue: 'oanda-forex', symbol: 'EURUSD' } };
    const oanda = (candles: unknown[], overrides: Record<string, unknown> = {}) => candlesData(candles, { source: { provider: 'oanda', market: 'forex', symbol: 'EUR_USD' }, backup: null, ...overrides });
    const mid = (openMs: number) => candle(openMs, { open: '1.0851', high: '1.0874', low: '1.0842', close: '1.0866', volume: null });
    const fetchImpl = vi.fn<typeof fetch>(async () => okAnswer(oanda([mid(START), mid(START + HOUR)])));
    const result = await ports(fetchImpl).history.acquireHistory(forex);
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://api.test/market/candles?end=1704074399999&interval=1h&limit=3&market=oanda-forex&start=1704067200000&symbol=EURUSD');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.candles[0]).toEqual({ openTime: '2024-01-01T00:00:00.000Z', closeTime: '2024-01-01T00:59:59.999Z', open: '1.0851', high: '1.0874', low: '1.0842', close: '1.0866' });
    expect(result.snapshot.origin).toEqual({ provider: 'oanda', market: 'forex', symbol: 'EUR_USD', backup: null });

    // A source that does not fit the market asked is not trusted.
    const faults: [string, MarketCandleHistoryRequest, unknown][] = [
      ['OANDA for a Binance market', REQUEST, oanda([mid(START)])],
      ['Binance for a forex pair', forex, candlesData([candle(START)], { backup: null })],
      ['an OANDA spot market', forex, oanda([mid(START)], { source: { provider: 'oanda', market: 'spot', symbol: 'EUR_USD' } })],
      ['an OANDA backup', forex, oanda([mid(START)], { backup: 'refused' })],
      ['a forex volume', forex, oanda([candle(START, { volume: '12' })])],
      ['a crypto candle without volume', REQUEST, candlesData([candle(START, { volume: null })])],
    ];
    for (const [label, request, data] of faults) {
      const fault = await ports(vi.fn<typeof fetch>(async () => okAnswer(data))).history.acquireHistory(request);
      expect(fault, label).toEqual({ ok: false, reason: 'unavailable', why: 'unreadable', retryAfterSeconds: null });
    }
  });

  it('refuses another venue without asking, and answers cancelled for an aborted signal', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => okAnswer(candlesData([])));
    expect(await ports(fetchImpl).history.acquireHistory({ ...REQUEST, instrument: { venue: 'other', symbol: 'BTCUSDT' } })).toEqual({ ok: false, reason: 'invalid-request', detail: 'venue-mismatch' });
    const controller = new AbortController();
    controller.abort();
    expect(await ports(fetchImpl).history.acquireHistory(REQUEST, { signal: controller.signal })).toEqual({ ok: false, reason: 'cancelled' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('marketDataUnavailableOf', () => {
  const server = (serverReason: string, retryAfterSeconds: number | null = null): KairosApiFailure => ({ ok: false, reason: 'unavailable', serverReason, retryAfterSeconds, status: 503 });

  it('turns every server reason and client failure into why the data could not be had', () => {
    const cases: [KairosApiFailure, string, number | null][] = [
      [{ ok: false, reason: 'not-set-up' }, 'not-set-up', null],
      [{ ok: false, reason: 'invalid-response', status: 200 }, 'unreadable', null],
      [server('rate-limited', 40), 'busy', 40],
      [server('source-busy', 12), 'busy', 12],
      [server('source-refused'), 'region', null],
      [server('unknown-market'), 'unknown-market', null],
      [server('not-set-up'), 'not-set-up', null],
      [server('device-not-recognised'), 'not-set-up', null],
      [server('source-unavailable', 30), 'source-down', 30],
      [server('bad-request'), 'source-down', null],
    ];
    for (const [failure, why, retryAfterSeconds] of cases) {
      expect(marketDataUnavailableOf(failure, () => true), why).toEqual({ ok: false, reason: 'unavailable', why, retryAfterSeconds });
    }
    expect(marketDataUnavailableOf({ ok: false, reason: 'transport-failed' }, () => false).why).toBe('offline');
    expect(marketDataUnavailableOf({ ok: false, reason: 'transport-failed' }, () => true).why).toBe('source-down');
  });
});

const MARKETS = [
  { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', tickSize: '0.01', stepSize: '0.00001' },
  { symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT', tickSize: '0.01', stepSize: '0.0001' },
];
const symbolsAnswer = () => okAnswer({ source: 'binance-spot', fetchedAt: FETCHED_AT, markets: MARKETS, leftOut: 3 });

function memoryStore(text: string | null) {
  const store = { text, writes: 0, async read() { return store.text; }, async write(next: string) { store.text = next; store.writes += 1; } };
  return store;
}
const copy = (ageMs: number) => JSON.stringify({ storedAt: NOW - ageMs, markets: MARKETS });

describe('the market list: the session, the device copy and the server', () => {
  it('asks the server once without a copy, gives the steps, and keeps the list on the device', async () => {
    const store = memoryStore(null);
    const fetchImpl = vi.fn<typeof fetch>(async () => symbolsAnswer());
    const result = await ports(fetchImpl, store).metadata.acquireInstrumentMetadata();
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://api.test/market/symbols');
    expect(result).toEqual({ ok: true, facts: [
      { instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, baseAsset: 'BTC', quoteAsset: 'USDT', tradingEnabled: true, tickSize: '0.01', stepSize: '0.00001' },
      { instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, baseAsset: 'ETH', quoteAsset: 'USDT', tradingEnabled: true, tickSize: '0.01', stepSize: '0.0001' },
    ] });
    expect(store.writes).toBe(1);
    expect(JSON.parse(store.text as string)).toEqual({ storedAt: NOW, markets: MARKETS });
  });

  it('uses a copy 5 hours old without asking', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => symbolsAnswer());
    const result = await ports(fetchImpl, memoryStore(copy(5 * HOUR))).metadata.acquireInstrumentMetadata();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.ok && result.facts.map((fact) => fact.instrument.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
  });

  it('falls back to a copy up to 7 days old when the server fails, and not to an older one', async () => {
    const down = vi.fn<typeof fetch>(async () => failAnswer('source-unavailable', 502, 30));
    const kept = await ports(down, memoryStore(copy(7 * HOUR))).metadata.acquireInstrumentMetadata();
    expect(down).toHaveBeenCalledTimes(1);
    expect(kept.ok && kept.facts).toHaveLength(2);
    const old = await ports(vi.fn<typeof fetch>(async () => failAnswer('source-unavailable', 502, 30)), memoryStore(copy(8 * 24 * HOUR))).metadata.acquireInstrumentMetadata();
    expect(old).toEqual({ ok: false, reason: 'unavailable', why: 'source-down', retryAfterSeconds: 30 });
  });

  it('keeps the fallback copy until the server\'s wait has passed, then asks again', async () => {
    let clock = NOW;
    const fetchImpl = vi.fn<typeof fetch>(async () => failAnswer('source-unavailable', 502, 30));
    const market = createKairosMarketDataPorts(createKairosApiClient({ baseUrl: BASE, fetchImpl }), { store: memoryStore(copy(7 * HOUR)), now: () => clock, isOnline: () => true });
    const first = await market.metadata.acquireInstrumentMetadata();
    const second = await market.metadata.acquireInstrumentMetadata();
    expect(first.ok && second.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock = NOW + 31_000;
    expect((await market.metadata.acquireInstrumentMetadata()).ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('asks again for a copy dated in the future or a damaged copy', async () => {
    for (const text of [copy(-HOUR), '{"storedAt":', JSON.stringify({ storedAt: NOW, markets: [{ symbol: 'BTCUSDT' }] })]) {
      const fetchImpl = vi.fn<typeof fetch>(async () => symbolsAnswer());
      const result = await ports(fetchImpl, memoryStore(text)).metadata.acquireInstrumentMetadata();
      expect(fetchImpl, text.slice(0, 20)).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
    }
  });

  it('shares one request between two callers, and works from memory without a store', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => symbolsAnswer());
    const port = ports(fetchImpl, null).metadata;
    const [first, second] = await Promise.all([port.acquireInstrumentMetadata(), port.acquireInstrumentMetadata()]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.ok && second.ok).toBe(true);
    await port.acquireInstrumentMetadata();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('the server-backed 24-hour prices', () => {
  const symbols = Array.from({ length: 230 }, (_, index) => `S${String(index).padStart(3, '0')}USDT`);
  // 7 and 230 share no factor, so this visits every symbol once, out of order.
  const shuffled = symbols.map((_, index) => symbols[(index * 7) % symbols.length]);
  const scope = shuffled.map((symbol) => ({ venue: 'binance-spot', symbol }));
  const ticker = (symbol: string) => ({ symbol, lastPrice: '1.5', openPrice: '1.4', highPrice: '1.6', lowPrice: '1.3', volume: '100', quoteVolume: '150', openTime: '2026-09-25T02:00:00.000Z', closeTime: '2026-09-26T01:59:59.000Z' });
  const tickersFetch = (failOn: number | null = null) => {
    let call = 0;
    return vi.fn<typeof fetch>(async (input) => {
      call += 1;
      if (call === failOn) return failAnswer('source-busy', 503, 20);
      const asked = (new URL(String(input)).searchParams.get('symbols') ?? '').split(',');
      return okAnswer({ source: 'binance-spot', fetchedAt: FETCHED_AT, tickers: asked.map(ticker) });
    });
  };

  it('asks in ascending batches of at most 100 and gives the facts back in the caller\'s order', async () => {
    const fetchImpl = tickersFetch();
    const result = await ports(fetchImpl).baseline.acquireBaseline(scope);
    const batches = fetchImpl.mock.calls.map(([input]) => (new URL(String(input)).searchParams.get('symbols') ?? '').split(','));
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 30]);
    expect(batches.flat()).toEqual(symbols);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.delivery.completeness).toBe('complete-for-scope');
    expect(result.delivery.facts.map((fact) => fact.instrument.symbol)).toEqual(shuffled);
    expect(result.delivery.facts[0]).toMatchObject({ lastPrice: '1.5', open24h: '1.4', high24h: '1.6', low24h: '1.3', baseVolume24h: '100', quoteVolume24h: '150', observedAt: FETCHED_AT, sourceTimestamp: '2026-09-26T01:59:59.000Z' });
  });

  it('answers the first failed batch', async () => {
    const result = await ports(tickersFetch(2)).baseline.acquireBaseline(scope);
    expect(result).toEqual({ ok: false, reason: 'unavailable', why: 'busy', retryAfterSeconds: 20 });
  });
});

describe('T-059b coin names: the session, the device copy and the server', () => {
  const NAMES = [{ symbol: 'BTC', name: 'Bitcoin' }, { symbol: 'ETH', name: 'Ethereum' }];
  const namesAnswer = () => okAnswer({ source: 'coingecko', fetchedAt: FETCHED_AT, names: NAMES });
  const names = (fetchImpl: typeof fetch, store: MarketListStore | null = null) => createKairosCoinNames(createKairosApiClient({ baseUrl: BASE, fetchImpl }), { store, now: () => NOW, isOnline: () => true });
  const stored = (ageMs: number) => JSON.stringify({ storedAt: NOW - ageMs, names: NAMES });
  const asMap = new Map([['BTC', 'Bitcoin'], ['ETH', 'Ethereum']]);

  it('asks the server once, keeps the names on the device, and shares one request between two callers', async () => {
    const store = memoryStore(null);
    const fetchImpl = vi.fn<typeof fetch>(async () => namesAnswer());
    const port = names(fetchImpl, store);
    const [first, second] = await Promise.all([port.coinNames(), port.coinNames()]);
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://api.test/market/coin-names');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ ok: true, names: asMap });
    expect(second).toEqual(first);
    expect(JSON.parse(store.text as string)).toEqual({ storedAt: NOW, names: NAMES });
    expect(await port.coinNames()).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses a copy younger than a day without asking, and one up to 7 days old only when the server fails', async () => {
    const quiet = vi.fn<typeof fetch>(async () => namesAnswer());
    expect(await names(quiet, memoryStore(stored(20 * HOUR))).coinNames()).toEqual({ ok: true, names: asMap });
    expect(quiet).not.toHaveBeenCalled();
    const down = vi.fn<typeof fetch>(async () => failAnswer('source-unavailable', 502, 30));
    expect(await names(down, memoryStore(stored(6 * 24 * HOUR))).coinNames()).toEqual({ ok: true, names: asMap });
    expect(await names(down, memoryStore(stored(8 * 24 * HOUR))).coinNames()).toEqual({ ok: false, reason: 'unavailable', why: 'source-down', retryAfterSeconds: 30 });
  });

  it('says "not set up" without the owner\'s key, and refuses names it cannot trust', async () => {
    expect(await names(vi.fn<typeof fetch>(async () => failAnswer('not-set-up', 503))).coinNames()).toMatchObject({ ok: false, why: 'not-set-up' });
    const repeated = vi.fn<typeof fetch>(async () => okAnswer({ source: 'coingecko', fetchedAt: FETCHED_AT, names: [...NAMES, NAMES[1]] }));
    expect(await names(repeated).coinNames()).toMatchObject({ ok: false, why: 'unreadable' });
    expect(decodeCoinNames({ source: 'coingecko', fetchedAt: FETCHED_AT, names: [{ symbol: 'btc', name: 'Bitcoin' }] })).toBeNull();
    expect(decodeCoinNames({ source: 'coingecko', fetchedAt: FETCHED_AT, names: [{ symbol: 'BTC', name: 'Bit\u0007coin' }] })).toBeNull();
    // Review r1: C1 control characters too.
    expect(decodeCoinNames({ source: 'coingecko', fetchedAt: FETCHED_AT, names: [{ symbol: 'BTC', name: 'Bit\u0085coin' }] })).toBeNull();
    expect(decodeCoinNames({ source: 'coingecko', fetchedAt: FETCHED_AT, names: [{ symbol: 'BTC', name: 'Bit\u009bcoin' }] })).toBeNull();
    expect(decodeCoinNames({ source: 'coingecko', fetchedAt: FETCHED_AT, names: [{ symbol: 'BTC', name: ' Bitcoin' }] })).toBeNull();
    expect(decodeCoinNames({ source: 'coingecko', fetchedAt: FETCHED_AT, names: NAMES })).toEqual(NAMES);
  });

  it('T-061e review r1: keeps "not set up" or a failure for the visit, or until the wait the server asked for, so Home asks once', async () => {
    let clock = NOW;
    const keeping = (fetchImpl: typeof fetch, online = true) => createKairosCoinNames(createKairosApiClient({ baseUrl: BASE, fetchImpl }), { store: null, now: () => clock, isOnline: () => online });
    const notSetUp = vi.fn<typeof fetch>(async () => failAnswer('not-set-up', 503));
    const withoutKey = keeping(notSetUp);
    expect(await withoutKey.coinNames()).toMatchObject({ ok: false, why: 'not-set-up' });
    clock += 2 * HOUR;
    expect(await withoutKey.coinNames()).toMatchObject({ ok: false, why: 'not-set-up' });
    expect(notSetUp).toHaveBeenCalledTimes(1);
    // A rate-limited answer is kept until its wait has passed, then asked again.
    const limited = vi.fn<typeof fetch>(async () => failAnswer('rate-limited', 429, 60));
    const busy = keeping(limited);
    expect(await busy.coinNames()).toMatchObject({ ok: false, why: 'busy', retryAfterSeconds: 60 });
    clock += 59_000;
    await busy.coinNames();
    expect(limited).toHaveBeenCalledTimes(1);
    clock += 1_000;
    await busy.coinNames();
    expect(limited).toHaveBeenCalledTimes(2);
    // Offline reached no server: asked again when it is.
    const offline = vi.fn<typeof fetch>(async () => { throw new TypeError('Failed to fetch'); });
    const lost = keeping(offline, false);
    expect(await lost.coinNames()).toMatchObject({ ok: false, why: 'offline' });
    await lost.coinNames();
    expect(offline).toHaveBeenCalledTimes(2);
  });

  it('a caller\'s abort ends only its own wait', async () => {
    let release: (response: Response) => void = () => undefined;
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>(resolve => { release = resolve; }));
    const port = names(fetchImpl);
    const controller = new AbortController();
    const leaving = port.coinNames({ signal: controller.signal });
    const staying = port.coinNames();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    controller.abort();
    expect(await leaving).toMatchObject({ ok: false });
    release(namesAnswer());
    expect(await staying).toEqual({ ok: true, names: asMap });
  });
});

