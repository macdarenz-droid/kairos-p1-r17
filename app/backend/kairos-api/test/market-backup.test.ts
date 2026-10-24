import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemoryCache } from '../src/cache';
import type { KairosApiEnv } from '../src/env';
import { handleKairosApiRequest } from '../src/router';
import { KAIROS_API_ROUTES } from '../src/routes';

const NOW = Date.parse('2026-09-26T02:00:00Z');
const APP = 'https://kairos-p1-r17.pages.dev';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const START = 1_704_067_200_000; // 2024-01-01T00:00:00Z
const END = START + 3 * HOUR - 1;

/** An OKX candle row: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm], all text. */
function okxRow(openMs: number, confirm = '1'): string[] {
  return [String(openMs), '42283.5', '42554.5', '42261.0', '42475.2', '12.5', '0.125', '531000.1', confirm];
}
const okxBody = (rows: unknown[], code = '0') => JSON.stringify({ code, msg: '', data: rows });

type Reply = { body: string; status?: number; headers?: Record<string, string> };
/** Answers Binance with `binance` (451 unless said otherwise) and OKX with `okx(url)`. */
function sources(okx: (url: URL) => Reply, binance: Reply = { body: '', status: 451 }) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const reply = url.hostname === 'www.okx.com' ? okx(url) : binance;
    return new Response(reply.body, { status: reply.status ?? 200, headers: { 'content-type': 'application/json', ...reply.headers } });
  });
}
const okxCalls = (fetchImpl: ReturnType<typeof sources>) => fetchImpl.mock.calls.map(([input]) => String(input)).filter((url) => url.startsWith('https://www.okx.com/'));

const limiter = () => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
/** backup null: the var is not set. */
async function call(path: string, fetchImpl: typeof fetch, backup: string | null = 'okx') {
  const env: KairosApiEnv = { KAIROS_APP_ORIGINS: APP, KAIROS_API_ANONYMOUS_LIMITER: limiter(), KAIROS_API_DEVICE_LIMITER: limiter(), KAIROS_MARKET_BACKUP: backup ?? undefined };
  const ctx = createExecutionContext();
  const response = await handleKairosApiRequest(new Request(`https://kairos-api.example.workers.dev${path}`, { headers: { origin: APP } }), env, ctx, { routes: KAIROS_API_ROUTES, fetchImpl, now: () => new Date(NOW) });
  await waitOnExecutionContext(ctx);
  return response;
}

interface CandlesData {
  source: { provider: string; market: string; symbol: string };
  backup: string | null;
  candles: Record<string, string>[];
  next: number | null;
}
const dataOf = async (response: Response) => ((await response.json()) as { data: CandlesData }).data;
const candles = (market: string, interval: string, extra = '&base=BTC&quote=USDT') =>
  `/market/candles?market=${market}&symbol=BTCUSDT&interval=${interval}&limit=3&start=${START}&end=${END}${extra}`;
const threeHours = () => ({ body: okxBody([okxRow(START + 2 * HOUR), okxRow(START + HOUR), okxRow(START)]) });

