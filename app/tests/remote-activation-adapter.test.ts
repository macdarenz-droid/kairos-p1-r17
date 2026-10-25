import { describe, expect, it, vi } from 'vitest';
import { RemoteActivationAdapter } from '../src/services/activation/RemoteActivationAdapter';

const request = {
  inviteCode: 'one-time-user-input',
  appVersion: '0.1.0',
  buildId: 'test-build',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('RemoteActivationAdapter', () => {
  it('requires an injected HTTPS endpoint', () => {
    expect(() => new RemoteActivationAdapter({ endpoint: 'http://example.test/activate' }))
      .toThrow('Activation endpoint must use HTTPS.');
  });

  it('posts only the activation request contract (with D275\'s request id and device name) and accepts a valid server receipt', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      ok: true,
      receipt: {
        receiptVersion: 1,
        activationId: 'activation-1',
        issuedAt: '2026-08-31T10:30:00.000Z',
        verifierPayload: 'server-payload',
        verifierSignature: 'server-signature',
      },
    }));
    const adapter = new RemoteActivationAdapter({
      endpoint: 'https://activation.example.test/v1/activate',
      fetchImpl,
    });

    await expect(adapter.validateInvite({ ...request, requestId: '0123456789abcdef0123456789abcdef', deviceLabel: 'iPhone · Safari' })).resolves.toEqual({
      ok: true,
      receipt: {
        receiptVersion: 1,
        activationId: 'activation-1',
        issuedAt: '2026-08-31T10:30:00.000Z',
        verifierPayload: 'server-payload',
        verifierSignature: 'server-signature',
      },
    });

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      inviteCode: 'one-time-user-input',
      appVersion: '0.1.0',
      buildId: 'test-build',
      requestId: '0123456789abcdef0123456789abcdef',
      deviceLabel: 'iPhone · Safari',
    });
  });

  it.each([
    ['invalid-code', 'invalid-code'],
    ['expired-code', 'expired-code'],
    ['already-used', 'already-used'],
  ] as const)('maps server rejection %s without client-side invite decisions', async (serverReason, expected) => {
    const adapter = new RemoteActivationAdapter({
      endpoint: 'https://activation.example.test/v1/activate',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: false, reason: serverReason }, 400)),
    });
    await expect(adapter.validateInvite(request)).resolves.toEqual({ ok: false, reason: expected });
  });

  it('reads how many devices a used-up code allows, and leaves out a number it cannot read', async () => {
    const answer = (body: unknown) => new RemoteActivationAdapter({
      endpoint: 'https://activation.example.test/v1/activate',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body, 403)),
    }).validateInvite(request);
    await expect(answer({ ok: false, reason: 'already-used', deviceLimit: 3 })).resolves.toStrictEqual({ ok: false, reason: 'already-used', deviceLimit: 3 });
    await expect(answer({ ok: false, reason: 'already-used', deviceLimit: 1 })).resolves.toStrictEqual({ ok: false, reason: 'already-used', deviceLimit: 1 });
    await expect(answer({ ok: false, reason: 'already-used', deviceLimit: 10 })).resolves.toStrictEqual({ ok: false, reason: 'already-used', deviceLimit: 10 });
    for (const deviceLimit of [0, 11, 2.5, -3, '3', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(answer({ ok: false, reason: 'already-used', deviceLimit })).resolves.toStrictEqual({ ok: false, reason: 'already-used' });
    }
    // A number beside another reason means nothing.
    await expect(answer({ ok: false, reason: 'invalid-code', deviceLimit: 3 })).resolves.toStrictEqual({ ok: false, reason: 'invalid-code' });
  });

  it('maps HTTP 429 to rate-limited and server failures to service-error', async () => {
    const limited = new RemoteActivationAdapter({
      endpoint: 'https://activation.example.test/v1/activate',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 })),
    });
    const failed = new RemoteActivationAdapter({
      endpoint: 'https://activation.example.test/v1/activate',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 })),
    });
    await expect(limited.validateInvite(request)).resolves.toEqual({ ok: false, reason: 'rate-limited' });
    await expect(failed.validateInvite(request)).resolves.toEqual({ ok: false, reason: 'service-error' });
  });

  it('fails closed on malformed success payloads', async () => {
    const adapter = new RemoteActivationAdapter({
      endpoint: 'https://activation.example.test/v1/activate',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true, receipt: { activationId: 'forged' } })),
    });
    await expect(adapter.validateInvite(request)).resolves.toEqual({ ok: false, reason: 'service-error' });
  });

  it('maps transport failure to network-unavailable', async () => {
    const adapter = new RemoteActivationAdapter({
      endpoint: 'https://activation.example.test/v1/activate',
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network down')),
    });
    await expect(adapter.validateInvite(request)).resolves.toEqual({ ok: false, reason: 'network-unavailable' });
  });
});

