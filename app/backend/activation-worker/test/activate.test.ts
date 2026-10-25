import { beforeAll, describe, expect, it, vi } from 'vitest';
import { activate, activationBody, addCode, APP, applyMigrations, codeRow, expectReceiptTheAppAccepts, newCode, send, sendWith, sha256Hex, UNUSED, type Receipt } from './support';

beforeAll(applyMigrations);

type Answer = { ok: true; receipt: Receipt } | { ok: false; reason: string };

async function answer(response: Response): Promise<Answer> {
  return response.json<Answer>();
}

describe('POST /activate on D1', () => {
  it('answers a good code with a signed receipt the app accepts, and uses the code up', async () => {
    const code = newCode();
    await addCode(code);
    const response = await activate(code);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.get('access-control-allow-origin')).toBe(APP);
    const body = await answer(response);
    expect(Object.keys(body)).toEqual(['ok', 'receipt']);
    expect(body.ok).toBe(true);
    const receipt = await expectReceiptTheAppAccepts((body as { receipt: unknown }).receipt);
    expect(await codeRow(code)).toEqual({ status: 'used', used_at: receipt.issuedAt, activation_id: receipt.activationId, app_version: '1.2.3', build_id: 'build-62a' });
  });

  it('reads the code trimmed and in upper case, and keeps the trimmed app version and build', async () => {
    const code = newCode();
    await addCode(code);
    const response = await send({ body: JSON.stringify({ inviteCode: `  ${code.toLowerCase()}\t`, appVersion: ' 1.2.4 ', buildId: ' build-b ' }) });
    expect(response.status).toBe(200);
    expect(await codeRow(code)).toMatchObject({ status: 'used', app_version: '1.2.4', build_id: 'build-b' });
  });

  it('refuses the same code again with already-used (403)', async () => {
    const code = newCode();
    await addCode(code);
    const first = await answer(await activate(code));
    const again = await activate(code);
    expect(again.status).toBe(403);
    expect(again.headers.get('access-control-allow-origin')).toBe(APP);
    expect(await answer(again)).toEqual({ ok: false, reason: 'already-used' });
    expect((await codeRow(code))?.activation_id).toBe((first as { receipt: Receipt }).receipt.activationId);
  });

  it('refuses an unknown code and a revoked code with the same invalid-code (403)', async () => {
    const unknown = await activate(newCode());
    expect(unknown.status).toBe(403);
    expect(await answer(unknown)).toEqual({ ok: false, reason: 'invalid-code' });
    const revoked = newCode();
    await addCode(revoked, { status: 'revoked' });
    const response = await activate(revoked);
    expect(response.status).toBe(403);
    expect(await answer(response)).toEqual({ ok: false, reason: 'invalid-code' });
    expect(await codeRow(revoked)).toEqual({ ...UNUSED, status: 'revoked' });
  });

  it('refuses an expired code with expired-code (403) and leaves it unused; a code that expires later works', async () => {
    const expired = newCode();
    await addCode(expired, { expiresAt: '2026-01-01T00:00:00.000Z' });
    const response = await activate(expired);
    expect(response.status).toBe(403);
    expect(await answer(response)).toEqual({ ok: false, reason: 'expired-code' });
    expect(await codeRow(expired)).toEqual(UNUSED);
    const later = newCode();
    await addCode(later, { expiresAt: '2999-01-01T00:00:00.000Z' });
    expect((await activate(later)).status).toBe(200);
  });

  it('answers 500 service-error without a signing key, and the code stays unused', async () => {
    const code = newCode();
    await addCode(code);
    for (const key of [undefined, '', '   ']) {
      const response = await sendWith({ KAIROS_ACTIVATION_PRIVATE_KEY: key }, { body: activationBody(code) });
      expect(response.status).toBe(500);
      expect(response.headers.get('access-control-allow-origin')).toBe(APP);
      expect(await answer(response)).toEqual({ ok: false, reason: 'service-error' });
    }
    expect(await codeRow(code)).toEqual(UNUSED);
    expect((await activate(code)).status).toBe(200);
  });

  it('refuses bad JSON and a missing field (400), a wrong content type (415), GET (405) and another path (404)', async () => {
    const code = newCode();
    await addCode(code);
    const badJson = await send({ body: '{"inviteCode":' });
    expect(badJson.status).toBe(400);
    expect(await answer(badJson)).toEqual({ ok: false, reason: 'invalid-code' });
    for (const body of [JSON.stringify({ inviteCode: code, appVersion: '1.2.3' }), JSON.stringify({ inviteCode: '  ', appVersion: '1.2.3', buildId: 'b' }), 'null', '[]']) {
      const response = await send({ body });
      expect(response.status).toBe(400);
      expect(await answer(response)).toEqual({ ok: false, reason: 'invalid-code' });
    }
    for (const contentType of ['text/plain', null]) {
      const response = await send({ body: activationBody(code), contentType });
      expect(response.status).toBe(415);
      expect(await answer(response)).toEqual({ ok: false, reason: 'service-error' });
    }
    const get = await send({ method: 'GET' });
    expect(get.status).toBe(405);
    expect(await answer(get)).toEqual({ ok: false, reason: 'service-error' });
    for (const path of ['/', '/activate/', '/v1/activate', '/health']) {
      const response = await send({ path, body: activationBody(code) });
      expect(response.status).toBe(404);
      expect(response.headers.get('access-control-allow-origin')).toBe(APP);
      expect(await answer(response)).toEqual({ ok: false, reason: 'service-error' });
    }
    expect(await codeRow(code)).toEqual(UNUSED);
  });

  it('lets 10 tries a minute from one address through, then answers 429 rate-limited; another address still gets in', async () => {
    const address = '198.51.100.62';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await send({ address, contentType: 'text/plain', body: 'x' })).status).toBe(415);
    }
    const code = newCode();
    await addCode(code);
    const limited = await activate(code, { address });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('access-control-allow-origin')).toBe(APP);
    expect(await answer(limited)).toEqual({ ok: false, reason: 'rate-limited' });
    expect(await codeRow(code)).toEqual(UNUSED);
    expect((await activate(code, { address: '198.51.100.63' })).status).toBe(200);
  });

  it('keys the limiter by the SHA-256 of the address, never the address itself', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    await sendWith({ ACTIVATION_RATE_LIMITER: { limit } }, { address: ' 203.0.113.9 ', contentType: 'text/plain', body: 'x' });
    await sendWith({ ACTIVATION_RATE_LIMITER: { limit } }, { address: null, contentType: 'text/plain', body: 'x' });
    expect(limit.mock.calls).toEqual([
      [{ key: `activation:${await sha256Hex('203.0.113.9')}` }],
      [{ key: `activation:${await sha256Hex('unidentified-client')}` }],
    ]);
  });

  it("answers the app's preflight with 204 and another website's with 403", async () => {
    const preflight = await send({ method: 'OPTIONS', contentType: null });
    expect(preflight.status).toBe(204);
    expect(Object.fromEntries(preflight.headers)).toEqual({
      'access-control-allow-origin': APP,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'Accept, Content-Type',
      'cache-control': 'no-store',
      vary: 'Origin',
    });
    const other = await send({ method: 'OPTIONS', contentType: null, origin: 'https://evil.example' });
    expect(other.status).toBe(403);
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    expect(other.headers.get('vary')).toBe('Origin');
    expect((await send({ method: 'OPTIONS', contentType: null, origin: null })).status).toBe(403);
  });
});
