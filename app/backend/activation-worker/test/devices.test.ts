import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  activate, activateDevice, activationBody, addCode, APP, applyMigrations, callDevices, codeRow, deviceRows, deviceToken,
  expectReceiptTheAppAccepts, newCode, send, sendWith, sha256Hex, signedToken, startOfAFreshMinute, todayUtc, type Receipt,
} from './support';

beforeAll(applyMigrations);

type Answer = Record<string, unknown> & { ok: boolean };

async function answer(response: Response): Promise<Answer> {
  return response.json<Answer>();
}

function requestId(): string {
  return crypto.randomUUID();
}

/** A code with `count` devices already on it, each with its own request id. */
async function codeWithDevices(count: number, row: Parameters<typeof addCode>[1] = {}): Promise<{ code: string; receipts: Receipt[] }> {
  const code = newCode();
  await addCode(code, row);
  const receipts: Receipt[] = [];
  for (let index = 0; index < count; index += 1) receipts.push(await activateDevice(code, { requestId: requestId() }));
  return { code, receipts };
}

async function check(receipt: Receipt): Promise<Answer> {
  const response = await callDevices('/devices/check', { token: deviceToken(receipt) });
  expect(response.status).toBe(200);
  return answer(response);
}

async function list(receipt: Receipt): Promise<Answer & { used: number; limit: number; devices: Array<Record<string, unknown>> }> {
  const response = await callDevices('/devices', { token: deviceToken(receipt) });
  expect(response.status).toBe(200);
  return response.json();
}

async function idOf(code: string, receipt: Receipt): Promise<number> {
  const row = (await deviceRows(code)).find((device) => device.activation_id === receipt.activationId);
  if (row === undefined) throw new Error('no such device');
  return row.id;
}

