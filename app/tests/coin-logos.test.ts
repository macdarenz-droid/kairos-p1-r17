import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseMarketDataPorts, createHomeMarket } from '../src/app/marketDataPorts';
import { createRequestBudget, HOME_SHARED_READS_PER_MINUTE } from '../src/application/online/requestBudget';
import type { MarketCandleHistoryPort } from '../src/services/market-data/MarketCandleHistoryPort';
import {
  browserCoinLogoCache, COIN_LOGO_ENTRY_PREFIX, COIN_LOGO_KEEP_MS, COIN_LOGO_MARKS_ENTRY, COIN_LOGO_NONE_KEEP_MS, COIN_LOGOS_CACHE_NAME, COIN_LOGOS_FAILURE_KEEP_MS,
  COIN_LOGOS_NOT_SET_UP_KEEP_MS, createCoinLogoKeeper, type CoinLogoAsk,
} from '../src/application/markets/coinLogos';
import { parseCoinLogoAddress, type CoinLogoAddress } from '../src/domain/market/coinLogo';
import { createKairosApiClient } from '../src/services/kairos-api/kairosApi';
import { createKairosCoinLogos } from '../src/services/kairos-api/marketApi';
import type { MarketDataPortSet } from '../src/app/marketDataPorts';

const BASE = 'https://api.kairos.test';
const NOW = Date.parse('2026-10-25T08:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const FETCHED_AT = '2026-10-25T07:59:58.000Z';

const base64 = (bytes: readonly number[] | Uint8Array) => btoa(String.fromCharCode(...bytes));
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1];
const WEBP = [0x52, 0x49, 0x46, 0x46, 26, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20];
const SVG = [...new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0x2c];
const BTC_LOGO = `data:image/png;base64,${base64(PNG)}`;
const ETH_LOGO = `data:image/jpeg;base64,${base64(JPEG)}`;
const SOL_LOGO = `data:image/webp;base64,${base64(WEBP)}`;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const okAnswer = (data: unknown) => json({ apiVersion: 1, ok: true, data });
const failAnswer = (reason: string, status: number, retryAfter: number | null = null) => json({ apiVersion: 1, ok: false, error: 'unavailable', reason, retryAfter }, status);
const logosAnswer = (logos: readonly { symbol: string; image: unknown }[]) => okAnswer({ source: 'coingecko', fetchedAt: FETCHED_AT, logos });
const client = (fetchImpl: typeof fetch) => createKairosCoinLogos(createKairosApiClient({ baseUrl: BASE, fetchImpl }), { isOnline: () => true });
const hostsAsked = (fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>) => fetchImpl.mock.calls.map(([url]) => new URL(String(url)).host);

/**
 * Cache Storage as a browser has it, by cache name, with each entry's text and headers; `refuse` makes those calls fail,
 * as a full or blocked store does. `read` lists the entries whose text was read, `written` those written.
 */
