/**
 * The activation Worker `kairos-activation`: invite codes in, signed receipts out, and each code's devices (D277).
 * Routes: POST /activate, POST /devices, POST /devices/remove, POST /devices/check, and GET /health.
 * Every request goes through, in this order: origin (another website gets 403 before any work), path, preflight, method,
 * then the route. A thrown error is a 500 service-error, never a stack trace or a value.
 */
import { handleActivate } from './activate';
import { devicesTableReadiness, handleDeviceRoute } from './devices';
import type { ActivationEnv } from './env';
import { callerOf, json, originRefused, preflight, type Caller } from './http';
import { signingKeyReadiness } from './receipt';

type Route = (request: Request, env: ActivationEnv, caller: Caller) => Promise<Response>;

const POST_ROUTES: ReadonlyMap<string, Route> = new Map<string, Route>([
  ['/activate', handleActivate],
  ['/devices', (request, env, caller) => handleDeviceRoute('list', request, env, caller)],
  ['/devices/remove', (request, env, caller) => handleDeviceRoute('remove', request, env, caller)],
  ['/devices/check', (request, env, caller) => handleDeviceRoute('check', request, env, caller)],
]);

/** GET /health, with no limit: whether the signing key and the devices table are ready. Never a value (D277). */
async function health(env: ActivationEnv, caller: Caller): Promise<Response> {
  const [signingKey, database] = await Promise.all([signingKeyReadiness(env.KAIROS_ACTIVATION_PRIVATE_KEY), devicesTableReadiness(env.DB)]);
  const ok = signingKey === 'ready' && database === 'ready';
  return json(caller, { ok, signingKey, database }, ok ? 200 : 503);
}

export default {
  async fetch(request, env) {
    const caller = callerOf(request, env.KAIROS_APP_ORIGINS);
    try {
      if (caller.refused) return originRefused(caller, request.method);
      const path = new URL(request.url).pathname;
      if (path === '/health' && request.method === 'GET') return await health(env, caller);
      const route = POST_ROUTES.get(path);
      if (route === undefined) return json(caller, { ok: false, reason: 'service-error' }, 404);
      if (request.method === 'OPTIONS') return preflight(caller);
      if (request.method !== 'POST') return json(caller, { ok: false, reason: 'service-error' }, 405);
      return await route(request, env, caller);
    } catch {
      return json(caller, { ok: false, reason: 'service-error' }, 500);
    }
  },
} satisfies ExportedHandler<ActivationEnv>;