describe('one invite code, three devices (D274, D275)', () => {
  it('gives each of 3 devices its own receipt, then answers already-used with deviceLimit 3', async () => {
    const code = newCode();
    await addCode(code);
    const receipts: Receipt[] = [];
    for (let index = 0; index < 3; index += 1) {
      const response = await activate(code, { body: activationBody(code, { requestId: requestId(), deviceLabel: 'Android · Chrome' }) });
      expect(response.status).toBe(200);
      const body = await answer(response);
      expect(Object.keys(body)).toEqual(['ok', 'receipt']);
      receipts.push(await expectReceiptTheAppAccepts(body.receipt));
    }
    expect(new Set(receipts.map((receipt) => receipt.activationId)).size).toBe(3);
    const fourth = await activate(code, { body: activationBody(code, { requestId: requestId() }) });
    expect(fourth.status).toBe(403);
    expect(fourth.headers.get('access-control-allow-origin')).toBe(APP);
    expect(await answer(fourth)).toEqual({ ok: false, reason: 'already-used', deviceLimit: 3 });
    // The first use is still the code's own record, as every older tool reads it.
    expect(await codeRow(code)).toMatchObject({ status: 'used', used_at: receipts[0].issuedAt, activation_id: receipts[0].activationId });
    expect((await deviceRows(code)).map((row) => [row.activation_id, row.activated_at, row.device_label, row.last_seen_on]))
      .toEqual(receipts.map((receipt) => [receipt.activationId, receipt.issuedAt, 'Android · Chrome', todayUtc()]));
  });

  it("follows each code's own limit", async () => {
    const { code } = await codeWithDevices(1, { deviceLimit: 1 });
    expect(await answer(await activate(code))).toEqual({ ok: false, reason: 'already-used', deviceLimit: 1 });
  });

  it('gives the same device back for the same requestId, signed again, without using a new place', async () => {
    const code = newCode();
    await addCode(code);
    const retry = requestId();
    const first = await activateDevice(code, { requestId: retry });
    const again = await activateDevice(code, { requestId: retry });
    await expectReceiptTheAppAccepts(again);
    expect([again.activationId, again.issuedAt, again.verifierPayload]).toEqual([first.activationId, first.issuedAt, first.verifierPayload]);
    expect((await list(first)).used).toBe(1);
    expect(await deviceRows(code)).toHaveLength(1);
    // A full code still gives a device that already has its place back.
    await activateDevice(code, { requestId: requestId() });
    await activateDevice(code, { requestId: requestId() });
    expect((await activateDevice(code, { requestId: retry })).activationId).toBe(first.activationId);
    // The same requestId on another code is a new device there: a request id never links two codes.
    const other = newCode();
    await addCode(other);
    expect((await activateDevice(other, { requestId: retry })).activationId).not.toBe(first.activationId);
  });

  it('uses a new place for an old app build that sends no requestId', async () => {
    const code = newCode();
    await addCode(code);
    const first = await activateDevice(code);
    const second = await activateDevice(code);
    expect(second.activationId).not.toBe(first.activationId);
    expect((await deviceRows(code)).map((row) => [row.request_id, row.device_label])).toEqual([[null, 'Other device'], [null, 'Other device']]);
  });

  it('lets exactly one of two devices in at once when one place is left', async () => {
    const { code } = await codeWithDevices(2);
    const [one, two] = await Promise.all([
      activate(code, { body: activationBody(code, { requestId: requestId() }) }),
      activate(code, { body: activationBody(code, { requestId: requestId() }) }),
    ]);
    expect([one.status, two.status].sort()).toEqual([200, 403]);
    const refused = one.status === 403 ? one : two;
    expect(await answer(refused)).toEqual({ ok: false, reason: 'already-used', deviceLimit: 3 });
    expect(await deviceRows(code)).toHaveLength(3);
  });

  it('gives the same device to two requests at once with the same requestId', async () => {
    const code = newCode();
    await addCode(code);
    const retry = requestId();
    const [one, two] = await Promise.all([
      activate(code, { body: activationBody(code, { requestId: retry }) }),
      activate(code, { body: activationBody(code, { requestId: retry }) }),
    ]);
    expect([one.status, two.status]).toEqual([200, 200]);
    const [a, b] = [(await answer(one)).receipt as Receipt, (await answer(two)).receipt as Receipt];
    expect(b.activationId).toBe(a.activationId);
    expect(await deviceRows(code)).toHaveLength(1);
  });

  it('checks the expiry date only for the first use', async () => {
    const code = newCode();
    await addCode(code, { expiresAt: '2999-01-01T00:00:00.000Z' });
    await activateDevice(code);
    await env.DB.prepare("UPDATE activation_codes SET expires_at = '2026-01-01T00:00:00.000Z' WHERE code_hash = ?").bind(await sha256Hex(code)).run();
    expect((await activate(code)).status).toBe(200);
    // An unused code past its date is still refused.
    const unused = newCode();
    await addCode(unused, { expiresAt: '2026-01-01T00:00:00.000Z' });
    expect(await answer(await activate(unused))).toEqual({ ok: false, reason: 'expired-code' });
  });

  it('refuses a new device on a revoked code that was used, with the same invalid-code', async () => {
    const code = newCode();
    await addCode(code);
    const retry = requestId();
    const first = await activateDevice(code, { requestId: retry });
    await env.DB.prepare('UPDATE activation_codes SET revoked_at = ? WHERE activation_id = ?').bind('2026-10-20T00:00:00.000Z', first.activationId).run();
    const response = await activate(code);
    expect(response.status).toBe(403);
    expect(await answer(response)).toEqual({ ok: false, reason: 'invalid-code' });
    // Even the retry of a device it already has.
    expect(await answer(await activate(code, { body: activationBody(code, { requestId: retry }) }))).toEqual({ ok: false, reason: 'invalid-code' });
    expect(await deviceRows(code)).toHaveLength(1);
  });

  it('frees a place when a device is removed', async () => {
    const { code, receipts } = await codeWithDevices(3);
    expect((await activate(code)).status).toBe(403);
    const removed = await callDevices('/devices/remove', { token: deviceToken(receipts[0]), deviceId: await idOf(code, receipts[2]) });
    expect(removed.status).toBe(200);
    expect(await answer(removed)).toEqual({ ok: true });
    expect((await activate(code)).status).toBe(200);
    expect((await activate(code)).status).toBe(403);
  });
});

