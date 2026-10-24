import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { activationKeys, deviceToken } from './signedReceipt';

const APP = 'https://kairos-p1-r17.pages.dev';
const BASE = 'https://kairos-api.example.workers.dev';

function get(path: string, origin: string | null = APP, extra: Record<string, string> = {}): Promise<Response> {
  return exports.default.fetch(new Request(`${BASE}${path}`, { headers: { ...(origin === null ? {} : { origin }), ...extra } }));
}

describe('the deployed kairos-api Worker', () => {
  it('answers /health for the app with what is set up, never a value', async () => {
    const response = await get('/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(APP);
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json<{ data: { serverTime: string } }>();
    expect(body).toMatchObject({ apiVersion: 1, ok: true, data: { service: 'kairos-api', checks: { deviceKey: 'missing', cache: 'ready', limits: 'ready' } } });
    expect(body.data.serverTime).toBe(new Date(Date.parse(body.data.serverTime)).toISOString());
  });

  it('refuses a query, another website and an unknown path', async () => {
    expect((await get('/health?x=1')).status).toBe(400);
    const evil = await get('/health', 'https://evil.example');
    expect(evil.status).toBe(403);
    expect(await evil.json()).toEqual({ apiVersion: 1, ok: false, error: 'unavailable', reason: 'origin-not-allowed', retryAfter: null });
    expect((await get('/anything?url=https://evil.example')).status).toBe(404);
  });

  it('says whether it could check the device', async () => {
    expect(await (await get('/health')).json()).toMatchObject({ data: { device: 'not-sent' } });
    const token = await deviceToken((await activationKeys()).privateKey);
    expect(await (await get('/health', APP, { 'x-kairos-device': token })).json()).toMatchObject({ data: { device: 'not-checked' } });
  });

  it('runs as the production Worker by its config', () => {
    expect(env.KAIROS_API_ROLE).toBe('production');
  });
});
