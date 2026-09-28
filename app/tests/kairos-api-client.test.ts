import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivationReceipt } from '../src/services/activation/activationTypes';
import {
  createKairosApiClient,
  createKairosApiHealthPort,
  decodeKairosApiHealth,
  kairosDeviceToken,
  parseKairosApiBaseUrl,
  storedReceiptReader,
} from '../src/services/kairos-api/kairosApi';

const BASE = 'https://kairos-api.example.workers.dev';
const HEALTH = { service: 'kairos-api', serverTime: '2026-09-26T10:00:00.000Z', device: 'recognised', checks: { deviceKey: 'ready', cache: 'ready', limits: 'ready' } };
const PAYLOAD = '{"proofVersion":1,"purpose":"kairos-activation","receiptVersion":1,"activationId":"a-1","issuedAt":"2026-09-20T10:00:00.000Z"}';
const receipt: ActivationReceipt = { receiptVersion: 1, activationId: 'a-1', issuedAt: '2026-09-20T10:00:00.000Z', verifierPayload: PAYLOAD, verifierSignature: 'abc_DEF-123' };

function jsonResponse(body: unknown, status = 200, contentType = 'application/json'): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': contentType } });
}

function fromBase64Url(value: string): string {
  const standard = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(standard + '='.repeat((4 - (standard.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('parseKairosApiBaseUrl', () => {
  it('keeps only a bare https origin', () => {
    expect(parseKairosApiBaseUrl(' https://kairos-api.example.workers.dev/ ')).toBe(BASE);
    for (const raw of [undefined, '', 'http://kairos-api.example.workers.dev', 'https://kairos-api.example.workers.dev/v1', 'https://u:p@x.dev', 'https://x.dev?a=1', 'https://x.dev#a', 'not a url']) {
      expect(parseKairosApiBaseUrl(raw), String(raw)).toBeNull();
    }
  });
});

describe('kairosDeviceToken and storedReceiptReader', () => {
  it('builds the device header from the stored receipt', () => {
    const token = kairosDeviceToken(receipt);
    expect(token).not.toBeNull();
    const [version, payload, signature] = token!.split('.');
    expect(version).toBe('v1');
    expect(signature).toBe('abc_DEF-123');
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(payload)).toBe(PAYLOAD);
    expect(kairosDeviceToken({ ...receipt, verifierSignature: 'ab+c' })).toBeNull();
    // '???>>>a' is Pz8/Pj4+YQ== in standard base64: the token carries - and _ in their places and no =.
    expect(kairosDeviceToken({ ...receipt, verifierPayload: '???>>>a' })).toBe('v1.Pz8_Pj4-YQ.abc_DEF-123');
    expect(kairosDeviceToken({ ...receipt, verifierSignature: 'abc=' })).toBeNull();
  });

  it('reads only a stored receipt', async () => {
    expect(await storedReceiptReader({ load: async () => ({ status: 'stored', receipt, storedAt: '2026-09-20T10:00:00.000Z' }) })()).toBe(receipt);
    expect(await storedReceiptReader({ load: async () => ({ status: 'missing' }) })()).toBeNull();
    expect(await storedReceiptReader({ load: async () => ({ status: 'corrupt', error: 'bad' }) })()).toBeNull();
  });
});

describe('createKairosApiClient', () => {
  it('answers not-set-up without the network when this build has no address', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const port = createKairosApiHealthPort(createKairosApiClient({ baseUrl: null, fetchImpl }));
    expect(port.setUp).toBe(false);
    expect(await port.checkHealth()).toEqual({ ok: false, reason: 'not-set-up' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends a GET with no credentials, no redirects, sorted query and the device header', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ apiVersion: 1, ok: true, data: { n: 1 } }));
    const client = createKairosApiClient({ baseUrl: BASE, readReceipt: async () => receipt, fetchImpl });
    await client.request('/market/candles', { symbol: 'BTCUSDT', from: '1', interval: '1h' }, (data) => data);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/market/candles?from=1&interval=1h&symbol=BTCUSDT`);
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', cache: 'default' });
    expect(init!.headers).toEqual({ accept: 'application/json', 'x-kairos-device': kairosDeviceToken(receipt) });
  });

  it('sends no device header when the receipt is missing or cannot be read', async () => {
    for (const readReceipt of [async () => null, async () => { throw new Error('db closed'); }]) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ apiVersion: 1, ok: true, data: HEALTH }));
      await createKairosApiClient({ baseUrl: BASE, readReceipt, fetchImpl }).request('/health', {}, decodeKairosApiHealth);
      expect(fetchImpl.mock.calls[0][1]!.headers).toEqual({ accept: 'application/json' });
    }
  });

  it('refuses a path that is not a plain server path, before the network', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createKairosApiClient({ baseUrl: BASE, fetchImpl });
    await expect(client.request('health', {}, (data) => data)).rejects.toThrow(TypeError);
    await expect(client.request('/x?y=1', {}, (data) => data)).rejects.toThrow(TypeError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('decodes ok and unavailable answers', async () => {
    const health = (response: Response) => createKairosApiHealthPort(createKairosApiClient({ baseUrl: BASE, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response) })).checkHealth();
    expect(await health(jsonResponse({ apiVersion: 1, ok: true, data: HEALTH }))).toEqual({ ok: true, value: { serverTime: HEALTH.serverTime, device: 'recognised', checks: HEALTH.checks } });
    expect(await health(jsonResponse({ apiVersion: 1, ok: false, error: 'unavailable', reason: 'rate-limited', retryAfter: 60 }, 429)))
      .toEqual({ ok: false, reason: 'unavailable', serverReason: 'rate-limited', retryAfterSeconds: 60, status: 429 });
  });

  it('reads anything else as invalid-response, with its status', async () => {
    const cases: Array<[Response, number]> = [
      [jsonResponse('<!doctype html><title>Kairos</title>', 200, 'text/html'), 200],
      [jsonResponse({ apiVersion: 2, ok: true, data: HEALTH }), 200],
      [jsonResponse({ apiVersion: 1, ok: true, data: HEALTH }, 201), 201],
      [jsonResponse({ apiVersion: 1, ok: true, data: { ...HEALTH, device: 'maybe' } }), 200],
      [jsonResponse({ apiVersion: 1, ok: true, data: { ...HEALTH, serverTime: '2026-09-26' } }), 200],
      [jsonResponse({ apiVersion: 1, ok: false, error: 'unavailable', reason: 'rate-limited', retryAfter: 0 }, 429), 429],
      [jsonResponse({ apiVersion: 1, ok: false, error: 'unavailable', reason: 'Rate Limited', retryAfter: null }, 429), 429],
      [jsonResponse('{not json', 200), 200],
      [jsonResponse({ apiVersion: 1, ok: true, data: { ...HEALTH, service: 'other-api' } }), 200],
      [jsonResponse({ apiVersion: 1, ok: true, data: { ...HEALTH, checks: { ...HEALTH.checks, cache: 'ok' } } }), 200],
      [jsonResponse({ apiVersion: 1, ok: false, error: 'oops', reason: 'rate-limited', retryAfter: 60 }, 429), 429],
      [jsonResponse({ apiVersion: 1, ok: false, error: 'unavailable', reason: 'rate-limited', retryAfter: 86_401 }, 429), 429],
    ];
    for (const [response, status] of cases) {
      const port = createKairosApiHealthPort(createKairosApiClient({ baseUrl: BASE, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response) }));
      expect(await port.checkHealth()).toEqual({ ok: false, reason: 'invalid-response', status });
    }
  });

  it('reads a failed fetch as transport-failed', async () => {
    const port = createKairosApiHealthPort(createKairosApiClient({ baseUrl: BASE, fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')) }));
    expect(await port.checkHealth()).toEqual({ ok: false, reason: 'transport-failed' });
  });

  it('gives up after the time limit, or when the caller stops it', async () => {
    vi.useFakeTimers();
    const hanging = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const port = createKairosApiHealthPort(createKairosApiClient({ baseUrl: BASE, fetchImpl: hanging }));
    let settled: unknown = 'pending';
    const pending = port.checkHealth().then((result) => { settled = result; });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(settled).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toEqual({ ok: false, reason: 'transport-failed' });

    const controller = new AbortController();
    const stopped = port.checkHealth({ signal: controller.signal });
    controller.abort();
    expect(await stopped).toEqual({ ok: false, reason: 'transport-failed' });
  });

  it('gives up on a stuck device read after the time limit, or when the caller stops it, without the network', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>();
    const stuck = () => new Promise<ActivationReceipt | null>(() => undefined);
    const port = createKairosApiHealthPort(createKairosApiClient({ baseUrl: BASE, readReceipt: stuck, fetchImpl }));
    let settled: unknown = 'pending';
    const pending = port.checkHealth().then((result) => { settled = result; });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(settled).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toEqual({ ok: false, reason: 'transport-failed' });

    const controller = new AbortController();
    const stopped = port.checkHealth({ signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(await stopped).toEqual({ ok: false, reason: 'transport-failed' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers transport-failed at once for a caller signal that was already stopped', async () => {
    vi.useFakeTimers();
    const hanging = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const port = createKairosApiHealthPort(createKairosApiClient({ baseUrl: BASE, fetchImpl: hanging }));
    let settled: unknown = 'pending';
    const pending = port.checkHealth({ signal: AbortSignal.abort() }).then((result) => { settled = result; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toEqual({ ok: false, reason: 'transport-failed' });
    await vi.advanceTimersByTimeAsync(20_000);
    await pending;
  });
});