describe('the device list (D277, D283)', () => {
  it("lists only this code's devices that are still in use, and never another device's activationId", async () => {
    const code = newCode();
    await addCode(code);
    const phone = await activateDevice(code, { requestId: requestId(), deviceLabel: 'iPhone · Safari' });
    const laptop = await activateDevice(code, { requestId: requestId(), deviceLabel: 'Windows · Edge' });
    const old = await activateDevice(code, { requestId: requestId(), deviceLabel: 'Android · Chrome' });
    const elsewhere = await codeWithDevices(1);
    expect((await callDevices('/devices/remove', { token: deviceToken(phone), deviceId: await idOf(code, old) })).status).toBe(200);
    await env.DB.prepare("UPDATE activation_devices SET last_seen_on = '2026-10-20' WHERE activation_id = ?").bind(laptop.activationId).run();

    const response = await callDevices('/devices', { token: deviceToken(phone) });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(APP);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      ok: true,
      used: 2,
      limit: 3,
      devices: [
        { id: await idOf(code, phone), label: 'iPhone · Safari', since: phone.issuedAt, lastSeenOn: todayUtc(), thisDevice: true },
        { id: await idOf(code, laptop), label: 'Windows · Edge', since: laptop.issuedAt, lastSeenOn: '2026-10-20', thisDevice: false },
      ],
    });
    for (const receipt of [phone, laptop, old, ...elsewhere.receipts]) expect(text).not.toContain(receipt.activationId);
    expect((await list(laptop)).devices.map((device) => device.thisDevice)).toEqual([false, true]);
  });

  it('removes another device of the same code; refuses itself (400) and a device of another code (404)', async () => {
    const { code, receipts: [me, other] } = await codeWithDevices(2);
    const stranger = await codeWithDevices(1);
    const itself = await callDevices('/devices/remove', { token: deviceToken(me), deviceId: await idOf(code, me) });
    expect(itself.status).toBe(400);
    expect(await answer(itself)).toEqual({ ok: false, reason: 'cannot-remove-this-device' });
    const foreign = await callDevices('/devices/remove', { token: deviceToken(me), deviceId: await idOf(stranger.code, stranger.receipts[0]) });
    expect(foreign.status).toBe(404);
    expect(await answer(foreign)).toEqual({ ok: false, reason: 'device-not-found' });
    expect((await callDevices('/devices/remove', { token: deviceToken(me), deviceId: 2 ** 40 })).status).toBe(404);
    expect(await check(stranger.receipts[0])).toEqual({ ok: true, status: 'active' });

    const removed = await callDevices('/devices/remove', { token: deviceToken(me), deviceId: await idOf(code, other) });
    expect(removed.status).toBe(200);
    expect((await deviceRows(code)).map((row) => [row.removed_at === null, row.removed_by])).toEqual([[true, null], [false, 'trader']]);
    // Asking again (an answer lost on the way) is still ok.
    expect((await callDevices('/devices/remove', { token: deviceToken(me), deviceId: await idOf(code, other) })).status).toBe(200);
    // The removed device can no longer see or change the list.
    const fromRemoved = await callDevices('/devices', { token: deviceToken(other) });
    expect(fromRemoved.status).toBe(403);
    expect(await answer(fromRemoved)).toEqual({ ok: false, reason: 'device-removed' });
    const removeBack = await callDevices('/devices/remove', { token: deviceToken(other), deviceId: await idOf(code, me) });
    expect(removeBack.status).toBe(403);
    expect(await check(me)).toEqual({ ok: true, status: 'active' });
  });

  it('refuses a deviceId that is not a whole number above 0, and a wrong body', async () => {
    const { receipts: [me] } = await codeWithDevices(1);
    for (const deviceId of [undefined, null, '2', 0, -1, 1.5, 2 ** 53]) {
      const response = await callDevices('/devices/remove', { token: deviceToken(me), deviceId });
      expect(response.status).toBe(400);
      expect(await answer(response)).toEqual({ ok: false, reason: 'invalid-request' });
    }
    for (const body of ['{"token":', 'null', '[]', '"text"']) {
      const response = await send({ path: '/devices', body });
      expect(response.status).toBe(400);
      expect(await answer(response)).toEqual({ ok: false, reason: 'invalid-request' });
    }
    const plain = await send({ path: '/devices/check', body: JSON.stringify({ token: deviceToken(me) }), contentType: 'text/plain' });
    expect(plain.status).toBe(415);
    const get = await send({ path: '/devices', method: 'GET' });
    expect(get.status).toBe(405);
    const preflight = await send({ path: '/devices/remove', method: 'OPTIONS', contentType: null });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(APP);
  });

  it("refuses another website's call before it can remove a device", async () => {
    const { code, receipts: [me, other] } = await codeWithDevices(2);
    const response = await callDevices('/devices/remove', { token: deviceToken(me), deviceId: await idOf(code, other) }, { origin: 'https://evil.example' });
    expect(response.status).toBe(403);
    expect(await check(other)).toEqual({ ok: true, status: 'active' });
  });
});

