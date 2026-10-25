import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env as workerEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryCache } from '../src/cache';
import type { KairosApiEnv } from '../src/env';
import { base64OfBytes, coinLogoDataAddress, decodeCoinGeckoMarkets } from '../src/market/coinGecko';
import { handleKairosApiRequest } from '../src/router';
import { KAIROS_API_ROUTES } from '../src/routes';
import { createUpstreamBytesFetch, UpstreamHostRefused } from '../src/upstream';

const NOW = Date.parse('2026-10-25T08:00:00Z');
const APP = 'https://kairos-p1-r17.pages.dev';
const LIST_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1';
/** The one copy of CoinGecko's list both coin routes read (KV), and the names route's own copy. */
const LIST_KEY = 'coingecko-coins:v1:';
const NAMES_KEY = 'market-coin-names:v1:';

/** A logo address as CoinGecko's /coins/markets sends it (checked 2026-10-25). */
const logo = (id: number, file: string) => `https://coin-images.coingecko.com/coins/images/${id}/large/${file}?1696501400`;
const coin = (symbol: string, name: string, image: unknown) => ({ id: name.toLowerCase(), symbol, name, image, current_price: 1, market_cap: 1 });
const COINS = [
  coin('btc', 'Bitcoin', logo(1, 'bitcoin.png')),
  coin('eth', 'Ethereum', logo(279, 'ethereum.png')),
  coin('sol', 'Solana', logo(4128, 'solana.jpg')),
  coin('xrp', 'XRP', logo(44, 'xrp-symbol-white-128.webp')),
  coin('doge', 'Dogecoin', logo(5, 'dogecoin.png')),
];

// The first bytes of each kind of image (the rest does not matter to the check).
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 26, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const base64 = (bytes: Uint8Array) => { let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text); };

type Body = Uint8Array | string;
const image = (bytes: Body, status = 200, headers: Record<string, string> = {}) => () => new Response(bytes, { status, headers: { 'content-type': 'image/png', ...headers } });

/** CoinGecko: the list from its API host, each logo from its image host, anything else refused by the test. */
function coinGecko(logos: Readonly<Record<string, () => Response>>, list: unknown = COINS) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === LIST_URL || url.startsWith('https://pro-api.coingecko.com/')) return new Response(JSON.stringify(list), { headers: { 'content-type': 'application/json' } });
    const answer = logos[url];
    if (answer === undefined) throw new Error(`not asked for in this test: ${url}`);
    return answer();
  });
}
const DEFAULT_LOGOS = {
  [logo(1, 'bitcoin.png')]: image(PNG),
  [logo(279, 'ethereum.png')]: image(PNG),
  [logo(4128, 'solana.jpg')]: image(JPEG, 200, { 'content-type': 'image/jpeg' }),
  [logo(44, 'xrp-symbol-white-128.webp')]: image(WEBP, 200, { 'content-type': 'image/webp' }),
  [logo(5, 'dogecoin.png')]: image(PNG),
};

const limiter = () => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
const env = (overrides: Partial<KairosApiEnv> = {}): KairosApiEnv => ({
  KAIROS_APP_ORIGINS: APP, KAIROS_API_ANONYMOUS_LIMITER: limiter(), KAIROS_API_DEVICE_LIMITER: limiter(), KAIROS_API_CACHE: workerEnv.KAIROS_API_CACHE,
  COIN_DATA_API_KEY: 'test-key', ...overrides,
});
async function call(path: string, fetchImpl: typeof fetch, overrides: Partial<KairosApiEnv> = {}) {
  const ctx = createExecutionContext();
  const response = await handleKairosApiRequest(new Request(`https://kairos-api.example.workers.dev${path}`, { headers: { origin: APP } }), env(overrides), ctx, { routes: KAIROS_API_ROUTES, fetchImpl, now: () => new Date(NOW) });
  await waitOnExecutionContext(ctx);
  return response;
}
type LogosBody = { data: { source: string; fetchedAt: string; logos: { symbol: string; image: string }[] } };
const logosOf = async (response: Response) => ((await response.json()) as LogosBody).data.logos;
const asked = (fetchImpl: ReturnType<typeof coinGecko>) => fetchImpl.mock.calls.map(([url]) => String(url));