function fakeCaches(refuse: 'open' | 'put' | 'match' | null = null) {
  type Entry = { text: string; headers: [string, string][] };
  const stores = new Map<string, Map<string, Entry>>();
  const read: string[] = [];
  const written: string[] = [];
  const storage = {
    stores, read, written,
    async open(name: string) {
      if (refuse === 'open') throw new DOMException('refused', 'SecurityError');
      const entries = stores.get(name) ?? new Map<string, Entry>();
      stores.set(name, entries);
      const key = (request: RequestInfo | URL) => new URL(String(request instanceof Request ? request.url : request), 'https://kairos.test').pathname;
      return {
        async match(request: RequestInfo | URL) {
          if (refuse === 'match') throw new DOMException('refused', 'UnknownError');
          const path = key(request);
          const entry = entries.get(path);
          if (entry === undefined) return undefined;
          const response = new Response(entry.text, { headers: entry.headers });
          const text = response.text.bind(response);
          return Object.assign(response, { text: () => { read.push(path); return text(); } });
        },
        async put(request: RequestInfo | URL, response: Response) {
          if (refuse === 'put') throw new DOMException('full', 'QuotaExceededError');
          written.push(key(request));
          entries.set(key(request), { text: await response.text(), headers: [...response.headers.entries()] });
        },
        async delete(request: RequestInfo | URL) {
          return entries.delete(key(request));
        },
        async keys() {
          if (refuse === 'match') throw new DOMException('refused', 'UnknownError');
          return [...entries.keys()].map(path => new Request(`https://kairos.test${path}`));
        },
      };
    },
  };
  vi.stubGlobal('caches', storage);
  return storage;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('T-061f the coin logos client (D272)', () => {
  it('asks the Kairos server once for the coins, A→Z, and takes PNG, JPEG and WebP data addresses only', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => logosAnswer([{ symbol: 'BTC', image: BTC_LOGO }, { symbol: 'ETH', image: ETH_LOGO }, { symbol: 'SOL', image: SOL_LOGO }]));
    const result = await client(fetchImpl).coinLogos(['SOL', 'BTC', 'ETH', 'BTC', 'pepe', 'X-Y', 'PEPE']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe('https://api.kairos.test/market/coin-logos?symbols=BTC%2CETH%2CPEPE%2CSOL');
    // At most 10 coins a request (the server's limit): the first 10 named.
    const many = vi.fn<typeof fetch>(async () => logosAnswer([]));
    await client(many).coinLogos(['L', 'K', 'J', 'I', 'H', 'G', 'F', 'E', 'D', 'C', 'B', 'A']);
    expect(String(many.mock.calls[0]![0])).toBe('https://api.kairos.test/market/coin-logos?symbols=C%2CD%2CE%2CF%2CG%2CH%2CI%2CJ%2CK%2CL');
    expect(result).toEqual({ ok: true, logos: new Map([['BTC', BTC_LOGO], ['ETH', ETH_LOGO], ['SOL', SOL_LOGO]]) });
    expect(hostsAsked(fetchImpl)).toEqual(['api.kairos.test']);
  });

  it('refuses the whole answer when a logo is not a PNG, JPEG or WebP data address, is over 48 KB, or is not for a coin asked', async () => {
    const big = new Uint8Array(40_000);
    big.set(PNG);
    const faults: [string, unknown][] = [
      ['an SVG', `data:image/svg+xml;base64,${base64(SVG)}`],
      ['SVG bytes called PNG', `data:image/png;base64,${base64(SVG)}`],
      ['GIF bytes called PNG', `data:image/png;base64,${base64(GIF)}`],
      ['JPEG bytes called PNG', `data:image/png;base64,${base64(JPEG)}`],
      ['a web address', 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png'],
      ['not base64', 'data:image/png;base64,<script>'],
      ['over 48 KB', `data:image/png;base64,${base64(big)}`],
      ['a number', 7],
    ];
    for (const [label, image] of faults) {
      const result = await client(vi.fn<typeof fetch>(async () => logosAnswer([{ symbol: 'BTC', image }]))).coinLogos(['BTC']);
      expect(result, label).toEqual({ ok: false, reason: 'unavailable', why: 'unreadable', retryAfterSeconds: null });
    }
    for (const [label, logos] of [
      ['a coin not asked', [{ symbol: 'ETH', image: ETH_LOGO }]],
      ['twice', [{ symbol: 'BTC', image: BTC_LOGO }, { symbol: 'BTC', image: BTC_LOGO }]],
    ] as const) {
      expect(await client(vi.fn<typeof fetch>(async () => logosAnswer(logos))).coinLogos(['BTC']), label).toMatchObject({ ok: false, why: 'unreadable' });
    }
    expect(await client(vi.fn<typeof fetch>(async () => okAnswer({ source: 'binance-spot', fetchedAt: FETCHED_AT, logos: [] }))).coinLogos(['BTC'])).toMatchObject({ ok: false, why: 'unreadable' });
    // The rule on its own: up to 48 KB (49,152 characters) of text passes, more does not.
    const sized = (length: number) => { const bytes = new Uint8Array(length); bytes.set(PNG); return `data:image/png;base64,${base64(bytes)}`; };
    expect(sized(36_846)).toHaveLength(49_150);
    expect(parseCoinLogoAddress(sized(36_846))).toBe(sized(36_846));
    expect(sized(36_849)).toHaveLength(49_154);
    expect(parseCoinLogoAddress(sized(36_849))).toBeNull();
  });

  it('says what a server failure means, asks nothing for no coin, and is "not set up" straight to Binance, with no request', async () => {
    expect(await client(vi.fn<typeof fetch>(async () => failAnswer('not-set-up', 503))).coinLogos(['BTC'])).toMatchObject({ ok: false, why: 'not-set-up' });
    expect(await client(vi.fn<typeof fetch>(async () => failAnswer('rate-limited', 429, 60))).coinLogos(['BTC'])).toEqual({ ok: false, reason: 'unavailable', why: 'busy', retryAfterSeconds: 60 });
    const quiet = vi.fn<typeof fetch>();
    expect(await client(quiet).coinLogos(['btc', '币安'])).toEqual({ ok: true, logos: new Map() });
    expect(quiet).not.toHaveBeenCalled();
    const global = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', global);
    const direct = chooseMarketDataPorts({ baseUrl: null, direct: {} as MarketDataPortSet });
    expect(await direct.coinLogos.coinLogos(['BTC'])).toMatchObject({ ok: false, why: 'not-set-up' });
    expect(global).not.toHaveBeenCalled();
  });
});

describe('T-061f the logos kept on this device (D272)', () => {
  const answered = (logos: Readonly<Record<string, string>>): CoinLogoAsk => vi.fn<CoinLogoAsk>(async (coins) => ({
    ok: true as const, logos: new Map(coins.flatMap((coin) => (logos[coin] === undefined ? [] : [[coin, logos[coin] as CoinLogoAddress] as const]))),
  }));
  const ALL = { BTC: BTC_LOGO, ETH: ETH_LOGO, SOL: SOL_LOGO };
  const visit = (ask: CoinLogoAsk, at: number | (() => number) = NOW) => createCoinLogoKeeper({ ask, budget: null, openCache: browserCoinLogoCache(), now: typeof at === 'number' ? () => at : at });

  it('keeps each logo 30 days in Cache Storage "kairos-coin-logos-v1", so a later visit asks nothing, and asks again after 30 days', async () => {
    const storage = fakeCaches();
    const first = answered(ALL);
    expect(await visit(first).logos(['ETH', 'BTC'])).toEqual(new Map([['BTC', BTC_LOGO], ['ETH', ETH_LOGO]]));
    expect(first).toHaveBeenCalledTimes(1);
    expect(vi.mocked(first).mock.calls[0]![0]).toEqual(['BTC', 'ETH']);
    expect([...storage.stores.keys()]).toEqual([COIN_LOGOS_CACHE_NAME]);
    expect(COIN_LOGOS_CACHE_NAME).toBe('kairos-coin-logos-v1');

    const later = answered(ALL);
    expect(await visit(later, NOW + COIN_LOGO_KEEP_MS - 1).logos(['BTC', 'ETH'])).toEqual(new Map([['BTC', BTC_LOGO], ['ETH', ETH_LOGO]]));
    expect(later).not.toHaveBeenCalled();

    const expired = answered(ALL);
    expect(await visit(expired, NOW + COIN_LOGO_KEEP_MS + 1).logos(['BTC', 'ETH'])).toEqual(new Map([['BTC', BTC_LOGO], ['ETH', ETH_LOGO]]));
    expect(vi.mocked(expired).mock.calls.map(([coins]) => coins)).toEqual([['BTC', 'ETH']]);
  });

  it('asks only for the coins it has no logo for, 10 a request and 30 a call, the caller\'s first coins first; one the server has none for is asked again after 7 days', async () => {
    fakeCaches();
    await visit(answered({ BTC: BTC_LOGO })).logos(['BTC']);
    const ask = answered(ALL);
    const keeper = visit(ask);
    const coins = ['BTC', 'ETH', 'SOL', 'DOGE', ...Array.from({ length: 30 }, (_, index) => `C${String(index).padStart(2, '0')}`)];
    expect(await keeper.logos(coins)).toEqual(new Map([['BTC', BTC_LOGO], ['ETH', ETH_LOGO], ['SOL', SOL_LOGO]]));
    // BTC is kept; the next 30 the caller names, in three requests of 10, each A→Z.
    const first = ['ETH', 'SOL', 'DOGE', ...coins.slice(4, 31)];
    const ascending = (list: readonly string[]) => [...list].sort();
    expect(vi.mocked(ask).mock.calls.map(([list]) => list)).toEqual([ascending(first.slice(0, 10)), ascending(first.slice(10, 20)), ascending(first.slice(20, 30))]);
    // The next call asks only for the coins still without an answer; then nothing is left to ask.
    await keeper.logos(coins);
    expect(vi.mocked(ask).mock.calls[3]![0]).toEqual(['C27', 'C28', 'C29']);
    await keeper.logos(coins);
    expect(ask).toHaveBeenCalledTimes(4);

    // DOGE had no logo: the next visit does not ask within 7 days (review r1: a day cost the news its place daily), and asks after.
    const nextVisit = answered(ALL);
    await visit(nextVisit, NOW + 6 * DAY).logos(['BTC', 'DOGE']);
    await visit(nextVisit, NOW + COIN_LOGO_NONE_KEEP_MS - 1).logos(['BTC', 'DOGE']);
    expect(nextVisit).not.toHaveBeenCalled();
    const dayLater = answered({ ...ALL, DOGE: BTC_LOGO });
    expect(await visit(dayLater, NOW + COIN_LOGO_NONE_KEEP_MS + 1).logos(['BTC', 'DOGE'])).toEqual(new Map([['BTC', BTC_LOGO], ['DOGE', BTC_LOGO]]));
    expect(vi.mocked(dayLater).mock.calls.map(([list]) => list)).toEqual([['DOGE']]);
  });

  it('keeps no logo from a failed request; as the coin names, it asks again after 10 minutes (or the server\'s wait), at once after offline, and never this visit after "not set up"', async () => {
    fakeCaches();
    let at = NOW;
    const failing = (why: 'source-down' | 'busy' | 'offline' | 'not-set-up', retryAfterSeconds: number | null = null): CoinLogoAsk =>
      vi.fn<CoinLogoAsk>(async () => ({ ok: false, reason: 'unavailable', why, retryAfterSeconds }));
    const down = failing('source-down', 30);
    const keeper = visit(down, () => at);
    expect(await keeper.logos(['BTC'])).toEqual(new Map());
    at = NOW + COIN_LOGOS_FAILURE_KEEP_MS - 1;
    expect(await keeper.logos(['BTC', 'ETH'])).toEqual(new Map());
    expect(down).toHaveBeenCalledTimes(1);
    at = NOW + COIN_LOGOS_FAILURE_KEEP_MS;
    await keeper.logos(['BTC']);
    expect(down).toHaveBeenCalledTimes(2);
    // Nothing was kept: the next visit asks.
    expect(await visit(answered(ALL)).logos(['BTC'])).toEqual(new Map([['BTC', BTC_LOGO]]));

    // The server's wait, when longer than 10 minutes.
    fakeCaches();
    at = NOW;
    const busy = failing('busy', 900);
    const waiting = visit(busy, () => at);
    await waiting.logos(['BTC']);
    at = NOW + 899_000;
    await waiting.logos(['BTC']);
    expect(busy).toHaveBeenCalledTimes(1);
    at = NOW + 900_000;
    await waiting.logos(['BTC']);
    expect(busy).toHaveBeenCalledTimes(2);

    // Offline: no server was reached, so the next call asks again.
    const offline = failing('offline');
    const away = visit(offline);
    await away.logos(['BTC']);
    await away.logos(['BTC']);
    expect(offline).toHaveBeenCalledTimes(2);

    const notSetUp = failing('not-set-up');
    const quiet = visit(notSetUp, () => at);
    await quiet.logos(['XRP']);
    at += 365 * 24 * 60 * 60 * 1000;
    await quiet.logos(['ADA']);
    expect(notSetUp).toHaveBeenCalledTimes(1);
  });

  it('with a refused or missing cache the logos still show this visit, and the next visit asks again', async () => {
    for (const refuse of ['open', 'put', 'match'] as const) {
      fakeCaches(refuse);
      const ask = answered(ALL);
      const keeper = visit(ask);
      expect(await keeper.logos(['BTC']), refuse).toEqual(new Map([['BTC', BTC_LOGO]]));
      expect(await keeper.kept(['BTC']), refuse).toEqual(new Map([['BTC', BTC_LOGO]]));
      const again = answered(ALL);
      await visit(again).logos(['BTC']);
      expect(again, refuse).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    }
    // No Cache Storage at all (an old browser, a test page).
    expect(browserCoinLogoCache()).toBeNull();
    const ask = answered(ALL);
    expect(await createCoinLogoKeeper({ ask, budget: null, openCache: null, now: () => NOW }).logos(['ETH'])).toEqual(new Map([['ETH', ETH_LOGO]]));
  });

  it('reads a bad kept entry as missing, and kept() never asks', async () => {
    const storage = fakeCaches();
    await visit(answered(ALL)).logos(['BTC', 'ETH']);
    const entries = storage.stores.get(COIN_LOGOS_CACHE_NAME)!;
    entries.get(`${COIN_LOGO_ENTRY_PREFIX}BTC`)!.text = `data:image/svg+xml;base64,${base64(SVG)}`;
    entries.get(`${COIN_LOGO_ENTRY_PREFIX}ETH`)!.headers = [['x-kairos-kept-at', 'yesterday']];
    const ask = answered(ALL);
    const keeper = visit(ask);
    expect(await keeper.kept(['BTC', 'ETH'])).toEqual(new Map());
    expect(ask).not.toHaveBeenCalled();
    expect(await keeper.logos(['BTC', 'ETH'])).toEqual(new Map([['BTC', BTC_LOGO], ['ETH', ETH_LOGO]]));
    expect(vi.mocked(ask).mock.calls.map(([coins]) => coins)).toEqual([['BTC', 'ETH']]);
    entries.set(COIN_LOGO_MARKS_ENTRY, { text: 'not json', headers: [] });
    entries.delete(`${COIN_LOGO_ENTRY_PREFIX}BTC`);
    const after = answered(ALL);
    expect(await visit(after).logos(['BTC', 'ETH'])).toEqual(new Map([['BTC', BTC_LOGO], ['ETH', ETH_LOGO]]));
    expect(vi.mocked(after).mock.calls.map(([coins]) => coins)).toEqual([['BTC']]);
  });

  it('review r1: one entry per coin, read only for the coins shown; a request writes only its own coins; old entries go once a visit', async () => {
    const storage = fakeCaches();
    await visit(answered(ALL)).logos(['BTC', 'ETH', 'SOL', 'DOGE']);
    const entries = storage.stores.get(COIN_LOGOS_CACHE_NAME)!;
    expect([...entries.keys()].sort()).toEqual([COIN_LOGO_MARKS_ENTRY, ...['BTC', 'ETH', 'SOL'].map(coin => `${COIN_LOGO_ENTRY_PREFIX}${coin}`)].sort());
    expect(entries.get(`${COIN_LOGO_ENTRY_PREFIX}BTC`)!.text).toBe(BTC_LOGO);
    // Another visit shows BTC only: only BTC's logo is read.
    storage.read.length = 0;
    expect(await visit(answered(ALL)).kept(['BTC'])).toEqual(new Map([['BTC', BTC_LOGO]]));
    expect(storage.read).toEqual([`${COIN_LOGO_ENTRY_PREFIX}BTC`]);
    // A new coin: one request for it; only its mark is written, no logo rewritten.
    storage.written.length = 0;
    const ask = answered(ALL);
    await visit(ask, NOW + 1_000).logos(['BTC', 'ETH', 'XRP']);
    expect(vi.mocked(ask).mock.calls.map(([coins]) => coins)).toEqual([['XRP']]);
    expect(storage.written).toEqual([COIN_LOGO_MARKS_ENTRY]);
    // An entry of an older shape, and a logo past 30 days, are deleted by the next visit that asks.
    entries.set('/kairos-coin-logos/kept', { text: '{"logos":{}}', headers: [] });
    await visit(answered(ALL), NOW + COIN_LOGO_KEEP_MS + 1).logos(['BTC']);
    expect(entries.has('/kairos-coin-logos/kept')).toBe(false);
    expect(entries.has(`${COIN_LOGO_ENTRY_PREFIX}ETH`)).toBe(false);
    expect(entries.has(`${COIN_LOGO_ENTRY_PREFIX}SOL`)).toBe(false);
    // BTC was asked again and kept anew.
    expect(entries.get(`${COIN_LOGO_ENTRY_PREFIX}BTC`)!.headers).toContainEqual(['x-kairos-kept-at', String(NOW + COIN_LOGO_KEEP_MS + 1)]);
  });

  it('review r1: keeps "not set up" on the device for a day, so the next load asks nothing and leaves Home\'s budget free; a good answer clears it', async () => {
    fakeCaches();
    const notSetUp: CoinLogoAsk = vi.fn<CoinLogoAsk>(async () => ({ ok: false, reason: 'unavailable', why: 'not-set-up', retryAfterSeconds: null }));
    const settleAll = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
    await createCoinLogoKeeper({ ask: notSetUp, budget: createRequestBudget(HOME_SHARED_READS_PER_MINUTE), openCache: browserCoinLogoCache(), now: () => NOW }).logos(['BTC', 'ETH']);
    expect(notSetUp).toHaveBeenCalledTimes(1);
    // The next page load, the same day: no request, and the news's 9 fit at once.
    const budget = createRequestBudget(HOME_SHARED_READS_PER_MINUTE);
    const nextLoad = vi.fn<CoinLogoAsk>(async () => ({ ok: false, reason: 'unavailable', why: 'not-set-up', retryAfterSeconds: null }));
    await createCoinLogoKeeper({ ask: nextLoad, budget, openCache: browserCoinLogoCache(), now: () => NOW + COIN_LOGOS_NOT_SET_UP_KEEP_MS - 1 }).logos(['BTC', 'ETH', 'SOL']);
    expect(nextLoad).not.toHaveBeenCalled();
    let newsFits = false;
    void budget.take(HOME_SHARED_READS_PER_MINUTE).then(ok => { newsFits = ok; });
    await settleAll();
    expect(newsFits).toBe(true);
    // A day later it asks again; the owner has set up the key now, so the mark is cleared and a new coin is asked at once.
    const dayLater = answered(ALL);
    await visit(dayLater, NOW + COIN_LOGOS_NOT_SET_UP_KEEP_MS).logos(['BTC']);
    expect(dayLater).toHaveBeenCalledTimes(1);
    const after = answered(ALL);
    await visit(after, NOW + COIN_LOGOS_NOT_SET_UP_KEEP_MS + 60_000).logos(['BTC', 'SOL']);
    expect(vi.mocked(after).mock.calls.map(([coins]) => coins)).toEqual([['SOL']]);
  });
});

describe('T-061f the logo request takes one place in Home\'s shared request budget (T-061e review r1)', () => {
  const history: MarketCandleHistoryPort = { acquireHistory: vi.fn<MarketCandleHistoryPort['acquireHistory']>(async request => ({ ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request, observedAt: FETCHED_AT, candles: [] } })) };
  const coinNames = { coinNames: async () => ({ ok: true as const, names: new Map<string, string>() }) };
  const BTC_ONLY = async () => ({ ok: true as const, logos: new Map([['BTC', BTC_LOGO as CoinLogoAddress]]) });
  const settle = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

  it('through the Kairos server it waits while the news\'s 9 fill the minute, counts as one, and is never sent when given up first', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const coinLogos = { coinLogos: vi.fn(BTC_ONLY) };
    const market = createHomeMarket({ route: 'server', moves: { acquireMoves: vi.fn() }, history, coinNames, coinLogos }, null);
    // The news refresh took the whole budget a moment ago.
    expect(await market.budget!.take(HOME_SHARED_READS_PER_MINUTE)).toBe(true);
    // Given up while waiting: nothing is sent or counted, and the coin is asked on the next call.
    const leaving = new AbortController();
    const left = market.logos!.logos(['BTC'], { signal: leaving.signal });
    await settle();
    leaving.abort();
    expect(await left).toEqual(new Map());
    const waiting = market.logos!.logos(['BTC']);
    await settle();
    expect(coinLogos.coinLogos).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await waiting).toEqual(new Map([['BTC', BTC_LOGO]]));
    expect(coinLogos.coinLogos).toHaveBeenCalledTimes(1);
    // It counted as one of the 9: the news's next 9 wait until the logo request leaves the minute.
    let nine = false;
    void market.budget!.take(HOME_SHARED_READS_PER_MINUTE).then(ok => { nine = ok; });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(nine).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(nine).toBe(true);
  });

  it('a budget of its own (a test) also holds it: one place, given back when the screen closes before it is sent', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    fakeCaches();
    const budget = createRequestBudget(1);
    expect(await budget.take(1)).toBe(true);
    const ask = vi.fn<CoinLogoAsk>(BTC_ONLY);
    const keeper = createCoinLogoKeeper({ ask, budget, openCache: browserCoinLogoCache(), now: () => Date.now() });
    const leaving = new AbortController();
    const left = keeper.logos(['BTC'], { signal: leaving.signal });
    await settle();
    leaving.abort();
    expect(await left).toEqual(new Map());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await keeper.logos(['BTC'])).toEqual(new Map([['BTC', BTC_LOGO]]));
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('straight to Binance (no Kairos server) there is no budget and no logo: "not set up", with no request', async () => {
    const global = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', global);
    const ports = chooseMarketDataPorts({ baseUrl: null, direct: { history, metadata: {} as MarketDataPortSet['metadata'], baseline: {} as MarketDataPortSet['baseline'] } });
    const market = createHomeMarket(ports, null);
    expect(await market.logos!.logos(['BTC', 'ETH'])).toEqual(new Map());
    expect(await market.logos!.logos(['BTC', 'ETH'])).toEqual(new Map());
    expect(global).not.toHaveBeenCalled();
  });
});