describe('the daily check (D278)', () => {
  it('answers active, removed and revoked', async () => {
    const { code, receipts: [me, other] } = await codeWithDevices(2);
    expect(await check(me)).toEqual({ ok: true, status: 'active' });
    expect((await callDevices('/devices/remove', { token: deviceToken(me), deviceId: await idOf(code, other) })).status).toBe(200);
    expect(await check(other)).toEqual({ ok: true, status: 'removed' });
    expect(await check(me)).toEqual({ ok: true, status: 'active' });
    await env.DB.prepare('UPDATE activation_codes SET revoked_at = ? WHERE activation_id = ?').bind('2026-10-21T00:00:00.000Z', me.activationId).run();
    expect(await check(me)).toEqual({ ok: true, status: 'revoked' });
    expect(await check(other)).toEqual({ ok: true, status: 'revoked' });
    const fromRevoked = await callDevices('/devices', { token: deviceToken(me) });
    expect(fromRevoked.status).toBe(403);
    expect(await answer(fromRevoked)).toEqual({ ok: false, reason: 'code-revoked' });
  });

  it('writes last_seen_on once a day, and only for a device still in use', async () => {
    const { code, receipts: [me, other] } = await codeWithDevices(2);
    await env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS seen_writes (device_id INTEGER NOT NULL, day TEXT)'),
      env.DB.prepare("UPDATE activation_devices SET last_seen_on = '2026-10-01' WHERE activation_id IN (?, ?)").bind(me.activationId, other.activationId),
      env.DB.prepare('CREATE TRIGGER IF NOT EXISTS count_seen_writes AFTER UPDATE OF last_seen_on ON activation_devices BEGIN INSERT INTO seen_writes (device_id, day) VALUES (NEW.id, NEW.last_seen_on); END'),
    ]);
    const writes = async (receipt: Receipt) => (await env.DB.prepare('SELECT day FROM seen_writes WHERE device_id = ?').bind(await idOf(code, receipt)).all<{ day: string }>()).results.map((row) => row.day);

    await check(me);
    await check(me);
    await check(me);
    expect(await writes(me)).toEqual([todayUtc()]);
    expect((await deviceRows(code))[0].last_seen_on).toBe(todayUtc());

    await env.DB.prepare("UPDATE activation_devices SET removed_at = '2026-10-02T00:00:00.000Z', removed_by = 'owner' WHERE activation_id = ?").bind(other.activationId).run();
    const before = await writes(other);
    expect(await check(other)).toEqual({ ok: true, status: 'removed' });
    expect(await writes(other)).toEqual(before);
    expect((await deviceRows(code))[1].last_seen_on).toBe('2026-10-01');
  });
});

