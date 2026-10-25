import { beforeAll, describe, expect, it, vi } from 'vitest';
import { activate, activationBody, addCode, APP, applyMigrations, codeRow, newCode, sendWith, UNUSED } from './support';

beforeAll(applyMigrations);

const OTHER_SITES = [
  'https://evil.example',
  'http://kairos-p1-r17.pages.dev',
  'https://kairos-p1-r17.pages.dev.evil.example',
  'https://preview.kairos-p1-r17.pages.dev',
  'https://kairos-p1-r17.pages.dev:8443',
  'null',
];

describe('only the app answers: KAIROS_APP_ORIGINS', () => {
  it('refuses a POST from another website with 403, and the code stays unused for the app', async () => {
    const code = newCode();
    await addCode(code);
    for (const origin of OTHER_SITES) {
      const response = await activate(code, { origin });
      expect(response.status).toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect(response.headers.get('vary')).toBe('Origin');
      expect(await response.json()).toEqual({ ok: false, reason: 'origin-not-allowed' });
    }
    // A form on another site can post text/plain with no preflight; it is refused the same way.
    const form = await activate(code, { origin: 'https://evil.example', contentType: 'text/plain; charset=application/json' });
    expect(form.status).toBe(403);
    expect(await codeRow(code)).toEqual(UNUSED);
    expect((await activate(code)).status).toBe(200);
  });

  it('refuses another website before any work: no limiter, no database, no signing', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const prepare = vi.fn(() => { throw new Error('the database was used'); });
    const bare = { ACTIVATION_RATE_LIMITER: { limit }, DB: { prepare } as unknown as D1Database, KAIROS_ACTIVATION_PRIVATE_KEY: undefined };
    for (const call of [{}, { path: '/elsewhere' }, { method: 'GET' }, { method: 'PUT' }]) {
      const response = await sendWith(bare, { ...call, origin: 'https://evil.example', body: activationBody(newCode()) });
      expect(response.status).toBe(403);
    }
    expect(limit).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('answers every origin on the exact list with its own CORS header, and nothing else', async () => {
    const listed = { KAIROS_APP_ORIGINS: ' https://journal.example , https://kairos-p1-r17.pages.dev,not an origin, https://journal.example/path ' };
    for (const origin of ['https://journal.example', APP]) {
      const code = newCode();
      await addCode(code);
      const response = await sendWith(listed, { origin, body: activationBody(code) });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
      const preflight = await sendWith(listed, { origin, method: 'OPTIONS', contentType: null });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);
    }
    const code = newCode();
    await addCode(code);
    expect((await sendWith(listed, { origin: 'https://other.example', body: activationBody(code) })).status).toBe(403);
    expect((await sendWith({ KAIROS_APP_ORIGINS: undefined }, { origin: APP, body: activationBody(code) })).status).toBe(403);
    expect(await codeRow(code)).toEqual(UNUSED);
  });

  it('answers a caller that sends no Origin (D139), without CORS headers', async () => {
    const code = newCode();
    await addCode(code);
    const response = await activate(code, { origin: null });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('vary')).toBe('Origin');
  });
});
