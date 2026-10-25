/**
 * The activation Worker `kairos-activation`: invite codes in, signed receipts out. One route, POST /activate. Every request
 * goes through, in this order: origin (another website gets 403 before any work), path, preflight, method, then the route
 * (activate.ts). A thrown error is a 500 service-error, never a stack trace or a value.
 */
import { handleActivate } from './activate';
import type { ActivationEnv } from './env';
import { callerOf, json, originRefused, preflight } from './http';

export default {
  async fetch(request, env) {
    const caller = callerOf(request, env.KAIROS_APP_ORIGINS);
    try {
      if (caller.refused) return originRefused(caller, request.method);
      if (new URL(request.url).pathname !== '/activate') return json(caller, { ok: false, reason: 'service-error' }, 404);
      if (request.method === 'OPTIONS') return preflight(caller);
      if (request.method !== 'POST') return json(caller, { ok: false, reason: 'service-error' }, 405);
      return await handleActivate(request, env, caller);
    } catch {
      return json(caller, { ok: false, reason: 'service-error' }, 500);
    }
  },
} satisfies ExportedHandler<ActivationEnv>;