describe('device tokens', () => {
  it('refuses a token that is missing, malformed, forged or unknown with device-not-recognised (401)', async () => {
    const { receipts: [me] } = await codeWithDevices(1);
    const [, payload, signature] = deviceToken(me).split('.');
    const otherKey = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const otherKeyBase64 = btoa(String.fromCharCode(...new Uint8Array((await crypto.subtle.exportKey('pkcs8', otherKey.privateKey)) as ArrayBuffer)));
    const payloadOf = JSON.parse(me.verifierPayload) as Record<string, unknown>;
    const tokens: unknown[] = [
      undefined, null, 42, '', 'v1', `v2.${payload}.${signature}`, `v1.${payload}`, `v1.${payload}.${signature}.x`, `v1.${payload}!.${signature}`,
      `v1.${payload}.${signature.slice(0, -4)}`, `v1.${payload}.${signature}`.padEnd(1100, 'A'),
      // Signed by another key.
      await signedToken(payloadOf, otherKeyBase64),
      // Signed by this key but not a receipt, or a receipt D1 doesn't know.
      await signedToken({ ...payloadOf, purpose: 'something-else' }),
      await signedToken({ ...payloadOf, activationId: crypto.randomUUID() }),
      await signedToken({ ...payloadOf, issuedAt: '2026-01-01T00:00:00.000Z' }),
      // The payload of another device with this device's signature.
      deviceToken({ verifierPayload: me.verifierPayload.replace(me.activationId, crypto.randomUUID()), verifierSignature: me.verifierSignature }),
    ];
    for (const path of ['/devices', '/devices/remove', '/devices/check'] as const) {
      for (const token of tokens) {
        const response = await callDevices(path, { token, deviceId: 1 });
        expect(response.status, `${path} ${String(token).slice(0, 40)}`).toBe(401);
        expect(await answer(response)).toEqual({ ok: false, reason: 'device-not-recognised' });
      }
    }
    expect(await check(me)).toEqual({ ok: true, status: 'active' });
  });

  it('answers 500 service-error without a signing key to check tokens with', async () => {
    const { receipts: [me] } = await codeWithDevices(1);
    for (const key of [undefined, '', 'not a key']) {
      const response = await sendWith({ KAIROS_ACTIVATION_PRIVATE_KEY: key }, { path: '/devices/check', body: JSON.stringify({ token: deviceToken(me) }) });
      expect(response.status).toBe(500);
      expect(await answer(response)).toEqual({ ok: false, reason: 'service-error' });
    }
  });

  it('limits each device to 10 calls a minute, keyed by device:<activationId>', async () => {
    const { receipts: [me, other] } = await codeWithDevices(2);
    const limit = vi.fn(async () => ({ success: true }));
    await sendWith({ ACTIVATION_RATE_LIMITER: { limit } }, { path: '/devices/check', body: JSON.stringify({ token: deviceToken(me) }) });
    await sendWith({ ACTIVATION_RATE_LIMITER: { limit } }, { path: '/devices', body: JSON.stringify({ token: deviceToken(other) }) });
    expect(limit.mock.calls).toEqual([[{ key: `device:${me.activationId}` }], [{ key: `device:${other.activationId}` }]]);
    const refused = await sendWith({ ACTIVATION_RATE_LIMITER: { limit: async () => ({ success: false }) } }, { path: '/devices/check', body: JSON.stringify({ token: deviceToken(me) }) });
    expect(refused.status).toBe(429);
    expect(await answer(refused)).toEqual({ ok: false, reason: 'rate-limited' });
  });

  it('lets 10 calls a minute from one device through on the real limiter, then 429; another device still gets in', { timeout: 20_000 }, async () => {
    const { receipts: [me, other] } = await codeWithDevices(2);
    await startOfAFreshMinute();
    for (let call = 0; call < 10; call += 1) expect((await callDevices('/devices/check', { token: deviceToken(me) })).status).toBe(200);
    expect((await callDevices('/devices', { token: deviceToken(me) })).status).toBe(429);
    expect((await callDevices('/devices/check', { token: deviceToken(other) })).status).toBe(200);
  });
});