describe('the OKX backup for /market/candles', () => {
  beforeEach(() => clearMemoryCache());

  it('asks OKX for the spot pair when Binance refuses, answers its candles ascending and names OKX', async () => {
    const fetchImpl = sources(threeHours);
    const response = await call(candles('binance-spot', '1h'), fetchImpl);
    expect(okxCalls(fetchImpl)).toEqual([`https://www.okx.com/api/v5/market/history-candles?instId=BTC-USDT&bar=1H&limit=300&after=${END + 1}&before=${START - 1}`]);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=604800');
    const data = await dataOf(response);
    expect(data.source).toEqual({ provider: 'okx', market: 'spot', symbol: 'BTC-USDT' });
    expect(data.backup).toBe('refused');
    expect(data.candles.map((candle) => candle.openTime)).toEqual(['2024-01-01T00:00:00.000Z', '2024-01-01T01:00:00.000Z', '2024-01-01T02:00:00.000Z']);
    expect(data.candles[0]).toEqual({ openTime: '2024-01-01T00:00:00.000Z', closeTime: '2024-01-01T00:59:59.999Z', open: '42283.5', high: '42554.5', low: '42261.0', close: '42475.2', volume: '12.5' });
  });

  it('asks the USDT perpetual swap for a USDⓈ-M market, with volume in the base coin', async () => {
    const fetchImpl = sources(threeHours);
    const data = await dataOf(await call(candles('binance-usdm', '1h'), fetchImpl));
    expect(okxCalls(fetchImpl)[0]).toContain('instId=BTC-USDT-SWAP&bar=1H');
    expect(data.source).toEqual({ provider: 'okx', market: 'perpetual-swap', symbol: 'BTC-USDT-SWAP' });
    expect(data.candles[0].volume).toBe('0.125');
  });

  it('uses the UTC bars, and never asks OKX for 8h or 3d candles', async () => {
    for (const [interval, bar] of [['6h', '6Hutc'], ['1d', '1Dutc']]) {
      clearMemoryCache();
      const fetchImpl = sources(() => ({ body: okxBody([]) }));
      await call(candles('binance-spot', interval), fetchImpl);
      expect(okxCalls(fetchImpl)[0], interval).toContain(`bar=${bar}&`);
    }
    for (const interval of ['8h', '3d']) {
      const fetchImpl = sources(threeHours);
      const response = await call(candles('binance-spot', interval), fetchImpl);
      expect(response.status, interval).toBe(451);
      expect(okxCalls(fetchImpl), interval).toEqual([]);
    }
  });

  it('never asks OKX without base and quote, for a CJK base, or when the backup is off or not set', async () => {
    const cases: [string, string | null, number][] = [
      [candles('binance-spot', '1h', ''), 'okx', 451],
      // A CJK base is asked of Binance; OKX is asked for ASCII codes only.
      [`/market/candles?market=binance-spot&symbol=${encodeURIComponent('币安人生USDT')}&interval=1h&limit=3&base=${encodeURIComponent('币安人生')}&quote=USDT`, 'okx', 451],
      [candles('binance-spot', '1h'), 'off', 451],
      [candles('binance-spot', '1h'), null, 451],
    ];
    for (const [path, backup, status] of cases) {
      clearMemoryCache();
      const fetchImpl = sources(threeHours);
      const response = await call(path, fetchImpl, backup);
      expect(response.status, `${path} ${backup}`).toBe(status);
      expect(okxCalls(fetchImpl), `${path} ${backup}`).toEqual([]);
    }
  });

  it('says why Binance did not answer: busy or down; an unknown market never asks OKX', async () => {
    const busy = await dataOf(await call(candles('binance-spot', '1h'), sources(threeHours, { body: '', status: 429, headers: { 'retry-after': '5' } })));
    expect(busy.backup).toBe('busy');
    clearMemoryCache();
    const down = await dataOf(await call(candles('binance-spot', '1h'), sources(threeHours, { body: '', status: 503 })));
    expect(down.backup).toBe('down');
    clearMemoryCache();
    const fetchImpl = sources(threeHours, { body: '{"code":-1121,"msg":"Invalid symbol."}', status: 400 });
    const unknown = await call(candles('binance-spot', '1h'), fetchImpl);
    expect(unknown.status).toBe(404);
    expect(okxCalls(fetchImpl)).toEqual([]);
  });

  it("answers Binance's reason when OKX does not know the pair, is busy, or sends rows it cannot trust", async () => {
    const replies: [string, Reply][] = [
      ['51001', { body: okxBody([], '51001') }],
      ['429', { body: '{"code":"50011","msg":"Too Many Requests","data":[]}', status: 429 }],
      ['8 items', { body: okxBody([okxRow(START).slice(0, 8)]) }],
      ['a number price', { body: okxBody([[String(START), 42283.5, ...okxRow(START).slice(2)]]) }],
    ];
    for (const [label, reply] of replies) {
      clearMemoryCache();
      const fetchImpl = sources(() => reply);
      const response = await call(candles('binance-spot', '1h'), fetchImpl);
      expect(okxCalls(fetchImpl), label).toHaveLength(1);
      expect(response.status, label).toBe(451);
      expect(await response.json(), label).toMatchObject({ ok: false, reason: 'source-refused' });
    }
  });

  it('walks back four pages for the newest 1,000 one-minute candles', async () => {
    const fetchImpl = sources((url) => {
      const after = url.searchParams.get('after');
      const top = after === null ? NOW : Number(after);
      return { body: okxBody(Array.from({ length: 300 }, (_, index) => okxRow(top - (index + 1) * MINUTE))) };
    });
    const response = await call('/market/candles?market=binance-spot&symbol=BTCUSDT&interval=1m&limit=1000&base=BTC&quote=USDT', fetchImpl);
    const calls = okxCalls(fetchImpl);
    expect(calls).toHaveLength(4);
    expect(calls[0]).not.toContain('after=');
    expect(calls.slice(1).map((url) => new URL(url).searchParams.get('after'))).toEqual([NOW - 300 * MINUTE, NOW - 600 * MINUTE, NOW - 900 * MINUTE].map(String));
    const data = await dataOf(response);
    expect(data.candles).toHaveLength(1_000);
    expect(data.candles[0].openTime).toBe(new Date(NOW - 1_000 * MINUTE).toISOString());
    expect(data.candles[999].openTime).toBe(new Date(NOW - MINUTE).toISOString());
    expect(data.next).toBeNull();
  });

  it('keeps a window with a forming OKX candle for 10 seconds only', async () => {
    const fetchImpl = sources(() => ({ body: okxBody([okxRow(START + 2 * HOUR, '0'), okxRow(START + HOUR), okxRow(START)]) }));
    const response = await call(candles('binance-spot', '1h'), fetchImpl);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=10');
  });

  it('asks Binance for a market written in Chinese characters, with its base and quote', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([[START, '0.1', '0.2', '0.1', '0.2', '5', START + HOUR - 1, '1', 1, '1', '1', '0']]), { status: 200, headers: { 'content-type': 'application/json' } }));
    const response = await call(`/market/candles?market=binance-spot&symbol=${encodeURIComponent('币安人生USDT')}&interval=1h&limit=3&start=${START}&end=${END}&base=${encodeURIComponent('币安人生')}&quote=USDT`, fetchImpl);
    expect(response.status).toBe(200);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('https://data-api.binance.vision/api/v3/klines?symbol=%E5%B8%81%E5%AE%89%E4%BA%BA%E7%94%9FUSDT&');
    const data = await dataOf(response);
    expect(data.source).toEqual({ provider: 'binance', market: 'spot', symbol: '币安人生USDT' });
    expect(data.candles.map((candle) => candle.close)).toEqual(['0.2']);
  });

  it("answers Binance's reason when OKX has no candles for the window, and keeps nothing", async () => {
    const binanceReplies: [Reply, number, Record<string, unknown>][] = [
      [{ body: '', status: 451 }, 451, { ok: false, reason: 'source-refused' }],
      [{ body: '', status: 429, headers: { 'retry-after': '5' } }, 503, { ok: false, reason: 'source-busy', retryAfter: 5 }],
      [{ body: '', status: 503 }, 502, { ok: false, reason: 'source-unavailable' }],
    ];
    for (const [binance, status, body] of binanceReplies) {
      clearMemoryCache();
      const fetchImpl = sources(() => ({ body: okxBody([]) }), binance);
      for (const round of [1, 2]) {
        const response = await call(candles('binance-spot', '1h'), fetchImpl);
        expect(response.status, `${status} round ${round}`).toBe(status);
        expect(response.headers.get('cache-control') ?? '', `${status} round ${round}`).not.toContain('max-age=604800');
        expect(await response.json(), `${status} round ${round}`).toMatchObject(body);
      }
      expect(fetchImpl.mock.calls.length, `${status} asks again`).toBe(4);
      expect(okxCalls(fetchImpl), `${status} asks OKX again`).toHaveLength(2);
    }
  });

  it('walks back from start to its candle: the first candle opens at start, 300 one-minute candles in all', async () => {
    const begin = START + 17 * MINUTE;
    // OKX: rows strictly between `after` and `before`, newest first, at most 300.
    const okx = (url: URL) => {
      const after = Number(url.searchParams.get('after') ?? NOW + MINUTE);
      const before = Number(url.searchParams.get('before') ?? -1);
      const rows: string[][] = [];
      for (let open = Math.ceil(after / MINUTE) * MINUTE - MINUTE; open > before && rows.length < 300; open -= MINUTE) if (open < after) rows.push(okxRow(open));
      return { body: okxBody(rows) };
    };
    for (const end of ['', `&end=${begin + 400 * MINUTE}`]) {
      clearMemoryCache();
      const fetchImpl = sources(okx);
      const response = await call(`/market/candles?market=binance-spot&symbol=BTCUSDT&interval=1m&limit=300&start=${begin}${end}&base=BTC&quote=USDT`, fetchImpl);
      expect(response.status, end).toBe(200);
      expect(okxCalls(fetchImpl).length, end).toBeLessThanOrEqual(4);
      const data = await dataOf(response);
      expect(data.candles, end).toHaveLength(300);
      expect(data.candles[0].openTime, end).toBe(new Date(begin).toISOString());
      expect(data.candles[299].openTime, end).toBe(new Date(begin + 299 * MINUTE).toISOString());
      expect(data.next, end).toBe(begin + 299 * MINUTE + 1);
    }
  });

  it('asks OKX for the UTC bar of every interval it has, and never for 8h or 3d', async () => {
    const bars: [string, string][] = [
      ['1s', '1s'], ['1m', '1m'], ['3m', '3m'], ['5m', '5m'], ['15m', '15m'], ['30m', '30m'], ['1h', '1H'], ['2h', '2H'], ['4h', '4H'],
      ['6h', '6Hutc'], ['12h', '12Hutc'], ['1d', '1Dutc'], ['1w', '1Wutc'], ['1M', '1Mutc'],
    ];
    for (const [interval, bar] of bars) {
      clearMemoryCache();
      const fetchImpl = sources(() => ({ body: okxBody([]) }));
      await call(candles('binance-spot', interval), fetchImpl);
      const asked = okxCalls(fetchImpl);
      expect(asked, interval).toHaveLength(1);
      expect(new URL(asked[0]).searchParams.get('bar'), interval).toBe(bar);
    }
    for (const interval of ['8h', '3d']) {
      clearMemoryCache();
      const fetchImpl = sources(threeHours);
      expect((await call(candles('binance-spot', interval), fetchImpl)).status, interval).toBe(451);
      expect(okxCalls(fetchImpl), interval).toEqual([]);
    }
  });

  it("answers Binance's reason, with no backup, when OKX sends an error code with HTTP 200", async () => {
    const fetchImpl = sources(() => ({ body: okxBody([okxRow(START + 2 * HOUR), okxRow(START + HOUR), okxRow(START)], '50011') }));
    const response = await call(candles('binance-spot', '1h'), fetchImpl);
    expect(okxCalls(fetchImpl)).toHaveLength(1);
    expect(response.status).toBe(451);
    expect(await response.json()).toMatchObject({ ok: false, reason: 'source-refused' });
  });
});