// T-062f (D277, D278): the device routes next to /activate, decoded strictly.
describe('RemoteActivationAdapter device routes', () => {
  const ENDPOINT = 'https://activation.example.test/v1/activate';
  const TOKEN = 'v1.eyJhIjoxfQ.c2lnbmF0dXJl';
  const thisPhone = { id: 1, label: 'iPhone · Safari', since: '2026-10-03T08:00:00.000Z', lastSeenOn: '2026-10-24', thisDevice: true };
  const laptop = { id: 4, label: 'Windows · Edge', since: '2026-09-01T10:00:00.000Z', lastSeenOn: null, thisDevice: false };
  const LIST = { ok: true, used: 2, limit: 3, devices: [thisPhone, laptop] };
  const answering = (response: Response) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    return { fetchImpl, adapter: new RemoteActivationAdapter({ endpoint: ENDPOINT, fetchImpl }) };
  };

  it('posts the token to /devices, /devices/remove and /devices/check next to /activate, with /activate\'s fetch options', async () => {
    const list = answering(jsonResponse(LIST));
    await list.adapter.listDevices(TOKEN);
    const remove = answering(jsonResponse({ ok: true }));
    await remove.adapter.removeDevice(TOKEN, 4);
    const check = answering(jsonResponse({ ok: true, status: 'active' }));
    await check.adapter.checkDevice(TOKEN);

    const calls = [list, remove, check].map(({ fetchImpl }) => fetchImpl.mock.calls[0]!);
    expect(calls.map(([url]) => String(url))).toEqual([
      'https://activation.example.test/v1/devices',
      'https://activation.example.test/v1/devices/remove',
      'https://activation.example.test/v1/devices/check',
    ]);
    expect(calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([{ token: TOKEN }, { token: TOKEN, deviceId: 4 }, { token: TOKEN }]);
    for (const [, init] of calls) {
      expect(init).toMatchObject({ method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error', headers: { accept: 'application/json', 'content-type': 'application/json' } });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('reads the list: the Worker\'s count, each device, and which one is this device', async () => {
    await expect(answering(jsonResponse(LIST)).adapter.listDevices(TOKEN)).resolves.toEqual({ ok: true, list: { used: 2, limit: 3, devices: [thisPhone, laptop] } });
  });

  it.each([
    ['a count that is not the list\'s length', { ...LIST, used: 3 }],
    ['more devices than the limit', { ...LIST, used: 2, limit: 1 }],
    ['a limit outside 1 to 10', { ...LIST, limit: 11 }],
    ['a name that is not text', { ...LIST, devices: [thisPhone, { ...laptop, label: 7 }] }],
    ['an empty name', { ...LIST, devices: [thisPhone, { ...laptop, label: '' }] }],
    ['a name longer than the Worker keeps', { ...LIST, devices: [thisPhone, { ...laptop, label: 'x'.repeat(129) }] }],
    ['a name with a control character', { ...LIST, devices: [thisPhone, { ...laptop, label: 'Windows\u0000Edge' }] }],
    ['a device twice', { ...LIST, devices: [thisPhone, { ...laptop, id: 1 }] }],
    ['no "this device"', { ...LIST, devices: [{ ...thisPhone, thisDevice: false }, laptop] }],
    ['two "this device"', { ...LIST, devices: [thisPhone, { ...laptop, thisDevice: true }] }],
    ['a row number that is not a whole number above 0', { ...LIST, devices: [thisPhone, { ...laptop, id: 0 }] }],
    ['a "since" that is not a time', { ...LIST, devices: [thisPhone, { ...laptop, since: '3 Oct' }] }],
    ['a "last used" day that does not exist', { ...LIST, devices: [thisPhone, { ...laptop, lastSeenOn: '2026-02-30' }] }],
    ['a "last used" left out', { ...LIST, devices: [thisPhone, { id: 4, label: 'Windows · Edge', since: '2026-09-01T10:00:00.000Z', thisDevice: false }] }],
    ['no count', { ok: true, limit: 3, devices: [thisPhone, laptop] }],
  ])('never shows a list with %s', async (_case, body) => {
    await expect(answering(jsonResponse(body)).adapter.listDevices(TOKEN)).resolves.toEqual({ ok: false, reason: 'service-error' });
  });

  // Fix r1: a name the Worker added after this build keeps the list (and Remove) working on older builds.
  it('shows a name off this build\'s copy of the list as "Other device", never as its text', async () => {
    const lab = { ...laptop, label: 'Vision · Safari' };
    await expect(answering(jsonResponse({ ...LIST, devices: [thisPhone, lab] })).adapter.listDevices(TOKEN))
      .resolves.toEqual({ ok: true, list: { used: 2, limit: 3, devices: [thisPhone, { ...lab, label: 'Other device' }] } });
    const longest = { ...laptop, label: 'y'.repeat(128) };
    await expect(answering(jsonResponse({ ...LIST, devices: [thisPhone, longest] })).adapter.listDevices(TOKEN))
      .resolves.toMatchObject({ ok: true, list: { devices: [thisPhone, { id: 4, label: 'Other device' }] } });
  });

  it('reads each refusal only with its own HTTP status, and anything else as an answer it can\'t read', async () => {
    const list = async (response: Response) => (await answering(response).adapter.listDevices(TOKEN));
    expect(await list(jsonResponse({ ok: false, reason: 'device-not-recognised' }, 401))).toEqual({ ok: false, reason: 'device-not-recognised' });
    expect(await list(jsonResponse({ ok: false, reason: 'device-removed' }, 403))).toEqual({ ok: false, reason: 'device-removed' });
    expect(await list(jsonResponse({ ok: false, reason: 'code-revoked' }, 403))).toEqual({ ok: false, reason: 'code-revoked' });
    expect(await list(jsonResponse({ ok: false, reason: 'device-removed' }, 400))).toEqual({ ok: false, reason: 'service-error' });
    expect(await list(jsonResponse({ ok: false, reason: 'device-not-found' }, 404))).toEqual({ ok: false, reason: 'service-error' });
    expect(await list(jsonResponse({ ok: false, reason: 'device-removed' }, 200))).toEqual({ ok: false, reason: 'service-error' });
    expect(await list(jsonResponse({ ok: false, reason: 'rate-limited' }, 429))).toEqual({ ok: false, reason: 'rate-limited' });
    expect(await list(new Response('busy', { status: 503 }))).toEqual({ ok: false, reason: 'service-error' });
    expect(await list(new Response(JSON.stringify(LIST), { status: 200, headers: { 'content-type': 'text/html' } }))).toEqual({ ok: false, reason: 'service-error' });
    expect(await list(jsonResponse(LIST, 201))).toEqual({ ok: false, reason: 'service-error' });
    const offline = new RemoteActivationAdapter({ endpoint: ENDPOINT, fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')) });
    expect(await offline.listDevices(TOKEN)).toEqual({ ok: false, reason: 'network-unavailable' });
    expect(await offline.checkDevice(TOKEN)).toEqual({ ok: false, reason: 'network-unavailable' });
    expect(await offline.removeDevice(TOKEN, 4)).toEqual({ ok: false, reason: 'network-unavailable' });
  });

  it('removes another device, and reads the remove route\'s own refusals', async () => {
    const remove = async (response: Response) => (await answering(response).adapter.removeDevice(TOKEN, 4));
    expect(await remove(jsonResponse({ ok: true }))).toEqual({ ok: true });
    expect(await remove(jsonResponse({ ok: false, reason: 'device-not-found' }, 404))).toEqual({ ok: false, reason: 'device-not-found' });
    expect(await remove(jsonResponse({ ok: false, reason: 'cannot-remove-this-device' }, 400))).toEqual({ ok: false, reason: 'cannot-remove-this-device' });
    expect(await remove(jsonResponse({ ok: false, reason: 'device-removed' }, 403))).toEqual({ ok: false, reason: 'device-removed' });
    expect(await remove(jsonResponse({ ok: false, reason: 'invalid-request' }, 400))).toEqual({ ok: false, reason: 'service-error' });
    expect(await remove(jsonResponse({ ok: 'yes' }))).toEqual({ ok: false, reason: 'service-error' });
    await expect(answering(jsonResponse({ ok: true })).adapter.removeDevice(TOKEN, 0)).rejects.toThrow(RangeError);
  });

  it('reads /devices/check only as active, removed or revoked, with a 200', async () => {
    const check = async (response: Response) => (await answering(response).adapter.checkDevice(TOKEN));
    for (const status of ['active', 'removed', 'revoked'] as const) {
      expect(await check(jsonResponse({ ok: true, status }))).toEqual({ ok: true, status });
    }
    expect(await check(jsonResponse({ ok: true, status: 'gone' }))).toEqual({ ok: false, reason: 'service-error' });
    expect(await check(jsonResponse({ ok: true }))).toEqual({ ok: false, reason: 'service-error' });
    expect(await check(jsonResponse({ ok: true, status: 'removed' }, 202))).toEqual({ ok: false, reason: 'service-error' });
    // The check never refuses with "removed": that comes only as a 200 status, so it can't end a device by mistake.
    expect(await check(jsonResponse({ ok: false, reason: 'device-removed' }, 403))).toEqual({ ok: false, reason: 'service-error' });
    expect(await check(jsonResponse({ ok: false, reason: 'device-not-recognised' }, 401))).toEqual({ ok: false, reason: 'device-not-recognised' });
    expect(await check(new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } }))).toEqual({ ok: false, reason: 'service-error' });
  });
});