describe('T-061f the logo address CoinGecko sends (D272)', () => {
  it('keeps a unique coin\'s logo only from coin-images.coingecko.com, at /coins/images/<digits>/large/<name>.png|jpg|jpeg|webp', () => {
    const decoded = decodeCoinGeckoMarkets(JSON.stringify([
      coin('btc', 'Bitcoin', logo(1, 'bitcoin.png')),
      coin('sol', 'Solana', logo(4128, 'solana.jpeg')),
      coin('xrp', 'XRP', 'https://coin-images.coingecko.com/coins/images/44/large/xrp.webp'),
      coin('svg', 'Svgcoin', logo(9, 'svgcoin.svg')),
      coin('gif', 'Gifcoin', logo(10, 'gifcoin.gif')),
      coin('far', 'Faraway', 'https://example.com/coins/images/11/large/far.png'),
      coin('look', 'Lookalike', 'https://coin-images.coingecko.com.example.com/coins/images/12/large/look.png'),
      coin('http', 'Plain', 'http://coin-images.coingecko.com/coins/images/13/large/plain.png'),
      coin('user', 'Userinfo', 'https://someone@coin-images.coingecko.com/coins/images/14/large/user.png'),
      coin('port', 'Port', 'https://coin-images.coingecko.com:8443/coins/images/15/large/port.png'),
      coin('small', 'Small', 'https://coin-images.coingecko.com/coins/images/16/small/small.png'),
      coin('word', 'Word', 'https://coin-images.coingecko.com/coins/images/x1/large/word.png'),
      coin('other', 'Other', 'https://coin-images.coingecko.com/assets/17/large/other.png'),
      coin('up', 'Up', 'https://coin-images.coingecko.com/coins/images/18/large/../../../up.png'),
      coin('frag', 'Fragment', 'https://coin-images.coingecko.com/coins/images/19/large/frag.png#x'),
      coin('num', 'Number', 7),
      // Two coins share this symbol: neither gets a name or a logo.
      coin('dup', 'Duplicate', logo(20, 'dup.png')), coin('dup', 'Duplicate Two', logo(21, 'dup-two.png')),
      // A bad name keeps the coin's logo.
      coin('ctl', 'Bell\u0007', logo(22, 'ctl.png')),
    ]));
    expect(decoded).toEqual([
      { symbol: 'BTC', name: 'Bitcoin', image: logo(1, 'bitcoin.png') },
      { symbol: 'CTL', image: logo(22, 'ctl.png') },
      { symbol: 'FAR', name: 'Faraway' },
      { symbol: 'FRAG', name: 'Fragment' },
      { symbol: 'GIF', name: 'Gifcoin' },
      { symbol: 'HTTP', name: 'Plain' },
      { symbol: 'LOOK', name: 'Lookalike' },
      { symbol: 'NUM', name: 'Number' },
      { symbol: 'OTHER', name: 'Other' },
      { symbol: 'PORT', name: 'Port' },
      { symbol: 'SMALL', name: 'Small' },
      { symbol: 'SOL', name: 'Solana', image: logo(4128, 'solana.jpeg') },
      { symbol: 'SVG', name: 'Svgcoin' },
      { symbol: 'UP', name: 'Up' },
      { symbol: 'USER', name: 'Userinfo' },
      { symbol: 'WORD', name: 'Word' },
      { symbol: 'XRP', name: 'XRP', image: 'https://coin-images.coingecko.com/coins/images/44/large/xrp.webp' },
    ]);
  });
});

describe('T-061f the logo\'s base64', () => {
  it('is the runtime\'s own, and the fallback for a runtime without it writes the same text, padding and all', () => {
    // workerd has Uint8Array.prototype.toBase64 (no CPU spent in script); a runtime without it uses the fallback.
    expect(typeof (Uint8Array.prototype as unknown as { toBase64?: unknown }).toBase64).toBe('function');
    const random = new Uint8Array(32_768);
    crypto.getRandomValues(random);
    for (const bytes of [new Uint8Array(0), PNG.slice(0, 1), PNG.slice(0, 2), PNG.slice(0, 3), PNG.slice(0, 4), PNG, random]) {
      expect(base64OfBytes(bytes), String(bytes.length)).toBe(base64(bytes));
    }
    const logo = new Uint8Array(32_768);
    logo.set(PNG);
    expect(coinLogoDataAddress(logo)).toBe(`data:image/png;base64,${base64OfBytes(logo)}`);
  });
});

describe('T-061f the upstream byte reader', () => {
  it('reads bytes only from the route\'s hosts, sends only its own headers, never follows a redirect, and stops past its cap', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(PNG, { headers: { 'content-type': 'image/png' } }));
    const read = createUpstreamBytesFetch(['coin-images.coingecko.com'], fetchImpl);
    await expect(read('https://example.com/x.png', { accept: 'image/png, image/jpeg, image/webp', maxBytes: 100 })).rejects.toThrow(UpstreamHostRefused);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await read(logo(1, 'bitcoin.png'), { accept: 'image/png, image/jpeg, image/webp', maxBytes: 100 })).toMatchObject({ ok: true, status: 200, bytes: PNG });
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(init.redirect).toBe('manual');
    expect(new Headers(init.headers).get('accept')).toBe('image/png, image/jpeg, image/webp');
    expect(await read(logo(1, 'bitcoin.png'), { accept: 'image/png, image/jpeg, image/webp', maxBytes: 8 })).toMatchObject({ ok: false, failure: 'too-large' });
    const moved = createUpstreamBytesFetch(['coin-images.coingecko.com'], vi.fn<typeof fetch>(async () => new Response(null, { status: 301, headers: { location: 'https://example.com/' } })));
    expect(await moved(logo(1, 'bitcoin.png'), { accept: 'image/png, image/jpeg, image/webp', maxBytes: 100 })).toEqual({ ok: false, failure: 'redirect', status: 301 });
  });
});