describe('the activation request (D275)', () => {
  it('accepts a device name from the fixed list and refuses anything else with 400', async () => {
    const code = newCode();
    await addCode(code);
    for (const deviceLabel of ['My phone', '', 'iphone · safari', 'iPhone · Safari ', 'Other device; DROP TABLE', null, 42, ['iPhone · Safari']]) {
      const response = await activate(code, { body: activationBody(code, { deviceLabel }) });
      expect(response.status, String(deviceLabel)).toBe(400);
      expect(await answer(response)).toEqual({ ok: false, reason: 'invalid-request' });
    }
    for (const id of ['short12', 'has space-1234', 'x'.repeat(65), null, 12345678, 'ünïcode-1234']) {
      const response = await activate(code, { body: activationBody(code, { requestId: id }) });
      expect(response.status, String(id)).toBe(400);
      expect(await answer(response)).toEqual({ ok: false, reason: 'invalid-request' });
    }
    expect(await deviceRows(code)).toEqual([]);
    // Every name below passes; the shared requestId keeps them to one place.
    for (const deviceLabel of ['iPhone · Safari', 'iPad · Safari', 'Android · Chrome', 'Windows · Edge', 'Mac · Firefox', 'Other device']) {
      await activateDevice(code, { deviceLabel, requestId: 'abcd-1234' });
    }
    expect((await deviceRows(code)).map((row) => row.device_label)).toEqual(['iPhone · Safari']);
    await activateDevice(code, { deviceLabel: 'Linux · Firefox', requestId: 'A'.repeat(64) });
    expect((await deviceRows(code)).map((row) => [row.device_label, row.request_id])).toEqual([['iPhone · Safari', 'abcd-1234'], ['Linux · Firefox', 'A'.repeat(64)]]);
  });
});

describe('GET /health', () => {
  it('says whether the signing key and the devices table are ready, never a value, with no limit', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const ready = await sendWith({ ACTIVATION_RATE_LIMITER: { limit } }, { path: '/health', method: 'GET', contentType: null });
    expect(ready.status).toBe(200);
    expect(ready.headers.get('cache-control')).toBe('no-store');
    expect(await ready.text()).toBe('{"ok":true,"signingKey":"ready","database":"ready"}');
    expect(limit).not.toHaveBeenCalled();

    for (const key of [undefined, '', 'bm90IGEga2V5']) {
      const missing = await sendWith({ KAIROS_ACTIVATION_PRIVATE_KEY: key }, { path: '/health', method: 'GET', contentType: null });
      expect(missing.status).toBe(503);
      expect(await answer(missing)).toEqual({ ok: false, signingKey: 'missing', database: 'ready' });
    }
    const brokenDb = { prepare: () => { throw new Error('no such table'); }, batch: async () => { throw new Error('no such table'); } } as unknown as D1Database;
    const noTable = await sendWith({ DB: brokenDb }, { path: '/health', method: 'GET', contentType: null });
    expect(noTable.status).toBe(503);
    expect(await answer(noTable)).toEqual({ ok: false, signingKey: 'ready', database: 'missing' });
    // From curl (no Origin) as CI asks it, and refused to another website.
    expect((await send({ path: '/health', method: 'GET', contentType: null, origin: null })).status).toBe(200);
    expect((await send({ path: '/health', method: 'GET', contentType: null, origin: 'https://evil.example' })).status).toBe(403);
  });
});