describe('T-061f /market/coin-logos (D272)', () => {
  // The KV copy of the list lives through the file's tests; each starts without one.
  beforeEach(async () => {
    clearMemoryCache();
    const kv = workerEnv.KAIROS_API_CACHE as unknown as { delete(key: string): Promise<void> };
    await kv.delete(LIST_KEY);
    await kv.delete(NAMES_KEY);
  });

  it('reads the list, then each logo from the image host only, and answers PNG, JPEG and WebP as data addresses, kept 30 days', async () => {
    const fetchImpl = coinGecko(DEFAULT_LOGOS);
    const response = await call('/market/coin-logos?symbols=BTC,SOL,XRP', fetchImpl);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=2592000');
    expect(await response.clone().json()).toMatchObject({ data: { source: 'coingecko', fetchedAt: '2026-10-25T08:00:00.000Z' } });
    expect(await logosOf(response)).toEqual([
      { symbol: 'BTC', image: `data:image/png;base64,${base64(PNG)}` },
      { symbol: 'SOL', image: `data:image/jpeg;base64,${base64(JPEG)}` },
      { symbol: 'XRP', image: `data:image/webp;base64,${base64(WEBP)}` },
    ]);
    expect(asked(fetchImpl).sort()).toEqual([LIST_URL, logo(1, 'bitcoin.png'), logo(4128, 'solana.jpg'), logo(44, 'xrp-symbol-white-128.webp')].sort());
    // The key goes only to CoinGecko's API; the image host gets no key and nothing of the caller's.
    for (const [url, init] of fetchImpl.mock.calls) {
      const headers = new Headers(init?.headers);
      expect(headers.get('x-cg-demo-api-key'), String(url)).toBe(String(url) === LIST_URL ? 'test-key' : null);
      expect(headers.get('origin'), String(url)).toBeNull();
    }
    // Kept at the edge only (Workers Cache answers the same question): no memory copy, whose JSON text would cost CPU.
    // Asked again here, only the logos are read again: the list is the shared copy.
    const again = await call('/market/coin-logos?symbols=BTC,SOL,XRP', fetchImpl);
    expect(again.headers.get('x-kairos-cache')).toBe('miss');
    expect(asked(fetchImpl).filter((url) => url === LIST_URL)).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(7);
  });

  it('reads the list once for every question: another set of coins asks only for its logos', async () => {
    const fetchImpl = coinGecko(DEFAULT_LOGOS);
    await call('/market/coin-logos?symbols=BTC', fetchImpl);
    expect(await workerEnv.KAIROS_API_CACHE!.get(LIST_KEY, 'text')).toContain('coin-images.coingecko.com');
    // A new isolate: no memory copy, so the list comes from KV.
    clearMemoryCache();
    const response = await call('/market/coin-logos?symbols=DOGE,ETH', fetchImpl);
    expect((await logosOf(response)).map(({ symbol }) => symbol)).toEqual(['DOGE', 'ETH']);
    expect(asked(fetchImpl).filter((url) => url === LIST_URL)).toHaveLength(1);
  });

  it('uses the list the coin names read, so names and logos together read CoinGecko\'s list once', async () => {
    const fetchImpl = coinGecko(DEFAULT_LOGOS);
    const names = await (await call('/market/coin-names', fetchImpl)).text();
    expect((JSON.parse(names) as { data: { names: unknown[] } }).data.names).toContainEqual({ symbol: 'BTC', name: 'Bitcoin' });
    // The names answer still holds names only.
    expect(names).not.toContain('coin-images');
    const logos = await call('/market/coin-logos?symbols=BTC,ETH', fetchImpl);
    expect((await logosOf(logos)).map(({ symbol }) => symbol)).toEqual(['BTC', 'ETH']);
    expect(asked(fetchImpl).filter((url) => url === LIST_URL)).toHaveLength(1);
  });

  it('leaves out a coin with no logo on the list, an SVG or other non-image, a redirect, a logo over 32 KB, and keeps one of exactly 32 KB', async () => {
    const big = new Uint8Array(32_769);
    big.set(PNG);
    const fits = big.slice(0, 32_768);
    const list = [...COINS, coin('svg', 'Svgcoin', logo(30, 'svgcoin.png')), coin('html', 'Htmlcoin', logo(31, 'htmlcoin.png')), coin('moved', 'Moved', logo(32, 'moved.png')),
      coin('big', 'Bigcoin', logo(33, 'bigcoin.png')), coin('said', 'Saidbig', logo(34, 'saidbig.png')), coin('fit', 'Fitcoin', logo(35, 'fitcoin.png')), coin('none', 'Nologo', null)];
    const fetchImpl = coinGecko({
      ...DEFAULT_LOGOS,
      [logo(30, 'svgcoin.png')]: image(SVG),
      [logo(31, 'htmlcoin.png')]: image('<!doctype html><title>Not found</title>', 200, { 'content-type': 'text/html' }),
      [logo(32, 'moved.png')]: () => new Response(null, { status: 302, headers: { location: 'https://example.com/evil.png' } }),
      [logo(33, 'bigcoin.png')]: image(big),
      [logo(34, 'saidbig.png')]: image(PNG, 200, { 'content-length': '40000' }),
      [logo(35, 'fitcoin.png')]: image(fits),
    }, list);
    const response = await call('/market/coin-logos?symbols=BIG,BTC,FIT,HTML,MOVED,NONE,NOTLISTED,SAID,SVG', fetchImpl);
    expect(response.status).toBe(200);
    const logos = await logosOf(response);
    expect(logos.map(({ symbol }) => symbol)).toEqual(['BTC', 'FIT']);
    expect(logos[1]!.image).toBe(`data:image/png;base64,${base64(fits)}`);
    expect(asked(fetchImpl)).not.toContain('https://example.com/evil.png');
    // These answers last: they are kept the full 30 days.
    expect(response.headers.get('cache-control')).toBe('public, max-age=2592000');
  });

  it('keeps an answer only an hour when a logo could not be read (down or too slow), so the next visit gets it', async () => {
    const fetchImpl = coinGecko({ ...DEFAULT_LOGOS, [logo(279, 'ethereum.png')]: image('oops', 503, { 'content-type': 'text/plain' }) });
    const response = await call('/market/coin-logos?symbols=BTC,ETH', fetchImpl);
    expect((await logosOf(response)).map(({ symbol }) => symbol)).toEqual(['BTC']);
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('is not set up without the key, and never asks CoinGecko then', async () => {
    for (const overrides of [{ COIN_DATA_API_KEY: undefined }, { COIN_DATA_API_KEY: '' }]) {
      clearMemoryCache();
      const fetchImpl = coinGecko(DEFAULT_LOGOS);
      const response = await call('/market/coin-logos?symbols=BTC', fetchImpl, overrides);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ ok: false, reason: 'not-set-up' });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('refuses symbols that are not 1 to 10 coins of A–Z and 0–9, strictly ascending, before any request', async () => {
    const fetchImpl = coinGecko(DEFAULT_LOGOS);
    const eleven = Array.from({ length: 11 }, (_, index) => `C${String(index).padStart(2, '0')}`).join(',');
    const ten = Array.from({ length: 10 }, (_, index) => `C${String(index).padStart(2, '0')}`).join(',');
    for (const query of ['', 'symbols=', 'symbols=btc', 'symbols=BTC,,ETH', 'symbols=ETH,BTC', 'symbols=BTC,BTC', 'symbols=BTC-USD', `symbols=${'A'.repeat(21)}`, `symbols=${eleven}`, 'symbols=BTC&image=https://example.com/x.png']) {
      const response = await call(`/market/coin-logos?${query}`, fetchImpl);
      expect(response.status, query).toBe(400);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await call(`/market/coin-logos?symbols=${ten}`, fetchImpl)).status).toBe(200);
  });

  it('answers CoinGecko\'s list failures: a refused key, busy (its wait), down, and a list it cannot trust', async () => {
    const failing = (body: string, status: number, headers: Record<string, string> = {}) => vi.fn<typeof fetch>(async () => new Response(body, { status, headers: { 'content-type': 'application/json', ...headers } }));
    const cases: Array<[string, typeof fetch, number, string, number | null]> = [
      ['refused', failing('{"status":{"error_code":10002}}', 401), 451, 'source-refused', null],
      ['busy', failing('{}', 429, { 'retry-after': '7' }), 503, 'source-busy', 7],
      ['down', failing('oops', 500, { 'content-type': 'text/plain' }), 502, 'source-unavailable', 30],
      ['not a list', failing(JSON.stringify({ coins: COINS }), 200), 502, 'source-unavailable', 30],
    ];
    for (const [label, fetchImpl, status, reason, retryAfter] of cases) {
      clearMemoryCache();
      const response = await call('/market/coin-logos?symbols=BTC', fetchImpl);
      expect(response.status, label).toBe(status);
      expect(await response.json(), label).toMatchObject({ ok: false, reason, retryAfter });
    }
  });
});
